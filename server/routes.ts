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
      const assessmentYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
      
      const [documents, incomeSources, investments, calculations, suggestions] = await Promise.all([
        storage.getTaxDocumentsByUser(userId),
        storage.getIncomeSourcesByUser(userId, assessmentYear),
        storage.getInvestmentsByUser(userId, assessmentYear),
        storage.getTaxCalculationsByUser(userId),
        storage.getTaxSuggestionsByUser(userId, assessmentYear)
      ]);

      res.json({
        documents,
        incomeSources,
        investments,
        calculations,
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
      const validatedData = insertTaxDocumentSchema.parse({ ...req.body, userId });
      
      const document = await storage.createTaxDocument(validatedData);
      
      // Process the PDF if file path is provided
      if (document.filePath) {
        // This would be triggered after successful upload
        res.json({ document, message: "Document uploaded successfully. Processing..." });
        
        // Process PDF in background
        setImmediate(async () => {
          try {
            const objectStorageService = new ObjectStorageService();
            const objectFile = await objectStorageService.getObjectEntityFile(document.filePath);
            
            // Download and process PDF
            const chunks: Buffer[] = [];
            const stream = objectFile.createReadStream();
            
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', async () => {
              const pdfBuffer = Buffer.concat(chunks);
              const extractedData = await pdfExtractor.extractForm16Data(pdfBuffer);
              
              // Update document with extracted data
              await storage.updateTaxDocument(document.id, userId, {
                extractedData,
                status: 'completed',
                processedAt: new Date()
              });

              // Create income sources and investments from extracted data
              if (extractedData.grossSalary) {
                await storage.createIncomeSource({
                  userId,
                  documentId: document.id,
                  source: 'salary',
                  amount: extractedData.grossSalary.toString(),
                  assessmentYear: extractedData.assessmentYear || document.assessmentYear,
                  description: 'Salary income from Form 16'
                });
              }

              // Create investments from deductions
              if (extractedData.deductions) {
                for (const [section, amount] of Object.entries(extractedData.deductions)) {
                  await storage.createInvestment({
                    userId,
                    documentId: document.id,
                    section,
                    type: `${section} Investment`,
                    amount: amount.toString(),
                    assessmentYear: extractedData.assessmentYear || document.assessmentYear,
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
                  documentId: document.id,
                  assessmentYear: extractedData.assessmentYear || document.assessmentYear,
                  grossIncome: extractedData.grossSalary.toString(),
                  totalDeductions: comparison.oldRegime.totalDeductions.toString(),
                  taxableIncome: comparison.oldRegime.taxableIncome.toString(),
                  oldRegimeTax: comparison.oldRegime.totalTax.toString(),
                  newRegimeTax: comparison.newRegime.totalTax.toString(),
                  tdsDeducted: extractedData.tdsDeducted?.toString() || '0',
                  refundAmount: ((extractedData.tdsDeducted || 0) - comparison.newRegime.totalTax).toString()
                });

                // Generate suggestions
                const suggestions = taxCalculator.generateTaxSuggestions(
                  extractedData.grossSalary,
                  extractedData.deductions || {},
                  extractedData.assessmentYear || document.assessmentYear
                );

                for (const suggestion of suggestions) {
                  await storage.createTaxSuggestion({
                    userId,
                    assessmentYear: extractedData.assessmentYear || document.assessmentYear,
                    category: 'investment',
                    suggestion: suggestion.suggestion,
                    potentialSaving: suggestion.potentialSaving.toString(),
                    priority: suggestion.priority
                  });
                }
              }
            });

            stream.on('error', async (error) => {
              console.error('Error processing PDF:', error);
              await storage.updateTaxDocument(document.id, userId, {
                status: 'failed',
                processedAt: new Date()
              });
            });
          } catch (error) {
            console.error('Error processing document:', error);
            await storage.updateTaxDocument(document.id, userId, {
              status: 'failed',
              processedAt: new Date()
            });
          }
        });
      } else {
        res.json({ document });
      }
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
    } catch (error) {
      console.error("Error updating document upload:", error);
      res.status(500).json({ error: "Failed to update document" });
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

  const httpServer = createServer(app);
  return httpServer;
}
