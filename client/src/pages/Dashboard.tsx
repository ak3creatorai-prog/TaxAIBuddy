import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { 
  TrendingUp, 
  TrendingDown, 
  Calculator, 
  FileText, 
  PiggyBank, 
  DollarSign,
  Lightbulb,
  ArrowUpRight
} from "lucide-react";

interface DashboardData {
  documents: any[];
  incomeSources: any[];
  investments: any[];
  calculations: any[];
  suggestions: any[];
  assessmentYear: string;
}

interface DashboardStats {
  totalIncome: number;
  totalDeductions: number;
  taxLiability: number;
  potentialSavings: number;
  documentsCount: number;
  lastCalculated: string;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    totalIncome: 0,
    totalDeductions: 0,
    taxLiability: 0,
    potentialSavings: 0,
    documentsCount: 0,
    lastCalculated: ''
  });

  const { data: dashboardData, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['/api/dashboard'],
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
    if (dashboardData) {
      // Calculate stats from dashboard data
      const totalIncome = dashboardData.incomeSources.reduce((sum, income) => 
        sum + parseFloat(income.amount || '0'), 0
      );
      
      const totalDeductions = dashboardData.investments.reduce((sum, investment) => 
        sum + parseFloat(investment.amount || '0'), 0
      );

      const latestCalculation = dashboardData.calculations[0];
      const taxLiability = latestCalculation ? parseFloat(latestCalculation.oldRegimeTax || '0') : 0;
      const newRegimeTax = latestCalculation ? parseFloat(latestCalculation.newRegimeTax || '0') : 0;
      const potentialSavings = Math.max(0, taxLiability - newRegimeTax);

      setStats({
        totalIncome,
        totalDeductions,
        taxLiability,
        potentialSavings,
        documentsCount: dashboardData.documents.length,
        lastCalculated: latestCalculation?.calculatedAt || ''
      });
    }
  }, [dashboardData]);

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getIncomeGrowth = () => {
    if (dashboardData?.calculations.length > 1) {
      const current = parseFloat(dashboardData.calculations[0]?.grossIncome || '0');
      const previous = parseFloat(dashboardData.calculations[1]?.grossIncome || '0');
      if (previous > 0) {
        return ((current - previous) / previous) * 100;
      }
    }
    return 0;
  };

  return (
    <div className="space-y-8" data-testid="dashboard-main">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-welcome">
          Tax Dashboard
        </h1>
        <p className="text-muted-foreground" data-testid="text-assessment-year">
          Assessment Year {dashboardData?.assessmentYear || '2024-25'}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card data-testid="card-total-income">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Income</p>
                <p className="text-2xl font-bold mt-2" data-testid="text-total-income">
                  {formatCurrency(stats.totalIncome)}
                </p>
                {getIncomeGrowth() !== 0 && (
                  <div className="flex items-center mt-2 text-sm">
                    {getIncomeGrowth() > 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                    )}
                    <span className={getIncomeGrowth() > 0 ? 'text-green-600' : 'text-red-600'}>
                      {Math.abs(getIncomeGrowth()).toFixed(1)}%
                    </span>
                    <span className="text-muted-foreground ml-1">from last year</span>
                  </div>
                )}
              </div>
              <div className="bg-primary/10 p-3 rounded-lg">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-deductions">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Deductions</p>
                <p className="text-2xl font-bold mt-2" data-testid="text-total-deductions">
                  {formatCurrency(stats.totalDeductions)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Tax savings applied
                </p>
              </div>
              <div className="bg-secondary/10 p-3 rounded-lg">
                <Calculator className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-tax-liability">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Current Tax Liability</p>
                <p className="text-2xl font-bold mt-2" data-testid="text-tax-liability">
                  {formatCurrency(stats.taxLiability)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Old regime
                </p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg">
                <FileText className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-potential-savings">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Potential Savings</p>
                <p className="text-2xl font-bold mt-2 text-green-600" data-testid="text-potential-savings">
                  {formatCurrency(stats.potentialSavings)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  With new regime
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <PiggyBank className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Documents */}
        <Card data-testid="card-recent-documents">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Documents</CardTitle>
              <Button variant="ghost" size="sm" data-testid="button-view-all-documents">
                View All
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboardData?.documents.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="text-no-documents">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No documents uploaded yet</p>
                <Button variant="outline" size="sm" className="mt-2" data-testid="button-upload-first">
                  Upload Form 16
                </Button>
              </div>
            ) : (
              dashboardData.documents.slice(0, 3).map((doc, index) => (
                <div key={doc.id} className="flex items-center space-x-3 p-3 border border-border rounded-lg" data-testid={`document-${index}`}>
                  <div className="bg-primary/10 p-2 rounded">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`document-name-${index}`}>
                      {doc.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`document-date-${index}`}>
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge 
                    variant={doc.status === 'completed' ? 'default' : doc.status === 'processing' ? 'secondary' : 'destructive'}
                    data-testid={`document-status-${index}`}
                  >
                    {doc.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Tax Suggestions */}
        <Card data-testid="card-tax-suggestions">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lightbulb className="h-5 w-5" />
                <span>Smart Tax Planning</span>
              </div>
              {dashboardData?.suggestions.length > 0 && (
                <Badge variant="secondary" className="text-xs" data-testid="suggestions-count">
                  {dashboardData.suggestions.filter(s => s.urgency === 'high').length} high priority
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboardData?.suggestions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground" data-testid="text-no-suggestions">
                <Lightbulb className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No suggestions available yet</p>
                <p className="text-xs">Upload Form 16 to get personalized advice</p>
              </div>
            ) : (
              dashboardData.suggestions
                .sort((a, b) => {
                  // Sort by urgency first (high > medium > low), then by potential savings
                  const urgencyOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                  const urgencyA = urgencyOrder[a.urgency as keyof typeof urgencyOrder] || 1;
                  const urgencyB = urgencyOrder[b.urgency as keyof typeof urgencyOrder] || 1;
                  
                  if (urgencyA !== urgencyB) return urgencyB - urgencyA;
                  
                  const savingsA = parseFloat(a.potentialSaving || '0');
                  const savingsB = parseFloat(b.potentialSaving || '0');
                  return savingsB - savingsA;
                })
                .slice(0, 4)
                .map((suggestion, index) => {
                  const urgencyColors = {
                    high: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
                    medium: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
                    low: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
                  };
                  
                  const urgencyIcons = {
                    high: '🔥',
                    medium: '⚡',
                    low: '💡'
                  };

                  const categoryIcons = {
                    investment: '📈',
                    insurance: '🛡️',
                    loan: '🏠',
                    savings: '💰',
                    strategy: '🎯'
                  };

                  return (
                    <div 
                      key={suggestion.id} 
                      className={`p-4 rounded-lg border transition-all hover:shadow-sm ${urgencyColors[suggestion.urgency as keyof typeof urgencyColors] || urgencyColors.low}`}
                      data-testid={`suggestion-${index}`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start space-x-2">
                          <span className="text-lg">{urgencyIcons[suggestion.urgency as keyof typeof urgencyIcons] || '💡'}</span>
                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <h4 className="text-sm font-semibold" data-testid={`suggestion-category-${index}`}>
                                {categoryIcons[suggestion.category as keyof typeof categoryIcons] || '📋'} 
                                {suggestion.category.charAt(0).toUpperCase() + suggestion.category.slice(1)}
                                {suggestion.section && (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    ({suggestion.section})
                                  </span>
                                )}
                              </h4>
                              <Badge 
                                variant={suggestion.urgency === 'high' ? 'destructive' : suggestion.urgency === 'medium' ? 'secondary' : 'outline'}
                                className="text-xs"
                                data-testid={`suggestion-urgency-${index}`}
                              >
                                {suggestion.urgency}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs font-semibold" data-testid={`suggestion-savings-${index}`}>
                          ₹{parseFloat(suggestion.potentialSaving || '0').toLocaleString()} saved
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-muted-foreground mb-3 leading-relaxed" data-testid={`suggestion-text-${index}`}>
                        {suggestion.suggestion}
                      </p>
                      
                      {(suggestion.currentAmount || suggestion.maxAmount) && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                          <span>Current: ₹{parseFloat(suggestion.currentAmount || '0').toLocaleString()}</span>
                          {suggestion.maxAmount && parseFloat(suggestion.maxAmount) > 0 && (
                            <span>Max: ₹{parseFloat(suggestion.maxAmount).toLocaleString()}</span>
                          )}
                        </div>
                      )}
                      
                      {!suggestion.isImplemented && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-2 text-xs" 
                          data-testid={`suggestion-action-${index}`}
                        >
                          Take Action
                        </Button>
                      )}
                    </div>
                  );
                })
            )}
            
            {dashboardData?.suggestions.length > 4 && (
              <div className="text-center pt-2">
                <Badge variant="outline" className="text-xs">
                  +{dashboardData.suggestions.length - 4} more suggestions available
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card data-testid="card-quick-actions">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start" data-testid="button-upload-form16">
              <FileText className="h-4 w-4 mr-2" />
              Upload Form 16
            </Button>
            
            <Button variant="outline" className="w-full justify-start" data-testid="button-compare-regimes">
              <Calculator className="h-4 w-4 mr-2" />
              Compare Tax Regimes
            </Button>
            
            <Button variant="outline" className="w-full justify-start" data-testid="button-add-income">
              <DollarSign className="h-4 w-4 mr-2" />
              Add Additional Income
            </Button>
            
            <Button variant="outline" className="w-full justify-start" data-testid="button-add-investment">
              <PiggyBank className="h-4 w-4 mr-2" />
              Add Investments
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Year-over-Year Summary */}
      {dashboardData?.calculations.length > 1 && (
        <Card data-testid="card-year-summary">
          <CardHeader>
            <CardTitle>Year-over-Year Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary" data-testid="text-income-growth">
                  {getIncomeGrowth() > 0 ? '+' : ''}{getIncomeGrowth().toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Income Growth</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-secondary" data-testid="text-avg-savings">
                  {formatCurrency(stats.potentialSavings)}
                </p>
                <p className="text-sm text-muted-foreground">Potential Annual Savings</p>
              </div>
              
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground" data-testid="text-effective-rate">
                  {stats.totalIncome > 0 ? ((stats.taxLiability / stats.totalIncome) * 100).toFixed(1) : '0'}%
                </p>
                <p className="text-sm text-muted-foreground">Effective Tax Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
