import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  PlayCircle,
  Brain,
  ClipboardList,
  Settings,
  LogOut,
  Shield,
  Upload,
  BarChart3,
  Loader2,
  Download,
  PieChart,
  Search,
  Layers,
  Sparkles,
  Target,
} from "lucide-react";
import type { TseImportJob } from "@shared/schema";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";

const mainNavItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, permission: null },
  { title: "Partidos", url: "/parties", icon: Building2, permission: "manage_parties" },
  { title: "Candidatos", url: "/candidates", icon: Users, permission: "manage_candidates" },
  { title: "Cenários", url: "/scenarios", icon: FileText, permission: "manage_scenarios" },
];

const simulationNavItems = [
  { title: "Simulações", url: "/simulations", icon: PlayCircle, permission: "run_simulations" },
  { title: "Previsões IA", url: "/predictions", icon: Brain, permission: "ai_predictions" },
  { title: "Insights IA", url: "/ai-insights", icon: Sparkles, permission: "ai_predictions" },
  { title: "Previsões Eleitorais", url: "/forecasts", icon: Target, permission: "ai_predictions" },
  { title: "Relatórios de Projeção", url: "/projection-reports", icon: FileText, permission: "ai_predictions" },
  { title: "Dashboard Eleitoral", url: "/electoral-dashboard", icon: PieChart, permission: null },
  { title: "Painel Interativo", url: "/interactive-dashboard", icon: Layers, permission: null },
  { title: "Análise de Dados", url: "/data-analysis", icon: BarChart3, permission: null },
  { title: "Busca Semântica", url: "/semantic-search", icon: Search, permission: "ai_predictions" },
];

const adminNavItems = [
  { title: "Importação TSE", url: "/tse-import", icon: Upload, permission: "manage_users" },
  { title: "Auditoria", url: "/audit", icon: ClipboardList, permission: "view_audit" },
  { title: "Usuários", url: "/users", icon: Shield, permission: "manage_users" },
];

function ImportStatusIndicator() {
  const { data: jobs } = useQuery<TseImportJob[]>({
    queryKey: ["/api/imports/tse"],
    refetchInterval: (query) => {
      const data = query.state.data as TseImportJob[] | undefined;
      const hasActive = data?.some(job => 
        ["pending", "downloading", "extracting", "running", "processing"].includes(job.status)
      );
      return hasActive ? 2000 : 30000;
    },
  });

  const activeJobs = jobs?.filter(job => 
    ["pending", "downloading", "extracting", "running", "processing"].includes(job.status)
  ) || [];

  if (activeJobs.length === 0) return null;

  const downloadingCount = activeJobs.filter(j => j.status === "downloading").length;
  const processingCount = activeJobs.filter(j => 
    ["extracting", "running", "processing"].includes(j.status)
  ).length;

  return (
    <div className="mx-2 mb-2 p-2 rounded-md bg-primary/10 border border-primary/20" data-testid="indicator-active-imports">
      <Link href="/tse-import" data-testid="link-active-imports">
        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80">
          {downloadingCount > 0 ? (
            <Download className="h-4 w-4 text-primary animate-pulse" />
          ) : (
            <Loader2 className="h-4 w-4 text-primary animate-spin" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-primary" data-testid="text-active-import-count">
              {activeJobs.length} importação{activeJobs.length > 1 ? "ões" : ""} ativa{activeJobs.length > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-import-status-detail">
              {downloadingCount > 0 && `${downloadingCount} baixando`}
              {downloadingCount > 0 && processingCount > 0 && ", "}
              {processingCount > 0 && `${processingCount} processando`}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout, hasPermission } = useAuth();

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    analyst: "Analista",
    viewer: "Visualizador",
  };

  const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
    admin: "default",
    analyst: "secondary",
    viewer: "outline",
  };

  function filterByPermission(items: typeof mainNavItems) {
    return items.filter((item) => !item.permission || hasPermission(item.permission));
  }

  return (
    <Sidebar className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-sidebar-primary flex items-center justify-center">
            <span className="text-sidebar-primary-foreground font-bold text-lg">TSE</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sidebar-foreground text-sm">SimulaVoto</span>
            <span className="text-xs text-sidebar-foreground/70">Sistema Eleitoral</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByPermission(mainNavItems).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    className="hover-elevate"
                    data-testid={`nav-${item.url.replace("/", "") || "dashboard"}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2">
            Simulação
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filterByPermission(simulationNavItems).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    className="hover-elevate"
                    data-testid={`nav-${item.url.replace("/", "")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {filterByPermission(adminNavItems).length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60 text-xs uppercase tracking-wider px-2">
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <ImportStatusIndicator />
              <SidebarMenu>
                {filterByPermission(adminNavItems).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      className="hover-elevate"
                      data-testid={`nav-${item.url.replace("/", "")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {user && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-sm">
                  {user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</span>
                <Badge
                  variant={roleBadgeVariant[user.role] || "outline"}
                  className="w-fit text-xs"
                >
                  {roleLabels[user.role] || user.role}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <SidebarMenuButton
                asChild
                className="flex-1 hover-elevate"
                data-testid="nav-settings"
              >
                <Link href="/settings">
                  <Settings className="h-4 w-4" />
                  <span>Config</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuButton
                onClick={logout}
                className="flex-1 hover-elevate text-destructive"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </SidebarMenuButton>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
