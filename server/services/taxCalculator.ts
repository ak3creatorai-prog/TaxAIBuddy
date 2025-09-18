export interface TaxSlabRate {
  min: number;
  max: number | null;
  rate: number;
}

export interface TaxCalculationResult {
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  taxLiability: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
  marginalRate: number;
}

export interface RegimeComparison {
  oldRegime: TaxCalculationResult;
  newRegime: TaxCalculationResult;
  savings: number;
  recommendedRegime: 'old' | 'new';
}

export class TaxCalculatorService {
  // Old regime tax slabs for AY 2024-25
  private oldRegimeSlabs: TaxSlabRate[] = [
    { min: 0, max: 250000, rate: 0 },
    { min: 250000, max: 500000, rate: 5 },
    { min: 500000, max: 1000000, rate: 20 },
    { min: 1000000, max: null, rate: 30 }
  ];

  // New regime tax slabs for AY 2024-25
  private newRegimeSlabs: TaxSlabRate[] = [
    { min: 0, max: 300000, rate: 0 },
    { min: 300000, max: 600000, rate: 5 },
    { min: 600000, max: 900000, rate: 10 },
    { min: 900000, max: 1200000, rate: 15 },
    { min: 1200000, max: 1500000, rate: 20 },
    { min: 1500000, max: null, rate: 30 }
  ];

  // Standard deduction for new regime
  private readonly NEW_REGIME_STANDARD_DEDUCTION = 50000;
  
  // Health and education cess
  private readonly CESS_RATE = 4; // 4% on income tax

  calculateOldRegimeTax(
    grossIncome: number,
    deductions: { [section: string]: number } = {},
    isNonResident: boolean = false
  ): TaxCalculationResult {
    const totalDeductions = Object.values(deductions).reduce((sum, amount) => sum + amount, 0);
    const taxableIncome = Math.max(0, grossIncome - totalDeductions);
    
    let slabs = this.oldRegimeSlabs;
    
    // Non-residents don't get basic exemption
    if (isNonResident) {
      slabs = [
        { min: 0, max: null, rate: 30 }
      ];
    }
    
    const taxLiability = this.calculateTaxFromSlabs(taxableIncome, slabs);
    const cess = (taxLiability * this.CESS_RATE) / 100;
    const totalTax = taxLiability + cess;
    
    return {
      grossIncome,
      totalDeductions,
      taxableIncome,
      taxLiability,
      cess,
      totalTax,
      effectiveRate: grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0,
      marginalRate: this.getMarginalRate(taxableIncome, slabs)
    };
  }

  calculateNewRegimeTax(
    grossIncome: number,
    additionalDeductions: number = 0,
    isNonResident: boolean = false
  ): TaxCalculationResult {
    // New regime only allows standard deduction and few specific deductions
    const standardDeduction = isNonResident ? 0 : this.NEW_REGIME_STANDARD_DEDUCTION;
    const totalDeductions = standardDeduction + additionalDeductions;
    const taxableIncome = Math.max(0, grossIncome - totalDeductions);
    
    let slabs = this.newRegimeSlabs;
    
    // Non-residents have different slabs
    if (isNonResident) {
      slabs = [
        { min: 0, max: null, rate: 30 }
      ];
    }
    
    const taxLiability = this.calculateTaxFromSlabs(taxableIncome, slabs);
    const cess = (taxLiability * this.CESS_RATE) / 100;
    const totalTax = taxLiability + cess;
    
    return {
      grossIncome,
      totalDeductions,
      taxableIncome,
      taxLiability,
      cess,
      totalTax,
      effectiveRate: grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0,
      marginalRate: this.getMarginalRate(taxableIncome, slabs)
    };
  }

  compareRegimes(
    grossIncome: number,
    oldRegimeDeductions: { [section: string]: number } = {},
    newRegimeAdditionalDeductions: number = 0,
    isNonResident: boolean = false
  ): RegimeComparison {
    const oldRegime = this.calculateOldRegimeTax(grossIncome, oldRegimeDeductions, isNonResident);
    const newRegime = this.calculateNewRegimeTax(grossIncome, newRegimeAdditionalDeductions, isNonResident);
    
    const savings = oldRegime.totalTax - newRegime.totalTax;
    const recommendedRegime = savings > 0 ? 'new' : 'old';
    
    return {
      oldRegime,
      newRegime,
      savings,
      recommendedRegime
    };
  }

