import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  BarChart3,
  PieChart,
  Target,
  Lightbulb,
  DollarSign
} from "lucide-react";

interface TaxCalculation {
  id: string;
  assessmentYear: string;
  grossIncome: string;
  totalDeductions: string;
  taxableIncome: string;
  oldRegimeTax: string;
  newRegimeTax: string;
  tdsDeducted?: string;
  refundAmount?: string;
  calculatedAt: string;
}

interface YearlyAnalysis {
  year: string;
  grossIncome: number;
  totalDeductions: number;
  taxLiability: number;
  effectiveRate: number;
  savings: number;
  incomeGrowth?: number;
  taxGrowth?: number;
}

export default function YearAnalysis() {
  const { toast } = useToast();
  const [selectedYears, setSelectedYears] = useState('3');
  const [yearlyData, setYearlyData] = useState<YearlyAnalysis[]>([]);
  const [trends, setTrends] = useState<{
    avgIncomeGrowth: number;
    avgTaxGrowth: number;
    totalSavings: number;
    bestYear: string;
    worstYear: string;
  } | null>(null);

  const { data: calculations, isLoading, error } = useQuery<TaxCalculation[]>({
    queryKey: ['/api/tax-calculations'],
    retry: false,
  });

  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
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
  }, [error, toast]);

  useEffect(() => {
    if (calculations && calculations.length > 0) {
      // Process calculations to create yearly analysis
      const analysisData = calculations.slice(0, parseInt(selectedYears)).map((calc, index) => {
        const grossIncome = parseFloat(calc.grossIncome);
        const totalDeductions = parseFloat(calc.totalDeductions);
        const oldRegimeTax = parseFloat(calc.oldRegimeTax);
        const newRegimeTax = parseFloat(calc.newRegimeTax);
        const savings = oldRegimeTax - newRegimeTax;
        const effectiveRate = grossIncome > 0 ? (oldRegimeTax / grossIncome) * 100 : 0;
        
        // Calculate growth rates
        let incomeGrowth: number | undefined;
        let taxGrowth: number | undefined;
        
        if (index < calculations.length - 1) {
          const prevCalc = calculations[index + 1];
          const prevIncome = parseFloat(prevCalc.grossIncome);
          const prevTax = parseFloat(prevCalc.oldRegimeTax);
          
          if (prevIncome > 0) {
            incomeGrowth = ((grossIncome - prevIncome) / prevIncome) * 100;
          }
          if (prevTax > 0) {
            taxGrowth = ((oldRegimeTax - prevTax) / prevTax) * 100;
          }
        }

        return {
          year: calc.assessmentYear,
          grossIncome,
          totalDeductions,
          taxLiability: oldRegimeTax,
          effectiveRate,
          savings,
          incomeGrowth,
          taxGrowth
        };
      });

      setYearlyData(analysisData);

      // Calculate trends
      if (analysisData.length > 1) {
        const growthRates = analysisData.filter(d => d.incomeGrowth !== undefined);
        const taxGrowthRates = analysisData.filter(d => d.taxGrowth !== undefined);
        
        const avgIncomeGrowth = growthRates.length > 0 
          ? growthRates.reduce((sum, d) => sum + (d.incomeGrowth || 0), 0) / growthRates.length 
          : 0;
          
        const avgTaxGrowth = taxGrowthRates.length > 0
          ? taxGrowthRates.reduce((sum, d) => sum + (d.taxGrowth || 0), 0) / taxGrowthRates.length
          : 0;
        
        const totalSavings = analysisData.reduce((sum, d) => sum + Math.max(0, d.savings), 0);
        
        const bestYear = analysisData.reduce((best, current) => 
          current.savings > best.savings ? current : best
        ).year;
        
        const worstYear = analysisData.reduce((worst, current) => 
          current.savings < worst.savings ? current : worst
        ).year;

        setTrends({
          avgIncomeGrowth,
          avgTaxGrowth,
          totalSavings,
          bestYear,
          worstYear
        });
      }
    }
  }, [calculations, selectedYears]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="year-analysis-loading">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-20 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="year-analysis-main">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-year-analysis">
            Year-over-Year Tax Analysis
          </h1>
          <p className="text-muted-foreground">
            Analyze your tax trends and plan for future savings opportunities
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={selectedYears} onValueChange={setSelectedYears}>
            <SelectTrigger className="w-32" data-testid="select-years">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Last 3 Years</SelectItem>
              <SelectItem value="5">Last 5 Years</SelectItem>
              <SelectItem value="10">Last 10 Years</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trend Overview */}
      {trends && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card data-testid="card-avg-income-growth">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg. Income Growth</p>
                  <p className="text-2xl font-bold mt-2" data-testid="text-avg-income-growth">
                    {formatPercentage(trends.avgIncomeGrowth)}
                  </p>
                </div>
                <div className="bg-primary/10 p-3 rounded-lg">
                  {trends.avgIncomeGrowth >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-600" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-avg-tax-growth">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg. Tax Growth</p>
                  <p className="text-2xl font-bold mt-2" data-testid="text-avg-tax-growth">
                    {formatPercentage(trends.avgTaxGrowth)}
                  </p>
                </div>
                <div className="bg-red-50 p-3 rounded-lg">
                  {trends.avgTaxGrowth >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-red-600" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-green-600" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-total-savings">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Potential Savings</p>
                  <p className="text-2xl font-bold mt-2 text-green-600" data-testid="text-total-savings">
                    {formatCurrency(trends.totalSavings)}
                  </p>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-best-year">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Best Savings Year</p>
                  <p className="text-2xl font-bold mt-2" data-testid="text-best-year">
                    {trends.bestYear}
                  </p>
                </div>
                <div className="bg-secondary/10 p-3 rounded-lg">
                  <Target className="h-6 w-6 text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Yearly Data Table */}
      <Card data-testid="card-yearly-data">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Year-by-Year Breakdown</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {yearlyData.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-data">
              <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No tax data available</p>
              <p className="text-sm text-muted-foreground mt-2">
                Upload Form 16 documents to start tracking your tax trends
              </p>
              <Button variant="outline" className="mt-4" data-testid="button-upload-start">
                Upload Form 16
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Assessment Year</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Gross Income</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Deductions</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Tax Liability</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Effective Rate</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Potential Savings</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyData.map((year, index) => (
                    <tr key={year.year} className="border-b border-border hover:bg-muted/50" data-testid={`row-year-${index}`}>
                      <td className="py-3 px-4">
                        <span className="font-medium" data-testid={`text-year-${index}`}>{year.year}</span>
                      </td>
                      <td className="text-right py-3 px-4" data-testid={`text-income-${index}`}>
                        {formatCurrency(year.grossIncome)}
                      </td>
                      <td className="text-right py-3 px-4 text-green-600" data-testid={`text-deductions-${index}`}>
                        {formatCurrency(year.totalDeductions)}
                      </td>
                      <td className="text-right py-3 px-4" data-testid={`text-tax-${index}`}>
                        {formatCurrency(year.taxLiability)}
                      </td>
                      <td className="text-right py-3 px-4" data-testid={`text-rate-${index}`}>
                        {year.effectiveRate.toFixed(2)}%
                      </td>
                      <td className="text-right py-3 px-4" data-testid={`text-savings-${index}`}>
                        <span className={year.savings > 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(Math.abs(year.savings))}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4" data-testid={`text-growth-${index}`}>
                        {year.incomeGrowth !== undefined ? (
                          <div className="flex items-center justify-end space-x-1">
                            {year.incomeGrowth >= 0 ? (
                              <TrendingUp className="h-4 w-4 text-green-600" />
                            ) : (
                              <TrendingDown className="h-4 w-4 text-red-600" />
                            )}
                            <span className={year.incomeGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatPercentage(year.incomeGrowth)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Future Projections */}
      {trends && yearlyData.length > 1 && (
        <Card data-testid="card-future-projections">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <span>Future Projections</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-4">Next Year Projection</h3>
                
                {(() => {
                  const currentYear = yearlyData[0];
                  const projectedIncome = currentYear.grossIncome * (1 + trends.avgIncomeGrowth / 100);
                  const projectedTax = projectedIncome * (currentYear.effectiveRate / 100);
                  const projectedSavings = Math.max(0, projectedTax * 0.15); // Assume 15% savings potential
                  
                  return (
                    <div className="space-y-4">
                      <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                        <span className="text-muted-foreground">Projected Income</span>
                        <span className="font-medium" data-testid="text-projected-income">
                          {formatCurrency(projectedIncome)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between p-3 bg-muted/50 rounded-lg">
                        <span className="text-muted-foreground">Estimated Tax</span>
                        <span className="font-medium" data-testid="text-projected-tax">
                          {formatCurrency(projectedTax)}
                        </span>
                      </div>
                      
                      <div className="flex justify-between p-3 bg-green-50 rounded-lg">
                        <span className="text-muted-foreground">Potential Savings</span>
                        <span className="font-medium text-green-600" data-testid="text-projected-savings">
                          {formatCurrency(projectedSavings)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-4">
                  <Lightbulb className="h-5 w-5 inline mr-2" />
                  Tax Planning Insights
                </h3>
                
                <div className="space-y-3">
                  {trends.avgIncomeGrowth > 5 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg" data-testid="insight-income-growth">
                      <p className="text-sm">
                        <strong>High Income Growth:</strong> Your income is growing at {trends.avgIncomeGrowth.toFixed(1)}% annually. 
                        Consider increasing your investment allocations to maintain tax efficiency.
                      </p>
                    </div>
                  )}
                  
                  {trends.avgTaxGrowth > trends.avgIncomeGrowth && (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg" data-testid="insight-tax-growth">
                      <p className="text-sm">
                        <strong>Tax Optimization Needed:</strong> Your tax is growing faster than your income. 
                        Review deduction opportunities and consider the new tax regime.
                      </p>
                    </div>
                  )}
                  
                  {trends.totalSavings > 50000 && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg" data-testid="insight-good-savings">
                      <p className="text-sm">
                        <strong>Good Tax Planning:</strong> You have potential savings of {formatCurrency(trends.totalSavings)}. 
                        Continue optimizing your tax planning strategy.
                      </p>
                    </div>
                  )}
                  
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg" data-testid="insight-recommendation">
                    <p className="text-sm">
                      <strong>Next Steps:</strong> Based on your trends, consider maxing out 80C deductions 
                      and explore NPS contributions for additional tax benefits.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
