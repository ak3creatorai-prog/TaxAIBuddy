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
  employerAddress?: string;
  employeeName?: string;
  employeeAddress?: string;
  pan?: string;
  assessmentYear?: string;
  grossSalary?: number;
  grossTotalIncome?: number;
  totalExemption?: number;
  standardDeduction?: number;
  basicSalary?: number;
  hra?: number;
  otherAllowances?: number;
  totalDeduction?: number;
  aggregateDeduction?: number;
  incomeChargeable?: number;
  taxableIncome?: number;
  netTaxPayable?: number;
  tdsDeducted?: number;
  deductions?: {
    [section: string]: number;
  };
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
      
      // Handle specific PDF errors with user-friendly messages
      const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
      
      if (errorMessage.includes('password') || errorMessage.includes('encrypted')) {
        throw new Error('PDF is password-protected. Please upload an unprotected PDF file.');
      }
      
      if (errorMessage.includes('invalid pdf') || errorMessage.includes('corrupted')) {
        throw new Error('PDF file appears to be corrupted. Please try uploading a different file.');
      }
      
      if (errorMessage.includes('timeout') || errorMessage.includes('cancelled')) {
        throw new Error('PDF processing took too long. Please try uploading a smaller file.');
      }
      
      // Generic fallback error
      throw new Error('Unable to process PDF file. Please ensure it is a valid Form 16 document.');
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
    
    // Split text into lines for more precise line-wise parsing
    const lines = text.split(/\r?\n/).map(line => line.trim());
    
    // Detect Form 16 sections for better scoping
    const partBStart = lines.findIndex(line => /^(?:Part\s*)?B\s*[:\-]?/i.test(line) || /^B\s*\(\s*1\s*\)/i.test(line));
    const chapterVIAStart = lines.findIndex(line => /Chapter\s*VI-A/i.test(line));
    
    // Extract PAN - prioritize employee PAN with specific context
    const employeePanPatterns = [
      /^PAN\s*(?:of\s*)?(?:Employee|Deductee)\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])/i,
      /^Employee\s*PAN\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])/i
    ];
    
    // Try employee-specific patterns first
    for (const line of lines) {
      for (const pattern of employeePanPatterns) {
        const match = line.match(pattern);
        if (match) {
          form16Data.pan = match[1].toUpperCase();
          break;
        }
      }
      if (form16Data.pan) break;
    }
    
    // Fallback to general PAN if not found
    if (!form16Data.pan) {
      const generalPanPatterns = [
        /^PAN\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])/i,
        /PAN\s*No\.?\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])/i
      ];
      
      for (const line of lines) {
        for (const pattern of generalPanPatterns) {
          const match = line.match(pattern);
          if (match) {
            form16Data.pan = match[1].toUpperCase();
            break;
          }
        }
        if (form16Data.pan) break;
      }
    }
    
    // Extract employee name with context
    const employeeNamePatterns = [
      /^(?:Name\s*of\s*)?Employee(?:'s)?\s*Name\s*[:\-]\s*(.+)$/i,
      /^Employee\s*[:\-]\s*(.+)$/i,
      /^Name\s*[:\-]\s*(.+)$/i
    ];
    
    for (const line of lines) {
      for (const pattern of employeeNamePatterns) {
        const match = line.match(pattern);
        if (match && match[1].length > 2) {
          form16Data.employeeName = match[1].trim();
          break;
        }
      }
      if (form16Data.employeeName) break;
    }
    
    // Extract employee address - capture multiple lines
    const employeeAddressStart = lines.findIndex(line => 
      /^(?:Address\s*of\s*)?Employee(?:'s)?\s*Address\s*[:\-]/i.test(line) ||
      /^(?:Residential\s*)?Address\s*[:\-]/i.test(line)
    );
    
    if (employeeAddressStart !== -1) {
      const addressLines = [];
      for (let i = employeeAddressStart; i < lines.length && i < employeeAddressStart + 5; i++) {
        const line = lines[i];
        // Stop at next labeled field
        if (i > employeeAddressStart && /^(?:PAN|TAN|Employer|Assessment|Income)/i.test(line)) {
          break;
        }
        if (i === employeeAddressStart) {
          // Extract address part after the label
          const match = line.match(/^(?:Address\s*of\s*)?Employee(?:'s)?\s*Address\s*[:\-]\s*(.+)$/i) ||
                       line.match(/^(?:Residential\s*)?Address\s*[:\-]\s*(.+)$/i);
          if (match && match[1].trim()) {
            addressLines.push(match[1].trim());
          }
        } else if (line && !line.match(/^[A-Z\s]+:\s*$/)) {
          addressLines.push(line);
        }
      }
      if (addressLines.length > 0) {
        form16Data.employeeAddress = addressLines.join(' ').trim();
      }
    }
    
    // Extract employer name with specific context
    const employerNamePatterns = [
      /^(?:Name\s*of\s*)?Employer(?:'s)?\s*Name\s*[:\-]\s*(.+)$/i,
      /^Employer\s*[:\-]\s*(.+)$/i,
      /^Company\s*Name\s*[:\-]\s*(.+)$/i
    ];
    
    for (const line of lines) {
      for (const pattern of employerNamePatterns) {
        const match = line.match(pattern);
        if (match && match[1].length > 2) {
          form16Data.employerName = match[1].trim();
          break;
        }
      }
      if (form16Data.employerName) break;
    }
    
    // Extract employer address - capture multiple lines
    const employerAddressStart = lines.findIndex(line => 
      /^(?:Address\s*of\s*)?Employer(?:'s)?\s*Address\s*[:\-]/i.test(line) ||
      /^Company\s*Address\s*[:\-]/i.test(line)
    );
    
    if (employerAddressStart !== -1) {
      const addressLines = [];
      for (let i = employerAddressStart; i < lines.length && i < employerAddressStart + 5; i++) {
        const line = lines[i];
        // Stop at next labeled field
        if (i > employerAddressStart && /^(?:Employee|PAN|TAN|Assessment|Income)/i.test(line)) {
          break;
        }
        if (i === employerAddressStart) {
          // Extract address part after the label
          const match = line.match(/^(?:Address\s*of\s*)?Employer(?:'s)?\s*Address\s*[:\-]\s*(.+)$/i) ||
                       line.match(/^Company\s*Address\s*[:\-]\s*(.+)$/i);
          if (match && match[1].trim()) {
            addressLines.push(match[1].trim());
          }
        } else if (line && !line.match(/^[A-Z\s]+:\s*$/)) {
          addressLines.push(line);
        }
      }
      if (addressLines.length > 0) {
        form16Data.employerAddress = addressLines.join(' ').trim();
      }
    }
    
    // Extract assessment year with more variations
    const assessmentYearPatterns = [
      /Assessment\s*Year\s*[:\-]?\s*(\d{4}[\-\s]*\d{2,4})/i,
      /AY\s*[:\-]?\s*(\d{4}[\-\s]*\d{2,4})/i,
      /A\.Y\.?\s*[:\-]?\s*(\d{4}[\-\s]*\d{2,4})/i,
      /Financial\s*Year\s*[:\-]?\s*(\d{4}[\-\s]*\d{2,4})/i
    ];
    
    for (const pattern of assessmentYearPatterns) {
      const match = text.match(pattern);
      if (match) {
        // Normalize to YYYY-YY format
        let year = match[1].replace(/\s+/g, '-');
        if (year.length === 7 && year.includes('-')) {
          form16Data.assessmentYear = year;
        } else if (year.length === 9) {
          // Convert YYYY-YYYY to YYYY-YY
          const parts = year.split('-');
          form16Data.assessmentYear = `${parts[0]}-${parts[1].slice(-2)}`;
        }
        break;
      }
    }
    
    // Helper function to search in specific section with line-scoped patterns
    const searchInSection = (startIndex: number, endIndex: number, patterns: RegExp[]): string | null => {
      const sectionLines = startIndex >= 0 ? lines.slice(startIndex, endIndex > 0 ? endIndex : lines.length) : lines;
      for (const line of sectionLines) {
        for (const pattern of patterns) {
          const match = line.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }
      }
      return null;
    };
    
    // Extract gross salary with Form 16 specific line-scoped patterns
    const grossSalaryPatterns = [
      /^(?:\d+\.?\s*)?(?:Gross\s*)?Salary\s*(?:as\s*per\s*provisions\s*of\s*section\s*17\s*\(1\))?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?(?:Total\s*)?Annual\s*Salary\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Gross\s*Salary\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    const grossSalaryResult = searchInSection(partBStart, chapterVIAStart, grossSalaryPatterns);
    if (grossSalaryResult) {
      form16Data.grossSalary = this.parseAmount(grossSalaryResult);
    }
    
    // Extract gross total income with Form 16 specific line-scoped patterns (removed conflicting pattern)
    const grossTotalIncomePatterns = [
      /^(?:\d+\.?\s*)?Gross\s*Total\s*Income\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Total\s*Income\s*(?:from\s*all\s*sources)?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    const grossTotalIncomeResult = searchInSection(partBStart, chapterVIAStart, grossTotalIncomePatterns);
    if (grossTotalIncomeResult) {
      form16Data.grossTotalIncome = this.parseAmount(grossTotalIncomeResult);
    }
    
    // Extract total exemption with section-scoped line patterns
    const totalExemptionPatterns = [
      /^(?:\d+\.?\s*)?(?:Total\s*)?(?:Amount\s*of\s*)?Exemption(?:s)?\s*(?:claimed\s*)?(?:u\/s\s*10)?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Exemptions\s*under\s*section\s*10\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    const totalExemptionResult = searchInSection(partBStart, chapterVIAStart, totalExemptionPatterns);
    if (totalExemptionResult) {
      form16Data.totalExemption = this.parseAmount(totalExemptionResult);
    }
    
    // Extract standard deduction with specific section references
    const standardDeductionPatterns = [
      /^(?:\d+\.?\s*)?(?:Standard\s*)?Deduction\s*(?:u\/s|under\s*section)\s*16\s*\(ia\)\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Section\s*16\s*\(ia\)\s*(?:Standard\s*Deduction)?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Standard\s*Deduction\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    const standardDeductionResult = searchInSection(partBStart, chapterVIAStart, standardDeductionPatterns);
    if (standardDeductionResult) {
      form16Data.standardDeduction = this.parseAmount(standardDeductionResult);
    }
    
    // Now implement the missing financial field extractions with proper line-scoping
    
    // Extract total deduction with Chapter VI-A scoping  
    const totalDeductionPatterns = [
      /^(?:\d+\.?\s*)?Total\s*(?:amount\s*of\s*)?deduction(?:s)?\s*(?:under\s*Chapter\s*VI-A)?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Total\s*deduction(?:s)?\s*claimed\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    const totalDeductionResult = searchInSection(chapterVIAStart, -1, totalDeductionPatterns);
    if (totalDeductionResult) {
      form16Data.totalDeduction = this.parseAmount(totalDeductionResult);
      // Set as aggregate deduction if not already set
      if (!form16Data.aggregateDeduction) {
        form16Data.aggregateDeduction = this.parseAmount(totalDeductionResult);
      }
    }
    
    // Extract income chargeable under the head 'Salaries' with specific Form 16 patterns
    const incomeChargeablePatterns = [
      /^(?:\d+\.?\s*)?Income\s*chargeable\s*under\s*the\s*head\s*['""]?Salaries['""]?\s*(?:\(\d+[-\s]*\d*\))?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?(?:Total\s*)?Income\s*chargeable\s*to\s*tax\s*(?:under\s*salary)?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    const incomeChargeableResult = searchInSection(partBStart, chapterVIAStart, incomeChargeablePatterns);
    if (incomeChargeableResult) {
      form16Data.incomeChargeable = this.parseAmount(incomeChargeableResult);
    }
    
    // Extract net tax payable with line-scoped patterns in tax computation section
    const netTaxPayablePatterns = [
      /^(?:\d+\.?\s*)?(?:Net\s*)?Tax\s*payable\s*(?:\(after\s*TDS\))?\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Balance\s*tax\s*payable\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Tax\s*on\s*total\s*income\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i,
      /^(?:\d+\.?\s*)?Total\s*tax\s*liability\s*[:\-]\s*₹?\s*([0-9,]+\.?\d*)/i
    ];
    
    // Search in tax computation section (after Chapter VI-A)
    const netTaxPayableResult = searchInSection(chapterVIAStart >= 0 ? chapterVIAStart : partBStart, -1, netTaxPayablePatterns);
    if (netTaxPayableResult) {
      form16Data.netTaxPayable = this.parseAmount(netTaxPayableResult);
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
    form16Data.deductions = this.extractDeductions(lines, chapterVIAStart);
    
    // Extract taxable income
    const taxableIncomeMatch = text.match(/Taxable\s*Income\s*:?\s*₹?\s*([0-9,]+\.?\d*)/i);
    if (taxableIncomeMatch) {
      form16Data.taxableIncome = this.parseAmount(taxableIncomeMatch[1]);
    }
    
    return form16Data;
  }
  
  private extractDeductions(lines: string[], chapterVIAStart: number): { [section: string]: number } {
    const deductions: { [section: string]: number } = {};
    
    // Only search within Chapter VI-A section (skip HRA/LTA as they are exemptions under section 10)
    const chapterVIALines = chapterVIAStart >= 0 ? lines.slice(chapterVIAStart) : [];
    
    // Chapter VI-A deduction sections only
    const deductionPatterns = [
      { section: '80C', pattern: /^(?:\d+\.?\s*)?(?:Section\s*)?80C\s*(?:deduction)?\s*[:\-]?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80D', pattern: /^(?:\d+\.?\s*)?(?:Section\s*)?80D\s*(?:deduction)?\s*[:\-]?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80G', pattern: /^(?:\d+\.?\s*)?(?:Section\s*)?80G\s*(?:deduction)?\s*[:\-]?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80E', pattern: /^(?:\d+\.?\s*)?(?:Section\s*)?80E\s*(?:deduction)?\s*[:\-]?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80CCD', pattern: /^(?:\d+\.?\s*)?(?:Section\s*)?80CCD\s*(?:deduction)?\s*[:\-]?\s*₹?\s*([0-9,]+\.?\d*)/i },
      { section: '80TTA', pattern: /^(?:\d+\.?\s*)?(?:Section\s*)?80TTA\s*(?:deduction)?\s*[:\-]?\s*₹?\s*([0-9,]+\.?\d*)/i }
    ];
    
    // Search within Chapter VI-A lines only
    for (const { section, pattern } of deductionPatterns) {
      for (const line of chapterVIALines) {
        const match = line.match(pattern);
        if (match) {
          const amount = this.parseAmount(match[1]);
          if (amount > 0) {
            deductions[section] = amount;
            break; // Found this section, move to next
          }
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
