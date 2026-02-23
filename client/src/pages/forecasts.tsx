import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  TrendingUp, 
  TrendingDown,
  Target,
  Map,
  AlertTriangle,
  Activity,
  BarChart3,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Trash2,
  Calendar,
  MapPin,
  Percent,
  ArrowUp,
  ArrowDown,
  Minus,
  Info
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  ErrorBar,
  ComposedChart,
  Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

const CHART_COLORS = ["#003366", "#FFD700", "#1E90FF", "#32CD32", "#FF6347", "#9370DB", "#20B2AA", "#FF69B4"];

const BRAZIL_STATES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins"
};

const POSITIONS = [
  { value: "DEPUTADO FEDERAL", label: "Deputado Federal" },
  { value: "DEPUTADO ESTADUAL", label: "Deputado Estadual" },
  { value: "SENADOR", label: "Senador" },
  { value: "GOVERNADOR", label: "Governador" },
  { value: "PRESIDENTE", label: "Presidente" },
  { value: "VEREADOR", label: "Vereador" },
  { value: "PREFEITO", label: "Prefeito" },
];

interface ForecastRun {
  id: number;
  name: string;
  description?: string;
  targetYear: number;
  targetPosition?: string;
  targetState?: string;
  targetElectionType?: string;
  historicalYearsUsed?: number[];
  status: string;
  totalSimulations?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

interface ForecastResult {
  id: number;
  runId: number;
  resultType: string;
  entityName: string;
  predictedVoteShare?: string;
  voteShareLower?: string;
  voteShareUpper?: string;
  predictedVotes?: number;
  votesLower?: number;
  votesUpper?: number;
  predictedSeats?: number;
  seatsLower?: number;
  seatsUpper?: number;
  trendDirection?: string;
  trendStrength?: string;
  confidence?: string;
  historicalTrend?: { years: number[]; voteShares: number[] };
  influenceFactors?: { factor: string; weight: number; impact: string }[];
}

interface SwingRegion {
  id: number;
  runId: number;
  region: string;
  regionName: string;
  position?: string;
  marginPercent?: string;
  marginVotes?: number;
  volatilityScore?: string;
  swingMagnitude?: string;
  leadingEntity?: string;
  challengingEntity?: string;
  outcomeUncertainty?: string;
  keyFactors?: { factor: string; impact: string }[];
}

interface ForecastSummary {
  run: ForecastRun;
  topParties: ForecastResult[];
  swingRegions: SwingRegion[];
  narrative?: string;
}

export default function ForecastsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("list");
  const [selectedForecast, setSelectedForecast] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newForecast, setNewForecast] = useState({
    name: "",
    description: "",
    targetYear: new Date().getFullYear() + 2,
    targetPosition: "",
    targetState: "",
    targetElectionType: "",
  });

  const { data: forecasts, isLoading: forecastsLoading, refetch: refetchForecasts } = useQuery<ForecastRun[]>({
    queryKey: ["/api/forecasts"],
    refetchInterval: 5000,
  });

  const { data: forecastSummary, isLoading: summaryLoading } = useQuery<ForecastSummary>({
    queryKey: ["/api/forecasts", selectedForecast],
    enabled: !!selectedForecast,
  });

  const createForecastMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/forecasts", newForecast);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Previsão criada",
        description: "A previsão está sendo processada. Isso pode levar alguns minutos.",
      });
      setIsCreateDialogOpen(false);
      setNewForecast({
        name: "",
        description: "",
        targetYear: new Date().getFullYear() + 2,
        targetPosition: "",
        targetState: "",
        targetElectionType: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forecasts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar previsão",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteForecastMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/forecasts/${id}`);
    },
    onSuccess: () => {
      toast({
        title: "Previsão excluída",
        description: "A previsão foi removida com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/forecasts"] });
      if (selectedForecast) {
        setSelectedForecast(null);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir previsão",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Concluída</Badge>;
      case "running":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Em Execução</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
    }
  };

  const getTrendIcon = (direction?: string) => {
    switch (direction) {
      case "rising":
        return <ArrowUp className="w-4 h-4 text-green-500" />;
      case "falling":
        return <ArrowDown className="w-4 h-4 text-red-500" />;
      default:
        return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const renderForecastsList = () => {
    if (forecastsLoading) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (!forecasts || forecasts.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma previsão encontrada</h3>
            <p className="text-muted-foreground mb-4">
              Crie sua primeira previsão eleitoral usando dados históricos e simulações Monte Carlo.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-create-first-forecast">
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeira Previsão
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-4">
        {forecasts.map((forecast) => (
          <Card key={forecast.id} className="hover-elevate cursor-pointer" onClick={() => {
            setSelectedForecast(forecast.id);
            setActiveTab("details");
          }} data-testid={`card-forecast-${forecast.id}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-lg">{forecast.name}</CardTitle>
                <CardDescription>
                  {forecast.description || `Previsão para ${forecast.targetYear}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(forecast.status)}
                {user?.role === "admin" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteForecastMutation.mutate(forecast.id);
                    }}
                    data-testid={`button-delete-forecast-${forecast.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Ano alvo: {forecast.targetYear}</span>
                </div>
                {forecast.targetPosition && (
                  <div className="flex items-center gap-1">
                    <Target className="w-4 h-4" />
                    <span>{forecast.targetPosition}</span>
                  </div>
                )}
                {forecast.targetState && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{BRAZIL_STATES[forecast.targetState] || forecast.targetState}</span>
                  </div>
                )}
                {forecast.totalSimulations && forecast.totalSimulations > 0 && (
                  <div className="flex items-center gap-1">
                    <Activity className="w-4 h-4" />
                    <span>{forecast.totalSimulations.toLocaleString("pt-BR")} simulações</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderForecastDetails = () => {
    if (!selectedForecast) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <Eye className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Selecione uma previsão</h3>
            <p className="text-muted-foreground">
              Clique em uma previsão na lista para ver os detalhes.
            </p>
          </CardContent>
        </Card>
      );
    }

    if (summaryLoading) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      );
    }

    if (!forecastSummary) {
      return (
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Previsão não encontrada</h3>
          </CardContent>
        </Card>
      );
    }

    const { run, topParties, swingRegions } = forecastSummary;

    const partyChartData = topParties.map((party, index) => ({
      name: party.entityName,
      voteShare: parseFloat(party.predictedVoteShare || "0"),
      lower: parseFloat(party.voteShareLower || "0"),
      upper: parseFloat(party.voteShareUpper || "0"),
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{run.name}</h2>
            <p className="text-muted-foreground">{run.description}</p>
          </div>
          {getStatusBadge(run.status)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Ano Alvo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{run.targetYear}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Simulações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(run.totalSimulations || 0).toLocaleString("pt-BR")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Partidos Analisados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{topParties.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Regiões Voláteis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{swingRegions.length}</div>
            </CardContent>
          </Card>
        </div>

        {run.status === "running" && (
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-blue-700 dark:text-blue-400">
                  Previsão em execução. Os resultados serão atualizados automaticamente.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {run.status === "completed" && topParties.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Previsão por Partido
                </CardTitle>
                <CardDescription>
                  Projeções independentes por partido com intervalos de confiança de 95%. 
                  Os valores são estimativas individuais e não somam 100%.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div style={{ height: Math.max(320, partyChartData.length * 36) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={partyChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 'auto']} unit="%" />
                      <YAxis dataKey="name" type="category" width={80} />
                      <RechartsTooltip
                        formatter={(value: number, name: string) => {
                          if (name === "voteShare") return [`${value.toFixed(2)}%`, "Previsão"];
                          return [value, name];
                        }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-background border rounded-lg shadow-lg p-3">
                                <p className="font-semibold">{data.name}</p>
                                <p className="text-sm">Previsão: {data.voteShare.toFixed(2)}%</p>
                                <p className="text-sm text-muted-foreground">
                                  IC 95%: {data.lower.toFixed(2)}% - {data.upper.toFixed(2)}%
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="voteShare" fill="#003366" radius={[0, 4, 4, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Detalhes por Partido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-3">
                    {topParties.map((party, index) => (
                      <Card key={party.id} className="bg-muted/30">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              />
                              <span className="font-semibold">{party.entityName}</span>
                              {getTrendIcon(party.trendDirection)}
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">
                                Confiança: {(parseFloat(party.confidence || "0") * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Previsão</p>
                              <p className="font-semibold text-lg">
                                {parseFloat(party.predictedVoteShare || "0").toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">IC 95% Inferior</p>
                              <p className="font-medium">
                                {parseFloat(party.voteShareLower || "0").toFixed(2)}%
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">IC 95% Superior</p>
                              <p className="font-medium">
                                {parseFloat(party.voteShareUpper || "0").toFixed(2)}%
                              </p>
                            </div>
                          </div>
                          {party.influenceFactors && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(party.influenceFactors as { factor: string; impact: string }[]).map((f, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {f.factor}: {f.impact}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        )}

        {run.status === "completed" && swingRegions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Map className="w-5 h-5" />
                Regiões Voláteis (Swing Regions)
              </CardTitle>
              <CardDescription>
                Regiões com resultados incertos onde pequenas mudanças podem alterar o resultado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {swingRegions.map((region) => (
                  <Card key={region.id} className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span className="font-semibold">{region.regionName}</span>
                        </div>
                        <Badge variant="outline" className="border-amber-600 text-amber-700">
                          Volatilidade: {parseFloat(region.volatilityScore || "0").toFixed(1)}
                        </Badge>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Margem atual:</span>
                          <span className="font-medium">{parseFloat(region.marginPercent || "0").toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Líder:</span>
                          <span className="font-medium">{region.leadingEntity}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Desafiante:</span>
                          <span className="font-medium">{region.challengingEntity}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Incerteza:</span>
                          <Progress 
                            value={parseFloat(region.outcomeUncertainty || "0") * 100} 
                            className="w-24 h-2"
                          />
                        </div>
                      </div>
                      {region.keyFactors && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {(region.keyFactors as { factor: string; impact: string }[]).map((f, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {f.factor}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Previsões Eleitorais</h1>
          <p className="text-muted-foreground">
            Modelos preditivos com simulações Monte Carlo e análise de tendências históricas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchForecasts()} data-testid="button-refresh-forecasts">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-forecast">
                <Plus className="w-4 h-4 mr-2" />
                Nova Previsão
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Nova Previsão</DialogTitle>
                <DialogDescription>
                  Configure os parâmetros para gerar uma previsão eleitoral baseada em dados históricos.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Previsão</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Eleições 2026 - Deputado Federal"
                    value={newForecast.name}
                    onChange={(e) => setNewForecast({ ...newForecast, name: e.target.value })}
                    data-testid="input-forecast-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrição (opcional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Descreva o objetivo desta previsão..."
                    value={newForecast.description}
                    onChange={(e) => setNewForecast({ ...newForecast, description: e.target.value })}
                    data-testid="input-forecast-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetYear">Ano Alvo</Label>
                  <Input
                    id="targetYear"
                    type="number"
                    min={2024}
                    max={2050}
                    value={newForecast.targetYear}
                    onChange={(e) => setNewForecast({ ...newForecast, targetYear: parseInt(e.target.value) })}
                    data-testid="input-forecast-year"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetPosition">Cargo (opcional)</Label>
                  <Select
                    value={newForecast.targetPosition || "_all"}
                    onValueChange={(value) => setNewForecast({ ...newForecast, targetPosition: value === "_all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-forecast-position">
                      <SelectValue placeholder="Todos os cargos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Todos os cargos</SelectItem>
                      {POSITIONS.map((pos) => (
                        <SelectItem key={pos.value} value={pos.value}>{pos.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetState">Estado (opcional)</Label>
                  <Select
                    value={newForecast.targetState || "_all"}
                    onValueChange={(value) => setNewForecast({ ...newForecast, targetState: value === "_all" ? "" : value })}
                  >
                    <SelectTrigger data-testid="select-forecast-state">
                      <SelectValue placeholder="Nacional (todos os estados)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">Nacional</SelectItem>
                      {Object.entries(BRAZIL_STATES).map(([code, name]) => (
                        <SelectItem key={code} value={code}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel-forecast">
                  Cancelar
                </Button>
                <Button 
                  onClick={() => createForecastMutation.mutate()}
                  disabled={!newForecast.name || createForecastMutation.isPending}
                  data-testid="button-submit-forecast"
                >
                  {createForecastMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Criar Previsão
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <Info className="w-5 h-5 text-blue-600" />
        <p className="text-sm text-blue-700 dark:text-blue-400">
          As previsões utilizam dados históricos importados do TSE para identificar tendências e calcular intervalos de confiança 
          através de simulações Monte Carlo. Importe dados de múltiplos anos eleitorais para obter previsões mais precisas.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-forecasts-list">
            <BarChart3 className="w-4 h-4 mr-2" />
            Lista de Previsões
          </TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-forecasts-details">
            <Target className="w-4 h-4 mr-2" />
            Detalhes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          {renderForecastsList()}
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          {renderForecastDetails()}
        </TabsContent>
      </Tabs>
    </div>
  );
}