  private calculateTaxFromSlabs(income: number, slabs: TaxSlabRate[]): number {
    let tax = 0;
    let remainingIncome = income;
    
    for (const slab of slabs) {
      if (remainingIncome <= 0) break;
      
      const slabMin = slab.min;
      const slabMax = slab.max ?? Infinity;
      const slabWidth = slabMax - slabMin;
      
      if (income <= slabMin) continue;
      
      const taxableInThisSlab = Math.min(remainingIncome, slabWidth);
      const taxInThisSlab = (taxableInThisSlab * slab.rate) / 100;
      
      tax += taxInThisSlab;
      remainingIncome -= taxableInThisSlab;
    }
    
    return Math.round(tax);
  }

  private getMarginalRate(income: number, slabs: TaxSlabRate[]): number {
    for (const slab of slabs) {
      if (income >= slab.min && (slab.max === null || income < slab.max)) {
        return slab.rate;
      }
    }
    return 0;
  }

  // Calculate tax suggestions based on current income and deductions
  generateTaxSuggestions(
    grossIncome: number,
    currentDeductions: { [section: string]: number } = {},
    assessmentYear: string
  ): Array<{
    section: string;
    suggestion: string;
    currentAmount: number;
    maxAmount: number;
    potentialSaving: number;
    priority: number;
  }> {
    const suggestions = [];
    const currentYear = parseInt(assessmentYear.split('-')[0]);
    
    // Section 80C suggestions
    const current80C = currentDeductions['80C'] || 0;
    const max80C = 150000;
    if (current80C < max80C) {
      const additionalAmount = max80C - current80C;
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, additionalAmount, currentDeductions);
      
      suggestions.push({
        section: '80C',
        suggestion: `Invest additional ₹${additionalAmount.toLocaleString()} in ELSS, PPF, or life insurance to maximize 80C benefits`,
        currentAmount: current80C,
        maxAmount: max80C,
        potentialSaving,
        priority: 1
      });
    }

    // Section 80D suggestions
    const current80D = currentDeductions['80D'] || 0;
    const max80D = 25000; // For individual + family, can be higher for senior citizens
    if (current80D < max80D) {
      const additionalAmount = max80D - current80D;
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, additionalAmount, currentDeductions);
      
      suggestions.push({
        section: '80D',
        suggestion: `Increase health insurance coverage by ₹${additionalAmount.toLocaleString()} to get full 80D benefits`,
        currentAmount: current80D,
        maxAmount: max80D,
        potentialSaving,
        priority: 2
      });
    }

    // NPS suggestions (80CCD(1B))
    const current80CCD1B = currentDeductions['80CCD1B'] || 0;
    const max80CCD1B = 50000;
    if (current80CCD1B < max80CCD1B) {
      const additionalAmount = max80CCD1B - current80CCD1B;
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, additionalAmount, currentDeductions);
      
      suggestions.push({
        section: '80CCD1B',
        suggestion: `Contribute ₹${additionalAmount.toLocaleString()} to NPS for additional tax benefits under 80CCD(1B)`,
        currentAmount: current80CCD1B,
        maxAmount: max80CCD1B,
        potentialSaving,
        priority: 3
      });
    }

    return suggestions.sort((a, b) => b.potentialSaving - a.potentialSaving || a.priority - b.priority);
  }

  private calculateSavingFromDeduction(
    grossIncome: number,
    additionalDeduction: number,
    currentDeductions: { [section: string]: number }
  ): number {
    const currentTax = this.calculateOldRegimeTax(grossIncome, currentDeductions);
    const newDeductions = { ...currentDeductions };
    
    // Add the additional deduction to appropriate section
    const existingAmount = Object.values(currentDeductions).reduce((sum, amount) => sum + amount, 0);
    const newTax = this.calculateOldRegimeTax(grossIncome, { total: existingAmount + additionalDeduction });
    
    return Math.round(currentTax.totalTax - newTax.totalTax);
  }

  // Calculate HRA exemption
  calculateHRAExemption(
    basicSalary: number,
    hra: number,
    rentPaid: number,
    isMetroCity: boolean
  ): number {
    if (rentPaid <= 0) return 0;
    
    const hraReceived = hra;
    const rentExcess = rentPaid - (basicSalary * 0.1);
    const hraPercentage = isMetroCity ? 0.5 : 0.4;
    const basicHRALimit = basicSalary * hraPercentage;
    
    return Math.min(hraReceived, rentExcess, basicHRALimit);
  }
}
