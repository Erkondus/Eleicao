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
import { 
  Brain, 
  TrendingUp, 
  Users, 
  Building2, 
  AlertTriangle,
  Lightbulb,
  BarChart3,
  PieChart,
  Target,
  RefreshCw,
  CheckCircle,
  XCircle,
  MinusCircle,
  ArrowUp,
  ArrowDown,
  Minus,
  Sparkles,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Newspaper
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  AreaChart,
  Area,
} from "recharts";

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

export default function AIInsightsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("turnout");
  const [filters, setFilters] = useState<{
    year?: number;
    uf?: string;
    electionType?: string;
    party?: string;
    targetYear?: number;
  }>({});

  const { data: availableYears } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });

  const { data: availableParties } = useQuery<{ abbreviation: string; name: string }[]>({
    queryKey: ["/api/analytics/parties-list"],
  });

  const turnoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/turnout", filters);
      return res.json();
    },
  });

  const candidateSuccessMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/candidate-success", filters);
      return res.json();
    },
  });

  const partyPerformanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/party-performance", filters);
      return res.json();
    },
  });

  const insightsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/electoral-insights", filters);
      return res.json();
    },
  });

  const sentimentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/sentiment", { party: filters.party });
      return res.json();
    },
  });

  const formatNumber = (num: number) => {
    return num.toLocaleString("pt-BR");
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return <Badge className="bg-green-500">Alta ({(confidence * 100).toFixed(0)}%)</Badge>;
    if (confidence >= 0.5) return <Badge className="bg-yellow-500">Média ({(confidence * 100).toFixed(0)}%)</Badge>;
    return <Badge className="bg-red-500">Baixa ({(confidence * 100).toFixed(0)}%)</Badge>;
  };

  const getTrendIcon = (trend: string) => {
    if (trend === "up" || trend === "growing" || trend === "positive") return <ArrowUp className="h-4 w-4 text-green-500" />;
    if (trend === "down" || trend === "declining" || trend === "negative") return <ArrowDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const getImpactColor = (impact: string) => {
    if (impact === "positive") return "text-green-600";
    if (impact === "negative") return "text-red-600";
    return "text-gray-600";
  };

  const canAnalyze = user?.role === "admin" || user?.role === "analyst";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
            <Brain className="h-8 w-8 text-primary" />
            Insights com IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Análises preditivas e insights baseados em inteligência artificial
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          Powered by GPT-4
        </Badge>
      </div>

      <Card data-testid="filters-card">
        <CardHeader>
          <CardTitle className="text-lg">Filtros de Análise</CardTitle>
          <CardDescription>Configure os parâmetros para as análises de IA</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label>Ano Base</Label>
              <Select
                value={filters.year?.toString() || "_all"}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, year: value && value !== "_all" ? parseInt(value) : undefined }))}
              >
                <SelectTrigger data-testid="select-year">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {availableYears?.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Estado</Label>
              <Select
                value={filters.uf || "_all"}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, uf: value && value !== "_all" ? value : undefined }))}
              >
                <SelectTrigger data-testid="select-state">
                  <SelectValue placeholder="Nacional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Nacional</SelectItem>
                  {Object.entries(BRAZIL_STATES).map(([code, name]) => (
                    <SelectItem key={code} value={code}>
                      {code} - {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Partido</Label>
              <Select
                value={filters.party || "_all"}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, party: value && value !== "_all" ? value : undefined }))}
              >
                <SelectTrigger data-testid="select-party">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {availableParties?.map((party) => (
                    <SelectItem key={party.abbreviation} value={party.abbreviation}>
                      {party.abbreviation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de Eleição</Label>
              <Select
                value={filters.electionType || "_all"}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, electionType: value && value !== "_all" ? value : undefined }))}
              >
                <SelectTrigger data-testid="select-election-type">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  <SelectItem value="Eleições Gerais">Eleições Gerais</SelectItem>
                  <SelectItem value="Eleições Municipais">Eleições Municipais</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ano Alvo (Previsão)</Label>
              <Input
                type="number"
                placeholder="Ex: 2026"
                value={filters.targetYear || ""}
                onChange={(e) => setFilters((prev) => ({ ...prev, targetYear: e.target.value ? parseInt(e.target.value) : undefined }))}
                data-testid="input-target-year"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="turnout" className="flex items-center gap-2" data-testid="tab-turnout">
            <Users className="h-4 w-4" />
            Comparecimento
          </TabsTrigger>
          <TabsTrigger value="candidates" className="flex items-center gap-2" data-testid="tab-candidates">
            <Target className="h-4 w-4" />
            Candidatos
          </TabsTrigger>
          <TabsTrigger value="parties" className="flex items-center gap-2" data-testid="tab-parties">
            <Building2 className="h-4 w-4" />
            Partidos
          </TabsTrigger>
          <TabsTrigger value="sentiment" className="flex items-center gap-2" data-testid="tab-sentiment">
            <MessageSquare className="h-4 w-4" />
            Sentimento
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2" data-testid="tab-insights">
            <Lightbulb className="h-4 w-4" />
            Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="turnout" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Previsão de Comparecimento Eleitoral
                  </CardTitle>
                  <CardDescription>
                    Análise preditiva baseada em padrões históricos de votação
                  </CardDescription>
                </div>
                <Button
                  onClick={() => turnoutMutation.mutate()}
                  disabled={!canAnalyze || turnoutMutation.isPending}
                  data-testid="button-analyze-turnout"
                >
                  {turnoutMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Analisar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {turnoutMutation.isPending ? (
                <div className="space-y-4">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-[300px]" />
                </div>
              ) : turnoutMutation.data ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-primary/5">
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Comparecimento Previsto</p>
                          <p className="text-4xl font-bold text-primary">
                            {turnoutMutation.data.predictedTurnout?.toFixed(1)}%
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-secondary/5">
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Confiança</p>
                          <div className="mt-2">
                            {getConfidenceBadge(turnoutMutation.data.confidence || 0)}
                          </div>
                          <Progress value={(turnoutMutation.data.confidence || 0) * 100} className="mt-2" />
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-accent/5">
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground">Metodologia</p>
                          <p className="text-sm mt-2">{turnoutMutation.data.methodology || "Análise de tendências históricas"}</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {turnoutMutation.data.factors?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Fatores de Influência</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {turnoutMutation.data.factors.map((factor: any, index: number) => (
                            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                {factor.impact === "positive" && <CheckCircle className="h-5 w-5 text-green-500" />}
                                {factor.impact === "negative" && <XCircle className="h-5 w-5 text-red-500" />}
                                {factor.impact === "neutral" && <MinusCircle className="h-5 w-5 text-gray-500" />}
                                <div>
                                  <p className="font-medium">{factor.factor}</p>
                                  <p className="text-sm text-muted-foreground">{factor.description}</p>
                                </div>
                              </div>
                              <Badge variant="outline">Peso: {(factor.weight * 100).toFixed(0)}%</Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {turnoutMutation.data.historicalComparison?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Comparativo Histórico</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart data={turnoutMutation.data.historicalComparison}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="year" />
                            <YAxis domain={[0, 100]} />
                            <RechartsTooltip />
                            <Area type="monotone" dataKey="turnout" fill="#003366" stroke="#003366" fillOpacity={0.3} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Users className="h-12 w-12 mb-4 opacity-50" />
                  <p>Clique em "Analisar" para gerar previsão de comparecimento</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="candidates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Probabilidade de Sucesso de Candidatos
                  </CardTitle>
                  <CardDescription>
                    Análise de chances de eleição baseada em dados históricos
                  </CardDescription>
                </div>
                <Button
                  onClick={() => candidateSuccessMutation.mutate()}
                  disabled={!canAnalyze || candidateSuccessMutation.isPending}
                  data-testid="button-analyze-candidates"
                >
                  {candidateSuccessMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Analisar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {candidateSuccessMutation.isPending ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : candidateSuccessMutation.data?.length > 0 ? (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {candidateSuccessMutation.data.map((candidate: any, index: number) => (
                      <Card key={index} className="hover:bg-muted/30" data-testid={`candidate-prediction-${index}`}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="text-2xl font-bold text-muted-foreground w-10">
                                #{candidate.ranking || index + 1}
                              </div>
                              <div>
                                <p className="font-semibold">{candidate.candidateName}</p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Badge variant="outline">{candidate.party}</Badge>
                                  {candidate.position && <span>{candidate.position}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2">
                                <span className="text-2xl font-bold">
                                  {((candidate.successProbability || 0) * 100).toFixed(0)}%
                                </span>
                                {getConfidenceBadge(candidate.confidence || 0)}
                              </div>
                              {candidate.projectedVotes && (
                                <p className="text-sm text-muted-foreground">
                                  Projeção: {formatNumber(candidate.projectedVotes.min)} - {formatNumber(candidate.projectedVotes.max)} votos
                                </p>
                              )}
                            </div>
                          </div>
                          {candidate.factors?.length > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-sm font-medium mb-2">Fatores Chave:</p>
                              <div className="flex flex-wrap gap-2">
                                {candidate.factors.slice(0, 4).map((factor: any, fIndex: number) => (
                                  <Badge 
                                    key={fIndex} 
                                    variant="secondary"
                                    className={getImpactColor(factor.impact)}
                                  >
                                    {factor.factor}: {factor.value}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {candidate.recommendation && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              "{candidate.recommendation}"
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Target className="h-12 w-12 mb-4 opacity-50" />
                  <p>Clique em "Analisar" para gerar previsões de candidatos</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parties" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Previsão de Desempenho Partidário
                  </CardTitle>
                  <CardDescription>
                    Análise de tendências e projeções para partidos políticos
                  </CardDescription>
                </div>
                <Button
                  onClick={() => partyPerformanceMutation.mutate()}
                  disabled={!canAnalyze || partyPerformanceMutation.isPending}
                  data-testid="button-analyze-parties"
                >
                  {partyPerformanceMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Analisar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {partyPerformanceMutation.isPending ? (
                <div className="space-y-4">
                  <Skeleton className="h-[300px]" />
                  <div className="grid grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
                  </div>
                </div>
              ) : partyPerformanceMutation.data?.length > 0 ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Projeção de Votação</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={Math.max(300, partyPerformanceMutation.data.length * 32)}>
                          <BarChart data={partyPerformanceMutation.data} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" />
                            <YAxis dataKey="party" type="category" width={60} />
                            <RechartsTooltip />
                            <Bar dataKey="predictedVoteShare" fill="#003366" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Tendência dos Partidos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <RechartsPie>
                            <Pie
                              data={partyPerformanceMutation.data}
                              dataKey="predictedVoteShare"
                              nameKey="party"
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                            >
                              {partyPerformanceMutation.data.map((entry: any, index: number) => (
                                <Cell key={entry.party} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip />
                            <Legend />
                          </RechartsPie>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3">
                      {partyPerformanceMutation.data.map((party: any, index: number) => (
                        <Card key={index} data-testid={`party-prediction-${index}`}>
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  {getTrendIcon(party.trend)}
                                  <span className="text-xl font-bold">{party.party}</span>
                                </div>
                                <Badge 
                                  variant={party.trend === "growing" ? "default" : party.trend === "declining" ? "destructive" : "secondary"}
                                >
                                  {party.trend === "growing" ? "Crescimento" : party.trend === "declining" ? "Declínio" : "Estável"}
                                </Badge>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">Projeção de Votos</p>
                                <p className="text-lg font-bold">{party.predictedVoteShare?.toFixed(1)}%</p>
                                {party.predictedSeats && (
                                  <p className="text-sm">
                                    {party.predictedSeats.min}-{party.predictedSeats.max} cadeiras
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              {party.keyFactors?.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium text-green-600 mb-1">Pontos Fortes:</p>
                                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                                    {party.keyFactors.slice(0, 3).map((f: string, i: number) => (
                                      <li key={i}>{f}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {party.risks?.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium text-red-600 mb-1">Riscos:</p>
                                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                                    {party.risks.slice(0, 3).map((r: string, i: number) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-4 opacity-50" />
                  <p>Clique em "Analisar" para gerar previsões de desempenho partidário</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    Insights Estratégicos
                  </CardTitle>
                  <CardDescription>
                    Análise abrangente com descobertas, riscos e recomendações
                  </CardDescription>
                </div>
                <Button
                  onClick={() => insightsMutation.mutate()}
                  disabled={!canAnalyze || insightsMutation.isPending}
                  data-testid="button-analyze-insights"
                >
                  {insightsMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4 mr-2" />
                  )}
                  Analisar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {insightsMutation.isPending ? (
                <div className="space-y-4">
                  <Skeleton className="h-32" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-48" />
                    <Skeleton className="h-48" />
                  </div>
                </div>
              ) : insightsMutation.data ? (
                <div className="space-y-6">
                  <Card className="bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-lg">Resumo Executivo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-line">{insightsMutation.data.summary}</p>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Lightbulb className="h-5 w-5" />
                          Descobertas Principais
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[250px]">
                          <div className="space-y-3">
                            {insightsMutation.data.keyFindings?.map((finding: any, index: number) => (
                              <div 
                                key={index} 
                                className="flex items-start gap-3 p-3 border rounded-lg"
                              >
                                <Badge 
                                  variant={finding.importance === "high" ? "destructive" : finding.importance === "medium" ? "default" : "secondary"}
                                >
                                  {finding.importance === "high" ? "Alta" : finding.importance === "medium" ? "Média" : "Baixa"}
                                </Badge>
                                <div>
                                  <p className="text-sm">{finding.finding}</p>
                                  <Badge variant="outline" className="mt-1 text-xs">
                                    {finding.category}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5" />
                          Fatores de Risco
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[250px]">
                          <div className="space-y-3">
                            {insightsMutation.data.riskFactors?.map((risk: any, index: number) => (
                              <div key={index} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="font-medium">{risk.risk}</p>
                                  <Badge 
                                    variant={risk.impact === "high" ? "destructive" : risk.impact === "medium" ? "default" : "secondary"}
                                  >
                                    {risk.impact === "high" ? "Alto Impacto" : risk.impact === "medium" ? "Médio" : "Baixo"}
                                  </Badge>
                                </div>
                                <Progress value={(risk.probability || 0) * 100} className="mb-2" />
                                <p className="text-sm text-muted-foreground">{risk.mitigation}</p>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>

                  {insightsMutation.data.recommendations?.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Recomendações</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {insightsMutation.data.recommendations.map((rec: string, index: number) => (
                            <div key={index} className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                              <p className="text-sm">{rec}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {insightsMutation.data.dataQuality && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Qualidade dos Dados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-center">
                          <div>
                            <p className="text-3xl font-bold">{((insightsMutation.data.dataQuality.completeness || 0) * 100).toFixed(0)}%</p>
                            <p className="text-sm text-muted-foreground">Completude</p>
                          </div>
                          <div>
                            <p className="text-3xl font-bold">{insightsMutation.data.dataQuality.yearsAnalyzed || 0}</p>
                            <p className="text-sm text-muted-foreground">Anos Analisados</p>
                          </div>
                          <div>
                            <p className="text-3xl font-bold">{formatNumber(insightsMutation.data.dataQuality.candidatesAnalyzed || 0)}</p>
                            <p className="text-sm text-muted-foreground">Candidatos</p>
                          </div>
                          <div>
                            <p className="text-3xl font-bold">{insightsMutation.data.dataQuality.partiesAnalyzed || 0}</p>
                            <p className="text-sm text-muted-foreground">Partidos</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mb-4 opacity-50" />
                  <p>Clique em "Analisar" para gerar insights estratégicos</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sentiment" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Análise de Sentimento
                  </CardTitle>
                  <CardDescription>
                    Análise de sentimento de notícias e mídias sociais sobre candidatos e partidos
                  </CardDescription>
                </div>
                <Button
                  onClick={() => sentimentMutation.mutate()}
                  disabled={sentimentMutation.isPending}
                  data-testid="button-analyze-sentiment"
                >
                  {sentimentMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Analisando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Analisar
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sentimentMutation.isPending ? (
                <div className="space-y-4">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-48" />
                </div>
              ) : sentimentMutation.data ? (
                <div className="space-y-6">
                  {sentimentMutation.data.message ? (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <Newspaper className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <h4 className="font-semibold mb-2">Funcionalidade em Desenvolvimento</h4>
                            <p className="text-muted-foreground">{sentimentMutation.data.message}</p>
                            <p className="text-sm text-muted-foreground mt-2">
                              Esta funcionalidade está preparada para receber notícias e posts de mídias sociais
                              sobre candidatos e partidos para análise automática de sentimento.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <Card>
                          <CardContent className="pt-6 text-center">
                            <ThumbsUp className="h-8 w-8 mx-auto mb-2 text-green-500" />
                            <p className="text-2xl font-bold text-green-600">{sentimentMutation.data.positiveSentiment || 0}%</p>
                            <p className="text-sm text-muted-foreground">Positivo</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6 text-center">
                            <Minus className="h-8 w-8 mx-auto mb-2 text-gray-500" />
                            <p className="text-2xl font-bold text-gray-600">{sentimentMutation.data.neutralSentiment || 0}%</p>
                            <p className="text-sm text-muted-foreground">Neutro</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6 text-center">
                            <ThumbsDown className="h-8 w-8 mx-auto mb-2 text-red-500" />
                            <p className="text-2xl font-bold text-red-600">{sentimentMutation.data.negativeSentiment || 0}%</p>
                            <p className="text-sm text-muted-foreground">Negativo</p>
                          </CardContent>
                        </Card>
                      </div>

                      {sentimentMutation.data.topics && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Tópicos Principais</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-2">
                              {sentimentMutation.data.topics.map((topic: any, index: number) => (
                                <Badge key={index} variant="outline">
                                  {typeof topic === 'string' ? topic : topic.topic || JSON.stringify(topic)}
                                </Badge>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {sentimentMutation.data.summary && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Resumo da Análise</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="whitespace-pre-line">{sentimentMutation.data.summary}</p>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                  <p>Clique em "Analisar" para realizar análise de sentimento</p>
                  <p className="text-sm mt-2 text-center max-w-md">
                    Analise o sentimento de notícias e posts de mídias sociais sobre partidos e candidatos.
                    Esta funcionalidade aceita dados externos para análise automatizada.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
