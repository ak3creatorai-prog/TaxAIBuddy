import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import { 
  Plus, 
  Edit, 
  Trash2, 
  DollarSign, 
  Home, 
  Briefcase, 
  TrendingUp,
  PiggyBank,
  Calculator,
  Save
} from "lucide-react";

interface IncomeSource {
  id: string;
  source: string;
  amount: string;
  description?: string;
  assessmentYear: string;
  createdAt: string;
}

interface Investment {
  id: string;
  section: string;
  type: string;
  amount: string;
  description?: string;
  assessmentYear: string;
  createdAt: string;
}

interface FormData {
  type: 'income' | 'investment';
  source?: string;
  section?: string;
  investmentType?: string;
  amount: string;
  description: string;
  assessmentYear: string;
}

const incomeSourceOptions = [
  { value: 'salary', label: 'Salary Income', icon: Briefcase },
  { value: 'rental', label: 'Rental Income', icon: Home },
  { value: 'business', label: 'Business Income', icon: TrendingUp },
  { value: 'capital_gains', label: 'Capital Gains', icon: DollarSign },
  { value: 'other', label: 'Other Income', icon: Plus }
];

const investmentSections = [
  { value: '80C', label: 'Section 80C (ELSS, PPF, NSC)', maxAmount: 150000 },
  { value: '80D', label: 'Section 80D (Health Insurance)', maxAmount: 25000 },
  { value: '80G', label: 'Section 80G (Donations)', maxAmount: null },
  { value: '80E', label: 'Section 80E (Education Loan)', maxAmount: null },
  { value: '80CCD1B', label: 'Section 80CCD(1B) (NPS)', maxAmount: 50000 },
  { value: 'HRA', label: 'HRA Exemption', maxAmount: null }
];

