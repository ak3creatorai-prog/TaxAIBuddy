import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Shield, User, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAuthenticated } = useAuth();
  const [location] = useLocation();

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  const navigationItems = [
    { path: "/", label: "Dashboard", icon: "fas fa-tachometer-alt" },
    { path: "/upload", label: "Upload Form 16", icon: "fas fa-upload" },
    { path: "/tax-comparison", label: "Tax Comparison", icon: "fas fa-balance-scale" },
    { path: "/tax-planning", label: "Smart Tax Planning", icon: "fas fa-lightbulb" },
    { path: "/year-analysis", label: "Year Analysis", icon: "fas fa-chart-line" },
    { path: "/additional-income", label: "Additional Income", icon: "fas fa-plus-circle" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm" data-testid="header-main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <Link href="/" className="flex items-center space-x-3" data-testid="link-home">
              <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                <Calculator className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">EasyTaxAnalyser</h1>
<p className="text-xs text-muted-foreground">Smart Tax Analysis Tool</p>
              </div>
            </Link>
            
            {/* Security Badge */}
            <div className="hidden md:flex items-center space-x-2">
              <Badge variant="secondary" className="bg-secondary text-secondary-foreground">
                <Shield className="h-3 w-3 mr-1" />
                Bank-Level Security
              </Badge>
            </div>
            
            {/* User Profile */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <p className="text-sm font-medium" data-testid="text-user-name">
                    {user?.firstName || 'User'} {user?.lastName || ''}
                  </p>
                  {user?.pan && (
                    <p className="text-xs text-muted-foreground" data-testid="text-user-pan">
                      PAN: {user.pan}
                    </p>
                  )}
                </div>
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                  {user?.profileImageUrl ? (
                    <img 
                      src={user.profileImageUrl} 
                      alt="Profile" 
                      className="w-8 h-8 rounded-full object-cover" 
                    />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => window.location.href = '/api/logout'}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-card border-b border-border" data-testid="nav-main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 overflow-x-auto">
            {navigationItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  location === item.path
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`nav-link-${item.path.replace('/', '') || 'dashboard'}`}
              >
                <i className={`${item.icon} mr-2`}></i>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border mt-12" data-testid="footer-main">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-secondary" />
                <span>SSL Encrypted</span>
              </div>
              <div className="flex items-center space-x-2">
                <i className="fas fa-user-shield text-secondary"></i>
                <span>Data Privacy Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <i className="fas fa-server text-secondary"></i>
                <span>Secure Storage</span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground" data-testid="text-last-updated">
              Last Updated: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
