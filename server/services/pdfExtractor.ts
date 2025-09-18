import pdf from 'pdf-parse';
import Tesseract from 'tesseract.js';
import pdf2pic from 'pdf2pic';
import { writeFile, unlink, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Global OCR concurrency control
class OCRSemaphore {
  private running = 0;
  private readonly maxConcurrent = 2;
  private queue: (() => void)[] = [];

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const ocrSemaphore = new OCRSemaphore();

export interface Form16Data {
  employerName?: string;
  employeeName?: string;
  pan?: string;
  assessmentYear?: string;
  grossSalary?: number;
  basicSalary?: number;
  hra?: number;
  otherAllowances?: number;
  tdsDeducted?: number;
  deductions?: {
    [section: string]: number;
  };
  taxableIncome?: number;
}

export class PDFExtractorService {
  async extractForm16Data(pdfBuffer: Buffer): Promise<Form16Data> {
    try {
      // First try to extract text directly from PDF
      const data = await pdf(pdfBuffer);
      let extractedText = data.text.trim();
      
      // Check if the extracted text is minimal (likely image-based PDF)
      if (this.isImageBasedPdf(extractedText)) {
        console.log('Image-based PDF detected, using OCR...');
        extractedText = await this.extractTextWithOCR(pdfBuffer);
      }
      
      return this.parseForm16Text(extractedText);
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('Failed to extract data from PDF');
    }
  }

  private isImageBasedPdf(text: string): boolean {
    // More robust detection for image-based PDFs
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    // Check text density and meaningful content
    const hasMinimalText = cleanText.length < 50;
    const hasLowTextDensity = cleanText.length < 200 && cleanText.split(' ').length < 20;
    
    // Check for Form 16 specific patterns
    const form16Patterns = [
      /form\s*16/i,
      /pan\s*:?\s*[A-Z0-9]/i,
      /tds\s*deducted/i,
      /assessment\s*year/i,
      /gross\s*salary/i,
      /taxable\s*income/i
    ];
    
    const hasForm16Content = form16Patterns.some(pattern => pattern.test(cleanText));
    
    // Consider image-based if minimal text OR low density without Form 16 content
    return hasMinimalText || (hasLowTextDensity && !hasForm16Content);
  }

  private async extractTextWithOCR(pdfBuffer: Buffer): Promise<string> {
    // Input validation
    if (pdfBuffer.length > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('PDF file too large for OCR processing');
    }

    // Acquire semaphore for concurrency control
    await ocrSemaphore.acquire();
    
    try {
      return await this.performOCRWithTimeout(pdfBuffer);
    } finally {
      ocrSemaphore.release();
    }
  }

  private async performOCRWithTimeout(pdfBuffer: Buffer): Promise<string> {
    // Create isolated temp directory for this job
    const jobTempDir = await mkdtemp(join(tmpdir(), 'pdf-ocr-'));
    const tempPdfPath = join(jobTempDir, 'document.pdf');
    
    const controller = new AbortController();
    const timeoutMs = 5 * 60 * 1000; // 5 minute timeout
    
    // Set up timeout that will cancel the operation using native setTimeout
    const timeoutHandle: NodeJS.Timeout = global.setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    
    try {
      const result = await this.performOCR(pdfBuffer, jobTempDir, tempPdfPath, controller.signal);
      clearTimeout(timeoutHandle);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle);
      if (controller.signal.aborted) {
        throw new Error('OCR processing timeout - operation was cancelled');
      }
      throw error;
    } finally {
      // Guaranteed cleanup of temp directory and all contents
      try {
        await rm(jobTempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn('Failed to cleanup temp directory:', jobTempDir, e);
      }
    }
  }

  private async performOCR(pdfBuffer: Buffer, jobTempDir: string, tempPdfPath: string, signal: AbortSignal): Promise<string> {
    try {
      // Write PDF buffer to temporary file
      await writeFile(tempPdfPath, pdfBuffer);
      
      if (signal.aborted) throw new Error('OCR operation was cancelled');
      
      // Convert only the first few pages to prevent abuse
      const maxPages = 10;
      const pdf2picOptions = {
        density: 200,           // Balanced for quality/performance
        saveFilename: "page",
        savePath: jobTempDir,
        format: "jpeg",         // JPEG for smaller file sizes
        quality: 85,            // Good quality with compression
        width: 1500,            // Reduced size for performance
        height: 1500
      };
      
      const convert = pdf2pic.fromPath(tempPdfPath, pdf2picOptions);
      
      // Convert only the pages we need (1 to maxPages)
      const pages = [];
      for (let i = 1; i <= maxPages; i++) {
        if (signal.aborted) throw new Error('OCR operation was cancelled');
        
        try {
          const page = await convert(i);
          pages.push(page);
        } catch (pageError) {
          // Page doesn't exist or conversion failed, stop here
          console.log(`Page ${i} conversion failed or doesn't exist:`, pageError);
          break;
        }
      }
      
      if (pages.length === 0) {
        throw new Error('No pages could be converted for OCR');
      }
      
      if (signal.aborted) throw new Error('OCR operation was cancelled');
      
      let allText = '';
      
      // Process each page with OCR using the simple Tesseract.recognize API
      for (let i = 0; i < pages.length; i++) {
        if (signal.aborted) throw new Error('OCR operation was cancelled');
        
        const page = pages[i];
        if (page.path) {
          try {
            const { data: { text } } = await Tesseract.recognize(page.path, 'eng', {
              logger: () => {}, // Disable verbose logging
            });
            allText += `Page ${i + 1}:\n${text}\n\n`;
          } catch (pageError) {
            console.warn(`OCR failed for page ${i + 1}:`, pageError);
            // Continue with other pages
          }
        }
      }
      
      if (allText.trim().length === 0) {
        throw new Error('No text could be extracted from PDF using OCR');
      }
      
      return allText;
    } finally {
      // No worker to terminate since we're using Tesseract.recognize directly
    }
  }

  private parseForm16Text(text: string): Form16Data {
    const form16Data: Form16Data = {};
    
    // Extract PAN
    const panMatch = text.match(/PAN\s*:?\s*([A-Z]{5}\d{4}[A-Z])/i);
    if (panMatch) {
      form16Data.pan = panMatch[1].toUpperCase();
    }
    
    // Extract employee name
    const nameMatch = text.match(/Name\s*:?\s*([A-Za-z\s]+)/i);
    if (nameMatch) {
      form16Data.employeeName = nameMatch[1].trim();
    }
    
    // Extract employer name
    const employerMatch = text.match(/Employer\s*:?\s*([A-Za-z\s&.,-]+)/i);
    if (employerMatch) {
      form16Data.employerName = employerMatch[1].trim();
    }
    
    // Extract assessment year
    const ayMatch = text.match(/Assessment\s*Year\s*:?\s*(\d{4}-\d{2})/i);
    if (ayMatch) {
      form16Data.assessmentYear = ayMatch[1];
    }
    
    // Extract gross salary (various patterns)
    const grossSalaryPatterns = [
      /Gross\s*Salary\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i,
      /Total\s*Income\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i,
      /Annual\s*Salary\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    for (const pattern of grossSalaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        form16Data.grossSalary = this.parseAmount(match[1]);
        break;
      }
    }
    
    // Extract basic salary
    const basicSalaryMatch = text.match(/Basic\s*Salary\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i);
    if (basicSalaryMatch) {
      form16Data.basicSalary = this.parseAmount(basicSalaryMatch[1]);
    }
    
    // Extract HRA
    const hraMatch = text.match(/HRA\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i);
    if (hraMatch) {
      form16Data.hra = this.parseAmount(hraMatch[1]);
    }
    
    // Extract TDS
    const tdsPatterns = [
      /TDS\s*Deducted\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i,
      /Tax\s*Deducted\s*at\s*Source\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i,
      /Total\s*TDS\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    for (const pattern of tdsPatterns) {
      const match = text.match(pattern);
      if (match) {
        form16Data.tdsDeducted = this.parseAmount(match[1]);
        break;
      }
    }
    
    // Extract deductions by sections
    form16Data.deductions = this.extractDeductions(text);
    
    // Extract taxable income
    const taxableIncomeMatch = text.match(/Taxable\s*Income\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i);
    if (taxableIncomeMatch) {
      form16Data.taxableIncome = this.parseAmount(taxableIncomeMatch[1]);
    }
    
    return form16Data;
  }
  
  private extractDeductions(text: string): { [section: string]: number } {
    const deductions: { [section: string]: number } = {};
    
    // Common deduction sections
    const deductionPatterns = [
      { section: '80C', pattern: /80C\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80D', pattern: /80D\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80G', pattern: /80G\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80E', pattern: /80E\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80CCD', pattern: /80CCD\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: 'HRA', pattern: /HRA\s*Exemption\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: 'LTA', pattern: /LTA\s*Exemption\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i }
    ];
    
    for (const { section, pattern } of deductionPatterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = this.parseAmount(match[1]);
        if (amount > 0) {
          deductions[section] = amount;
        }
      }
    }
    
    return deductions;
  }
  
  private parseAmount(amountString: string): number {
    // Remove commas and convert to number
    const cleanAmount = amountString.replace(/,/g, '');
    return parseFloat(cleanAmount) || 0;
  }
}
