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

  app.put("/api/tax-documents/:id/upload-complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = req.params.id;
      const { uploadURL } = req.body;

      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        uploadURL,
        {
          owner: userId,
          visibility: "private"
        }
      );

      // Update document with file path
      const updatedDocument = await storage.updateTaxDocument(documentId, userId, {
        filePath: objectPath,
        status: 'processing'
      });

      res.json({ document: updatedDocument });

      console.log(`[ROUTE DEBUG] Upload complete route finished, about to start background processing for ${documentId}`);
      
      // Process PDF in background after returning response
      setImmediate(() => {
        (async () => {
          console.log(`[PDF Processing] Starting background processing for document ${documentId}`);
          try {
          // Ensure we have updated document data for processing
          if (!updatedDocument) {
            console.error('Updated document is undefined, cannot process PDF');
            return;
          }
          console.log(`[PDF Processing] Document verified, file path: ${objectPath}`);
          
          console.log(`[PDF Processing] Getting object file from storage...`);
          const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
          console.log(`[PDF Processing] Object file retrieved successfully`);
          
          // Download and process PDF with safe size validation using pipeline
          const chunks: Buffer[] = [];
          const maxSize = 50 * 1024 * 1024; // 50MB limit
          const sourceStream = objectFile.createReadStream();
          const byteLimitTransform = new ByteLimitTransform(maxSize);
          
          // Collect chunks in a transform stream
          const collectTransform = new Transform({
            transform(chunk, encoding, callback) {
              chunks.push(chunk);
              callback(null, chunk);
            }
          });
          
          try {
            console.log(`[PDF Processing] Starting PDF download pipeline...`);
            // Use safe pipeline for stream handling
            try {
              await pipeline(sourceStream, byteLimitTransform, collectTransform);
              console.log(`[PDF Processing] Pipeline completed successfully`);
            } catch (pipelineError) {
              console.error(`[PDF Processing] Pipeline failed:`, pipelineError);
              throw new Error(`PDF download pipeline failed: ${pipelineError.message}`);
            }
            
            const pdfBuffer = Buffer.concat(chunks);
            console.log(`[PDF Processing] PDF downloaded successfully, size: ${pdfBuffer.length} bytes`);
            
            console.log(`[PDF Processing] Starting Form 16 data extraction...`);
            let extractedData;
            try {
              extractedData = await pdfExtractor.extractForm16Data(pdfBuffer);
              console.log(`[PDF Processing] Extraction completed, extracted data:`, JSON.stringify(extractedData, null, 2));
            } catch (extractionError) {
              console.error(`[PDF Processing] Data extraction failed:`, extractionError);
              throw new Error(`PDF data extraction failed: ${extractionError.message}`);
            }
              
              // Update document with extracted data
              console.log(`[PDF Processing] Updating document with extracted data...`);
              try {
                await storage.updateTaxDocument(documentId, userId, {
                  extractedData,
                  status: 'completed',
                  processedAt: new Date()
                });
                console.log(`[PDF Processing] Document updated successfully to completed status`);
              } catch (updateError) {
                console.error(`[PDF Processing] Document update failed:`, updateError);
                throw new Error(`Document update failed: ${updateError.message}`);
              }

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

                // Generate intelligent tax suggestions with user profile considerations
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
            } catch (processError) {
              console.error('Error processing PDF data:', processError);
              await storage.updateTaxDocument(documentId, userId, {
                status: 'failed',
                processedAt: new Date()
              });
            }
          } catch (pipelineError) {
            console.error('Error during PDF download or size validation:', pipelineError);
            await storage.updateTaxDocument(documentId, userId, {
              status: 'failed',
              processedAt: new Date()
            });
          }
      });
    } catch (error) {
      console.error("Error updating document upload:", error);
      res.status(500).json({ error: "Failed to update document" });
    }
  });

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
