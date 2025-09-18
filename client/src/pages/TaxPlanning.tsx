import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Lightbulb, Calculator, TrendingUp, AlertCircle, CheckCircle, DollarSign } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface UserProfile {
  age?: number;
  hasParents?: boolean;
  isMetroCity?: boolean;
  hasHomeLoan?: boolean;
  investmentRiskProfile?: 'conservative' | 'moderate' | 'aggressive';
}

interface TaxSuggestion {
  section: string;
  suggestion: string;
  currentAmount: number;
  maxAmount: number;
  potentialSaving: number;
  priority: number;
  category: 'investment' | 'insurance' | 'loan' | 'savings' | 'strategy';
  urgency: 'high' | 'medium' | 'low';
}

interface SuggestionsResponse {
  suggestions: TaxSuggestion[];
  totalPotentialSaving: number;
  highPrioritySuggestions: number;
}

export default function TaxPlanning() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    grossIncome: '',
    assessmentYear: '2024-25',
    currentDeductions: {
      '80C': '',
      '80D': '',
      '80CCD1B': '',
      '80G': '',
      '80TTA': '',
      '24': ''
    },
    userProfile: {
      age: undefined,
      hasParents: false,
      isMetroCity: false,
      hasHomeLoan: false,
      investmentRiskProfile: 'moderate'
    } as UserProfile
  });

  const [suggestions, setSuggestions] = useState<SuggestionsResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateSuggestionsMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/tax-suggestions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to generate suggestions');
      return response.json();
    },
    onSuccess: (data: SuggestionsResponse) => {
      setSuggestions(data);
      toast({
        title: "Tax Suggestions Generated",
        description: `Found ${data.suggestions.length} personalized recommendations with potential savings of ₹${data.totalPotentialSaving.toLocaleString()}`
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to generate tax suggestions. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleGenerateSuggestions = () => {
    if (!formData.grossIncome) {
      toast({
        title: "Missing Information",
        description: "Please enter your gross annual income.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);

    const deductions = Object.entries(formData.currentDeductions)
      .filter(([_, value]) => value && parseFloat(value) > 0)
      .reduce((acc, [key, value]) => {
        acc[key] = parseFloat(value);
        return acc;
      }, {} as Record<string, number>);

    const requestData = {
      grossIncome: formData.grossIncome,
      currentDeductions: deductions,
      assessmentYear: formData.assessmentYear,
      userProfile: {
        ...formData.userProfile,
        age: formData.userProfile.age || undefined
      },
      saveToDatabase: true
    };

    generateSuggestionsMutation.mutate(requestData);
    setIsGenerating(false);
  };

  const getCategoryIcon = (category: string) => {
    const icons = {
      investment: '📈',
      insurance: '🛡️',
      loan: '🏠',
      savings: '💰',
      strategy: '🎯'
    };
    return icons[category as keyof typeof icons] || '📋';
  };

  const getUrgencyIcon = (urgency: string) => {
    const icons = {
      high: '🔥',
      medium: '⚡',
      low: '💡'
    };
    return icons[urgency as keyof typeof icons] || '💡';
  };

  const getUrgencyColor = (urgency: string) => {
    const colors = {
      high: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
      medium: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
      low: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800'
    };
    return colors[urgency as keyof typeof colors] || colors.low;
  };

  const totalCurrentDeductions = Object.values(formData.currentDeductions)
    .filter(val => val && parseFloat(val) > 0)
    .reduce((sum, val) => sum + parseFloat(val), 0);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          Smart Tax Planning Assistant
        </h1>
        <p className="text-lg text-muted-foreground mt-2">
          Get personalized tax-saving recommendations based on your financial profile
        </p>
      </div>

      <Tabs defaultValue="input" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2" data-testid="tabs-list">
          <TabsTrigger value="input" data-testid="tab-input">Your Information</TabsTrigger>
          <TabsTrigger value="suggestions" disabled={!suggestions} data-testid="tab-suggestions">
            Smart Recommendations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card data-testid="card-basic-info">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calculator className="h-5 w-5" />
                  <span>Income & Deductions</span>
                </CardTitle>
                <CardDescription>
                  Enter your current financial information for accurate suggestions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="grossIncome">Gross Annual Income</Label>
                    <Input
                      id="grossIncome"
                      type="number"
                      placeholder="₹15,00,000"
                      value={formData.grossIncome}
                      onChange={(e) => setFormData(prev => ({ ...prev, grossIncome: e.target.value }))}
                      data-testid="input-gross-income"
                    />
                  </div>
                  <div>
                    <Label htmlFor="assessmentYear">Assessment Year</Label>
                    <Select value={formData.assessmentYear} onValueChange={(value) => 
                      setFormData(prev => ({ ...prev, assessmentYear: value }))
                    }>
                      <SelectTrigger data-testid="select-assessment-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024-25">2024-25</SelectItem>
                        <SelectItem value="2023-24">2023-24</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Current Tax-Saving Investments</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(formData.currentDeductions).map(([section, value]) => (
                      <div key={section}>
                        <Label htmlFor={section} className="text-xs text-muted-foreground">
                          Section {section}
                        </Label>
                        <Input
                          id={section}
                          type="number"
                          placeholder="₹0"
                          value={value}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            currentDeductions: { ...prev.currentDeductions, [section]: e.target.value }
                          }))}
                          data-testid={`input-deduction-${section}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="text-sm">
                      Total: ₹{totalCurrentDeductions.toLocaleString()}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Profile Information */}
            <Card data-testid="card-profile-info">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>Personal Profile</span>
                </CardTitle>
                <CardDescription>
                  Help us personalize your tax-saving strategy
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    type="number"
                    placeholder="30"
                    value={formData.userProfile.age || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      userProfile: { ...prev.userProfile, age: e.target.value ? parseInt(e.target.value) : undefined }
                    }))}
                    data-testid="input-age"
                  />
                </div>

                <div>
                  <Label>Investment Risk Profile</Label>
                  <Select 
                    value={formData.userProfile.investmentRiskProfile} 
                    onValueChange={(value) => 
                      setFormData(prev => ({ 
                        ...prev, 
                        userProfile: { ...prev.userProfile, investmentRiskProfile: value as any }
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-risk-profile">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative (Safe returns)</SelectItem>
                      <SelectItem value="moderate">Moderate (Balanced approach)</SelectItem>
                      <SelectItem value="aggressive">Aggressive (High growth potential)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Additional Information</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="hasParents"
                        checked={formData.userProfile.hasParents}
                        onCheckedChange={(checked) =>
                          setFormData(prev => ({
                            ...prev,
                            userProfile: { ...prev.userProfile, hasParents: !!checked }
                          }))
                        }
                        data-testid="checkbox-has-parents"
                      />
                      <Label htmlFor="hasParents">I have dependent parents</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isMetroCity"
                        checked={formData.userProfile.isMetroCity}
                        onCheckedChange={(checked) =>
                          setFormData(prev => ({
                            ...prev,
                            userProfile: { ...prev.userProfile, isMetroCity: !!checked }
                          }))
                        }
                        data-testid="checkbox-metro-city"
                      />
                      <Label htmlFor="isMetroCity">I live in a metro city</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="hasHomeLoan"
                        checked={formData.userProfile.hasHomeLoan}
                        onCheckedChange={(checked) =>
                          setFormData(prev => ({
                            ...prev,
                            userProfile: { ...prev.userProfile, hasHomeLoan: !!checked }
                          }))
                        }
                        data-testid="checkbox-home-loan"
                      />
                      <Label htmlFor="hasHomeLoan">I have a home loan</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <Button 
                onClick={handleGenerateSuggestions}
                disabled={isGenerating || generateSuggestionsMutation.isPending}
                className="w-full"
                size="lg"
                data-testid="button-generate-suggestions"
              >
                <Lightbulb className="h-5 w-5 mr-2" />
                {isGenerating || generateSuggestionsMutation.isPending ? 'Generating...' : 'Get My Tax Planning Recommendations'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-6">
          {suggestions && (
            <>
              {/* Summary */}
              <Card data-testid="card-suggestions-summary">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Your Personalized Tax Strategy</span>
                    <Badge variant="default" className="text-lg px-4 py-1">
                      Save ₹{suggestions.totalPotentialSaving.toLocaleString()}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    We found {suggestions.suggestions.length} recommendations, including {suggestions.highPrioritySuggestions} high-priority actions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        ₹{suggestions.totalPotentialSaving.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Potential Savings</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {suggestions.suggestions.length}
                      </div>
                      <div className="text-sm text-muted-foreground">Recommendations</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {suggestions.highPrioritySuggestions}
                      </div>
                      <div className="text-sm text-muted-foreground">High Priority Actions</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Suggestions List */}
              <div className="space-y-4">
                {suggestions.suggestions.map((suggestion, index) => (
                  <Card 
                    key={index} 
                    className={`transition-all hover:shadow-sm ${getUrgencyColor(suggestion.urgency)}`}
                    data-testid={`suggestion-card-${index}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <span className="text-2xl">
                            {getUrgencyIcon(suggestion.urgency)}
                          </span>
                          <div>
                            <CardTitle className="text-lg flex items-center space-x-2">
                              <span>{getCategoryIcon(suggestion.category)}</span>
                              <span>{suggestion.category.charAt(0).toUpperCase() + suggestion.category.slice(1)}</span>
                              {suggestion.section && (
                                <Badge variant="outline" className="text-xs">
                                  {suggestion.section}
                                </Badge>
                              )}
                              <Badge 
                                variant={suggestion.urgency === 'high' ? 'destructive' : 
                                        suggestion.urgency === 'medium' ? 'secondary' : 'outline'}
                                className="text-xs"
                              >
                                {suggestion.urgency.toUpperCase()}
                              </Badge>
                            </CardTitle>
                          </div>
                        </div>
                        <Badge variant="default" className="text-sm font-semibold">
                          ₹{suggestion.potentialSaving.toLocaleString()} saved
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground mb-4 leading-relaxed">
                        {suggestion.suggestion}
                      </p>
                      
                      {(suggestion.currentAmount > 0 || suggestion.maxAmount > 0) && (
                        <div className="flex items-center justify-between text-sm bg-muted/30 p-3 rounded">
                          <span>Current Investment: ₹{suggestion.currentAmount.toLocaleString()}</span>
                          {suggestion.maxAmount > 0 && (
                            <span>Maximum Limit: ₹{suggestion.maxAmount.toLocaleString()}</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}