export default function AdditionalIncome() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [currentYear] = useState(`${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`);
  
  const [formData, setFormData] = useState<FormData>({
    type: 'income',
    amount: '',
    description: '',
    assessmentYear: currentYear
  });

  const { data: incomeSources, isLoading: incomeLoading } = useQuery<IncomeSource[]>({
    queryKey: ['/api/income-sources', { assessmentYear: currentYear }],
    retry: false,
  });

  const { data: investments, isLoading: investmentLoading } = useQuery<Investment[]>({
    queryKey: ['/api/investments', { assessmentYear: currentYear }],
    retry: false,
  });

  const createIncomeMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/income-sources', data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/income-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      toast({ title: "Income source added successfully" });
      resetForm();
    },
    onError: handleError
  });

  const createInvestmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/investments', data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/investments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      toast({ title: "Investment added successfully" });
      resetForm();
    },
    onError: handleError
  });

  const updateIncomeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PUT', `/api/income-sources/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/income-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      toast({ title: "Income source updated successfully" });
      resetForm();
    },
    onError: handleError
  });

  const updateInvestmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PUT', `/api/investments/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/investments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      toast({ title: "Investment updated successfully" });
      resetForm();
    },
    onError: handleError
  });

  const deleteIncomeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/income-sources/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/income-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      toast({ title: "Income source deleted successfully" });
    },
    onError: handleError
  });

  const deleteInvestmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/investments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/investments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      toast({ title: "Investment deleted successfully" });
    },
    onError: handleError
  });

  function handleError(error: Error) {
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
    toast({
      title: "Error",
      description: "An error occurred. Please try again.",
      variant: "destructive",
    });
  }

  const resetForm = () => {
    setFormData({
      type: 'income',
      amount: '',
      description: '',
      assessmentYear: currentYear
    });
    setIsFormOpen(false);
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount greater than 0",
        variant: "destructive",
      });
      return;
    }

    if (formData.type === 'income') {
      if (!formData.source) {
        toast({
          title: "Missing Information",
          description: "Please select an income source",
          variant: "destructive",
        });
        return;
      }

      const incomeData = {
        source: formData.source,
        amount: formData.amount,
        description: formData.description,
        assessmentYear: formData.assessmentYear
      };

      if (editingItem) {
        updateIncomeMutation.mutate({ id: editingItem, data: incomeData });
      } else {
        createIncomeMutation.mutate(incomeData);
      }
    } else {
      if (!formData.section || !formData.investmentType) {
        toast({
          title: "Missing Information",
          description: "Please select section and investment type",
          variant: "destructive",
        });
        return;
      }

      const investmentData = {
        section: formData.section,
        type: formData.investmentType,
        amount: formData.amount,
        description: formData.description,
        assessmentYear: formData.assessmentYear
      };

      if (editingItem) {
        updateInvestmentMutation.mutate({ id: editingItem, data: investmentData });
      } else {
        createInvestmentMutation.mutate(investmentData);
      }
    }
  };

  const startEdit = (type: 'income' | 'investment', item: IncomeSource | Investment) => {
    if (type === 'income') {
      const income = item as IncomeSource;
      setFormData({
        type: 'income',
        source: income.source,
        amount: income.amount,
        description: income.description || '',
        assessmentYear: income.assessmentYear
      });
    } else {
      const investment = item as Investment;
      setFormData({
        type: 'investment',
        section: investment.section,
        investmentType: investment.type,
        amount: investment.amount,
        description: investment.description || '',
        assessmentYear: investment.assessmentYear
      });
    }
    setEditingItem(item.id);
    setIsFormOpen(true);
  };

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  };

  const getTotalsByType = () => {
    const totalIncome = incomeSources?.reduce((sum, income) => 
      sum + parseFloat(income.amount), 0) || 0;
    
    const totalInvestments = investments?.reduce((sum, investment) => 
      sum + parseFloat(investment.amount), 0) || 0;
    
    return { totalIncome, totalInvestments };
  };

  const { totalIncome, totalInvestments } = getTotalsByType();

  return (
    <div className="space-y-8" data-testid="additional-income-main">
      {/* Page Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-additional-income">
            Additional Income & Investments
          </h1>
          <p className="text-muted-foreground">
            Add supplementary income sources and investment details for comprehensive tax planning
          </p>
        </div>
        
        <Button 
          onClick={() => setIsFormOpen(true)}
          data-testid="button-add-new"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Entry
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card data-testid="card-total-income">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Additional Income</p>
                <p className="text-2xl font-bold mt-2" data-testid="text-total-income">
                  {formatCurrency(totalIncome.toString())}
                </p>
              </div>
              <div className="bg-primary/10 p-3 rounded-lg">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-total-investments">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Investments</p>
                <p className="text-2xl font-bold mt-2" data-testid="text-total-investments">
                  {formatCurrency(totalInvestments.toString())}
                </p>
              </div>
              <div className="bg-secondary/10 p-3 rounded-lg">
                <PiggyBank className="h-6 w-6 text-secondary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-tax-impact">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Estimated Tax Impact</p>
                <p className="text-2xl font-bold mt-2" data-testid="text-tax-impact">
                  {formatCurrency((totalIncome * 0.3 - totalInvestments * 0.3).toString())}
                </p>
              </div>
              <div className="bg-accent/10 p-3 rounded-lg">
                <Calculator className="h-6 w-6 text-accent" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Modal */}
      {isFormOpen && (
        <Card data-testid="card-form">
          <CardHeader>
            <CardTitle>
              {editingItem ? 'Edit Entry' : 'Add New Entry'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Type Selection */}
              <div>
                <Label>Entry Type</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value: 'income' | 'investment') => 
                    setFormData(prev => ({ ...prev, type: value }))}
                  disabled={!!editingItem}
                >
                  <SelectTrigger data-testid="select-entry-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Additional Income</SelectItem>
                    <SelectItem value="investment">Investment / Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Income Source Selection */}
              {formData.type === 'income' && (
                <div>
                  <Label>Income Source</Label>
                  <Select 
                    value={formData.source} 
                    onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, source: value }))}
                  >
                    <SelectTrigger data-testid="select-income-source">
                      <SelectValue placeholder="Select income source" />
                    </SelectTrigger>
                    <SelectContent>
                      {incomeSourceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Investment Section Selection */}
              {formData.type === 'investment' && (
                <>
                  <div>
                    <Label>Tax Section</Label>
                    <Select 
                      value={formData.section} 
                      onValueChange={(value) => 
                        setFormData(prev => ({ ...prev, section: value }))}
                    >
                      <SelectTrigger data-testid="select-investment-section">
                        <SelectValue placeholder="Select tax section" />
                      </SelectTrigger>
                      <SelectContent>
                        {investmentSections.map((section) => (
                          <SelectItem key={section.value} value={section.value}>
                            <div>
                              <div>{section.label}</div>
                              {section.maxAmount && (
                                <div className="text-xs text-muted-foreground">
                                  Max: ₹{section.maxAmount.toLocaleString()}
                                </div>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Investment Type</Label>
                    <Input
                      placeholder="e.g., ELSS Mutual Fund, PPF, Health Insurance"
                      value={formData.investmentType || ''}
                      onChange={(e) => 
                        setFormData(prev => ({ ...prev, investmentType: e.target.value }))}
                      data-testid="input-investment-type"
                    />
                  </div>
                </>
              )}

              {/* Amount */}
              <div>
                <Label>Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={formData.amount}
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, amount: e.target.value }))}
                  data-testid="input-amount"
                />
              </div>

              {/* Description */}
              <div>
                <Label>Description (Optional)</Label>
                <Textarea
                  placeholder="Add any additional details"
                  value={formData.description}
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, description: e.target.value }))}
                  data-testid="textarea-description"
                />
              </div>

              {/* Assessment Year */}
              <div>
                <Label>Assessment Year</Label>
                <Input
                  value={formData.assessmentYear}
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, assessmentYear: e.target.value }))}
                  placeholder="e.g., 2024-25"
                  data-testid="input-assessment-year"
                />
              </div>

              {/* Form Actions */}
              <div className="flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={resetForm}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createIncomeMutation.isPending || createInvestmentMutation.isPending}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {editingItem ? 'Update' : 'Save'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Income Sources */}
      <Card data-testid="card-income-sources">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5" />
            <span>Additional Income Sources</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {incomeLoading ? (
            <div className="text-center py-8" data-testid="income-loading">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading income sources...</p>
            </div>
          ) : incomeSources?.length === 0 ? (
            <div className="text-center py-8" data-testid="no-income-sources">
              <DollarSign className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No additional income sources</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add rental income, business income, or other sources
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomeSources?.map((income, index) => (
                <div key={income.id} className="flex items-center justify-between p-4 border border-border rounded-lg" data-testid={`income-item-${index}`}>
                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-2 rounded">
                      {(() => {
                        const sourceOption = incomeSourceOptions.find(opt => opt.value === income.source);
                        const IconComponent = sourceOption?.icon || DollarSign;
                        return <IconComponent className="h-5 w-5 text-primary" />;
                      })()}
                    </div>
                    <div>
                      <p className="font-medium" data-testid={`income-source-${index}`}>
                        {incomeSourceOptions.find(opt => opt.value === income.source)?.label || income.source}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid={`income-description-${index}`}>
                        {income.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-semibold" data-testid={`income-amount-${index}`}>
                        {formatCurrency(income.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {income.assessmentYear}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => startEdit('income', income)}
                        data-testid={`button-edit-income-${index}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteIncomeMutation.mutate(income.id)}
                        disabled={deleteIncomeMutation.isPending}
                        data-testid={`button-delete-income-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Investments */}
      <Card data-testid="card-investments">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <PiggyBank className="h-5 w-5" />
            <span>Investments & Deductions</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {investmentLoading ? (
            <div className="text-center py-8" data-testid="investment-loading">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Loading investments...</p>
            </div>
          ) : investments?.length === 0 ? (
            <div className="text-center py-8" data-testid="no-investments">
              <PiggyBank className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium text-muted-foreground">No investments added</p>
              <p className="text-sm text-muted-foreground mt-2">
                Add ELSS, PPF, insurance, and other tax-saving investments
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {investments?.map((investment, index) => (
                <div key={investment.id} className="flex items-center justify-between p-4 border border-border rounded-lg" data-testid={`investment-item-${index}`}>
                  <div className="flex items-center space-x-4">
                    <div className="bg-secondary/10 p-2 rounded">
                      <PiggyBank className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <p className="font-medium" data-testid={`investment-type-${index}`}>
                          {investment.type}
                        </p>
                        <Badge variant="outline" data-testid={`investment-section-${index}`}>
                          {investment.section}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`investment-description-${index}`}>
                        {investment.description || 'No description'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="font-semibold text-secondary" data-testid={`investment-amount-${index}`}>
                        {formatCurrency(investment.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {investment.assessmentYear}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => startEdit('investment', investment)}
                        data-testid={`button-edit-investment-${index}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteInvestmentMutation.mutate(investment.id)}
                        disabled={deleteInvestmentMutation.isPending}
                        data-testid={`button-delete-investment-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
