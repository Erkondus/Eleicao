import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw, Lightbulb, Plus, Play, Trash2, Settings2, BarChart3, FileText, ChevronDown, ChevronUp, Users, Calendar, Shuffle, AlertTriangle, ArrowRight, ArrowLeftRight, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ErrorBar, ComposedChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { exportPredictionToPdf, exportMultiplePredictionsToPdf } from "@/lib/pdf-export";
import type { Scenario, Party, AIPrediction, PredictionScenario } from "@shared/schema";

const BRAZILIAN_STATES = [
  { value: "", label: "Nacional" },
  { value: "AC", label: "Acre" }, { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" }, { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" }, { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" }, { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" }, { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" }, { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" }, { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" }, { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" }, { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" }, { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" }, { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" }, { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" }, { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

const POSITIONS = [
  { value: "DEPUTADO FEDERAL", label: "Deputado Federal" },
  { value: "DEPUTADO ESTADUAL", label: "Deputado Estadual" },
  { value: "DEPUTADO DISTRITAL", label: "Deputado Distrital" },
  { value: "VEREADOR", label: "Vereador" },
];

interface PollingDataItem {
  party: string;
  pollPercent: number;
  source: string;
}

interface PartyAdjustment {
  voteShareAdjust: number;
  reason: string;
}

interface ExternalFactor {
  factor: string;
  impact: "positive" | "negative";
  magnitude: number;
}

interface CandidateComparison {
  id: number;
  name: string;
  description?: string;
  candidateIds: string[];
  state?: string;
  position?: string;
  targetYear: number;
  status: string;
  results?: any;
  narrative?: string;
  aiInsights?: any;
  createdAt: string;
}

interface EventImpactPrediction {
  id: number;
  name: string;
  eventDescription: string;
  eventType: string;
  eventDate?: string;
  affectedEntities: { parties?: string[]; candidates?: string[]; regions?: string[] };
  state?: string;
  position?: string;
  targetYear: number;
  status: string;
  beforeProjection?: any;
  afterProjection?: any;
  impactDelta?: any;
  narrative?: string;
  createdAt: string;
}

interface ScenarioSimulation {
  id: number;
  name: string;
  description?: string;
  simulationType: string;
  baseScenario: any;
  modifiedScenario: any;
  parameters?: any;
  scope?: any;
  status: string;
  baselineResults?: any;
  simulatedResults?: any;
  impactAnalysis?: any;
  narrative?: string;
  createdAt: string;
}

export default function Predictions() {
  const { toast } = useToast();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);
  const [activeTab, setActiveTab] = useState("quick");
  const [showNewScenarioDialog, setShowNewScenarioDialog] = useState(false);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<number>>(new Set());

  // New scenario form state
  const [newScenario, setNewScenario] = useState({
    name: "",
    description: "",
    targetYear: 2026,
    baseYear: 2022,
    state: "",
    position: "DEPUTADO FEDERAL",
    pollingWeight: 30,
    historicalWeight: 50,
    adjustmentWeight: 20,
    monteCarloIterations: 10000,
    confidenceLevel: 95,
  });
  const [pollingData, setPollingData] = useState<PollingDataItem[]>([]);
  const [partyAdjustments, setPartyAdjustments] = useState<Record<string, PartyAdjustment>>({});
  const [externalFactors, setExternalFactors] = useState<ExternalFactor[]>([]);

  // Candidate Comparison state
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [comparisonForm, setComparisonForm] = useState({
    name: "",
    candidateIds: [] as string[],
    candidateInput: "",
    state: "",
    position: "DEPUTADO FEDERAL",
    targetYear: 2026,
  });

  // Event Impact state
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: "",
    eventDescription: "",
    eventType: "policy",
    affectedParties: [] as string[],
    affectedCandidates: [] as string[],
    state: "",
    position: "",
    targetYear: 2026,
    impactMagnitude: 0.5,
    impactDuration: "medium-term",
  });

  // What-If Simulation state
  const [showWhatIfDialog, setShowWhatIfDialog] = useState(false);
  const [whatIfForm, setWhatIfForm] = useState({
    name: "",
    description: "",
    simulationType: "party_change",
    candidateName: "",
    fromParty: "",
    toParty: "",
    state: "",
    targetYear: 2026,
  });

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const { data: predictionScenarios, isLoading: loadingScenarios } = useQuery<PredictionScenario[]>({
    queryKey: ["/api/prediction-scenarios"],
  });

  // Candidate Comparisons
  const { data: comparisons, isLoading: loadingComparisons } = useQuery<CandidateComparison[]>({
    queryKey: ["/api/candidate-comparisons"],
  });

  // Event Impact Predictions
  const { data: eventImpacts, isLoading: loadingEvents } = useQuery<EventImpactPrediction[]>({
    queryKey: ["/api/event-impacts"],
  });

  // Scenario Simulations
  const { data: simulations, isLoading: loadingSimulations } = useQuery<ScenarioSimulation[]>({
    queryKey: ["/api/scenario-simulations"],
  });

  const predictionMutation = useMutation({
    mutationFn: async (scenarioId: number) => {
      const response = await apiRequest("POST", "/api/ai/predict", { scenarioId });
      const data = await response.json();
      return data as AIPrediction;
    },
    onSuccess: (data) => {
      setPrediction(data);
      toast({ title: "Previsão gerada", description: "A análise de IA foi concluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao gerar previsão", variant: "destructive" });
    },
  });

  const createScenarioMutation = useMutation({
    mutationFn: async (data: typeof newScenario & { pollingData: PollingDataItem[]; partyAdjustments: Record<string, PartyAdjustment>; externalFactors: ExternalFactor[] }) => {
      return apiRequest("POST", "/api/prediction-scenarios", {
        name: data.name,
        description: data.description,
        targetYear: data.targetYear,
        baseYear: data.baseYear,
        state: data.state || null,
        position: data.position,
        pollingData: data.pollingData,
        partyAdjustments: data.partyAdjustments,
        externalFactors: data.externalFactors,
        parameters: {
          pollingWeight: data.pollingWeight / 100,
          historicalWeight: data.historicalWeight / 100,
          adjustmentWeight: data.adjustmentWeight / 100,
          monteCarloIterations: data.monteCarloIterations,
          confidenceLevel: data.confidenceLevel / 100,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prediction-scenarios"] });
      setShowNewScenarioDialog(false);
      resetForm();
      toast({ title: "Cenário criado", description: "O cenário de previsão foi criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar cenário", variant: "destructive" });
    },
  });

  const runScenarioMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/prediction-scenarios/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prediction-scenarios"] });
      toast({ title: "Execução iniciada", description: "O cenário está sendo processado" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao executar cenário", variant: "destructive" });
    },
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/prediction-scenarios/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prediction-scenarios"] });
      toast({ title: "Cenário excluído", description: "O cenário foi removido" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir cenário", variant: "destructive" });
    },
  });

  // Candidate Comparison mutations
  const createComparisonMutation = useMutation({
    mutationFn: async (data: typeof comparisonForm) => {
      return apiRequest("POST", "/api/candidate-comparisons", {
        name: data.name,
        candidateIds: data.candidateIds,
        state: data.state || null,
        position: data.position,
        targetYear: data.targetYear,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-comparisons"] });
      setShowComparisonDialog(false);
      setComparisonForm({ name: "", candidateIds: [], candidateInput: "", state: "", position: "DEPUTADO FEDERAL", targetYear: 2026 });
      toast({ title: "Comparação criada", description: "Execute para ver os resultados" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar comparação", variant: "destructive" });
    },
  });

  const runComparisonMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/candidate-comparisons/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-comparisons"] });
      toast({ title: "Comparação executada", description: "Análise concluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao executar comparação", variant: "destructive" });
    },
  });

  const deleteComparisonMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/candidate-comparisons/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-comparisons"] });
      toast({ title: "Comparação excluída" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    },
  });

  // Event Impact mutations
  const createEventMutation = useMutation({
    mutationFn: async (data: typeof eventForm) => {
      return apiRequest("POST", "/api/event-impacts", {
        name: data.name,
        eventDescription: data.eventDescription,
        eventType: data.eventType,
        affectedEntities: { parties: data.affectedParties, candidates: data.affectedCandidates },
        state: data.state || null,
        position: data.position || null,
        targetYear: data.targetYear,
        estimatedImpactMagnitude: data.impactMagnitude,
        impactDuration: data.impactDuration,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-impacts"] });
      setShowEventDialog(false);
      setEventForm({ name: "", eventDescription: "", eventType: "policy", affectedParties: [], affectedCandidates: [], state: "", position: "", targetYear: 2026, impactMagnitude: 0.5, impactDuration: "medium-term" });
      toast({ title: "Previsão de evento criada", description: "Execute para ver projeções antes/depois" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar previsão de evento", variant: "destructive" });
    },
  });

  const runEventMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/event-impacts/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-impacts"] });
      toast({ title: "Análise de impacto concluída", description: "Projeções antes/depois geradas" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao analisar impacto", variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/event-impacts/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-impacts"] });
      toast({ title: "Previsão excluída" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    },
  });

  // What-If Simulation mutations
  const createWhatIfMutation = useMutation({
    mutationFn: async (data: typeof whatIfForm) => {
      return apiRequest("POST", "/api/scenario-simulations", {
        name: data.name,
        description: data.description,
        simulationType: data.simulationType,
        baseScenario: { candidate: data.candidateName, party: data.fromParty },
        modifiedScenario: { candidate: data.candidateName, party: data.toParty },
        parameters: { candidateName: data.candidateName, fromParty: data.fromParty, toParty: data.toParty },
        scope: { state: data.state || null, year: data.targetYear },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenario-simulations"] });
      setShowWhatIfDialog(false);
      setWhatIfForm({ name: "", description: "", simulationType: "party_change", candidateName: "", fromParty: "", toParty: "", state: "", targetYear: 2026 });
      toast({ title: "Simulação criada", description: "Execute para ver resultados" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar simulação", variant: "destructive" });
    },
  });

  const runWhatIfMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/scenario-simulations/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenario-simulations"] });
      toast({ title: "Simulação concluída", description: "Resultados disponíveis" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao executar simulação", variant: "destructive" });
    },
  });

  const deleteWhatIfMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scenario-simulations/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenario-simulations"] });
      toast({ title: "Simulação excluída" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    },
  });

  const addCandidateToComparison = () => {
    if (comparisonForm.candidateInput.trim() && !comparisonForm.candidateIds.includes(comparisonForm.candidateInput.trim())) {
      setComparisonForm({
        ...comparisonForm,
        candidateIds: [...comparisonForm.candidateIds, comparisonForm.candidateInput.trim()],
        candidateInput: "",
      });
    }
  };

  const removeCandidateFromComparison = (candidate: string) => {
    setComparisonForm({
      ...comparisonForm,
      candidateIds: comparisonForm.candidateIds.filter(c => c !== candidate),
    });
  };

  const resetForm = () => {
    setNewScenario({
      name: "",
      description: "",
      targetYear: 2026,
      baseYear: 2022,
      state: "",
      position: "DEPUTADO FEDERAL",
      pollingWeight: 30,
      historicalWeight: 50,
      adjustmentWeight: 20,
      monteCarloIterations: 10000,
      confidenceLevel: 95,
    });
    setPollingData([]);
    setPartyAdjustments({});
    setExternalFactors([]);
  };

  const addPollingData = () => {
    setPollingData([...pollingData, { party: "", pollPercent: 0, source: "" }]);
  };

  const updatePollingData = (index: number, field: keyof PollingDataItem, value: string | number) => {
    const updated = [...pollingData];
    updated[index] = { ...updated[index], [field]: value };
    setPollingData(updated);
  };

  const removePollingData = (index: number) => {
    setPollingData(pollingData.filter((_, i) => i !== index));
  };

  const addExternalFactor = () => {
    setExternalFactors([...externalFactors, { factor: "", impact: "positive", magnitude: 5 }]);
  };

  const updateExternalFactor = (index: number, field: keyof ExternalFactor, value: string | number) => {
    const updated = [...externalFactors];
    updated[index] = { ...updated[index], [field]: value } as ExternalFactor;
    setExternalFactors(updated);
  };

  const removeExternalFactor = (index: number) => {
    setExternalFactors(externalFactors.filter((_, i) => i !== index));
  };

  const toggleScenarioExpanded = (id: number) => {
    const newExpanded = new Set(expandedScenarios);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedScenarios(newExpanded);
  };

  const selectedScenario = scenarios?.find((s) => s.id === parseInt(selectedScenarioId));

  const trendIcons = {
    up: TrendingUp,
    down: TrendingDown,
    stable: Minus,
  };

  const trendColors = {
    up: "text-success",
    down: "text-destructive",
    stable: "text-muted-foreground",
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline">Rascunho</Badge>;
      case "running":
        return <Badge variant="secondary" className="animate-pulse">Executando</Badge>;
      case "completed":
        return <Badge className="bg-success text-success-foreground">Concluído</Badge>;
      case "failed":
        return <Badge variant="destructive">Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Previsões com IA"
        description="Análise preditiva de resultados eleitorais utilizando inteligência artificial e cenários personalizados"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Previsões IA" },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="quick" className="gap-2" data-testid="tab-quick-prediction">
            <Brain className="h-4 w-4" />
            Previsão Rápida
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-2" data-testid="tab-scenarios">
            <Settings2 className="h-4 w-4" />
            Cenários
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-2" data-testid="tab-comparison">
            <Users className="h-4 w-4" />
            Comparar Candidatos
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2" data-testid="tab-events">
            <Calendar className="h-4 w-4" />
            Impacto de Eventos
          </TabsTrigger>
          <TabsTrigger value="whatif" className="gap-2" data-testid="tab-whatif">
            <Shuffle className="h-4 w-4" />
            E se...?
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Gerar Previsão Eleitoral
              </CardTitle>
              <CardDescription>
                A IA analisa dados históricos e tendências para gerar previsões de distribuição de vagas.
                Esta funcionalidade utiliza Replit AI Integrations e os custos são debitados dos seus créditos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cenário para Análise</Label>
                  <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
                    <SelectTrigger data-testid="select-prediction-scenario">
                      <SelectValue placeholder="Selecione um cenário" />
                    </SelectTrigger>
                    <SelectContent>
                      {scenarios?.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({s.availableSeats} vagas)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedScenario && (
                  <div className="flex items-end">
                    <Button
                      onClick={() => predictionMutation.mutate(parseInt(selectedScenarioId))}
                      disabled={predictionMutation.isPending}
                      className="w-full md:w-auto"
                      data-testid="button-generate-prediction"
                    >
                      {predictionMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Analisando...
                        </>
                      ) : (
                        <>
                          <Brain className="h-4 w-4 mr-2" />
                          Gerar Previsão
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {prediction && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle>Análise da IA</CardTitle>
                      <CardDescription>
                        Gerado em {new Date(prediction.generatedAt).toLocaleString("pt-BR")}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => predictionMutation.mutate(parseInt(selectedScenarioId))}
                      disabled={predictionMutation.isPending}
                      data-testid="button-refresh-prediction"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{prediction.analysis}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Previsão de Distribuição de Vagas</CardTitle>
                  <CardDescription>
                    Estimativa de vagas por partido com intervalo de confiança
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(prediction.predictions || []).map((pred) => {
                      const party = parties?.find((p) => p.id === pred.partyId);
                      const TrendIcon = trendIcons[pred.trend];
                      const trendColor = trendColors[pred.trend];
                      const avgSeats = (pred.predictedSeats.min + pred.predictedSeats.max) / 2;
                      const maxPossible = selectedScenario?.availableSeats || 20;

                      return (
                        <div key={pred.partyId} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-4 h-4 rounded-full shrink-0"
                                style={{ backgroundColor: party?.color || "#003366" }}
                              />
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{pred.partyName}</span>
                                  <Badge variant="outline">{party?.abbreviation}</Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className={`flex items-center gap-1 ${trendColor}`}>
                                <TrendIcon className="h-4 w-4" />
                                <span className="text-sm">
                                  {pred.trend === "up" ? "Tendência de alta" : pred.trend === "down" ? "Tendência de baixa" : "Estável"}
                                </span>
                              </div>
                              <Badge variant="secondary" className="font-mono">
                                {(pred.confidence * 100).toFixed(0)}% confiança
                              </Badge>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Previsão de vagas</span>
                              <span className="font-mono font-bold">
                                {pred.predictedSeats.min} - {pred.predictedSeats.max}
                              </span>
                            </div>
                            <Progress value={(avgSeats / maxPossible) * 100} className="h-2" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {(prediction.recommendations || []).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-accent" />
                      Recomendações
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {(prediction.recommendations || []).map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-muted-foreground">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!selectedScenarioId && !prediction && (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Brain}
                  title="Selecione um cenário"
                  description="Escolha um cenário eleitoral para gerar previsões baseadas em inteligência artificial."
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="scenarios" className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Cenários de Previsão</h2>
              <p className="text-sm text-muted-foreground">
                Configure cenários personalizados com dados de pesquisas, ajustes por partido e fatores externos
              </p>
            </div>
            <Dialog open={showNewScenarioDialog} onOpenChange={setShowNewScenarioDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-scenario">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Cenário
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Criar Cenário de Previsão</DialogTitle>
                  <DialogDescription>
                    Configure um cenário personalizado para análise preditiva eleitoral
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="scenario-name">Nome do Cenário</Label>
                      <Input
                        id="scenario-name"
                        value={newScenario.name}
                        onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                        placeholder="Ex: Cenário Otimista 2026"
                        data-testid="input-scenario-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scenario-position">Cargo</Label>
                      <Select
                        value={newScenario.position}
                        onValueChange={(v) => setNewScenario({ ...newScenario, position: v })}
                      >
                        <SelectTrigger data-testid="select-scenario-position">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POSITIONS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="scenario-description">Descrição</Label>
                    <Textarea
                      id="scenario-description"
                      value={newScenario.description}
                      onChange={(e) => setNewScenario({ ...newScenario, description: e.target.value })}
                      placeholder="Descreva as premissas deste cenário..."
                      rows={2}
                      data-testid="textarea-scenario-description"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Ano Alvo</Label>
                      <Select
                        value={String(newScenario.targetYear)}
                        onValueChange={(v) => setNewScenario({ ...newScenario, targetYear: parseInt(v) })}
                      >
                        <SelectTrigger data-testid="select-target-year">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2026">2026</SelectItem>
                          <SelectItem value="2028">2028</SelectItem>
                          <SelectItem value="2030">2030</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Ano Base</Label>
                      <Select
                        value={String(newScenario.baseYear)}
                        onValueChange={(v) => setNewScenario({ ...newScenario, baseYear: parseInt(v) })}
                      >
                        <SelectTrigger data-testid="select-base-year">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2022">2022</SelectItem>
                          <SelectItem value="2018">2018</SelectItem>
                          <SelectItem value="2014">2014</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Select
                        value={newScenario.state}
                        onValueChange={(v) => setNewScenario({ ...newScenario, state: v })}
                      >
                        <SelectTrigger data-testid="select-scenario-state">
                          <SelectValue placeholder="Nacional" />
                        </SelectTrigger>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-4 border rounded-lg p-4">
                    <h4 className="font-medium">Pesos do Modelo</h4>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Peso das Pesquisas</Label>
                          <span className="text-muted-foreground">{newScenario.pollingWeight}%</span>
                        </div>
                        <Slider
                          value={[newScenario.pollingWeight]}
                          onValueChange={([v]) => setNewScenario({ ...newScenario, pollingWeight: v })}
                          max={100}
                          step={5}
                          data-testid="slider-polling-weight"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Peso Histórico</Label>
                          <span className="text-muted-foreground">{newScenario.historicalWeight}%</span>
                        </div>
                        <Slider
                          value={[newScenario.historicalWeight]}
                          onValueChange={([v]) => setNewScenario({ ...newScenario, historicalWeight: v })}
                          max={100}
                          step={5}
                          data-testid="slider-historical-weight"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <Label>Peso dos Ajustes</Label>
                          <span className="text-muted-foreground">{newScenario.adjustmentWeight}%</span>
                        </div>
                        <Slider
                          value={[newScenario.adjustmentWeight]}
                          onValueChange={([v]) => setNewScenario({ ...newScenario, adjustmentWeight: v })}
                          max={100}
                          step={5}
                          data-testid="slider-adjustment-weight"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Dados de Pesquisas</h4>
                      <Button variant="outline" size="sm" onClick={addPollingData} data-testid="button-add-polling">
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                    {pollingData.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum dado de pesquisa adicionado</p>
                    ) : (
                      <div className="space-y-3">
                        {pollingData.map((poll, idx) => (
                          <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Partido</Label>
                              <Input
                                value={poll.party}
                                onChange={(e) => updatePollingData(idx, "party", e.target.value)}
                                placeholder="PT, PL..."
                                data-testid={`input-poll-party-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Percentual</Label>
                              <Input
                                type="number"
                                value={poll.pollPercent}
                                onChange={(e) => updatePollingData(idx, "pollPercent", parseFloat(e.target.value) || 0)}
                                placeholder="15.5"
                                data-testid={`input-poll-percent-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Fonte</Label>
                              <Input
                                value={poll.source}
                                onChange={(e) => updatePollingData(idx, "source", e.target.value)}
                                placeholder="Datafolha"
                                data-testid={`input-poll-source-${idx}`}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removePollingData(idx)}
                              data-testid={`button-remove-poll-${idx}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Fatores Externos</h4>
                      <Button variant="outline" size="sm" onClick={addExternalFactor} data-testid="button-add-factor">
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </div>
                    {externalFactors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum fator externo adicionado</p>
                    ) : (
                      <div className="space-y-3">
                        {externalFactors.map((factor, idx) => (
                          <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Fator</Label>
                              <Input
                                value={factor.factor}
                                onChange={(e) => updateExternalFactor(idx, "factor", e.target.value)}
                                placeholder="Economia, Escândalo..."
                                data-testid={`input-factor-name-${idx}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Impacto</Label>
                              <Select
                                value={factor.impact}
                                onValueChange={(v) => updateExternalFactor(idx, "impact", v)}
                              >
                                <SelectTrigger data-testid={`select-factor-impact-${idx}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="positive">Positivo</SelectItem>
                                  <SelectItem value="negative">Negativo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Magnitude (1-10)</Label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={factor.magnitude}
                                onChange={(e) => updateExternalFactor(idx, "magnitude", parseInt(e.target.value) || 5)}
                                data-testid={`input-factor-magnitude-${idx}`}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeExternalFactor(idx)}
                              data-testid={`button-remove-factor-${idx}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Iterações Monte Carlo</Label>
                      <Select
                        value={String(newScenario.monteCarloIterations)}
                        onValueChange={(v) => setNewScenario({ ...newScenario, monteCarloIterations: parseInt(v) })}
                      >
                        <SelectTrigger data-testid="select-monte-carlo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1000">1.000 (rápido)</SelectItem>
                          <SelectItem value="5000">5.000 (balanceado)</SelectItem>
                          <SelectItem value="10000">10.000 (padrão)</SelectItem>
                          <SelectItem value="50000">50.000 (preciso)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nível de Confiança</Label>
                      <Select
                        value={String(newScenario.confidenceLevel)}
                        onValueChange={(v) => setNewScenario({ ...newScenario, confidenceLevel: parseInt(v) })}
                      >
                        <SelectTrigger data-testid="select-confidence">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="90">90%</SelectItem>
                          <SelectItem value="95">95%</SelectItem>
                          <SelectItem value="99">99%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowNewScenarioDialog(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => createScenarioMutation.mutate({ ...newScenario, pollingData, partyAdjustments, externalFactors })}
                    disabled={!newScenario.name || createScenarioMutation.isPending}
                    data-testid="button-save-scenario"
                  >
                    {createScenarioMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Criar Cenário"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {loadingScenarios ? (
            <Card>
              <CardContent className="p-6 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : !predictionScenarios || predictionScenarios.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Settings2}
                  title="Nenhum cenário criado"
                  description="Crie um cenário personalizado para começar a fazer previsões avançadas."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {predictionScenarios.map((scenario) => (
                <Card key={scenario.id} data-testid={`card-scenario-${scenario.id}`}>
                  <Collapsible
                    open={expandedScenarios.has(scenario.id)}
                    onOpenChange={() => toggleScenarioExpanded(scenario.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3">
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              {expandedScenarios.has(scenario.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <div>
                            <CardTitle className="text-base">{scenario.name}</CardTitle>
                            <CardDescription>
                              {scenario.targetYear} baseado em {scenario.baseYear}
                              {scenario.state && ` - ${scenario.state}`}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusBadge(scenario.status)}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => runScenarioMutation.mutate(scenario.id)}
                            disabled={scenario.status === "running" || runScenarioMutation.isPending}
                            data-testid={`button-run-scenario-${scenario.id}`}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Executar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteScenarioMutation.mutate(scenario.id)}
                            disabled={deleteScenarioMutation.isPending}
                            data-testid={`button-delete-scenario-${scenario.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <CardContent className="space-y-4">
                        {scenario.description && (
                          <p className="text-sm text-muted-foreground">{scenario.description}</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="space-y-1">
                            <span className="text-muted-foreground">Cargo</span>
                            <p className="font-medium">{scenario.position || "Dep. Federal"}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground">Iterações</span>
                            <p className="font-medium">{scenario.monteCarloIterations?.toLocaleString()}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground">Confiança</span>
                            <p className="font-medium">{parseFloat(scenario.confidenceLevel || "0.95") * 100}%</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground">Última Execução</span>
                            <p className="font-medium">
                              {scenario.lastRunAt ? new Date(scenario.lastRunAt).toLocaleDateString("pt-BR") : "Nunca"}
                            </p>
                          </div>
                        </div>
                        {scenario.narrative && (
                          <div className="bg-muted/50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium text-sm">Análise IA</span>
                            </div>
                            <p className="text-sm text-muted-foreground">{scenario.narrative}</p>
                          </div>
                        )}
                        {scenario.forecastRunId && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/forecasts?id=${scenario.forecastRunId}`}>
                              <BarChart3 className="h-4 w-4 mr-2" />
                              Ver Resultados Detalhados
                            </a>
                          </Button>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Candidate Comparison Tab */}
        <TabsContent value="comparison" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Comparação de Candidatos</CardTitle>
                  <CardDescription>Compare o desempenho projetado de dois ou mais candidatos</CardDescription>
                </div>
                <Dialog open={showComparisonDialog} onOpenChange={setShowComparisonDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-comparison">
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Comparação
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Criar Comparação de Candidatos</DialogTitle>
                      <DialogDescription>Compare o desempenho projetado de candidatos</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nome da Comparação</Label>
                        <Input
                          value={comparisonForm.name}
                          onChange={(e) => setComparisonForm({ ...comparisonForm, name: e.target.value })}
                          placeholder="Ex: Disputa SP 2026"
                          data-testid="input-comparison-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Adicionar Candidatos</Label>
                        <div className="flex gap-2">
                          <Input
                            value={comparisonForm.candidateInput}
                            onChange={(e) => setComparisonForm({ ...comparisonForm, candidateInput: e.target.value })}
                            placeholder="Nome do candidato"
                            onKeyPress={(e) => e.key === "Enter" && addCandidateToComparison()}
                            data-testid="input-candidate-name"
                          />
                          <Button type="button" onClick={addCandidateToComparison} size="icon" data-testid="button-add-candidate">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {comparisonForm.candidateIds.map((c, i) => (
                            <Badge key={i} variant="secondary" className="gap-1" data-testid={`badge-candidate-${i}`}>
                              {c}
                              <button 
                                onClick={() => removeCandidateFromComparison(c)} 
                                className="ml-1 hover:text-destructive"
                                data-testid={`button-remove-candidate-${i}`}
                              >×</button>
                            </Badge>
                          ))}
                        </div>
                        {comparisonForm.candidateIds.length < 2 && (
                          <p className="text-xs text-muted-foreground">Adicione pelo menos 2 candidatos para comparar</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Estado</Label>
                          <Select value={comparisonForm.state || "national"} onValueChange={(v) => setComparisonForm({ ...comparisonForm, state: v === "national" ? "" : v })}>
                            <SelectTrigger data-testid="select-comparison-state"><SelectValue placeholder="Nacional" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="national">Nacional</SelectItem>
                              {BRAZILIAN_STATES.filter(s => s.value).map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Ano Alvo</Label>
                          <Input
                            type="number"
                            value={comparisonForm.targetYear}
                            onChange={(e) => setComparisonForm({ ...comparisonForm, targetYear: parseInt(e.target.value) })}
                            data-testid="input-comparison-year"
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createComparisonMutation.mutate(comparisonForm)}
                        disabled={createComparisonMutation.isPending || comparisonForm.candidateIds.length < 2 || !comparisonForm.name}
                        data-testid="button-submit-comparison"
                      >
                        {createComparisonMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Criar Comparação
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingComparisons ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : comparisons && comparisons.length > 0 ? (
                <div className="space-y-4">
                  {comparisons.map((comp) => (
                    <Card key={comp.id} data-testid={`card-comparison-${comp.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <CardTitle className="text-base">{comp.name}</CardTitle>
                            <CardDescription>
                              {(comp.candidateIds as string[]).join(" vs ")} - {comp.targetYear}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(comp.status)}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => runComparisonMutation.mutate(comp.id)}
                              disabled={comp.status === "running" || runComparisonMutation.isPending}
                              data-testid={`button-run-comparison-${comp.id}`}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Analisar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteComparisonMutation.mutate(comp.id)}
                              data-testid={`button-delete-comparison-${comp.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {comp.status === "completed" && comp.results && (
                        <CardContent className="space-y-4">
                          <div className="h-48 mb-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={(comp.results.candidates || []).map((c: any) => ({
                                name: c.name.split(" ")[0],
                                votos: c.projectedVoteShare || 0,
                                probabilidade: (c.electionProbability || 0) * 100,
                                errorMargin: (c.projectedVoteShare || 0) * 0.1,
                              }))}>
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tickFormatter={(v) => `${v}%`} />
                                <Tooltip 
                                  formatter={(value: number, name: string) => [
                                    `${value.toFixed(1)}%`, 
                                    name === "votos" ? "Votos Projetados" : "Prob. Eleição"
                                  ]}
                                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                                />
                                <Legend />
                                <Bar dataKey="votos" name="Votos %" fill="hsl(210, 100%, 40%)" radius={[4, 4, 0, 0]}>
                                  <ErrorBar dataKey="errorMargin" stroke="hsl(0, 0%, 60%)" strokeWidth={1.5} />
                                </Bar>
                                <Bar dataKey="probabilidade" name="Prob. %" fill="hsl(45, 100%, 50%)" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {(comp.results.candidates || []).map((c: any, i: number) => (
                              <div key={i} className="p-4 rounded-lg border space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{c.name}</span>
                                  <Badge variant={c.name === comp.results.overallWinner ? "default" : "outline"}>
                                    {c.party}
                                  </Badge>
                                </div>
                                <div className="space-y-1 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Votos Projetados</span>
                                    <span>{(c.projectedVoteShare || 0).toFixed(1)}%</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Prob. Eleição</span>
                                    <span>{((c.electionProbability || 0) * 100).toFixed(0)}%</span>
                                  </div>
                                  <Progress value={(c.electionProbability || 0) * 100} className="h-2" />
                                </div>
                              </div>
                            ))}
                          </div>
                          {comp.narrative && (
                            <div className="bg-muted/50 rounded-lg p-4">
                              <p className="text-sm text-muted-foreground">{comp.narrative}</p>
                            </div>
                          )}
                          <div className="flex justify-end pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => exportPredictionToPdf({
                                title: comp.name,
                                subtitle: `Comparação: ${(comp.candidateIds as string[]).join(" vs ")}`,
                                type: "comparison",
                                data: comp,
                                narrative: comp.narrative || undefined,
                              })}
                              data-testid={`button-export-comparison-${comp.id}`}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Exportar PDF
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma comparação criada</p>
                  <p className="text-sm">Crie uma nova comparação para analisar candidatos</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Event Impact Tab */}
        <TabsContent value="events" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Impacto de Eventos</CardTitle>
                  <CardDescription>Projete o impacto de eventos políticos com análise antes/depois</CardDescription>
                </div>
                <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-event">
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Previsão
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Prever Impacto de Evento</DialogTitle>
                      <DialogDescription>Analise como um evento pode afetar os resultados eleitorais</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nome da Previsão</Label>
                        <Input
                          value={eventForm.name}
                          onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                          placeholder="Ex: Impacto da Delação"
                          data-testid="input-event-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição do Evento</Label>
                        <Textarea
                          value={eventForm.eventDescription}
                          onChange={(e) => setEventForm({ ...eventForm, eventDescription: e.target.value })}
                          placeholder="Descreva o evento em detalhes..."
                          data-testid="input-event-description"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tipo de Evento</Label>
                          <Select value={eventForm.eventType} onValueChange={(v) => setEventForm({ ...eventForm, eventType: v })}>
                            <SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="scandal">Escândalo</SelectItem>
                              <SelectItem value="party_change">Mudança de Partido</SelectItem>
                              <SelectItem value="endorsement">Apoio/Endorsement</SelectItem>
                              <SelectItem value="policy">Política Pública</SelectItem>
                              <SelectItem value="debate">Debate</SelectItem>
                              <SelectItem value="economic">Evento Econômico</SelectItem>
                              <SelectItem value="other">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Duração do Impacto</Label>
                          <Select value={eventForm.impactDuration} onValueChange={(v) => setEventForm({ ...eventForm, impactDuration: v })}>
                            <SelectTrigger data-testid="select-impact-duration"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="short-term">Curto Prazo</SelectItem>
                              <SelectItem value="medium-term">Médio Prazo</SelectItem>
                              <SelectItem value="long-term">Longo Prazo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Partidos Afetados (separados por vírgula)</Label>
                        <Input
                          value={eventForm.affectedParties.join(", ")}
                          onChange={(e) => setEventForm({ ...eventForm, affectedParties: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          placeholder="PT, PL, PSDB..."
                          data-testid="input-affected-parties"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Magnitude do Impacto</Label>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-muted-foreground">-100%</span>
                          <Slider
                            value={[eventForm.impactMagnitude * 100]}
                            onValueChange={([v]) => setEventForm({ ...eventForm, impactMagnitude: v / 100 })}
                            min={-100}
                            max={100}
                            step={5}
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground">+100%</span>
                          <span className="font-medium w-16 text-right">{(eventForm.impactMagnitude * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createEventMutation.mutate(eventForm)}
                        disabled={createEventMutation.isPending || !eventForm.name || !eventForm.eventDescription}
                        data-testid="button-submit-event"
                      >
                        {createEventMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Criar Previsão
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingEvents ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : eventImpacts && eventImpacts.length > 0 ? (
                <div className="space-y-4">
                  {eventImpacts.map((event) => (
                    <Card key={event.id} data-testid={`card-event-${event.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <CardTitle className="text-base">{event.name}</CardTitle>
                            <CardDescription className="line-clamp-1">{event.eventDescription}</CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(event.status)}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => runEventMutation.mutate(event.id)}
                              disabled={event.status === "running" || runEventMutation.isPending}
                              data-testid={`button-run-event-${event.id}`}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Analisar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteEventMutation.mutate(event.id)}
                              data-testid={`button-delete-event-${event.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {event.status === "completed" && event.beforeProjection && event.afterProjection && (
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg border space-y-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">Antes</Badge>
                                <span className="text-sm font-medium">Projeção Pré-Evento</span>
                              </div>
                              {(event.beforeProjection.parties || []).slice(0, 5).map((p: any, i: number) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span>{p.party}</span>
                                  <span>{p.voteShare?.toFixed(1)}%</span>
                                </div>
                              ))}
                            </div>
                            <div className="p-4 rounded-lg border space-y-3">
                              <div className="flex items-center gap-2">
                                <Badge>Depois</Badge>
                                <span className="text-sm font-medium">Projeção Pós-Evento</span>
                              </div>
                              {(event.afterProjection.parties || []).slice(0, 5).map((p: any, i: number) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span>{p.party}</span>
                                  <span className="flex items-center gap-1">
                                    {p.voteShare?.toFixed(1)}%
                                    {p.trend === "growing" && <TrendingUp className="h-3 w-3 text-success" />}
                                    {p.trend === "declining" && <TrendingDown className="h-3 w-3 text-destructive" />}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {event.impactDelta && (
                            <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
                              {event.impactDelta.biggestGainer && (
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-success" />
                                  <span className="text-sm">
                                    <strong>{event.impactDelta.biggestGainer.party}</strong> +{event.impactDelta.biggestGainer.voteShareChange?.toFixed(1)}%
                                  </span>
                                </div>
                              )}
                              {event.impactDelta.biggestLoser && (
                                <div className="flex items-center gap-2">
                                  <TrendingDown className="h-4 w-4 text-destructive" />
                                  <span className="text-sm">
                                    <strong>{event.impactDelta.biggestLoser.party}</strong> {event.impactDelta.biggestLoser.voteShareChange?.toFixed(1)}%
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="h-48 mb-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <ComposedChart data={(() => {
                                const beforeMap = new Map<string, number>((event.beforeProjection.parties || []).map((p: any) => [p.party, p.voteShare || 0]));
                                return (event.afterProjection.parties || []).slice(0, 6).map((p: any) => ({
                                  name: p.party,
                                  antes: beforeMap.get(p.party) || 0,
                                  depois: p.voteShare || 0,
                                  variacao: (p.voteShare || 0) - (beforeMap.get(p.party) || 0),
                                }));
                              })()}>
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis yAxisId="left" tickFormatter={(v) => `${v}%`} />
                                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
                                <Tooltip 
                                  formatter={(value: number, name: string) => [
                                    `${value.toFixed(1)}%`, 
                                    name === "antes" ? "Antes" : name === "depois" ? "Depois" : "Variação"
                                  ]}
                                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                                />
                                <Legend />
                                <Bar yAxisId="left" dataKey="antes" name="Antes" fill="hsl(210, 30%, 60%)" radius={[4, 4, 0, 0]} />
                                <Bar yAxisId="left" dataKey="depois" name="Depois" fill="hsl(210, 100%, 40%)" radius={[4, 4, 0, 0]} />
                                <Line yAxisId="right" type="monotone" dataKey="variacao" name="Variação" stroke="hsl(45, 100%, 50%)" strokeWidth={2} dot={{ fill: "hsl(45, 100%, 50%)" }} />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                          {event.narrative && (
                            <div className="bg-muted/50 rounded-lg p-4">
                              <p className="text-sm text-muted-foreground">{event.narrative}</p>
                            </div>
                          )}
                          <div className="flex justify-end pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => exportPredictionToPdf({
                                title: event.name,
                                subtitle: `Impacto de Evento: ${event.eventType}`,
                                type: "event",
                                data: event,
                                narrative: event.narrative || undefined,
                              })}
                              data-testid={`button-export-event-${event.id}`}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Exportar PDF
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma previsão de evento criada</p>
                  <p className="text-sm">Crie uma nova previsão para analisar impactos</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* What-If Simulation Tab */}
        <TabsContent value="whatif" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Simulações "E se...?"</CardTitle>
                  <CardDescription>Simule cenários hipotéticos como mudanças de partido ou coligações</CardDescription>
                </div>
                <Dialog open={showWhatIfDialog} onOpenChange={setShowWhatIfDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-whatif">
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Simulação
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Criar Simulação "E se...?"</DialogTitle>
                      <DialogDescription>Simule cenários hipotéticos e veja os impactos projetados</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nome da Simulação</Label>
                        <Input
                          value={whatIfForm.name}
                          onChange={(e) => setWhatIfForm({ ...whatIfForm, name: e.target.value })}
                          placeholder="Ex: E se X mudar de partido?"
                          data-testid="input-whatif-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Tipo de Simulação</Label>
                        <Select value={whatIfForm.simulationType} onValueChange={(v) => setWhatIfForm({ ...whatIfForm, simulationType: v })}>
                          <SelectTrigger data-testid="select-simulation-type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="party_change">Mudança de Partido</SelectItem>
                            <SelectItem value="coalition_change">Mudança de Coligação</SelectItem>
                            <SelectItem value="turnout_change">Variação de Comparecimento</SelectItem>
                            <SelectItem value="regional_shift">Mudança Regional</SelectItem>
                            <SelectItem value="custom">Personalizado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {whatIfForm.simulationType === "party_change" && (
                        <>
                          <div className="space-y-2">
                            <Label>Candidato</Label>
                            <Input
                              value={whatIfForm.candidateName}
                              onChange={(e) => setWhatIfForm({ ...whatIfForm, candidateName: e.target.value })}
                              placeholder="Nome do candidato"
                              data-testid="input-whatif-candidate"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Partido Atual</Label>
                              <Select value={whatIfForm.fromParty} onValueChange={(v) => setWhatIfForm({ ...whatIfForm, fromParty: v })}>
                                <SelectTrigger data-testid="select-from-party"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {parties?.map((p) => (
                                    <SelectItem key={p.id} value={p.abbreviation}>{p.abbreviation}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Novo Partido</Label>
                              <Select value={whatIfForm.toParty} onValueChange={(v) => setWhatIfForm({ ...whatIfForm, toParty: v })}>
                                <SelectTrigger data-testid="select-to-party"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {parties?.map((p) => (
                                    <SelectItem key={p.id} value={p.abbreviation}>{p.abbreviation}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </>
                      )}
                      <div className="space-y-2">
                        <Label>Descrição (opcional)</Label>
                        <Textarea
                          value={whatIfForm.description}
                          onChange={(e) => setWhatIfForm({ ...whatIfForm, description: e.target.value })}
                          placeholder="Descreva o cenário..."
                          data-testid="input-whatif-description"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => createWhatIfMutation.mutate(whatIfForm)}
                        disabled={createWhatIfMutation.isPending || !whatIfForm.name}
                        data-testid="button-submit-whatif"
                      >
                        {createWhatIfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Criar Simulação
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSimulations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : simulations && simulations.length > 0 ? (
                <div className="space-y-4">
                  {simulations.map((sim) => (
                    <Card key={sim.id} data-testid={`card-simulation-${sim.id}`}>
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <CardTitle className="text-base">{sim.name}</CardTitle>
                            <CardDescription>
                              {sim.simulationType === "party_change" && sim.parameters && (
                                <span className="flex items-center gap-1">
                                  {sim.parameters.candidateName}: {sim.parameters.fromParty} <ArrowRight className="h-3 w-3" /> {sim.parameters.toParty}
                                </span>
                              )}
                              {sim.simulationType !== "party_change" && sim.description}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(sim.status)}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => runWhatIfMutation.mutate(sim.id)}
                              disabled={sim.status === "running" || runWhatIfMutation.isPending}
                              data-testid={`button-run-simulation-${sim.id}`}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Simular
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteWhatIfMutation.mutate(sim.id)}
                              data-testid={`button-delete-simulation-${sim.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      {sim.status === "completed" && sim.impactAnalysis && (
                        <CardContent className="space-y-4">
                          <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                Impacto: {sim.impactAnalysis.overallImpact === "significativo" ? "Significativo" : 
                                          sim.impactAnalysis.overallImpact === "moderado" ? "Moderado" : "Mínimo"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">Confiança: {((sim.impactAnalysis.confidence || 0) * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          {sim.impactAnalysis.seatChanges && sim.impactAnalysis.seatChanges.length > 0 && (
                            <>
                              <div className="h-48 mb-4">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={sim.impactAnalysis.seatChanges.slice(0, 6).map((c: any) => ({
                                    name: c.party,
                                    antes: c.before,
                                    depois: c.after,
                                    variacao: c.change,
                                  }))}>
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis />
                                    <Tooltip 
                                      formatter={(value: number, name: string) => [
                                        value, 
                                        name === "antes" ? "Antes" : name === "depois" ? "Depois" : "Variação"
                                      ]}
                                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                                    />
                                    <Legend />
                                    <Bar dataKey="antes" name="Antes" fill="hsl(210, 30%, 60%)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="depois" name="Depois" fill="hsl(210, 100%, 40%)" radius={[4, 4, 0, 0]} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {sim.impactAnalysis.seatChanges.slice(0, 4).map((change: any, i: number) => (
                                  <div key={i} className="p-3 rounded-lg border text-center">
                                    <span className="font-medium">{change.party}</span>
                                    <div className="flex items-center justify-center gap-1 mt-1">
                                      <span className="text-muted-foreground">{change.before}</span>
                                      <ArrowRight className="h-3 w-3" />
                                      <span className={change.change > 0 ? "text-success" : change.change < 0 ? "text-destructive" : ""}>
                                        {change.after}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          {sim.narrative && (
                            <div className="bg-muted/50 rounded-lg p-4">
                              <p className="text-sm text-muted-foreground">{sim.narrative}</p>
                            </div>
                          )}
                          <div className="flex justify-end pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => exportPredictionToPdf({
                                title: sim.name,
                                subtitle: `Simulação: ${sim.simulationType}`,
                                type: "whatif",
                                data: sim,
                                narrative: sim.narrative || undefined,
                              })}
                              data-testid={`button-export-simulation-${sim.id}`}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Exportar PDF
                            </Button>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Shuffle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma simulação criada</p>
                  <p className="text-sm">Crie uma nova simulação para explorar cenários hipotéticos</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
