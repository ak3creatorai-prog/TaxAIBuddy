import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  ArrowLeft
} from "lucide-react";

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
    grossSalary?: number;
    tdsDeducted?: number;
  };
}

export default function Documents() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: documents, isLoading, error } = useQuery<TaxDocument[]>({
    queryKey: ['/api/tax-documents'],
    queryFn: async () => {
      const response = await fetch('/api/tax-documents', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    retry: false,
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

  const handleBackToDashboard = () => {
    setLocation('/');
  };

  const handleUploadNew = () => {
    setLocation('/upload');
  };

  if (error && isUnauthorizedError(error as Error)) {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });
    setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
    return null;
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="documents-loading">
        <div className="flex items-center space-x-4 mb-6">
          <Button variant="outline" size="sm" onClick={handleBackToDashboard}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
        <div className="grid gap-4">
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
    <div className="max-w-6xl mx-auto p-6 space-y-6" data-testid="documents-main">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={handleBackToDashboard} data-testid="button-back-dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
              All Documents
            </h1>
            <p className="text-muted-foreground">
              {documents?.length || 0} Form 16 documents uploaded
            </p>
          </div>
        </div>
        <Button onClick={handleUploadNew} data-testid="button-upload-new">
          <Upload className="h-4 w-4 mr-2" />
          Upload New Document
        </Button>
      </div>

      {/* Documents List */}
      {!documents || documents.length === 0 ? (
        <Card data-testid="card-no-documents">
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No documents uploaded yet</h3>
              <p className="mb-4">Upload your first Form 16 to get started with tax analysis</p>
              <Button onClick={handleUploadNew} data-testid="button-upload-first">
                <Upload className="h-4 w-4 mr-2" />
                Upload Form 16
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc, index) => (
            <Card key={doc.id} className="transition-all hover:shadow-sm" data-testid={`document-card-${index}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <FileText className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold" data-testid={`document-name-${index}`}>
                        {doc.fileName}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span data-testid={`document-year-${index}`}>
                          Assessment Year: {doc.assessmentYear}
                        </span>
                        <span data-testid={`document-date-${index}`}>
                          Uploaded: {new Date(doc.uploadedAt).toLocaleDateString()}
                        </span>
                        {doc.processedAt && (
                          <span data-testid={`document-processed-${index}`}>
                            Processed: {new Date(doc.processedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {doc.extractedData && (
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          {doc.extractedData.employerName && (
                            <span data-testid={`document-employer-${index}`}>
                              Employer: {doc.extractedData.employerName}
                            </span>
                          )}
                          {doc.extractedData.grossSalary && (
                            <span data-testid={`document-salary-${index}`}>
                              Gross Salary: ₹{doc.extractedData.grossSalary.toLocaleString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(doc.status)}
                      <Badge 
                        variant={getStatusColor(doc.status) as "default" | "secondary" | "destructive" | "outline"}
                        data-testid={`document-status-${index}`}
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}