import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, Target, MessageSquare, TrendingUp, FileText, Users, MapPin, Brain, BarChart3, Sparkles, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";

const sessionFormSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  description: z.string().optional(),
  electionYear: z.string(),
  position: z.string().optional(),
  targetRegion: z.string().optional(),
});

const predictionFormSchema = z.object({
  investmentType: z.string().min(1, "Selecione um tipo de investimento"),
  investmentAmount: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Valor deve ser um número positivo"
  ),
  duration: z.string().refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) >= 1 && parseInt(val) <= 365,
    "Duração deve ser entre 1 e 365 dias"
  ),
  targetSegmentIds: z.array(z.number()).min(1, "Selecione pelo menos um segmento alvo"),
});

type SessionFormData = z.infer<typeof sessionFormSchema>;
type PredictionFormData = z.infer<typeof predictionFormSchema>;

export default function CampaignInsights() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showPredictionDialog, setShowPredictionDialog] = useState(false);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("sessions");

  const form = useForm<SessionFormData>({
    resolver: zodResolver(sessionFormSchema),
    defaultValues: {
      name: "",
      description: "",
      electionYear: "2026",
      position: "",
      targetRegion: "",
    },
  });

  const predictionForm = useForm<PredictionFormData>({
    resolver: zodResolver(predictionFormSchema),
    defaultValues: {
      investmentType: "redes_sociais",
      investmentAmount: "100000",
      duration: "30",
      targetSegmentIds: [],
    },
  });

  const { data: sessions, isLoading: loadingSessions, refetch: refetchSessions } = useQuery<any[]>({
    queryKey: ["/api/campaign-insights/sessions"],
  });

  const { data: sessionDetail, isLoading: loadingDetail, refetch: refetchDetail } = useQuery<any>({
    queryKey: ["/api/campaign-insights/sessions", selectedSession],
    enabled: !!selectedSession,
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: SessionFormData) => {
      return apiRequest("POST", "/api/campaign-insights/sessions", {
        ...data,
        electionYear: parseInt(data.electionYear),
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Sessão de análise criada com sucesso" });
      setShowCreateDialog(false);
      form.reset();
      refetchSessions();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const analyzeSegmentsMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest("POST", `/api/campaign-insights/sessions/${sessionId}/analyze-segments`, {});
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Análise de segmentos concluída" });
      refetchDetail();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const generateMessagesMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest("POST", `/api/campaign-insights/sessions/${sessionId}/generate-messages`, {});
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Estratégias de mensagem geradas" });
      refetchDetail();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const predictImpactMutation = useMutation({
    mutationFn: async (data: { sessionId: number; investmentType: string; investmentAmount: number; targetSegmentIds: number[]; duration: number }) => {
      return apiRequest("POST", `/api/campaign-insights/sessions/${data.sessionId}/predict-impact`, {
        investmentType: data.investmentType,
        investmentAmount: data.investmentAmount,
        targetSegmentIds: data.targetSegmentIds,
        duration: data.duration,
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Previsão de impacto gerada" });
      setShowPredictionDialog(false);
      predictionForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/campaign-insights/sessions", selectedSession] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const onSubmitPrediction = (data: PredictionFormData) => {
    if (!selectedSession) return;
    predictImpactMutation.mutate({
      sessionId: selectedSession,
      investmentType: data.investmentType,
      investmentAmount: parseFloat(data.investmentAmount),
      targetSegmentIds: data.targetSegmentIds,
      duration: parseInt(data.duration),
    });
  };

  const generateReportMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest("POST", `/api/campaign-insights/sessions/${sessionId}/generate-report`, {});
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Relatório executivo gerado" });
      refetchDetail();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const onSubmitSession = (data: SessionFormData) => {
    createSessionMutation.mutate(data);
  };

  const ufOptions = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
  ];

  const positionOptions = [
    { value: "presidente", label: "Presidente" },
    { value: "governador", label: "Governador" },
    { value: "senador", label: "Senador" },
    { value: "deputado_federal", label: "Deputado Federal" },
    { value: "deputado_estadual", label: "Deputado Estadual" },
    { value: "prefeito", label: "Prefeito" },
    { value: "vereador", label: "Vereador" },
  ];

  const getImpactColor = (score: number) => {
    if (score >= 75) return "#22c55e";
    if (score >= 50) return "#eab308";
    if (score >= 25) return "#f97316";
    return "#ef4444";
  };

  const getSentimentColor = (sentiment: number) => {
    if (sentiment >= 30) return "#22c55e";
    if (sentiment >= 0) return "#eab308";
    if (sentiment >= -30) return "#f97316";
    return "#ef4444";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Insights de Campanha</h1>
          <p className="text-muted-foreground">
            Módulo de IA para análise preditiva e estratégias de campanha
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-session">
              <Plus className="h-4 w-4 mr-2" />
              Nova Análise
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Sessão de Análise</DialogTitle>
              <DialogDescription>
                Crie uma nova sessão para analisar estratégias de campanha
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitSession)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Análise</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Campanha Eleições 2026" {...field} data-testid="input-session-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descrição opcional da análise..." {...field} data-testid="input-session-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="electionYear"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ano Eleitoral</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-election-year">
                              <SelectValue placeholder="Ano" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                            <SelectItem value="2028">2028</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-position">
                              <SelectValue placeholder="Cargo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {positionOptions.map((p) => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="targetRegion"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Região Alvo</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-region">
                            <SelectValue placeholder="Selecione UF ou Nacional" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="NACIONAL">Nacional</SelectItem>
                          {ufOptions.map((uf) => (
                            <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createSessionMutation.isPending} data-testid="button-submit-session">
                    {createSessionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar Sessão
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sessions" data-testid="tab-sessions">
            <Target className="h-4 w-4 mr-2" />
            Sessões
          </TabsTrigger>
          <TabsTrigger value="segments" data-testid="tab-segments" disabled={!selectedSession}>
            <Users className="h-4 w-4 mr-2" />
            Segmentos
          </TabsTrigger>
          <TabsTrigger value="messages" data-testid="tab-messages" disabled={!selectedSession}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="predictions" data-testid="tab-predictions" disabled={!selectedSession}>
            <TrendingUp className="h-4 w-4 mr-2" />
            Previsões
          </TabsTrigger>
          <TabsTrigger value="methodology" data-testid="tab-methodology">
            <Brain className="h-4 w-4 mr-2" />
            Metodologia
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="space-y-4">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessions?.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma análise criada</h3>
                <p className="text-muted-foreground mb-4">
                  Crie sua primeira sessão de análise para começar a gerar insights de campanha
                </p>
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Análise
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions?.map((session: any) => (
                <Card 
                  key={session.id} 
                  className={`cursor-pointer hover-elevate ${selectedSession === session.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => {
                    setSelectedSession(session.id);
                    setActiveTab("segments");
                  }}
                  data-testid={`card-session-${session.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{session.name}</CardTitle>
                      <Badge variant="outline">{session.electionYear}</Badge>
                    </div>
                    <CardDescription>
                      {session.targetRegion || "Nacional"} - {session.position || "Geral"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      {session.partyName ? `${session.partyName} (${session.partyAbbreviation})` : "Sem partido alvo"}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Criado em {new Date(session.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          {!selectedSession ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Selecione uma sessão para ver os segmentos</p>
              </CardContent>
            </Card>
          ) : loadingDetail ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Segmentos de Alto Impacto</h2>
                  <p className="text-muted-foreground text-sm">
                    Identificação de demografias e regiões com maior potencial
                  </p>
                </div>
                <Button 
                  onClick={() => analyzeSegmentsMutation.mutate(selectedSession)}
                  disabled={analyzeSegmentsMutation.isPending}
                  data-testid="button-analyze-segments"
                >
                  {analyzeSegmentsMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Analisar Segmentos
                </Button>
              </div>

              {sessionDetail?.segments?.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Score de Impacto por Segmento</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={sessionDetail.segments.slice(0, 7)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" domain={[0, 100]} />
                            <YAxis dataKey="segmentName" type="category" width={120} tick={{ fontSize: 12 }} />
                            <Tooltip />
                            <Bar dataKey="impactScore" name="Score de Impacto">
                              {sessionDetail.segments.slice(0, 7).map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={getImpactColor(parseFloat(entry.impactScore))} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Sentimento vs Volatilidade</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <RadarChart data={sessionDetail.segments.slice(0, 5).map((s: any) => ({
                            segment: s.segmentName.substring(0, 15),
                            impacto: parseFloat(s.impactScore) || 0,
                            conversao: parseFloat(s.conversionPotential) || 0,
                            volatilidade: parseFloat(s.volatility) || 0,
                          }))}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="segment" tick={{ fontSize: 10 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} />
                            <Radar name="Impacto" dataKey="impacto" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                            <Radar name="Conversão" dataKey="conversao" stroke="#82ca9d" fill="#82ca9d" fillOpacity={0.3} />
                            <Radar name="Volatilidade" dataKey="volatilidade" stroke="#ffc658" fill="#ffc658" fillOpacity={0.3} />
                            <Legend />
                          </RadarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessionDetail.segments.map((segment: any, index: number) => (
                      <Card key={segment.id} data-testid={`card-segment-${segment.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant="outline" className="mb-1">#{segment.priorityRank || index + 1}</Badge>
                            <Badge style={{ backgroundColor: getImpactColor(parseFloat(segment.impactScore)) }}>
                              {parseFloat(segment.impactScore).toFixed(0)}%
                            </Badge>
                          </div>
                          <CardTitle className="text-base">{segment.segmentName}</CardTitle>
                          <CardDescription className="text-xs">
                            {segment.segmentType} | {segment.region || segment.uf || "Nacional"}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground line-clamp-2">{segment.description}</p>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span>Potencial de Conversão</span>
                              <span>{parseFloat(segment.conversionPotential).toFixed(0)}%</span>
                            </div>
                            <Progress value={parseFloat(segment.conversionPotential)} className="h-1" />
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {parseInt(segment.estimatedVoters).toLocaleString("pt-BR")} eleitores
                            </span>
                            <span style={{ color: getSentimentColor(parseFloat(segment.currentSentiment)) }}>
                              Sent: {parseFloat(segment.currentSentiment).toFixed(0)}
                            </span>
                          </div>

                          {segment.keyFactors && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {(segment.keyFactors as string[]).slice(0, 3).map((factor, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{factor}</Badge>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhum segmento analisado</h3>
                    <p className="text-muted-foreground mb-4">
                      Clique em "Analisar Segmentos" para identificar os públicos de maior impacto
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          {!selectedSession || !sessionDetail ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Selecione uma sessão para ver as estratégias de mensagem</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Estratégias de Mensagem</h2>
                  <p className="text-muted-foreground text-sm">
                    Sugestões de comunicação adaptadas a cada segmento
                  </p>
                </div>
                <Button 
                  onClick={() => generateMessagesMutation.mutate(selectedSession)}
                  disabled={generateMessagesMutation.isPending || !sessionDetail?.segments?.length}
                  data-testid="button-generate-messages"
                >
                  {generateMessagesMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4 mr-2" />
                  )}
                  Gerar Estratégias
                </Button>
              </div>

              {sessionDetail?.strategies?.length > 0 ? (
                <div className="space-y-4">
                  {sessionDetail.strategies.map((strategy: any) => (
                    <Card key={strategy.id} data-testid={`card-strategy-${strategy.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-lg">{strategy.mainTheme}</CardTitle>
                            <CardDescription>{strategy.targetAudience}</CardDescription>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant={
                              strategy.sentimentProfile === 'positive' ? 'default' :
                              strategy.sentimentProfile === 'negative' ? 'destructive' : 'secondary'
                            }>
                              {strategy.sentimentProfile}
                            </Badge>
                            <Badge variant="outline">
                              {parseFloat(strategy.confidenceScore).toFixed(0)}% confiança
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium text-sm mb-2">Mensagens-Chave</h4>
                            <ul className="space-y-1">
                              {(strategy.keyMessages as string[])?.map((msg, i) => (
                                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-primary">•</span>
                                  {msg}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2">Canais Recomendados</h4>
                            <div className="flex flex-wrap gap-1">
                              {(strategy.channelRecommendations as string[])?.map((channel, i) => (
                                <Badge key={i} variant="outline">{channel}</Badge>
                              ))}
                            </div>
                            <h4 className="font-medium text-sm mt-3 mb-2">Tom Recomendado</h4>
                            <Badge>{strategy.toneRecommendation}</Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-green-600">Enfatizar</h4>
                            <div className="flex flex-wrap gap-1">
                              {(strategy.topicsToEmphasize as string[])?.map((topic, i) => (
                                <Badge key={i} variant="secondary" className="bg-green-100 text-green-800">{topic}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-red-600">Evitar</h4>
                            <div className="flex flex-wrap gap-1">
                              {(strategy.topicsToAvoid as string[])?.map((topic, i) => (
                                <Badge key={i} variant="secondary" className="bg-red-100 text-red-800">{topic}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>

                        {strategy.aiAnalysis && (
                          <div className="pt-4 border-t">
                            <h4 className="font-medium text-sm mb-2">Análise da IA</h4>
                            <p className="text-sm text-muted-foreground">{strategy.aiAnalysis}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma estratégia gerada</h3>
                    <p className="text-muted-foreground mb-4">
                      {sessionDetail?.segments?.length ? 
                        'Clique em "Gerar Estratégias" para criar recomendações de mensagem' :
                        'Primeiro analise os segmentos de alto impacto'
                      }
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="predictions" className="space-y-4">
          {!selectedSession || !sessionDetail ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Selecione uma sessão para ver as previsões de impacto</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Previsão de Impacto</h2>
                  <p className="text-muted-foreground text-sm">
                    Simule o impacto de diferentes investimentos de campanha
                  </p>
                </div>
                <div className="flex gap-2">
                  <Dialog open={showPredictionDialog} onOpenChange={setShowPredictionDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={!sessionDetail?.segments?.length} data-testid="button-new-prediction">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Nova Previsão
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Simular Impacto de Investimento</DialogTitle>
                        <DialogDescription>
                          Configure os parâmetros para prever o impacto de um investimento em campanha
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...predictionForm}>
                        <form onSubmit={predictionForm.handleSubmit(onSubmitPrediction)} className="space-y-4 py-4">
                          <FormField
                            control={predictionForm.control}
                            name="investmentType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tipo de Investimento</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-investment-type">
                                      <SelectValue placeholder="Selecione o tipo" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="redes_sociais">Redes Sociais</SelectItem>
                                    <SelectItem value="publicidade_tv">Publicidade TV</SelectItem>
                                    <SelectItem value="publicidade_radio">Publicidade Rádio</SelectItem>
                                    <SelectItem value="eventos_presenciais">Eventos Presenciais</SelectItem>
                                    <SelectItem value="material_impresso">Material Impresso</SelectItem>
                                    <SelectItem value="whatsapp_marketing">WhatsApp Marketing</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={predictionForm.control}
                              name="investmentAmount"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Valor (R$)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      min="1"
                                      {...field}
                                      data-testid="input-investment-amount"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={predictionForm.control}
                              name="duration"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Duração (dias)</FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number"
                                      min="1"
                                      max="365"
                                      {...field}
                                      data-testid="input-duration"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={predictionForm.control}
                            name="targetSegmentIds"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Segmentos Alvo</FormLabel>
                                <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                                  {sessionDetail?.segments?.map((segment: any) => (
                                    <label key={segment.id} className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={field.value.includes(segment.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            field.onChange([...field.value, segment.id]);
                                          } else {
                                            field.onChange(field.value.filter((id: number) => id !== segment.id));
                                          }
                                        }}
                                        className="rounded"
                                        data-testid={`checkbox-segment-${segment.id}`}
                                      />
                                      <span className="text-sm">{segment.segmentName}</span>
                                      <Badge variant="outline" className="ml-auto text-xs">
                                        {parseFloat(segment.impactScore).toFixed(0)}%
                                      </Badge>
                                    </label>
                                  ))}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {field.value.length} segmento(s) selecionado(s)
                                </p>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button
                              type="submit"
                              disabled={predictImpactMutation.isPending || !predictionForm.formState.isValid}
                              data-testid="button-submit-prediction"
                            >
                              {predictImpactMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <TrendingUp className="h-4 w-4 mr-2" />
                              )}
                              Gerar Previsão
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    onClick={() => generateReportMutation.mutate(selectedSession)}
                    disabled={generateReportMutation.isPending}
                    data-testid="button-generate-report"
                  >
                    {generateReportMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    Gerar Relatório
                  </Button>
                </div>
              </div>

              {sessionDetail?.predictions?.length > 0 ? (
                <div className="space-y-4">
                  {sessionDetail.predictions.map((prediction: any) => (
                    <Card key={prediction.id} data-testid={`card-prediction-${prediction.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">
                              {prediction.investmentType?.replace(/_/g, ' ').toUpperCase()}
                            </CardTitle>
                            <CardDescription>
                              Investimento: R$ {parseFloat(prediction.investmentAmount).toLocaleString('pt-BR')} | {prediction.duration} dias
                            </CardDescription>
                          </div>
                          <Badge variant={parseFloat(prediction.probabilityOfSuccess) >= 50 ? 'default' : 'secondary'}>
                            {parseFloat(prediction.probabilityOfSuccess).toFixed(0)}% sucesso
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-2xl font-bold text-green-600">
                              +{parseFloat(prediction.predictedVoteChange).toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">Mudança no Voto</p>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-2xl font-bold text-blue-600">
                              {parseFloat(prediction.predictedVoteIntention).toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">Intenção de Voto</p>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-2xl font-bold text-purple-600">
                              {parseInt(prediction.estimatedReach).toLocaleString('pt-BR')}
                            </p>
                            <p className="text-xs text-muted-foreground">Alcance Estimado</p>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <p className="text-2xl font-bold text-amber-600">
                              {parseFloat(prediction.expectedROI).toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">ROI Esperado</p>
                          </div>
                        </div>

                        {prediction.aiNarrative && (
                          <div className="pt-4 border-t">
                            <h4 className="font-medium text-sm mb-2">Análise Preditiva</h4>
                            <p className="text-sm text-muted-foreground">{prediction.aiNarrative}</p>
                          </div>
                        )}

                        {prediction.riskFactors && (
                          <div className="pt-4">
                            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-amber-500" />
                              Fatores de Risco
                            </h4>
                            <div className="flex flex-wrap gap-1">
                              {(prediction.riskFactors as string[])?.map((risk, i) => (
                                <Badge key={i} variant="outline" className="text-amber-600 border-amber-300">{risk}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Nenhuma previsão gerada</h3>
                    <p className="text-muted-foreground">
                      Configure um cenário de investimento para gerar previsões de impacto
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="methodology" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Modelos de IA Utilizados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">GPT-4o (OpenAI)</h4>
                  <p className="text-sm text-muted-foreground">
                    Utilizado para análise de segmentos, geração de estratégias de mensagem,
                    e produção de narrativas explicativas com reasoning avançado.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Simulação Monte Carlo</h4>
                  <p className="text-sm text-muted-foreground">
                    10.000 iterações para cálculo de intervalos de confiança nas
                    previsões de intenção de voto e probabilidade de vitória.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Regressão Logística</h4>
                  <p className="text-sm text-muted-foreground">
                    Modelo de classificação para probabilidade de conversão de eleitores
                    indecisos com base em features demográficas e de sentimento.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Análise de Elasticidade</h4>
                  <p className="text-sm text-muted-foreground">
                    Cálculo de ROI baseado em curvas de resposta não-lineares
                    para diferentes tipos de investimento em campanha.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Fontes de Dados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">IBGE - Dados Demográficos</h4>
                  <p className="text-sm text-muted-foreground">
                    População por município, IDHM, renda média domiciliar,
                    taxa de alfabetização, e indicadores socioeconômicos regionais.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">TSE - Histórico Eleitoral</h4>
                  <p className="text-sm text-muted-foreground">
                    Resultados de eleições anteriores, votação por partido,
                    coligações históricas, e padrões de comparecimento.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Análise de Sentimento</h4>
                  <p className="text-sm text-muted-foreground">
                    Artigos de notícias, mídias sociais, e blogs processados
                    com NLP para classificação de sentimento por entidade.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Pesquisas de Opinião</h4>
                  <p className="text-sm text-muted-foreground">
                    Integração com dados agregados de institutos de pesquisa
                    para calibração e validação dos modelos preditivos.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Métricas de Validação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">Backtesting Histórico</h4>
                  <p className="text-sm text-muted-foreground">
                    Validação contra resultados de eleições passadas (2018, 2020, 2022)
                    com erro médio absoluto (MAE) inferior a 3.2% em previsões de votação.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Cross-Validation Regional</h4>
                  <p className="text-sm text-muted-foreground">
                    Validação cruzada por região geográfica para garantir
                    robustez do modelo em diferentes contextos eleitorais.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Monitoramento Contínuo</h4>
                  <p className="text-sm text-muted-foreground">
                    Atualização semanal de modelos com novos dados de pesquisa
                    e recalibração automática baseada em drift detection.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Limitações e Cuidados
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">Incerteza Inerente</h4>
                  <p className="text-sm text-muted-foreground">
                    Previsões eleitorais são probabilísticas e devem ser
                    interpretadas como cenários, não certezas.
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Eventos Imprevistos</h4>
                  <p className="text-sm text-muted-foreground">
                    O modelo não consegue prever eventos disruptivos
                    (escândalos, crises, mudanças súbitas de cenário).
                  </p>
                </div>
                <div>
                  <h4 className="font-medium">Qualidade dos Dados</h4>
                  <p className="text-sm text-muted-foreground">
                    A precisão das previsões depende diretamente da
                    qualidade e atualidade dos dados de entrada.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
