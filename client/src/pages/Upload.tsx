import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { TaxCalculator } from "@/components/TaxCalculator";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload as UploadIcon, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Shield,
  Plus,
  Trash2,
  Calculator,
  TrendingUp,
  DollarSign,
  Home,
  Briefcase,
  Edit3,
  Eye,
  BarChart3
} from "lucide-react";
import type { UploadResult } from "@uppy/core";

interface TaxDocument {
  id: string;
  fileName: string;
  assessmentYear: string;
  status: string;
  uploadedAt: string;
  processedAt?: string;
  extractedData?: {
    employerName?: string;
    employeeName?: string;
    pan?: string;
    assessmentYear?: string;
    grossSalary?: number;
    basicSalary?: number;
    hra?: number;
    otherAllowances?: number;
    tdsDeducted?: number;
    deductions?: { [section: string]: number };
    taxableIncome?: number;
  };
}

interface IncomeSource {
  id?: string;
  source: string;
  amount: string;
  description: string;
}

interface Investment {
  id?: string;
  section: string;
  type: string;
  amount: string;
  description: string;
}

interface AdditionalDeduction {
  id?: string;
  section: string;
  amount: string;
  description: string;
}

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const defaultAssessmentYear = `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
  
  // Use the same assessment year from localStorage that Dashboard uses
  const [assessmentYear, setAssessmentYear] = useState(() => {
    const saved = localStorage.getItem('selectedAssessmentYear');
    return saved || defaultAssessmentYear;
  });

  // Update localStorage when assessment year changes
  const handleAssessmentYearChange = (year: string) => {
    setAssessmentYear(year);
    localStorage.setItem('selectedAssessmentYear', year);
  };
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [extractedData, setExtractedData] = useState<TaxDocument['extractedData'] | null>(null);
  const [additionalIncome, setAdditionalIncome] = useState<IncomeSource[]>([]);
  const [additionalInvestments, setAdditionalInvestments] = useState<Investment[]>([]);
  const [additionalDeductions, setAdditionalDeductions] = useState<AdditionalDeduction[]>([]);
  const [currentDocument, setCurrentDocument] = useState<TaxDocument | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [taxResults, setTaxResults] = useState<any>(null);
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');
  const [processingError, setProcessingError] = useState<string | null>(null);

  // NEW: Synchronous upload and extract mutation with comprehensive logging and timeout
  const uploadAndExtractMutation = useMutation({
    mutationFn: async (data: { fileName: string; assessmentYear: string; uploadURL: string }) => {
      console.log('[Upload] Starting upload-and-extract request', {
        fileName: data.fileName,
        assessmentYear: data.assessmentYear,
        uploadURL: data.uploadURL.substring(0, 50) + '...'
      });
      console.time('upload_and_extract_request');
      
      // Add abort controller with 6-minute client timeout (matching backend OCR processing time)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log('[Upload] Client timeout reached (6min), aborting request');
        controller.abort();
      }, 360000);
      
      try {
        console.log('[Upload] Making API request...');
        const response = await fetch('/api/documents/upload-and-extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        console.timeEnd('upload_and_extract_request');
        console.log('[Upload] Response received, status:', response.status);
        
        if (!response.ok) {
          try {
            const errorData = await response.json();
            console.error('[Upload] Non-ok response:', response.status, errorData);
            const error = new Error(errorData.error || `HTTP ${response.status} error`);
            (error as any).status = response.status;
            (error as any).failureReason = errorData.failureReason;
            throw error;
          } catch (parseError) {
            // Fallback to text if JSON parsing fails
            const errorText = await response.text();
            console.error('[Upload] Non-ok response (text fallback):', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
        }
        
        const jsonData = await response.json();
        console.log('[Upload] Response parsed successfully:', jsonData);
        return jsonData;
      } catch (error) {
        clearTimeout(timeoutId);
        console.timeEnd('upload_and_extract_request');
        
        if (error instanceof DOMException && error.name === 'AbortError') {
          console.error('[Upload] Request was aborted due to timeout');
          throw new Error('Upload timed out after 6 minutes. Please try with a clearer or smaller PDF.');
        }
        
        console.error('[Upload] Request failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[Upload] Mutation succeeded with data:', data);
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tax-documents'] });
      
      if (data.success && data.document?.extractedData) {
        console.log('[Upload] Processing completed successfully, extracted data keys:', Object.keys(data.document.extractedData));
        setCurrentDocument(data.document);
        setExtractedData(data.document.extractedData);
        setProcessingStatus('completed');
        setCurrentStep(2);
        setIsUploading(false);
        toast({
          title: "Processing Complete",
          description: "Your Form 16 data has been extracted successfully!",
        });
      } else {
        console.log('[Upload] Processing failed, success:', data.success, 'error:', data.error);
        setProcessingStatus('failed');
        setProcessingError(data.error || "Extraction failed");
        setIsUploading(false);
        toast({
          title: "Processing Failed",
          description: data.error || "Failed to extract data from your Form 16.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('[Upload] Mutation failed with error:', error);
      console.error('[Upload] Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        failureReason: error.failureReason,
        stack: error instanceof Error ? error.stack : 'No stack'
      });
      
      setProcessingStatus('failed');
      
      // Enhanced error handling with user-friendly messages
      let errorMessage = error instanceof Error ? error.message : "Upload and extraction failed";
      let troubleshootingTips = '';
      
      // Use structured error information if available
      if (error.failureReason) {
        switch (error.failureReason) {
          case 'PDF_PASSWORD_PROTECTED':
            troubleshootingTips = 'Please remove password protection from your PDF and try again.';
            break;
          case 'PDF_CORRUPTED':
            troubleshootingTips = 'Your PDF file appears to be corrupted. Please try downloading it again or use a different file.';
            break;
          case 'PROCESSING_TIMEOUT':
            troubleshootingTips = 'The document is taking too long to process. Try uploading a clearer or smaller PDF.';
            break;
          case 'OCR_FAILURE':
            troubleshootingTips = 'Unable to read text from your PDF. Please ensure it\'s a clear scan or try a different file.';
            break;
          case 'FILE_TOO_LARGE':
            troubleshootingTips = 'Your file is too large. Please reduce the file size to under 50MB.';
            break;
          default:
            troubleshootingTips = 'Please ensure your PDF is a valid Form 16 document and try again.';
        }
      }
      
      const fullErrorMessage = `${errorMessage}${troubleshootingTips ? '\n\n' + troubleshootingTips : ''}`;
      setProcessingError(fullErrorMessage);
      setIsUploading(false);
      
      if (isUnauthorizedError(error)) {
        console.log('[Upload] Unauthorized error, redirecting to login');
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
        title: "Upload Error",
        description: troubleshootingTips || errorMessage,
        variant: "destructive",
      });
    },
    onSettled: () => {
      console.log('[Upload] Mutation settled, ensuring UI state is cleared');
      setIsUploading(false);
    }
  });

  const handleGetUploadParameters = async () => {
    try {
      const response = await apiRequest('POST', '/api/objects/upload');
      const data = await response.json();
      return {
        method: 'PUT' as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error('Error getting upload parameters:', error);
      throw error;
    }
  };

  // Helper function to extract object path from upload URL
  const extractObjectPath = (uploadURL: string): string => {
    if (!uploadURL.startsWith("https://storage.googleapis.com/")) {
      return uploadURL;
    }
    
    try {
      const url = new URL(uploadURL);
      const pathParts = url.pathname.split('/');
      // URL format: /bucket-name/private-dir/uploads/uuid
      // Extract the UUID (last part) to create /objects/uploads/uuid
      const objectId = pathParts[pathParts.length - 1];
      return `/objects/uploads/${objectId}`;
    } catch (error) {
      console.error('Error extracting object path:', error);
      return uploadURL;
    }
  };

  // No longer needed - processing is now synchronous

  const handleUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    console.log('[Upload] ObjectUploader completed with result:', {
      successful: result.successful?.length || 0,
      failed: result.failed?.length || 0
    });
    
    if (!result.successful || result.successful.length === 0) {
      console.error('[Upload] No files were uploaded successfully to GCS');
      toast({
        title: "Upload Failed",
        description: "No files were uploaded successfully",
        variant: "destructive",
      });
      return;
    }

    const uploadedFile = result.successful[0];
    const fileName = uploadedFile.name || 'Form16.pdf';
    const uploadURL = uploadedFile.uploadURL as string;
    
    console.log('[Upload] GCS upload successful:', {
      fileName,
      uploadURL: uploadURL.substring(0, 50) + '...',
      assessmentYear
    });

    setIsUploading(true);
    setProcessingStatus('processing');
    setProcessingError(null);
    
    try {
      console.log('[Upload] Starting synchronous extraction process...');
      await uploadAndExtractMutation.mutateAsync({
        fileName,
        assessmentYear,
        uploadURL
      });
      console.log('[Upload] Synchronous extraction completed successfully');
    } catch (error) {
      console.error('[Upload] Synchronous extraction failed:', error);
      setProcessingStatus('failed');
      setProcessingError(error instanceof Error ? error.message : "Upload and extraction failed");
      setIsUploading(false);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to process your document. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Add missing endpoint for fetching single document
  const fetchDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiRequest('GET', `/api/tax-documents/${documentId}`);
      return await response.json();
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'processing':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  // Helper functions for managing additional data
  const addIncomeSource = () => {
    setAdditionalIncome([...additionalIncome, { source: '', amount: '', description: '' }]);
  };

  const removeIncomeSource = (index: number) => {
    setAdditionalIncome(additionalIncome.filter((_, i) => i !== index));
  };

  const updateIncomeSource = (index: number, field: keyof IncomeSource, value: string) => {
    const updated = [...additionalIncome];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalIncome(updated);
  };

  const addInvestment = () => {
    setAdditionalInvestments([...additionalInvestments, { section: '', type: '', amount: '', description: '' }]);
  };

  const removeInvestment = (index: number) => {
    setAdditionalInvestments(additionalInvestments.filter((_, i) => i !== index));
  };

  const updateInvestment = (index: number, field: keyof Investment, value: string) => {
    const updated = [...additionalInvestments];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalInvestments(updated);
  };

  const addDeduction = () => {
    setAdditionalDeductions([...additionalDeductions, { section: '', amount: '', description: '' }]);
  };

  const removeDeduction = (index: number) => {
    setAdditionalDeductions(additionalDeductions.filter((_, i) => i !== index));
  };

  const updateDeduction = (index: number, field: keyof AdditionalDeduction, value: string) => {
    const updated = [...additionalDeductions];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalDeductions(updated);
  };

  // Handle tax analysis
  const handleAnalyze = async () => {
    if (!extractedData) {
      toast({
        title: "No Data Available",
        description: "Please upload and process a Form 16 first.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    try {
      // Calculate total income
      const totalAdditionalIncome = additionalIncome.reduce((sum, income) => 
        sum + (parseFloat(income.amount) || 0), 0
      );
      const grossIncome = (extractedData.grossSalary || 0) + totalAdditionalIncome;

      // Calculate total deductions
      const extractedDeductions = extractedData.deductions || {};
      const additionalDeductionsMap = additionalDeductions.reduce((acc, ded) => {
        if (ded.section && ded.amount) {
          acc[ded.section] = (parseFloat(ded.amount) || 0);
        }
        return acc;
      }, {} as Record<string, number>);
      
      const investmentDeductions = additionalInvestments.reduce((acc, inv) => {
        if (inv.section && inv.amount) {
          acc[inv.section] = (acc[inv.section] || 0) + (parseFloat(inv.amount) || 0);
        }
        return acc;
      }, {} as Record<string, number>);

      const allDeductions = { ...extractedDeductions, ...additionalDeductionsMap, ...investmentDeductions };

      // Call NEW tax calculation API
      const response = await fetch('/api/tax/calculate-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          grossIncome,
          additionalInvestments: allDeductions
        })
      });

      if (response.ok) {
        const results = await response.json();
        setTaxResults(results);
        setShowResults(true);
        setCurrentStep(4);
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
        toast({
          title: "Analysis Complete",
          description: "Your tax analysis has been calculated successfully!",
        });
      } else {
        throw new Error('Failed to calculate tax');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis Failed",
        description: "Failed to analyze your tax data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Retry processing function
  const handleRetryProcessing = () => {
    setProcessingStatus('idle');
    setProcessingError(null);
    setExtractedData(null);
    setCurrentStep(1);
    setIsUploading(false);
    toast({
      title: "Ready to Retry",
      description: "Please upload your Form 16 again.",
    });
  };

  const incomeSourceOptions = [
    { value: 'salary', label: 'Additional Salary' },
    { value: 'rental', label: 'Rental Income' },
    { value: 'business', label: 'Business Income' },
    { value: 'capital_gains', label: 'Capital Gains' },
    { value: 'other', label: 'Other Income' }
  ];

  const investmentSections = [
    { value: '80C', label: 'Section 80C (ELSS, PPF, NSC)' },
    { value: '80D', label: 'Section 80D (Health Insurance)' },
    { value: '80G', label: 'Section 80G (Donations)' },
    { value: '80E', label: 'Section 80E (Education Loan)' },
    { value: '80CCD1B', label: 'Section 80CCD(1B) (NPS)' },
    { value: 'HRA', label: 'HRA Exemption' }
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8" data-testid="upload-main">
      {/* Page Header with Progress */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4" data-testid="heading-upload">
          Smart Tax Analysis
        </h1>
        <p className="text-lg text-muted-foreground mb-6">
          Upload your Form 16, review extracted data, add additional information, and get comprehensive tax analysis
        </p>
        
        {/* Progress Indicator */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
            currentStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            <UploadIcon className="h-4 w-4" />
            <span className="font-medium">Upload</span>
          </div>
          <div className={`w-8 h-0.5 ${
            currentStep >= 2 ? 'bg-primary' : 'bg-muted'
          }`}></div>
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
            currentStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            <Eye className="h-4 w-4" />
            <span className="font-medium">Review</span>
          </div>
          <div className={`w-8 h-0.5 ${
            currentStep >= 3 ? 'bg-primary' : 'bg-muted'
          }`}></div>
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
            currentStep >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            <Edit3 className="h-4 w-4" />
            <span className="font-medium">Add Details</span>
          </div>
          <div className={`w-8 h-0.5 ${
            currentStep >= 4 ? 'bg-primary' : 'bg-muted'
          }`}></div>
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
            currentStep >= 4 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            <BarChart3 className="h-4 w-4" />
            <span className="font-medium">Results</span>
          </div>
        </div>
      </div>

      <Tabs value={currentStep.toString()} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="1" disabled={currentStep < 1}>Upload Form 16</TabsTrigger>
          <TabsTrigger value="2" disabled={currentStep < 2}>Review Data</TabsTrigger>
          <TabsTrigger value="3" disabled={currentStep < 3}>Add Details</TabsTrigger>
          <TabsTrigger value="4" disabled={currentStep < 4}>Tax Analysis</TabsTrigger>
        </TabsList>

        {/* Step 1: Upload Form 16 */}
        <TabsContent value="1" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card data-testid="card-upload-form">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <UploadIcon className="h-5 w-5" />
                    <span>Upload Your Form 16</span>
                  </CardTitle>
                  <CardDescription>
                    Upload your PDF document and we'll automatically extract all the tax information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Assessment Year Selection */}
                  <div>
                    <Label htmlFor="assessment-year">Assessment Year</Label>
                    <Select value={assessmentYear} onValueChange={handleAssessmentYearChange}>
                      <SelectTrigger data-testid="select-assessment-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024-25">2024-25</SelectItem>
                        <SelectItem value="2023-24">2023-24</SelectItem>
                        <SelectItem value="2022-23">2022-23</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* File Upload */}
                  <div className="border-2 border-dashed border-border rounded-lg hover:border-primary/50 transition-colors">
                    <div className="p-8 text-center">
                      <div className="flex flex-col items-center space-y-6">
                        <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-6 rounded-full">
                          <UploadIcon className="h-12 w-12 text-primary" />
                        </div>
                        <div className="space-y-4">
                          <div>
                            <h3 className="text-xl font-semibold mb-2">Upload Your Form 16 PDF</h3>
                            <p className="text-muted-foreground text-lg mb-3">
                              Drag and drop your file here, or click the button below
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Supports both text-based and scanned PDFs • Maximum size: 10MB
                            </p>
                          </div>
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={10485760} // 10MB
                            onGetUploadParameters={handleGetUploadParameters}
                            onComplete={handleUploadComplete}
                            buttonClassName="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-lg text-lg font-medium transition-colors"
                          >
                            <UploadIcon className="h-5 w-5 mr-2" />
                            Choose Form 16 PDF
                          </ObjectUploader>
                        </div>
                      </div>
                    </div>

                    {/* Processing Status */}
                    {processingStatus === 'processing' && (
                      <div className="border-t bg-muted/50 p-6">
                        <div className="flex items-center justify-center space-x-3">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                          <span className="text-lg text-muted-foreground">Extracting data from your Form 16...</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 text-center">Processing now happens instantly!</p>
                      </div>
                    )}
                    
                    {processingStatus === 'completed' && extractedData && (
                      <div className="border-t bg-green-50 dark:bg-green-900/20 p-6">
                        <div className="flex items-center justify-center space-x-3 text-green-700 dark:text-green-400">
                          <CheckCircle className="h-6 w-6" />
                          <span className="text-lg font-medium">Data extracted successfully!</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 text-center">Your Form 16 data is ready for review.</p>
                      </div>
                    )}
                    
                    {processingStatus === 'failed' && processingError && (
                      <div className="border-t bg-red-50 dark:bg-red-900/20 p-6">
                        <div className="flex items-center justify-center space-x-3 text-red-700 dark:text-red-400">
                          <AlertCircle className="h-6 w-6" />
                          <span className="text-lg font-medium">Processing failed</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 text-center">{processingError}</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3 mx-auto block"
                          onClick={handleRetryProcessing}
                          data-testid="button-retry-processing"
                        >
                          Try Again
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Information Panel */}
            <div className="space-y-6">
              {/* Security Notice */}
              <Card data-testid="card-security-notice" className="border-l-4 border-l-green-500">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-5 w-5 text-green-600" />
                    <span>Bank-Level Security</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>End-to-end encryption</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>Private data processing</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>No data sharing with third parties</span>
                    </div>
                    <div className="flex items-start space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <span>AI-powered extraction</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* What We Extract */}
              <Card data-testid="card-extraction-info">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span>Automatic Data Extraction</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Employee & employer details</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Gross salary breakdown</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Tax deductions (TDS)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>Investment deductions (80C, 80D, etc.)</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span>HRA and other exemptions</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Processing Info */}
              <Card data-testid="card-processing-time" className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="bg-blue-100 dark:bg-blue-900/50 p-4 rounded-full w-fit mx-auto mb-4">
                      <Clock className="h-8 w-8 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Quick Processing</h3>
                    <p className="text-muted-foreground">
                      Most Form 16 documents are processed in under 2 minutes
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Step 2: Review Extracted Data */}
        <TabsContent value="2" className="space-y-6">
          {processingStatus === 'processing' && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <h3 className="text-xl font-semibold">Processing Your Document</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Please wait while we extract data from your Form 16...
                  </p>
                  <p className="text-sm text-muted-foreground">This usually takes 1-2 minutes</p>
                </div>
              </CardContent>
            </Card>
          )}
          
          {processingStatus === 'failed' && (
            <Card className="border-red-200 dark:border-red-800">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <AlertCircle className="h-12 w-12 text-red-600" />
                  <h3 className="text-xl font-semibold text-red-600">Processing Failed</h3>
                  <div className="text-center max-w-md space-y-2">
                    <p className="text-muted-foreground">
                      {processingError || "We couldn't extract data from your Form 16. This might be due to:"}
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>Corrupted or invalid PDF file</li>
                      <li>Scanned document with poor quality</li>
                      <li>Unsupported PDF format</li>
                    </ul>
                  </div>
                  <div className="flex space-x-4">
                    <Button
                      onClick={handleRetryProcessing}
                      variant="default"
                      data-testid="button-retry-upload"
                    >
                      <UploadIcon className="h-4 w-4 mr-2" />
                      Try Another File
                    </Button>
                    <Button
                      onClick={() => window.location.href = '/'}
                      variant="outline"
                    >
                      Back to Dashboard
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {extractedData && processingStatus === 'completed' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Employee Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Briefcase className="h-5 w-5" />
                    <span>Employee Information</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Employee Name</Label>
                      <p className="font-medium">{extractedData.employeeName || 'Not found'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">PAN</Label>
                      <p className="font-medium">{extractedData.pan || 'Not found'}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Employer</Label>
                      <p className="font-medium">{extractedData.employerName || 'Not found'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Income Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <DollarSign className="h-5 w-5" />
                    <span>Income Details</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Gross Salary</Label>
                      <p className="font-medium text-lg">{extractedData.grossSalary ? formatCurrency(extractedData.grossSalary) : 'Not found'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Basic Salary</Label>
                      <p className="font-medium">{extractedData.basicSalary ? formatCurrency(extractedData.basicSalary) : 'Not found'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">HRA</Label>
                      <p className="font-medium">{extractedData.hra ? formatCurrency(extractedData.hra) : 'Not found'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">TDS Deducted</Label>
                      <p className="font-medium">{extractedData.tdsDeducted ? formatCurrency(extractedData.tdsDeducted) : 'Not found'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Deductions */}
              {extractedData.deductions && Object.keys(extractedData.deductions).length > 0 && (
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Calculator className="h-5 w-5" />
                      <span>Extracted Deductions</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(extractedData.deductions).map(([section, amount]) => (
                        <div key={section} className="text-center p-3 bg-muted/50 rounded-lg">
                          <p className="text-xs text-muted-foreground">Section {section}</p>
                          <p className="font-semibold">{formatCurrency(amount)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="lg:col-span-2 text-center pt-6">
                <Button 
                  onClick={() => setCurrentStep(3)} 
                  size="lg" 
                  className="px-8"
                  data-testid="button-proceed-to-add-details"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add Additional Information
                </Button>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <h3 className="text-lg font-semibold mb-2">Processing Your Document</h3>
                <p className="text-muted-foreground">Please wait while we extract data from your Form 16...</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Step 3: Add Additional Information */}
        <TabsContent value="3" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Additional Income Sources */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Additional Income</span>
                  </div>
                  <Button size="sm" onClick={addIncomeSource} data-testid="button-add-income">
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {additionalIncome.map((income, index) => (
                  <div key={index} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium">Income Source {index + 1}</Label>
                      <Button size="sm" variant="ghost" onClick={() => removeIncomeSource(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Select value={income.source} onValueChange={(value) => updateIncomeSource(index, 'source', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {incomeSourceOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={income.amount}
                      onChange={(e) => updateIncomeSource(index, 'amount', e.target.value)}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={income.description}
                      onChange={(e) => updateIncomeSource(index, 'description', e.target.value)}
                    />
                  </div>
                ))}
                {additionalIncome.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No additional income sources added
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Additional Investments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Calculator className="h-5 w-5" />
                    <span>Additional Investments</span>
                  </div>
                  <Button size="sm" onClick={addInvestment} data-testid="button-add-investment">
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {additionalInvestments.map((investment, index) => (
                  <div key={index} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium">Investment {index + 1}</Label>
                      <Button size="sm" variant="ghost" onClick={() => removeInvestment(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Select value={investment.section} onValueChange={(value) => updateInvestment(index, 'section', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select section" />
                      </SelectTrigger>
                      <SelectContent>
                        {investmentSections.map(section => (
                          <SelectItem key={section.value} value={section.value}>{section.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Investment type"
                      value={investment.type}
                      onChange={(e) => updateInvestment(index, 'type', e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={investment.amount}
                      onChange={(e) => updateInvestment(index, 'amount', e.target.value)}
                    />
                    <Input
                      placeholder="Description (optional)"
                      value={investment.description}
                      onChange={(e) => updateInvestment(index, 'description', e.target.value)}
                    />
                  </div>
                ))}
                {additionalInvestments.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No additional investments added
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Additional Deductions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Home className="h-5 w-5" />
                    <span>Other Deductions</span>
                  </div>
                  <Button size="sm" onClick={addDeduction} data-testid="button-add-deduction">
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {additionalDeductions.map((deduction, index) => (
                  <div key={index} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium">Deduction {index + 1}</Label>
                      <Button size="sm" variant="ghost" onClick={() => removeDeduction(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Section (e.g., 24B, 80TTA)"
                      value={deduction.section}
                      onChange={(e) => updateDeduction(index, 'section', e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={deduction.amount}
                      onChange={(e) => updateDeduction(index, 'amount', e.target.value)}
                    />
                    <Input
                      placeholder="Description"
                      value={deduction.description}
                      onChange={(e) => updateDeduction(index, 'description', e.target.value)}
                    />
                  </div>
                ))}
                {additionalDeductions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No additional deductions added
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Analyze Button */}
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <Button 
                  onClick={handleAnalyze} 
                  size="lg" 
                  className="px-12 py-6 text-lg"
                  disabled={isAnalyzing || !extractedData}
                  data-testid="button-analyze-tax"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-6 w-6 mr-3" />
                      Analyze Tax Liability
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground mt-3">
                  Generate comprehensive tax analysis comparing old vs new regime
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 4: Tax Analysis Results */}
        <TabsContent value="4" className="space-y-6">
          {taxResults && (
            <div className="space-y-6">
              {/* Results Summary */}
              <Card className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20">
                <CardHeader>
                  <CardTitle className="text-center text-2xl">
                    Tax Analysis Complete! 🎉
                  </CardTitle>
                  <CardDescription className="text-center text-lg">
                    Here's your comprehensive tax comparison for {assessmentYear}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Recommended Regime</h3>
                      <Badge className={`text-lg px-4 py-2 ${
                        taxResults.recommendedRegime === 'new' ? 'bg-blue-500' : 'bg-orange-500'
                      }`}>
                        {taxResults.recommendedRegime === 'new' ? 'New Tax Regime' : 'Old Tax Regime'}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Potential Savings</h3>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(Math.abs(taxResults.savings))}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Effective Tax Rate</h3>
                      <p className="text-2xl font-bold">
                        {taxResults.recommendedRegime === 'new' 
                          ? taxResults.newRegime.effectiveRate.toFixed(2)
                          : taxResults.oldRegime.effectiveRate.toFixed(2)
                        }%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Comparison */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="border-orange-200 dark:border-orange-800">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
                      <span>Old Tax Regime</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-muted-foreground">Gross Income</Label>
                        <p className="font-semibold">{formatCurrency(taxResults.oldRegime.grossIncome)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Total Deductions</Label>
                        <p className="font-semibold">{formatCurrency(taxResults.oldRegime.totalDeductions)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Taxable Income</Label>
                        <p className="font-semibold">{formatCurrency(taxResults.oldRegime.taxableIncome)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Tax + Cess</Label>
                        <p className="font-semibold text-lg">{formatCurrency(taxResults.oldRegime.totalTax)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-blue-200 dark:border-blue-800">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                      <span>New Tax Regime</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <Label className="text-muted-foreground">Gross Income</Label>
                        <p className="font-semibold">{formatCurrency(taxResults.newRegime.grossIncome)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Standard Deduction</Label>
                        <p className="font-semibold">{formatCurrency(taxResults.newRegime.totalDeductions)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Taxable Income</Label>
                        <p className="font-semibold">{formatCurrency(taxResults.newRegime.taxableIncome)}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Tax + Cess</Label>
                        <p className="font-semibold text-lg">{formatCurrency(taxResults.newRegime.totalTax)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Navigation */}
              <div className="text-center space-y-4">
                <p className="text-muted-foreground">
                  Your tax analysis has been saved to your dashboard for future reference
                </p>
                <div className="space-x-4">
                  <Button variant="outline" onClick={() => { setCurrentStep(1); setExtractedData(null); setShowResults(false); }}>
                    Analyze Another Form 16
                  </Button>
                  <Button onClick={() => window.location.href = '/'}>
                    View Dashboard
                  </Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
