import pdf from 'pdf-parse';

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
      const data = await pdf(pdfBuffer);
      const text = data.text;
      
      return this.parseForm16Text(text);
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('Failed to extract data from PDF');
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
