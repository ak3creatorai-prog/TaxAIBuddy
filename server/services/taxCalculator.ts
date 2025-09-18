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
    assessmentYear: string,
    userProfile?: {
      age?: number;
      hasParents?: boolean;
      isMetroCity?: boolean;
      hasHomeLoan?: boolean;
      investmentRiskProfile?: 'conservative' | 'moderate' | 'aggressive';
    }
  ): Array<{
    section: string;
    suggestion: string;
    currentAmount: number;
    maxAmount: number;
    potentialSaving: number;
    priority: number;
    category: 'investment' | 'insurance' | 'loan' | 'savings' | 'strategy';
    urgency: 'high' | 'medium' | 'low';
  }> {
    const suggestions = [];
    const currentYear = parseInt(assessmentYear.split('-')[0]);
    const isSeniorCitizen = userProfile?.age && userProfile.age >= 60;
    
    // First, analyze which tax regime is better
    const regimeComparison = this.compareRegimes(grossIncome, currentDeductions);
    if (regimeComparison.savings > 5000) {
      suggestions.push({
        section: 'REGIME',
        suggestion: `Switch to ${regimeComparison.recommendedRegime} tax regime to save ₹${regimeComparison.savings.toLocaleString()} annually`,
        currentAmount: 0,
        maxAmount: 0,
        potentialSaving: regimeComparison.savings,
        priority: 0,
        category: 'strategy',
        urgency: 'high'
      });
    }

    // Section 80C suggestions with intelligent recommendations
    const current80C = currentDeductions['80C'] || 0;
    const max80C = 150000;
    if (current80C < max80C) {
      const additionalAmount = max80C - current80C;
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, additionalAmount, currentDeductions);
      
      let investmentSuggestion = '';
      if (userProfile?.investmentRiskProfile === 'aggressive' && grossIncome > 1000000) {
        investmentSuggestion = `Invest ₹${additionalAmount.toLocaleString()} in ELSS mutual funds for potential high returns with 3-year lock-in`;
      } else if (userProfile?.investmentRiskProfile === 'conservative' || grossIncome < 500000) {
        investmentSuggestion = `Invest ₹${additionalAmount.toLocaleString()} in PPF or NSC for guaranteed returns and tax benefits`;
      } else {
        investmentSuggestion = `Invest ₹${additionalAmount.toLocaleString()} in balanced portfolio: ELSS (₹${Math.floor(additionalAmount * 0.6).toLocaleString()}), PPF (₹${Math.floor(additionalAmount * 0.4).toLocaleString()})`;
      }
      
      suggestions.push({
        section: '80C',
        suggestion: investmentSuggestion,
        currentAmount: current80C,
        maxAmount: max80C,
        potentialSaving,
        priority: 1,
        category: 'investment',
        urgency: current80C < 50000 ? 'high' : 'medium'
      });
    }

    // Section 80D suggestions with age-based limits
    const current80D = currentDeductions['80D'] || 0;
    let max80D = 25000; // For individual + family
    if (isSeniorCitizen) max80D = 50000;
    if (userProfile?.hasParents && isSeniorCitizen) max80D = 75000;
    
    if (current80D < max80D) {
      const additionalAmount = max80D - current80D;
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, additionalAmount, currentDeductions);
      
      let healthSuggestion = '';
      if (userProfile?.hasParents) {
        healthSuggestion = `Increase health insurance coverage by ₹${additionalAmount.toLocaleString()} including parents' coverage for comprehensive 80D benefits`;
      } else {
        healthSuggestion = `Enhance health insurance coverage by ₹${additionalAmount.toLocaleString()} for yourself and family`;
      }
      
      suggestions.push({
        section: '80D',
        suggestion: healthSuggestion,
        currentAmount: current80D,
        maxAmount: max80D,
        potentialSaving,
        priority: 2,
        category: 'insurance',
        urgency: current80D === 0 ? 'high' : 'medium'
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
        suggestion: `Contribute ₹${additionalAmount.toLocaleString()} to NPS for retirement planning and additional tax benefits beyond 80C`,
        currentAmount: current80CCD1B,
        maxAmount: max80CCD1B,
        potentialSaving,
        priority: 3,
        category: 'investment',
        urgency: 'medium'
      });
    }

    // Section 80G (Donations) suggestions for high-income earners
    const current80G = currentDeductions['80G'] || 0;
    if (grossIncome > 1500000 && current80G < 50000) {
      const suggestedAmount = Math.min(50000, grossIncome * 0.1);
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, suggestedAmount, currentDeductions);
      
      suggestions.push({
        section: '80G',
        suggestion: `Consider donating ₹${suggestedAmount.toLocaleString()} to eligible charities for 80G tax benefits while supporting causes`,
        currentAmount: current80G,
        maxAmount: suggestedAmount,
        potentialSaving,
        priority: 8,
        category: 'investment',
        urgency: 'low'
      });
    }

    // Section 80TTA/80TTB (Interest on Savings)
    const current80TTA = currentDeductions['80TTA'] || 0;
    const max80TTA = isSeniorCitizen ? 50000 : 10000;
    const section = isSeniorCitizen ? '80TTB' : '80TTA';
    
    if (current80TTA < max80TTA && grossIncome > 300000) {
      const requiredDeposit = max80TTA / 0.04; // Assuming 4% interest rate
      const potentialSaving = this.calculateSavingFromDeduction(grossIncome, max80TTA, currentDeductions);
      
      suggestions.push({
        section,
        suggestion: `Maintain ₹${requiredDeposit.toLocaleString()} in savings account/FD to maximize ${section} benefits (₹${max80TTA.toLocaleString()} deduction)`,
        currentAmount: current80TTA,
        maxAmount: max80TTA,
        potentialSaving,
        priority: 6,
        category: 'savings',
        urgency: 'low'
      });
    }

    // Home Loan Interest (Section 24)
    if (userProfile?.hasHomeLoan) {
      const currentHomeLoan = currentDeductions['24'] || 0;
      const maxHomeLoan = 200000;
      if (currentHomeLoan < maxHomeLoan) {
        const additionalAmount = maxHomeLoan - currentHomeLoan;
        const potentialSaving = this.calculateSavingFromDeduction(grossIncome, additionalAmount, currentDeductions);
        
        suggestions.push({
          section: '24',
          suggestion: `Ensure you're claiming full home loan interest up to ₹${maxHomeLoan.toLocaleString()} under Section 24`,
          currentAmount: currentHomeLoan,
          maxAmount: maxHomeLoan,
          potentialSaving,
          priority: 4,
          category: 'loan',
          urgency: 'high'
        });
      }
    }

    // Section 80EE (First-time home buyer)
    if (!userProfile?.hasHomeLoan && grossIncome < 3500000) {
      suggestions.push({
        section: '80EE',
        suggestion: `Consider home loan for first-time purchase to claim ₹50,000 additional deduction under Section 80EE`,
        currentAmount: 0,
        maxAmount: 50000,
        potentialSaving: this.calculateSavingFromDeduction(grossIncome, 50000, currentDeductions),
        priority: 9,
        category: 'loan',
        urgency: 'low'
      });
    }

    // Strategic suggestions based on income levels
    if (grossIncome > 2000000 && Object.values(currentDeductions).reduce((sum, val) => sum + val, 0) < 200000) {
      suggestions.push({
        section: 'STRATEGY',
        suggestion: `With your high income bracket, consider comprehensive tax planning through mutual fund SIPs, insurance, and diversified investments`,
        currentAmount: 0,
        maxAmount: 0,
        potentialSaving: 50000, // Estimated potential saving
        priority: 1,
        category: 'strategy',
        urgency: 'high'
      });
    }

    // End-of-year urgency suggestions
    const currentMonth = new Date().getMonth() + 1;
    if (currentMonth >= 12 || currentMonth <= 3) { // Dec-Mar (financial year ending)
      const totalCurrentDeductions = Object.values(currentDeductions).reduce((sum, val) => sum + val, 0);
      if (totalCurrentDeductions < 150000) {
        suggestions.push({
          section: 'URGENT',
          suggestion: `Financial year ending soon! Complete pending tax-saving investments of ₹${(150000 - totalCurrentDeductions).toLocaleString()} before March 31st`,
          currentAmount: totalCurrentDeductions,
          maxAmount: 150000,
          potentialSaving: this.calculateSavingFromDeduction(grossIncome, 150000 - totalCurrentDeductions, currentDeductions),
          priority: 0,
          category: 'strategy',
          urgency: 'high'
        });
      }
    }

    return suggestions
      .filter(s => s.potentialSaving > 500) // Only show meaningful savings
      .sort((a, b) => {
        // Sort by urgency first, then potential savings, then priority
        if (a.urgency !== b.urgency) {
          const urgencyOrder = { 'high': 3, 'medium': 2, 'low': 1 };
          return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        }
        return b.potentialSaving - a.potentialSaving || a.priority - b.priority;
      });
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
