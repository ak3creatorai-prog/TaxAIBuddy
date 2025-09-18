import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";

interface TaxCalculationResult {
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  taxLiability: number;
  cess: number;
  totalTax: number;
  effectiveRate: number;
  marginalRate: number;
}

interface RegimeComparison {
  oldRegime: TaxCalculationResult;
  newRegime: TaxCalculationResult;
  savings: number;
  recommendedRegime: 'old' | 'new';
}

interface TaxCalculatorProps {
  initialIncome?: number;
  initialDeductions?: { [key: string]: number };
  onCalculationComplete?: (comparison: RegimeComparison) => void;
}

export function TaxCalculator({ 
  initialIncome = 0, 
  initialDeductions = {},
  onCalculationComplete 
}: TaxCalculatorProps) {
  const [grossIncome, setGrossIncome] = useState(initialIncome);
  const [deductions, setDeductions] = useState({
    '80C': initialDeductions['80C'] || 0,
    '80D': initialDeductions['80D'] || 0,
    '80G': initialDeductions['80G'] || 0,
    'HRA': initialDeductions['HRA'] || 0,
    ...initialDeductions
  });
  const [comparison, setComparison] = useState<RegimeComparison | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const handleDeductionChange = (section: string, value: string) => {
    setDeductions(prev => ({
      ...prev,
      [section]: parseFloat(value) || 0
    }));
  };

  const calculateTax = async () => {
    if (grossIncome <= 0) return;
    
    setIsCalculating(true);
    try {
      const response = await fetch('/api/tax-calculations/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          grossIncome: grossIncome.toString(),
          deductions,
          assessmentYear: `${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`
        })
      });

      if (response.ok) {
        const result = await response.json();
        setComparison(result);
        onCalculationComplete?.(result);
      } else {
        console.error('Failed to calculate tax');
      }
    } catch (error) {
      console.error('Error calculating tax:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card data-testid="tax-calculator-inputs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Tax Calculator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="gross-income">Gross Annual Income</Label>
            <Input
              id="gross-income"
              data-testid="input-gross-income"
              type="number"
              placeholder="Enter your gross income"
              value={grossIncome || ''}
              onChange={(e) => setGrossIncome(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <h4 className="font-medium mb-3">Deductions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="deduction-80c">Section 80C (ELSS, PPF, etc.)</Label>
                <Input
                  id="deduction-80c"
                  data-testid="input-deduction-80c"
                  type="number"
                  placeholder="Max: ₹1,50,000"
                  value={deductions['80C'] || ''}
                  onChange={(e) => handleDeductionChange('80C', e.target.value)}
                />
              </div>
              
              <div>
                <Label htmlFor="deduction-80d">Section 80D (Health Insurance)</Label>
                <Input
                  id="deduction-80d"
                  data-testid="input-deduction-80d"
                  type="number"
                  placeholder="Max: ₹25,000"
                  value={deductions['80D'] || ''}
                  onChange={(e) => handleDeductionChange('80D', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="deduction-hra">HRA Exemption</Label>
                <Input
                  id="deduction-hra"
                  data-testid="input-deduction-hra"
                  type="number"
                  placeholder="Enter HRA exemption"
                  value={deductions['HRA'] || ''}
                  onChange={(e) => handleDeductionChange('HRA', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="deduction-80g">Section 80G (Donations)</Label>
                <Input
                  id="deduction-80g"
                  data-testid="input-deduction-80g"
                  type="number"
                  placeholder="Enter donation amount"
                  value={deductions['80G'] || ''}
                  onChange={(e) => handleDeductionChange('80G', e.target.value)}
                />
              </div>
            </div>
          </div>

          <Button 
            onClick={calculateTax}
            disabled={isCalculating || grossIncome <= 0}
            className="w-full"
            data-testid="button-calculate-tax"
          >
            {isCalculating ? 'Calculating...' : 'Calculate Tax'}
          </Button>
        </CardContent>
      </Card>

      {/* Results Section */}
      {comparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Old Regime */}
          <Card data-testid="card-old-regime">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Old Tax Regime</span>
                {comparison.recommendedRegime === 'old' && (
                  <Badge variant="secondary" data-testid="badge-recommended-old">
                    Recommended
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Income</span>
                <span data-testid="text-old-gross-income">
                  {formatCurrency(comparison.oldRegime.grossIncome)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Deductions</span>
                <span className="text-green-600" data-testid="text-old-deductions">
                  {formatCurrency(comparison.oldRegime.totalDeductions)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Income</span>
                <span data-testid="text-old-taxable-income">
                  {formatCurrency(comparison.oldRegime.taxableIncome)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Tax Liability</span>
                <span className="text-red-600" data-testid="text-old-tax-liability">
                  {formatCurrency(comparison.oldRegime.totalTax)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Effective Rate</span>
                <span data-testid="text-old-effective-rate">
                  {comparison.oldRegime.effectiveRate.toFixed(2)}%
                </span>
              </div>
            </CardContent>
          </Card>

          {/* New Regime */}
          <Card data-testid="card-new-regime">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>New Tax Regime</span>
                {comparison.recommendedRegime === 'new' && (
                  <Badge variant="secondary" data-testid="badge-recommended-new">
                    Recommended
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gross Income</span>
                <span data-testid="text-new-gross-income">
                  {formatCurrency(comparison.newRegime.grossIncome)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Standard Deduction</span>
                <span className="text-green-600" data-testid="text-new-deductions">
                  {formatCurrency(comparison.newRegime.totalDeductions)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxable Income</span>
                <span data-testid="text-new-taxable-income">
                  {formatCurrency(comparison.newRegime.taxableIncome)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Tax Liability</span>
                <span className="text-red-600" data-testid="text-new-tax-liability">
                  {formatCurrency(comparison.newRegime.totalTax)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Effective Rate</span>
                <span data-testid="text-new-effective-rate">
                  {comparison.newRegime.effectiveRate.toFixed(2)}%
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Savings Summary */}
      {comparison && (
        <Card data-testid="card-savings-summary">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center space-x-4">
              <div className="flex items-center space-x-2">
                {comparison.savings > 0 ? (
                  <TrendingUp className="h-5 w-5 text-green-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-600" />
                )}
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    {comparison.savings > 0 ? 'Potential Savings' : 'Additional Tax'}
                  </p>
                  <p className={`text-2xl font-bold ${comparison.savings > 0 ? 'text-green-600' : 'text-red-600'}`} 
                     data-testid="text-tax-savings">
                    {formatCurrency(Math.abs(comparison.savings))}
                  </p>
                </div>
              </div>
              
              {comparison.savings > 0 && (
                <div className="flex items-center space-x-2 bg-green-50 px-4 py-2 rounded-lg">
                  <Lightbulb className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-700" data-testid="text-regime-recommendation">
                    Switch to {comparison.recommendedRegime} regime to save money
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
