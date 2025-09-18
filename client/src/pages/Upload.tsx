import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { ObjectUploader } from "@/components/ObjectUploader";
import { apiRequest } from "@/lib/queryClient";
import { 
  Upload as UploadIcon, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Shield 
} from "lucide-react";
import type { UploadResult } from "@uppy/core";

interface TaxDocument {
  id: string;
  fileName: string;
  assessmentYear: string;
  status: string;
  uploadedAt: string;
  processedAt?: string;
}

export default function Upload() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [assessmentYear, setAssessmentYear] = useState(`${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`);
  const [isUploading, setIsUploading] = useState(false);

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { fileName: string; assessmentYear: string }) => {
      const response = await apiRequest('POST', '/api/tax-documents', data);
      return await response.json();
    },
    onError: (error) => {
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
        title: "Upload Error",
        description: "Failed to create document record",
        variant: "destructive",
      });
    }
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ documentId, uploadURL }: { documentId: string; uploadURL: string }) => {
      const response = await apiRequest('PUT', `/api/tax-documents/${documentId}/upload-complete`, {
        uploadURL
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tax-documents'] });
      toast({
        title: "Upload Successful",
        description: "Your Form 16 is being processed. You'll see the results in your dashboard shortly.",
      });
    },
    onError: (error) => {
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
        title: "Processing Error",
        description: "Upload completed but processing failed. Please try again.",
        variant: "destructive",
      });
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

  const handleUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (!result.successful || result.successful.length === 0) {
      toast({
        title: "Upload Failed",
        description: "No files were uploaded successfully",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const uploadedFile = result.successful[0];
    const fileName = uploadedFile.name || 'Form16.pdf';

    try {
      // Create document record first
      const documentResult = await createDocumentMutation.mutateAsync({
        fileName,
        assessmentYear
      });

      // Update with upload URL
      await updateDocumentMutation.mutateAsync({
        documentId: documentResult.document.id,
        uploadURL: uploadedFile.uploadURL as string
      });

    } catch (error) {
      console.error('Upload completion error:', error);
    } finally {
      setIsUploading(false);
    }
  };

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

  return (
    <div className="space-y-8" data-testid="upload-main">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="heading-upload">
          Upload Form 16
        </h1>
        <p className="text-muted-foreground">
          Upload your Form 16 PDF to automatically extract tax information and calculate your liabilities.
        </p>
      </div>

      {/* Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card data-testid="card-upload-form">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <UploadIcon className="h-5 w-5" />
                <span>Upload Document</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Assessment Year Selection */}
              <div>
                <Label htmlFor="assessment-year">Assessment Year</Label>
                <Input
                  id="assessment-year"
                  data-testid="input-assessment-year"
                  value={assessmentYear}
                  onChange={(e) => setAssessmentYear(e.target.value)}
                  placeholder="e.g., 2024-25"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the assessment year for this Form 16
                </p>
              </div>

              {/* File Upload */}
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760} // 10MB
                  onGetUploadParameters={handleGetUploadParameters}
                  onComplete={handleUploadComplete}
                  buttonClassName="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <div className="flex flex-col items-center space-y-4">
                    <div className="bg-primary/10 p-4 rounded-full">
                      <UploadIcon className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">Choose Form 16 PDF</h3>
                      <p className="text-muted-foreground mt-1">
                        Click to browse or drag and drop your file here
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Maximum file size: 10MB • Supported format: PDF only
                      </p>
                    </div>
                  </div>
                </ObjectUploader>

                {isUploading && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      <span className="text-sm text-muted-foreground">Processing upload...</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Information Panel */}
        <div className="space-y-6">
          {/* Security Notice */}
          <Card data-testid="card-security-notice">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-secondary" />
                <span>Security & Privacy</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-secondary rounded-full mt-2"></div>
                  <span className="text-muted-foreground">
                    Your documents are encrypted during upload and storage
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-secondary rounded-full mt-2"></div>
                  <span className="text-muted-foreground">
                    Only you can access your tax documents and data
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-secondary rounded-full mt-2"></div>
                  <span className="text-muted-foreground">
                    We never share your information with third parties
                  </span>
                </div>
                <div className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-secondary rounded-full mt-2"></div>
                  <span className="text-muted-foreground">
                    Documents are automatically processed using AI
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* What We Extract */}
          <Card data-testid="card-extraction-info">
            <CardHeader>
              <CardTitle>What We Extract</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Basic salary and allowances</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Tax deducted at source (TDS)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Section 80C, 80D deductions</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>HRA and other exemptions</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>PAN and employer details</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Processing Time */}
          <Card data-testid="card-processing-time">
            <CardHeader>
              <CardTitle>Processing Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-3">
                  <Clock className="h-6 w-6 text-primary" />
                </div>
                <p className="font-semibold">Usually under 2 minutes</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Most documents are processed automatically within seconds
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Upload Instructions */}
      <Card data-testid="card-upload-tips">
        <CardHeader>
          <CardTitle>Tips for Best Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">Document Quality</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Use the original PDF from your employer</li>
                <li>• Both text-based and scanned/image PDFs are supported</li>
                <li>• Ensure all text is clearly readable for best accuracy</li>
                <li>• Check that all pages are included</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Common Issues</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Password-protected PDFs may not process</li>
                <li>• Very old format documents might need manual entry</li>
                <li>• Corrupted files will fail processing</li>
                <li>• Non-standard Form 16 formats may have limited extraction</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
