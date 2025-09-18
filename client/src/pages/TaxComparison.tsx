import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { TaxCalculator } from "@/components/TaxCalculator";
import { 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Lightbulb,
  RefreshCw,
  Save,
  Download
} from "lucide-react";

interface RegimeComparison {
  oldRegime: {
    grossIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    taxLiability: number;
    cess: number;
    totalTax: number;
    effectiveRate: number;
    marginalRate: number;
  };
  newRegime: {
    grossIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    taxLiability: number;
    cess: number;
    totalTax: number;
    effectiveRate: number;
    marginalRate: number;
  };
  savings: number;
  recommendedRegime: 'old' | 'new';
}

export default function TaxComparison() {
  const { toast } = useToast();
  const [comparison, setComparison] = useState<RegimeComparison | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Redirect to login if unauthorized
    const handleUnauthorized = (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
    };
  }, [toast]);

  const handleCalculationComplete = (result: RegimeComparison) => {
    setComparison(result);
  };

  const saveCalculation = async () => {
    if (!comparison) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/tax-calculations/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          grossIncome: comparison.oldRegime.grossIncome.toString(),
          deductions: {}, // This would come from the form
          assessmentYear: `${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`
        })
      });

      if (response.ok) {
        toast({
          title: "Calculation Saved",
          description: "Your tax comparison has been saved to your dashboard.",
        });
      } else {
        throw new Error('Failed to save calculation');
      }
    } catch (error) {
      console.error('Error saving calculation:', error);
      toast({
        title: "Save Failed",
        description: "Could not save your calculation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const downloadReport = () => {
    if (!comparison) return;

    const reportData = {
      generatedOn: new Date().toLocaleDateString(),
      oldRegime: comparison.oldRegime,
      newRegime: comparison.newRegime,
      savings: comparison.savings,
      recommendation: comparison.recommendedRegime
    };

    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `tax-comparison-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Report Downloaded",
      description: "Your tax comparison report has been downloaded.",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="space-y-8" data-testid="tax-comparison-main">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-tax-comparison">
            Tax Regime Comparison
          </h1>
          <p className="text-muted-foreground">
            Compare old vs new tax regime to find the best option for your income level
          </p>
        </div>
        
        {comparison && (
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              onClick={downloadReport}
              data-testid="button-download-report"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Report
            </Button>
            <Button 
              onClick={saveCalculation}
              disabled={isSaving}
              data-testid="button-save-calculation"
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Calculation
            </Button>
          </div>
        )}
      </div>

      {/* Tax Calculator Component */}
      <TaxCalculator onCalculationComplete={handleCalculationComplete} />

      {/* Detailed Comparison */}
      {comparison && (
        <div className="space-y-6">
          {/* Detailed Breakdown */}
          <Card data-testid="card-detailed-breakdown">
            <CardHeader>
              <CardTitle>Detailed Tax Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Old Regime Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">Old Tax Regime</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross Income</span>
                      <span data-testid="text-old-gross-detailed">
                        {formatCurrency(comparison.oldRegime.grossIncome)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Deductions</span>
                      <span className="text-green-600" data-testid="text-old-deductions-detailed">
                        -{formatCurrency(comparison.oldRegime.totalDeductions)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxable Income</span>
                      <span data-testid="text-old-taxable-detailed">
                        {formatCurrency(comparison.oldRegime.taxableIncome)}
                      </span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Income Tax</span>
                      <span data-testid="text-old-income-tax">
                        {formatCurrency(comparison.oldRegime.taxLiability)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Health & Education Cess (4%)</span>
                      <span data-testid="text-old-cess">
                        {formatCurrency(comparison.oldRegime.cess)}
                      </span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total Tax</span>
                      <span className="text-red-600" data-testid="text-old-total-tax">
                        {formatCurrency(comparison.oldRegime.totalTax)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Effective Tax Rate</span>
                      <span data-testid="text-old-effective-detailed">
                        {comparison.oldRegime.effectiveRate.toFixed(2)}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Marginal Tax Rate</span>
                      <span data-testid="text-old-marginal">
                        {comparison.oldRegime.marginalRate}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* New Regime Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-foreground">New Tax Regime</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gross Income</span>
                      <span data-testid="text-new-gross-detailed">
                        {formatCurrency(comparison.newRegime.grossIncome)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Standard Deduction</span>
                      <span className="text-green-600" data-testid="text-new-deductions-detailed">
                        -{formatCurrency(comparison.newRegime.totalDeductions)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Taxable Income</span>
                      <span data-testid="text-new-taxable-detailed">
                        {formatCurrency(comparison.newRegime.taxableIncome)}
                      </span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Income Tax</span>
                      <span data-testid="text-new-income-tax">
                        {formatCurrency(comparison.newRegime.taxLiability)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Health & Education Cess (4%)</span>
                      <span data-testid="text-new-cess">
                        {formatCurrency(comparison.newRegime.cess)}
                      </span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex justify-between font-semibold text-lg">
                      <span>Total Tax</span>
                      <span className="text-red-600" data-testid="text-new-total-tax">
                        {formatCurrency(comparison.newRegime.totalTax)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Effective Tax Rate</span>
                      <span data-testid="text-new-effective-detailed">
                        {comparison.newRegime.effectiveRate.toFixed(2)}%
                      </span>
                    </div>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Marginal Tax Rate</span>
                      <span data-testid="text-new-marginal">
                        {comparison.newRegime.marginalRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Key Insights */}
          <Card data-testid="card-key-insights">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lightbulb className="h-5 w-5" />
                <span>Key Insights</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 border border-border rounded-lg">
                  <div className="mb-2">
                    {comparison.savings > 0 ? (
                      <TrendingUp className="h-8 w-8 text-green-600 mx-auto" />
                    ) : (
                      <TrendingDown className="h-8 w-8 text-red-600 mx-auto" />
                    )}
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-absolute-savings">
                    {formatCurrency(Math.abs(comparison.savings))}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {comparison.savings > 0 ? 'Annual Savings' : 'Additional Tax'}
                  </p>
                </div>
                
                <div className="text-center p-4 border border-border rounded-lg">
                  <div className="mb-2">
                    <Calculator className="h-8 w-8 text-primary mx-auto" />
                  </div>
                  <p className="text-2xl font-bold" data-testid="text-savings-percentage">
                    {comparison.oldRegime.totalTax > 0 
                      ? Math.abs((comparison.savings / comparison.oldRegime.totalTax) * 100).toFixed(1)
                      : '0'
                    }%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {comparison.savings > 0 ? 'Tax Reduction' : 'Tax Increase'}
                  </p>
                </div>
                
                <div className="text-center p-4 border border-border rounded-lg">
                  <div className="mb-2">
                    <Badge 
                      variant={comparison.recommendedRegime === 'new' ? 'default' : 'secondary'}
                      className="text-lg px-4 py-2"
                    >
                      {comparison.recommendedRegime === 'new' ? 'NEW' : 'OLD'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Recommended Regime
                  </p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">💡 Recommendation</h4>
                <p className="text-sm text-muted-foreground">
                  {comparison.savings > 0 
                    ? `Switch to the ${comparison.recommendedRegime} tax regime to save ${formatCurrency(comparison.savings)} annually. This represents a ${Math.abs((comparison.savings / comparison.oldRegime.totalTax) * 100).toFixed(1)}% reduction in your tax liability.`
                    : `The ${comparison.recommendedRegime} tax regime is still recommended for your income level, though it may result in ${formatCurrency(Math.abs(comparison.savings))} additional tax.`
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
