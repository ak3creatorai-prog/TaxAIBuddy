import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator, 
  Shield, 
  Upload, 
  BarChart3, 
  PiggyBank, 
  FileText, 
  Users,
  CheckCircle
} from "lucide-react";

export default function Landing() {
  const features = [
    {
      icon: <Upload className="h-6 w-6" />,
      title: "Secure PDF Upload",
      description: "Upload your Form 16 documents with bank-level encryption"
    },
    {
      icon: <Calculator className="h-6 w-6" />,
      title: "Auto Tax Calculation",
      description: "Automatic extraction and calculation of tax liability"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Regime Comparison",
      description: "Compare old vs new tax regime to maximize savings"
    },
    {
      icon: <PiggyBank className="h-6 w-6" />,
      title: "Tax Planning",
      description: "Get personalized recommendations for tax savings"
    },
    {
      icon: <FileText className="h-6 w-6" />,
      title: "Year-over-Year Analysis",
      description: "Track your tax trends and plan future investments"
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Complete Privacy",
      description: "Your financial data is encrypted and never shared"
    }
  ];

  const benefits = [
    "Save time with automated Form 16 processing",
    "Maximize tax savings with regime comparison",
    "Get personalized tax planning suggestions",
    "Track your tax history and trends",
    "Secure, encrypted document storage",
    "Professional-grade calculations"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                <Calculator className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">TaxAssist</h1>
                <p className="text-xs text-muted-foreground">Form 16 Tax Assistant</p>
              </div>
            </div>
            
            <Button 
              onClick={() => window.location.href = '/api/login'}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-login"
            >
              <Shield className="h-4 w-4 mr-2" />
              Secure Login
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <Badge className="bg-secondary text-secondary-foreground px-4 py-2 text-sm">
              <Shield className="h-4 w-4 mr-2" />
              Bank-Level Security • SSL Encrypted
            </Badge>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6" data-testid="heading-hero">
            Professional Indian Tax Assistant
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Upload your Form 16, get instant tax calculations, compare regimes, and receive 
            personalized tax planning advice. All your financial data stays secure and private.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-lg px-8 py-3"
              onClick={() => window.location.href = '/api/login'}
              data-testid="button-get-started"
            >
              <Calculator className="h-5 w-5 mr-2" />
              Get Started Free
            </Button>
            
            <Button 
              size="lg" 
              variant="outline" 
              className="text-lg px-8 py-3"
              data-testid="button-learn-more"
            >
              <FileText className="h-5 w-5 mr-2" />
              Learn More
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="bg-secondary/10 p-3 rounded-full w-fit mx-auto mb-2">
                <Shield className="h-6 w-6 text-secondary" />
              </div>
              <p className="text-sm font-medium">End-to-End Encrypted</p>
            </div>
            
            <div className="text-center">
              <div className="bg-secondary/10 p-3 rounded-full w-fit mx-auto mb-2">
                <Users className="h-6 w-6 text-secondary" />
              </div>
              <p className="text-sm font-medium">Trusted by Professionals</p>
            </div>
            
            <div className="text-center">
              <div className="bg-secondary/10 p-3 rounded-full w-fit mx-auto mb-2">
                <CheckCircle className="h-6 w-6 text-secondary" />
              </div>
              <p className="text-sm font-medium">100% Accurate Calculations</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4" data-testid="heading-features">
              Everything You Need for Tax Management
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Comprehensive tax analysis and planning tools designed for Indian taxpayers
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="bg-card border-border hover:shadow-lg transition-shadow" data-testid={`card-feature-${index}`}>
                <CardHeader>
                  <div className="bg-primary/10 text-primary p-3 rounded-lg w-fit">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-foreground mb-6" data-testid="heading-benefits">
                Why Choose TaxAssist?
              </h2>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3" data-testid={`benefit-${index}`}>
                    <CheckCircle className="h-5 w-5 text-secondary mt-0.5 flex-shrink-0" />
                    <p className="text-muted-foreground">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20" data-testid="card-security">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-6 w-6 text-primary" />
                  <span>Security First</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Your financial documents contain sensitive information. That's why we use:
                </p>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    <span className="text-sm">256-bit SSL encryption</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    <span className="text-sm">Secure cloud storage</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    <span className="text-sm">User-specific data isolation</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    <span className="text-sm">No data sharing with third parties</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-4" data-testid="heading-cta">
            Ready to Optimize Your Taxes?
          </h2>
          
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of professionals who trust TaxAssist for their tax planning needs.
            Start your free analysis today.
          </p>
          
          <Button 
            size="lg" 
            variant="secondary"
            className="text-lg px-8 py-3 bg-card text-card-foreground hover:bg-card/90"
            onClick={() => window.location.href = '/api/login'}
            data-testid="button-start-analysis"
          >
            <Shield className="h-5 w-5 mr-2" />
            Start Secure Analysis
          </Button>
        </div>
      </section>
    </div>
  );
}
