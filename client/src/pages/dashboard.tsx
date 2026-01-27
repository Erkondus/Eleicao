import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Building2, Users, FileText, PlayCircle, TrendingUp, Calendar, 
  Brain, BarChart3, MessageSquareText, Target, Sparkles, ChevronRight,
  Activity, AlertTriangle, HelpCircle, RefreshCw, Clock, TrendingDown
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatsCard } from "@/components/stats-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import type { Scenario, Party, Simulation } from "@shared/schema";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { BrazilMap } from "@/components/brazil-map";
import { useState, useEffect } from "react";

interface MetricTooltipProps {
  children: React.ReactNode;
  content: string;
}

function MetricTooltip({ children, content }: MetricTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          {children}
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-sm">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

interface UpdateBadgeProps {
  label: string;
  isNew?: boolean;
  timestamp?: Date | null;
}

function UpdateBadge({ label, isNew, timestamp }: UpdateBadgeProps) {
  const [pulse, setPulse] = useState(isNew);
  
  useEffect(() => {
    if (isNew) {
      const timer = setTimeout(() => setPulse(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  return (
    <Badge 
      variant={isNew ? "default" : "secondary"} 
      className={`text-xs ${pulse ? "animate-pulse" : ""}`}
    >
      {isNew && <Activity className="h-3 w-3 mr-1" />}
      {label}
      {timestamp && (
        <span className="ml-1 opacity-70">
          {new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </Badge>
  );
}

interface AIFeatureCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  gradient: string;
  badge?: string;
  testId: string;
}

function AIFeatureCard({ title, description, icon: Icon, href, gradient, badge, testId }: AIFeatureCardProps) {
  return (
    <Link href={href} data-testid={testId}>
      <Card className="hover-elevate cursor-pointer h-full">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${gradient}`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{title}</h3>
                {badge && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {badge}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface SentimentEntity {
  name: string;
  sentiment: number;
  type?: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<{
    parties: number;
    candidates: number;
    scenarios: number;
    simulations: number;
  }>({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });

  const { data: recentScenarios, isLoading: scenariosLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
    refetchInterval: 30000,
  });

  const { data: recentSimulations, isLoading: simulationsLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/simulations/recent"],
    refetchInterval: 30000,
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  // Fetch real party votes data from TSE imports
  const { data: partyVotes } = useQuery<{
    party: string;
    partyNumber: number | null;
    votes: number;
    candidateCount: number;
  }[]>({
    queryKey: ["/api/analytics/votes-by-party"],
    refetchInterval: 60000,
  });

  const { data: sentimentData } = useQuery<{ entities: SentimentEntity[] }>({
    queryKey: ["/api/sentiment/summary"],
    refetchInterval: 60000,
  });

  const { data: crisisAlerts } = useQuery<{ unacknowledged: number }>({
    queryKey: ["/api/sentiment/alerts/count"],
    refetchInterval: 30000,
  });

  // Fetch real activity trend data (scenarios and simulations per day)
  const { data: activityTrend } = useQuery<{ day: string; simulacoes: number; cenarios: number }[]>({
    queryKey: ["/api/activity-trend"],
    refetchInterval: 60000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (
          key === '/api/stats' ||
          key === '/api/scenarios' ||
          key === '/api/simulations/recent' ||
          key === '/api/parties' ||
          key === '/api/analytics/votes-by-party' ||
          key === '/api/activity-trend' ||
          key === '/api/sentiment/summary' ||
          key === '/api/sentiment/alerts/count'
        );
      }
    });
    setLastRefresh(new Date());
    setIsRefreshing(false);
  };

  const chartColors = [
    "hsl(210, 100%, 20%)",
    "hsl(45, 100%, 50%)",
    "hsl(145, 63%, 42%)",
    "hsl(4, 84%, 49%)",
    "hsl(280, 60%, 40%)",
    "hsl(200, 80%, 50%)",
    "hsl(30, 90%, 50%)",
    "hsl(320, 70%, 50%)",
  ];

  // Use real party votes data from TSE imports
  const partyChartData = partyVotes?.slice(0, 8).map((pv, i) => {
    // Try to find matching party for color
    const matchingParty = parties?.find(p => p.abbreviation === pv.party || p.number === pv.partyNumber);
    return {
      name: pv.party,
      value: pv.votes,
      color: matchingParty?.color || chartColors[i % chartColors.length],
    };
  }) || [];

  // Use real activity trend data from API
  const trendData = activityTrend || [];

  const aiFeatures = [
    {
      title: "Previsão de Resultados",
      description: "Análise preditiva com Monte Carlo e machine learning para projetar resultados eleitorais",
      icon: BarChart3,
      href: "/predictions",
      gradient: "bg-gradient-to-br from-blue-500 to-blue-700",
      badge: "GPT-4o",
      testId: "card-ai-predictions"
    },
    {
      title: "Análise de Sentimento",
      description: "Monitoramento de sentimento em tempo real com detecção automática de crises",
      icon: MessageSquareText,
      href: "/sentiment-analysis",
      gradient: "bg-gradient-to-br from-purple-500 to-purple-700",
      badge: crisisAlerts?.unacknowledged ? `${crisisAlerts.unacknowledged} alertas` : undefined,
      testId: "card-ai-sentiment"
    },
    {
      title: "Simulador de Cenários",
      description: "Crie e compare cenários eleitorais com distribuição proporcional D'Hondt",
      icon: Target,
      href: "/simulations",
      gradient: "bg-gradient-to-br from-green-500 to-green-700",
      testId: "card-ai-simulator"
    },
    {
      title: "Estrategista de Campanha",
      description: "Identificação de segmentos de alto impacto e estratégias de comunicação com IA",
      icon: Sparkles,
      href: "/campaign-insights",
      gradient: "bg-gradient-to-br from-amber-500 to-orange-600",
      badge: "Novo",
      testId: "card-ai-campaign"
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title={`Bem-vindo, ${user?.name.split(" ")[0] || "Usuário"}`}
          description="Painel de controle do sistema de simulação eleitoral"
        />
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={isRefreshing}
                data-testid="button-refresh-dashboard"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Última atualização: {lastRefresh.toLocaleTimeString("pt-BR")}
            </TooltipContent>
          </Tooltip>
          <Badge variant="outline" className="hidden sm:flex items-center gap-1" data-testid="badge-auto-refresh">
            <Clock className="h-3 w-3" />
            Auto-refresh: 30s
          </Badge>
        </div>
      </div>

      <section aria-label="Estatísticas principais">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div data-testid="stat-parties">
                    <StatsCard
                      title="Partidos"
                      value={stats?.parties || 0}
                      description="Partidos cadastrados"
                      icon={Building2}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Total de partidos políticos registrados no sistema, incluindo federações e coligações
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div data-testid="stat-candidates">
                    <StatsCard
                      title="Candidatos"
                      value={stats?.candidates || 0}
                      description="Candidatos registrados"
                      icon={Users}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Total de candidatos cadastrados, vinculados a partidos e elegíveis para simulações
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div data-testid="stat-scenarios">
                    <StatsCard
                      title="Cenários"
                      value={stats?.scenarios || 0}
                      description="Cenários eleitorais"
                      icon={FileText}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Cenários eleitorais configurados com número de vagas, zona eleitoral e regras específicas
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div data-testid="stat-simulations">
                    <StatsCard
                      title="Simulações"
                      value={stats?.simulations || 0}
                      description="Simulações realizadas"
                      icon={PlayCircle}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Número total de simulações executadas usando o método proporcional D'Hondt
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </section>

      <section aria-label="IA Avançada" className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70">
            <Brain className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">IA Avançada</h2>
            <p className="text-sm text-muted-foreground">Recursos de inteligência artificial para análise eleitoral</p>
          </div>
          {crisisAlerts?.unacknowledged && crisisAlerts.unacknowledged > 0 && (
            <Badge variant="destructive" className="ml-auto animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {crisisAlerts.unacknowledged} alerta{crisisAlerts.unacknowledged > 1 ? "s" : ""} pendente{crisisAlerts.unacknowledged > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {aiFeatures.map((feature) => (
            <AIFeatureCard key={feature.href} {...feature} />
          ))}
        </div>
        
        {sentimentData?.entities && sentimentData.entities.length > 0 && (
          <Card data-testid="card-sentiment-summary">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <MessageSquareText className="h-5 w-5 text-purple-500" />
                  <CardTitle className="text-base">Resumo de Sentimento</CardTitle>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/sentiment-analysis" data-testid="link-sentiment-details">Ver detalhes</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {sentimentData.entities.slice(0, 6).map((entity, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/30"
                    data-testid={`sentiment-entity-${idx}`}
                  >
                    <span className="font-medium text-sm">{entity.name}</span>
                    <Badge 
                      variant={entity.sentiment >= 0.5 ? "default" : entity.sentiment >= 0 ? "secondary" : "destructive"}
                      className="text-xs"
                    >
                      {entity.sentiment >= 0.5 ? (
                        <TrendingUp className="h-3 w-3 mr-1" />
                      ) : entity.sentiment < 0 ? (
                        <TrendingDown className="h-3 w-3 mr-1" />
                      ) : null}
                      {(entity.sentiment * 100).toFixed(0)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <section aria-label="Visualizações" className="space-y-6">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-1">
            <BrazilMap />
          </div>
          <Card className="xl:col-span-2" data-testid="chart-votes-distribution">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div>
                  <MetricTooltip content="Distribuição de votos por partido com base nos dados importados do TSE. Valores reais das eleições.">
                    <CardTitle className="text-lg">Distribuição de Votos por Partido</CardTitle>
                  </MetricTooltip>
                  <CardDescription>Dados reais importados do TSE</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <UpdateBadge label="Dados TSE" />
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {partyChartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={partyChartData}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip
                        formatter={(value: number) => [value.toLocaleString("pt-BR"), "Votos"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {partyChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Cadastre partidos para ver a visualização
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="chart-seats-distribution">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <MetricTooltip content="Gráfico de pizza mostrando a distribuição proporcional de vagas entre os partidos, calculada pelo método D'Hondt conforme legislação eleitoral brasileira.">
                  <CardTitle className="text-lg">Distribuição de Vagas</CardTitle>
                </MetricTooltip>
                <CardDescription>Simulação da distribuição proporcional</CardDescription>
              </div>
              <UpdateBadge label="D'Hondt" />
            </CardHeader>
            <CardContent>
              {partyChartData.length > 0 ? (
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={partyChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name }) => name}
                        labelLine={false}
                      >
                        {partyChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => [value.toLocaleString("pt-BR"), "Votos"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Cadastre partidos para ver a visualização
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="chart-activity">
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <MetricTooltip content="Tendência de atividade no sistema nos últimos 7 dias, mostrando o volume de simulações e cenários criados por dia. Dados reais do banco de dados.">
                  <CardTitle className="text-lg">Atividade Recente</CardTitle>
                </MetricTooltip>
                <CardDescription>Simulações e cenários nos últimos 7 dias</CardDescription>
              </div>
              <UpdateBadge label="Dados reais" isNew={false} timestamp={lastRefresh} />
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="simulacoes" 
                        stroke="hsl(210, 100%, 40%)" 
                        strokeWidth={2}
                        dot={{ fill: "hsl(210, 100%, 40%)" }}
                        name="Simulações"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cenarios" 
                        stroke="hsl(45, 100%, 45%)" 
                        strokeWidth={2}
                        dot={{ fill: "hsl(45, 100%, 45%)" }}
                        name="Cenários"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  Carregando dados de atividade...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-label="Dados Recentes" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-recent-scenarios">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg">Cenários Recentes</CardTitle>
              <CardDescription>Últimos cenários eleitorais criados</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/scenarios" data-testid="link-view-scenarios">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {scenariosLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentScenarios && recentScenarios.length > 0 ? (
              <div className="space-y-3">
                {recentScenarios.slice(0, 5).map((scenario) => (
                  <div
                    key={scenario.id}
                    className="flex items-center justify-between p-3 rounded-md border hover-elevate gap-2"
                    data-testid={`row-scenario-${scenario.id}`}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium truncate" data-testid={`text-scenario-name-${scenario.id}`}>{scenario.name}</span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 shrink-0" />
                          {new Date(scenario.createdAt).toLocaleDateString("pt-BR")}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-mono" data-testid={`text-scenario-seats-${scenario.id}`}>{scenario.availableSeats} vagas</span>
                          </TooltipTrigger>
                          <TooltipContent>Número de vagas disponíveis neste cenário</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <Badge variant={scenario.status === "completed" ? "default" : "secondary"} className="shrink-0" data-testid={`badge-scenario-status-${scenario.id}`}>
                      {scenario.status === "completed" ? "Concluído" : "Rascunho"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="empty-scenarios">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum cenário criado ainda</p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/scenarios" data-testid="link-create-scenario">Criar primeiro cenário</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-recent-simulations">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-lg">Simulações Recentes</CardTitle>
              <CardDescription>Últimas simulações executadas</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/simulations" data-testid="link-view-simulations">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {simulationsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentSimulations && recentSimulations.length > 0 ? (
              <div className="space-y-3">
                {recentSimulations.slice(0, 5).map((simulation) => (
                  <div
                    key={simulation.id}
                    className="flex items-center justify-between p-3 rounded-md border hover-elevate gap-2"
                    data-testid={`row-simulation-${simulation.id}`}
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="font-medium truncate" data-testid={`text-simulation-name-${simulation.id}`}>{simulation.name}</span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>{new Date(simulation.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <Badge className="shrink-0" data-testid={`badge-simulation-status-${simulation.id}`}>Completo</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="empty-simulations">
                <PlayCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma simulação realizada</p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/simulations" data-testid="link-run-simulation">Executar simulação</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
