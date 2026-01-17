import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Parties from "@/pages/parties";
import Candidates from "@/pages/candidates";
import Scenarios from "@/pages/scenarios";
import Simulations from "@/pages/simulations";
import Predictions from "@/pages/predictions";
import Audit from "@/pages/audit";
import Users from "@/pages/users";
import Settings from "@/pages/settings";
import Alliances from "@/pages/alliances";
import TseImport from "@/pages/tse-import";
import ScenarioCandidates from "@/pages/scenario-candidates";
import DataAnalysis from "@/pages/data-analysis";
import ElectoralDashboard from "@/pages/electoral-dashboard";
import SemanticSearch from "@/pages/semantic-search";
import InteractiveDashboard from "@/pages/interactive-dashboard";
import AIInsights from "@/pages/ai-insights";
import { Loader2 } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/parties" component={Parties} />
      <Route path="/candidates" component={Candidates} />
      <Route path="/scenarios" component={Scenarios} />
      <Route path="/scenarios/:scenarioId/alliances" component={Alliances} />
      <Route path="/scenarios/:scenarioId/candidates" component={ScenarioCandidates} />
      <Route path="/simulations" component={Simulations} />
      <Route path="/predictions" component={Predictions} />
      <Route path="/audit" component={Audit} />
      <Route path="/users" component={Users} />
      <Route path="/settings" component={Settings} />
      <Route path="/tse-import" component={TseImport} />
      <Route path="/data-analysis" component={DataAnalysis} />
      <Route path="/electoral-dashboard" component={ElectoralDashboard} />
      <Route path="/semantic-search" component={SemanticSearch} />
      <Route path="/interactive-dashboard" component={InteractiveDashboard} />
      <Route path="/ai-insights" component={AIInsights} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-6 bg-muted/30">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <AuthenticatedApp />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
