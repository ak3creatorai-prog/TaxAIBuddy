import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { PDFExtractorService } from "./services/pdfExtractor";
import { TaxCalculatorService } from "./services/taxCalculator";
import { insertTaxDocumentSchema, insertIncomeSourceSchema, insertInvestmentSchema } from "@shared/schema";
import { z } from "zod";
import { pipeline } from "stream/promises";
import { Transform } from "stream";

// Safe ByteLimit transform to prevent DoS attacks
class ByteLimitTransform extends Transform {
  private totalBytes = 0;
  private readonly maxBytes: number;

  constructor(maxBytes: number) {
    super();
    this.maxBytes = maxBytes;
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: Function) {
    this.totalBytes += chunk.length;
    if (this.totalBytes > this.maxBytes) {
      callback(new Error(`File size exceeds limit of ${Math.round(this.maxBytes / (1024 * 1024))}MB`));
      return;
    }
    callback(null, chunk);
  }
}

const pdfExtractor = new PDFExtractorService();
const taxCalculator = new TaxCalculatorService();

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Dashboard data
  app.get('/api/dashboard', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const currentYear = new Date().getFullYear();
      const defaultAssessmentYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
      
      // Get assessment year from query params, fallback to default
      const assessmentYear = req.query.assessmentYear as string || defaultAssessmentYear;
      
      const [documents, incomeSources, investments, calculations, suggestions] = await Promise.all([
        storage.getTaxDocumentsByUser(userId),
        storage.getIncomeSourcesByUser(userId, assessmentYear),
        storage.getInvestmentsByUser(userId, assessmentYear),
        storage.getTaxCalculationsByUser(userId),
        storage.getTaxSuggestionsByUser(userId, assessmentYear)
      ]);

      // Filter documents and calculations by assessment year for consistency
      const filteredDocuments = documents.filter(doc => doc.assessmentYear === assessmentYear);
      const filteredCalculations = calculations.filter(calc => calc.assessmentYear === assessmentYear);

      res.json({
        documents: filteredDocuments,
        incomeSources,
        investments,
        calculations: filteredCalculations,
        suggestions,
        assessmentYear
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      res.status(500).json({ message: "Failed to fetch dashboard data" });
    }
  });

  // DEBUG: Test endpoint to manually trigger background processing
  app.post("/api/debug/process-document/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = req.params.id;
      
      // Get document from database
      const document = await storage.getTaxDocument(documentId, userId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      console.log(`[DEBUG] Manually triggering processing for document ${documentId} with file path: ${document.filePath}`);
      
      // Manually trigger background processing
      void processDocumentAsync(documentId, userId, document.filePath || "", document).catch(async (error) => {
        console.error(`[DEBUG] Manual processing failed for ${documentId}:`, error);
        try {
          await storage.updateTaxDocument(documentId, userId, {
            status: 'failed',
            processedAt: new Date()
          });
          console.log(`[DEBUG] Document ${documentId} marked as failed due to processing error`);
        } catch (updateError) {
          console.error(`[DEBUG] Failed to mark document ${documentId} as failed:`, updateError);
        }
      });
      
      res.json({ message: "Background processing triggered", documentId });
    } catch (error) {
      console.error('Error in debug process route:', error);
      res.status(500).json({ error: 'Failed to trigger processing' });
    }
  });

  // NEW: Synchronous upload and extraction endpoint
  app.post("/api/documents/upload-and-extract", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { fileName, assessmentYear, uploadURL } = req.body;
      
      // Validation
      if (!fileName || !assessmentYear || !uploadURL) {
        return res.status(400).json({ 
          error: 'Validation Error', 
          message: 'fileName, assessmentYear, and uploadURL are required',
          success: false 
        });
      }
      
      // Validate fileName length and format
      if (fileName.length > 200 || !fileName.endsWith('.pdf')) {
        return res.status(400).json({
          error: 'Invalid fileName',
          message: 'fileName must be a PDF under 200 characters',
          success: false
        });
      }
      
      // Validate assessment year format
      const yearRegex = /^\d{4}-\d{2}$/;
      if (!yearRegex.test(assessmentYear)) {
        return res.status(400).json({
          error: 'Invalid assessmentYear',
          message: 'assessmentYear must be in YYYY-YY format',
          success: false
        });
      }
      
      // Validate uploadURL format
      if (!uploadURL.startsWith('https://storage.googleapis.com/')) {
        return res.status(400).json({
          error: 'Invalid uploadURL',
          message: 'uploadURL must be a valid Google Cloud Storage URL',
          success: false
        });
      }
      
      console.log(`[SYNC Upload] Starting synchronous upload and extraction for ${fileName}`);
      
      // Set ACL policy for uploaded file
      const objectStorageService = new ObjectStorageService();
      let objectPath;
      
      try {
        objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
          uploadURL,
          {
            owner: userId,
            visibility: "private"
          }
        );
      } catch (aclError) {
        console.error(`[SYNC Upload] ACL policy failed:`, aclError);
        return res.status(400).json({
          error: 'Invalid Upload URL',
          message: 'The provided upload URL is invalid or expired',
          success: false
        });
      }
      
      // Create document record
      const document = await storage.createTaxDocument({
        userId,
        fileName,
        filePath: objectPath,
        assessmentYear,
        status: 'processing'
      });
      
      console.log(`[SYNC Upload] Document created with ID: ${document.id}`);
      
      try {
        // Get PDF file from storage
        console.log(`[SYNC Upload] Getting PDF file from storage...`);
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        console.log(`[SYNC Upload] Object file retrieved, starting download...`);
        
        // Download PDF with size validation
        const chunks: Buffer[] = [];
        const maxSize = 50 * 1024 * 1024; // 50MB limit
        const sourceStream = objectFile.createReadStream();
        const byteLimitTransform = new ByteLimitTransform(maxSize);
        
        const collectTransform = new Transform({
          transform(chunk, encoding, callback) {
            chunks.push(chunk);
            callback(null, chunk);
          }
        });
        
        console.log(`[SYNC Upload] Starting PDF download pipeline...`);
        await pipeline(sourceStream, byteLimitTransform, collectTransform);
        const pdfBuffer = Buffer.concat(chunks);
        console.log(`[SYNC Upload] PDF downloaded successfully, size: ${pdfBuffer.length} bytes`);
        
        console.log(`[SYNC Upload] Starting PDF extraction...`);
        
        // Extract data from PDF synchronously with timeout
        const extractionPromise = pdfExtractor.extractForm16Data(pdfBuffer);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF extraction timeout after 30 seconds')), 30000)
        );
        
        const extractedData = await Promise.race([extractionPromise, timeoutPromise]);
        console.log(`[SYNC Upload] PDF extraction completed successfully`);
        
        console.log(`[SYNC Upload] Extraction completed:`, JSON.stringify(extractedData, null, 2));
        
        // Update document with extracted data
        const completedDocument = await storage.updateTaxDocument(document.id, userId, {
          extractedData,
          status: 'completed',
          processedAt: new Date()
        });
        
        console.log(`[SYNC Upload] Document processing completed successfully`);
        
        // Return completed document with extracted data
        res.json({ 
          document: completedDocument,
          extractedData,
          success: true
        });
        
      } catch (extractionError) {
        console.error(`[SYNC Upload] Extraction failed:`, extractionError);
        
        // Update document as failed
        await storage.updateTaxDocument(document.id, userId, {
          status: 'failed',
          processedAt: new Date()
        });
        
        // Return specific error message
        const errorMessage = extractionError instanceof Error ? extractionError.message : 'Unknown extraction error';
        res.status(422).json({ 
          error: 'PDF Processing Failed',
          message: errorMessage,
          document: document,
          success: false
        });
      }
      
    } catch (error) {
      console.error('Error in synchronous upload:', error);
      res.status(500).json({ error: 'Upload and extraction failed', success: false });
    }
  });

  // Object storage routes for PDF uploads
  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    const objectStorageService = new ObjectStorageService();
    
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.sendStatus(401);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Tax document routes
  app.post('/api/tax-documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      // Remove filePath from client data for security - it will be set in upload-complete
      const { filePath, ...cleanData } = req.body;
      const validatedData = insertTaxDocumentSchema.parse({ ...cleanData, userId });
      
      const document = await storage.createTaxDocument(validatedData);
      
      // Never process automatically - only through upload-complete route
      res.json({ document });
    } catch (error) {
      console.error("Error creating tax document:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create tax document" });
      }
    }
  });

  // Tax regime comparison endpoint
  app.post("/api/tax/calculate-comparison", isAuthenticated, async (req: any, res) => {
    try {
      const { grossIncome, additionalInvestments = {} } = req.body;
      
      if (!grossIncome || grossIncome <= 0) {
        return res.status(400).json({ error: 'Valid gross income is required' });
      }
      
      console.log(`[Tax Calculation] Calculating regime comparison for gross income: ${grossIncome}`);
      
      // Calculate old regime tax (with all deductions)
      const oldRegimeTax = taxCalculator.calculateOldRegimeTax(grossIncome, additionalInvestments);
      
      // Calculate new regime tax (only standard deduction)
      const newRegimeTax = taxCalculator.calculateNewRegimeTax(grossIncome);
      
      // Determine which regime is better
      const savings = oldRegimeTax.totalTax - newRegimeTax.totalTax;
      const recommendation = savings > 0 ? 'new' : 'old';
      
      const comparison = {
        oldRegime: oldRegimeTax,
        newRegime: newRegimeTax,
        savings: Math.abs(savings),
        recommendation,
        summary: {
          betterRegime: recommendation,
          potentialSavings: Math.abs(savings),
          message: savings > 0 
            ? `New regime saves ₹${Math.abs(savings).toLocaleString('en-IN')}`
            : `Old regime saves ₹${Math.abs(savings).toLocaleString('en-IN')}`
        }
      };
      
      console.log(`[Tax Calculation] Comparison completed:`, comparison.summary);
      res.json(comparison);
      
    } catch (error) {
      console.error('Error calculating tax comparison:', error);
      res.status(500).json({ error: 'Tax calculation failed' });
    }
  });

  // Investment management endpoints
  app.post("/api/investments", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const investmentData = { ...req.body, userId };
      
      const investment = await storage.createInvestment(investmentData);
      res.json({ investment, success: true });
    } catch (error) {
      console.error('Error creating investment:', error);
      res.status(500).json({ error: 'Failed to create investment' });
    }
  });

  app.put("/api/investments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const investmentId = req.params.id;
      
      const investment = await storage.updateInvestment(investmentId, userId, req.body);
      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }
      
      res.json({ investment, success: true });
    } catch (error) {
      console.error('Error updating investment:', error);
      res.status(500).json({ error: 'Failed to update investment' });
    }
  });

  app.delete("/api/investments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const investmentId = req.params.id;
      
      // Note: We don't have a delete method in storage, so we'll implement a soft delete
      const investment = await storage.updateInvestment(investmentId, userId, { 
        amount: '0' // Set amount to 0 as a soft delete
      });
      
      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting investment:', error);
      res.status(500).json({ error: 'Failed to delete investment' });
    }
  });

  // DEPRECATED: Old async upload endpoint - keeping for backwards compatibility
  app.put("/api/tax-documents/:id/upload-complete", isAuthenticated, async (req: any, res) => {
    // This endpoint is now deprecated in favor of synchronous processing
    res.status(410).json({ 
      error: 'This endpoint has been deprecated', 
      message: 'Use POST /api/documents/upload-and-extract instead' 
    });
  });

  // Separate async function for PDF processing
  async function processDocumentAsync(documentId: string, userId: string, objectPath: string, updatedDocument: any) {
    console.log(`[PDF Processing] Starting background processing for document ${documentId}`);
    
    try {
      // Ensure we have updated document data for processing
      if (!updatedDocument) {
        console.error('Updated document is undefined, cannot process PDF');
        return;
      }
      console.log(`[PDF Processing] Document verified, file path: ${objectPath}`);
      
      // Get object file from storage
      console.log(`[PDF Processing] Getting object file from storage...`);
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      console.log(`[PDF Processing] Object file retrieved successfully`);
      
      // Download PDF with size validation
      const chunks: Buffer[] = [];
      const maxSize = 50 * 1024 * 1024; // 50MB limit
      const sourceStream = objectFile.createReadStream();
      const byteLimitTransform = new ByteLimitTransform(maxSize);
      
      const collectTransform = new Transform({
        transform(chunk, encoding, callback) {
          chunks.push(chunk);
          callback(null, chunk);
        }
      });
      
      console.log(`[PDF Processing] Starting PDF download pipeline...`);
      await pipeline(sourceStream, byteLimitTransform, collectTransform);
      console.log(`[PDF Processing] Pipeline completed successfully`);
      
      const pdfBuffer = Buffer.concat(chunks);
      console.log(`[PDF Processing] PDF downloaded successfully, size: ${pdfBuffer.length} bytes`);
      
      // Extract data from PDF
      console.log(`[PDF Processing] Starting Form 16 data extraction...`);
      const extractedData = await pdfExtractor.extractForm16Data(pdfBuffer);
      console.log(`[PDF Processing] Extraction completed, extracted data:`, JSON.stringify(extractedData, null, 2));
      
      // Update document with extracted data
      console.log(`[PDF Processing] Updating document with extracted data...`);
      await storage.updateTaxDocument(documentId, userId, {
        extractedData,
        status: 'completed',
        processedAt: new Date()
      });
      console.log(`[PDF Processing] Document updated successfully to completed status`);

      // Create income sources and investments from extracted data
      if (extractedData.grossSalary) {
        await storage.createIncomeSource({
          userId,
          documentId,
          source: 'salary',
          amount: extractedData.grossSalary.toString(),
          assessmentYear: extractedData.assessmentYear || updatedDocument?.assessmentYear || '2024-25',
          description: 'Salary income from Form 16'
        });
      }

      // Create investments from deductions
      if (extractedData.deductions) {
        for (const [section, amount] of Object.entries(extractedData.deductions)) {
          await storage.createInvestment({
            userId,
            documentId,
            section,
            type: `${section} Investment`,
            amount: amount.toString(),
            assessmentYear: extractedData.assessmentYear || updatedDocument?.assessmentYear || '2024-25',
            description: `Deduction under section ${section}`
          });
        }
      }

      // Calculate taxes
      if (extractedData.grossSalary) {
        const comparison = taxCalculator.compareRegimes(
          extractedData.grossSalary,
          extractedData.deductions || {}
        );

        await storage.createTaxCalculation({
          userId,
          documentId,
          assessmentYear: extractedData.assessmentYear || updatedDocument?.assessmentYear || '2024-25',
          grossIncome: extractedData.grossSalary.toString(),
          totalDeductions: comparison.oldRegime.totalDeductions.toString(),
          taxableIncome: comparison.oldRegime.taxableIncome.toString(),
          oldRegimeTax: comparison.oldRegime.totalTax.toString(),
          newRegimeTax: comparison.newRegime.totalTax.toString(),
          tdsDeducted: extractedData.tdsDeducted?.toString() || '0',
          refundAmount: ((extractedData.tdsDeducted || 0) - comparison.newRegime.totalTax).toString()
        });

        // Generate intelligent tax suggestions
        const userProfile = {
          age: undefined,
          hasParents: false,
          isMetroCity: false,
          hasHomeLoan: false,
          investmentRiskProfile: ((extractedData.grossSalary || 0) > 1000000 ? 'moderate' : 'conservative') as 'moderate' | 'conservative' | 'aggressive'
        };

        const suggestions = taxCalculator.generateTaxSuggestions(
          extractedData.grossSalary,
          extractedData.deductions || {},
          extractedData.assessmentYear || updatedDocument.assessmentYear,
          userProfile
        );

        for (const suggestion of suggestions) {
          await storage.createTaxSuggestion({
            userId,
            assessmentYear: extractedData.assessmentYear || updatedDocument?.assessmentYear || '2024-25',
            section: suggestion.section,
            category: suggestion.category,
            suggestion: suggestion.suggestion,
            currentAmount: suggestion.currentAmount.toString(),
            maxAmount: suggestion.maxAmount.toString(),
            potentialSaving: suggestion.potentialSaving.toString(),
            priority: suggestion.priority,
            urgency: suggestion.urgency
          });
        }
      }
      
      console.log(`[PDF Processing] Background processing completed successfully for document ${documentId}`);
      
    } catch (error) {
      console.error(`[PDF Processing] Critical error during processing:`, error);
      console.error(`[PDF Processing] Error stack:`, error instanceof Error ? error.stack : 'No stack trace available');
      
      // Mark document as failed
      try {
        await storage.updateTaxDocument(documentId, userId, {
          status: 'failed',
          processedAt: new Date()
        });
        console.log(`[PDF Processing] Document marked as failed due to error`);
      } catch (failedUpdateError) {
        console.error(`[PDF Processing] Failed to mark document as failed:`, failedUpdateError);
      }
    }
  }

  app.get('/api/tax-documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = req.params.id;
      const document = await storage.getTaxDocument(documentId, userId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      console.error("Error fetching tax document:", error);
      res.status(500).json({ message: "Failed to fetch tax document" });
    }
  });

  app.get('/api/tax-documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documents = await storage.getTaxDocumentsByUser(userId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching tax documents:", error);
      res.status(500).json({ message: "Failed to fetch tax documents" });
    }
  });

  // Income source routes
  app.post('/api/income-sources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertIncomeSourceSchema.parse({ ...req.body, userId });
      
      const incomeSource = await storage.createIncomeSource(validatedData);
      res.json(incomeSource);
    } catch (error) {
      console.error("Error creating income source:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create income source" });
      }
    }
  });

  app.get('/api/income-sources', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const assessmentYear = req.query.assessmentYear as string;
      const incomeSources = await storage.getIncomeSourcesByUser(userId, assessmentYear);
      res.json(incomeSources);
    } catch (error) {
      console.error("Error fetching income sources:", error);
      res.status(500).json({ message: "Failed to fetch income sources" });
    }
  });

  app.put('/api/income-sources/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const incomeId = req.params.id;
      
      const updatedIncome = await storage.updateIncomeSource(incomeId, userId, req.body);
      
      if (!updatedIncome) {
        return res.status(404).json({ message: "Income source not found" });
      }
      
      res.json(updatedIncome);
    } catch (error) {
      console.error("Error updating income source:", error);
      res.status(500).json({ message: "Failed to update income source" });
    }
  });

  app.delete('/api/income-sources/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const incomeId = req.params.id;
      
      const deleted = await storage.deleteIncomeSource(incomeId, userId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Income source not found" });
      }
      
      res.json({ message: "Income source deleted successfully" });
    } catch (error) {
      console.error("Error deleting income source:", error);
      res.status(500).json({ message: "Failed to delete income source" });
    }
  });

  // Investment routes
  app.post('/api/investments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertInvestmentSchema.parse({ ...req.body, userId });
      
      const investment = await storage.createInvestment(validatedData);
      res.json(investment);
    } catch (error) {
      console.error("Error creating investment:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create investment" });
      }
    }
  });

  app.get('/api/investments', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const assessmentYear = req.query.assessmentYear as string;
      const investments = await storage.getInvestmentsByUser(userId, assessmentYear);
      res.json(investments);
    } catch (error) {
      console.error("Error fetching investments:", error);
      res.status(500).json({ message: "Failed to fetch investments" });
    }
  });

  app.put('/api/investments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const investmentId = req.params.id;
      
      const updatedInvestment = await storage.updateInvestment(investmentId, userId, req.body);
      
      if (!updatedInvestment) {
        return res.status(404).json({ message: "Investment not found" });
      }
      
      res.json(updatedInvestment);
    } catch (error) {
      console.error("Error updating investment:", error);
      res.status(500).json({ message: "Failed to update investment" });
    }
  });

  app.delete('/api/investments/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const investmentId = req.params.id;
      
      const deleted = await storage.deleteInvestment(investmentId, userId);
      
      if (!deleted) {
        return res.status(404).json({ message: "Investment not found" });
      }
      
      res.json({ message: "Investment deleted successfully" });
    } catch (error) {
      console.error("Error deleting investment:", error);
      res.status(500).json({ message: "Failed to delete investment" });
    }
  });

  // Tax calculation routes
  app.post('/api/tax-calculations/compare', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { grossIncome, deductions, assessmentYear } = req.body;
      
      const comparison = taxCalculator.compareRegimes(parseFloat(grossIncome), deductions || {});
      
      // Save calculation
      await storage.createTaxCalculation({
        userId,
        assessmentYear,
        grossIncome,
        totalDeductions: comparison.oldRegime.totalDeductions.toString(),
        taxableIncome: comparison.oldRegime.taxableIncome.toString(),
        oldRegimeTax: comparison.oldRegime.totalTax.toString(),
        newRegimeTax: comparison.newRegime.totalTax.toString()
      });
      
      res.json(comparison);
    } catch (error) {
      console.error("Error calculating tax comparison:", error);
      res.status(500).json({ message: "Failed to calculate tax comparison" });
    }
  });

  app.get('/api/tax-calculations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const calculations = await storage.getTaxCalculationsByUser(userId);
      res.json(calculations);
    } catch (error) {
      console.error("Error fetching tax calculations:", error);
      res.status(500).json({ message: "Failed to fetch tax calculations" });
    }
  });

  // Tax suggestions routes
  app.get('/api/tax-suggestions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const assessmentYear = req.query.assessmentYear as string;
      const suggestions = await storage.getTaxSuggestionsByUser(userId, assessmentYear);
      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching tax suggestions:", error);
      res.status(500).json({ message: "Failed to fetch tax suggestions" });
    }
  });

  // Generate personalized tax suggestions
  app.post('/api/tax-suggestions/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { 
        grossIncome, 
        currentDeductions, 
        assessmentYear, 
        userProfile 
      } = req.body;

      // Validate required fields
      if (!grossIncome || !assessmentYear) {
        return res.status(400).json({ message: "grossIncome and assessmentYear are required" });
      }

      // Generate suggestions using the enhanced engine
      const suggestions = taxCalculator.generateTaxSuggestions(
        parseFloat(grossIncome),
        currentDeductions || {},
        assessmentYear,
        userProfile
      );

      // Save new suggestions (optionally replace old ones for this year)
      if (req.body.saveToDatabase !== false) {
        for (const suggestion of suggestions) {
          await storage.createTaxSuggestion({
            userId,
            assessmentYear,
            section: suggestion.section,
            category: suggestion.category,
            suggestion: suggestion.suggestion,
            currentAmount: suggestion.currentAmount.toString(),
            maxAmount: suggestion.maxAmount.toString(),
            potentialSaving: suggestion.potentialSaving.toString(),
            priority: suggestion.priority,
            urgency: suggestion.urgency
          });
        }
      }

      res.json({ 
        suggestions,
        totalPotentialSaving: suggestions.reduce((sum, s) => sum + s.potentialSaving, 0),
        highPrioritySuggestions: suggestions.filter(s => s.urgency === 'high').length
      });
    } catch (error) {
      console.error("Error generating tax suggestions:", error);
      res.status(500).json({ message: "Failed to generate tax suggestions" });
    }
  });

  // Mark tax suggestion as implemented
  app.put('/api/tax-suggestions/:id/implement', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const suggestionId = req.params.id;
      
      const updated = await storage.updateTaxSuggestion(suggestionId, userId, {
        isImplemented: true
      });
      
      if (!updated) {
        return res.status(404).json({ message: "Tax suggestion not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating tax suggestion:", error);
      res.status(500).json({ message: "Failed to update tax suggestion" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
