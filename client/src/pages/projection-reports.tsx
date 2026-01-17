import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  FileText, 
  Plus, 
  Download, 
  Trash2, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  BarChart3,
  Target,
  Shield,
  Lightbulb,
  Calendar,
  MapPin,
  ChevronRight
} from "lucide-react";
import type { ProjectionReportRecord } from "@shared/schema";

const BRAZIL_STATES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins"
};

type ProjectionReport = ProjectionReportRecord & {
  dataQuality?: {
    completeness: number;
    yearsAnalyzed: number;
    totalRecordsAnalyzed: number;
    lastUpdated: string;
  } | null;
  turnoutProjection?: {
    expected: number;
    confidence: number;
    marginOfError: { lower: number; upper: number };
    historicalBasis: { year: number; turnout: number }[];
    factors: { factor: string; impact: number; description: string }[];
  } | null;
  partyProjections?: {
    party: string;
    abbreviation: string;
    voteShare: { expected: number; min: number; max: number };
    seats: { expected: number; min: number; max: number };
    trend: "growing" | "declining" | "stable";
    confidence: number;
    marginOfError: number;
  }[] | null;
  candidateProjections?: {
    name: string;
    party: string;
    position: string;
    electionProbability: number;
    projectedVotes: { expected: number; min: number; max: number };
    confidence: number;
    ranking: number;
  }[] | null;
  scenarios?: {
    name: string;
    description: string;
    probability: number;
    outcomes: { party: string; seats: number; voteShare: number }[];
  }[] | null;
  riskAssessment?: {
    overallRisk: "low" | "medium" | "high";
    risks: {
      risk: string;
      probability: number;
      impact: "low" | "medium" | "high";
      category: string;
      mitigation: string;
    }[];
  } | null;
  confidenceIntervals?: {
    overall: number;
    turnout: number;
    partyResults: number;
    seatDistribution: number;
  } | null;
  recommendations?: string[] | null;
  status: string;
  createdAt: string;
  validUntil?: string;
}

export default function ProjectionReportsPage() {
  const { toast } = useToast();
  const [selectedReport, setSelectedReport] = useState<ProjectionReport | null>(null);
  const [showNewReportForm, setShowNewReportForm] = useState(false);
  const [newReportForm, setNewReportForm] = useState({
    name: "",
    targetYear: new Date().getFullYear() + 2,
    electionType: "Eleições Gerais",
    scope: "national" as "national" | "state",
    state: ""
  });

  const { data: reports, isLoading: loadingReports, refetch } = useQuery<ProjectionReport[]>({
    queryKey: ["/api/projection-reports"],
  });

  const createReportMutation = useMutation({
    mutationFn: async (data: typeof newReportForm) => {
      const res = await apiRequest("POST", "/api/projection-reports", data);
      return res.json() as Promise<ProjectionReport>;
    },
    onSuccess: (data) => {
      toast({ title: "Sucesso", description: "Relatório de projeção gerado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/projection-reports"] });
      setShowNewReportForm(false);
      setSelectedReport(data);
      setNewReportForm({
        name: "",
        targetYear: new Date().getFullYear() + 2,
        electionType: "Eleições Gerais",
        scope: "national",
        state: ""
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro", 
        description: error.message || "Falha ao gerar relatório de projeção",
        variant: "destructive"
      });
    }
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/projection-reports/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Relatório excluído com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/projection-reports"] });
      setSelectedReport(null);
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro", 
        description: error.message || "Falha ao excluir relatório",
        variant: "destructive"
      });
    }
  });

  const handleExportCSV = (id: number) => {
    window.open(`/api/projection-reports/${id}/export/csv`, "_blank");
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "growing": return <TrendingUp className="w-4 h-4 text-green-500" />;
      case "declining": return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-gray-500" />;
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Baixo</Badge>;
      case "medium": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Médio</Badge>;
      case "high": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Alto</Badge>;
      default: return <Badge variant="secondary">{risk}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="secondary">Rascunho</Badge>;
      case "published": return <Badge variant="default" className="bg-green-600">Publicado</Badge>;
      case "archived": return <Badge variant="outline">Arquivado</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="page-title">
            <FileText className="w-8 h-8 text-primary" />
            Relatórios de Projeção
          </h1>
          <p className="text-muted-foreground mt-1">
            Projeções eleitorais com modelos preditivos, margens de erro e intervalos de confiança
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            onClick={() => setShowNewReportForm(true)}
            data-testid="button-new-report"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Relatório
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Relatórios Gerados</CardTitle>
            <CardDescription>Selecione um relatório para visualizar</CardDescription>
          </CardHeader>
          <CardContent>
            {showNewReportForm && (
              <Card className="mb-4 border-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Novo Relatório de Projeção</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Nome do Relatório</Label>
                    <Input
                      placeholder="Ex: Projeção Eleições 2026"
                      value={newReportForm.name}
                      onChange={(e) => setNewReportForm(prev => ({ ...prev, name: e.target.value }))}
                      data-testid="input-report-name"
                    />
                  </div>
                  <div>
                    <Label>Ano Alvo</Label>
                    <Input
                      type="number"
                      value={newReportForm.targetYear}
                      onChange={(e) => setNewReportForm(prev => ({ ...prev, targetYear: parseInt(e.target.value) }))}
                      data-testid="input-target-year"
                    />
                  </div>
                  <div>
                    <Label>Tipo de Eleição</Label>
                    <Select
                      value={newReportForm.electionType}
                      onValueChange={(value) => setNewReportForm(prev => ({ ...prev, electionType: value }))}
                    >
                      <SelectTrigger data-testid="select-election-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Eleições Gerais">Eleições Gerais</SelectItem>
                        <SelectItem value="Eleições Municipais">Eleições Municipais</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Escopo</Label>
                    <Select
                      value={newReportForm.scope}
                      onValueChange={(value: "national" | "state") => setNewReportForm(prev => ({ ...prev, scope: value }))}
                    >
                      <SelectTrigger data-testid="select-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="national">Nacional</SelectItem>
                        <SelectItem value="state">Estadual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newReportForm.scope === "state" && (
                    <div>
                      <Label>Estado</Label>
                      <Select
                        value={newReportForm.state}
                        onValueChange={(value) => setNewReportForm(prev => ({ ...prev, state: value }))}
                      >
                        <SelectTrigger data-testid="select-state">
                          <SelectValue placeholder="Selecione um estado" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(BRAZIL_STATES).map(([code, name]) => (
                            <SelectItem key={code} value={code}>{code} - {name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1"
                      onClick={() => createReportMutation.mutate(newReportForm)}
                      disabled={createReportMutation.isPending || !newReportForm.name}
                      data-testid="button-generate-report"
                    >
                      {createReportMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Target className="w-4 h-4 mr-2" />
                          Gerar Projeção
                        </>
                      )}
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => setShowNewReportForm(false)}
                      data-testid="button-cancel"
                    >
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <ScrollArea className="h-[500px]">
              {loadingReports ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : reports && reports.length > 0 ? (
                <div className="space-y-2">
                  {reports.map((report) => (
                    <Card 
                      key={report.id}
                      className={`cursor-pointer transition-colors hover-elevate ${selectedReport?.id === report.id ? "border-primary bg-primary/5" : ""}`}
                      onClick={() => setSelectedReport(report)}
                      data-testid={`report-card-${report.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{report.name}</h3>
                              {getStatusBadge(report.status)}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              <span>{report.targetYear}</span>
                              <span>•</span>
                              <MapPin className="w-3 h-3" />
                              <span>{report.scope === "national" ? "Nacional" : report.state}</span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum relatório gerado ainda.</p>
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowNewReportForm(true)}
                    className="mt-2 text-primary"
                  >
                    Criar primeiro relatório
                  </Button>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            {selectedReport ? (
              <Tabs defaultValue="summary" className="w-full">
                <div className="flex items-center justify-between p-4 border-b">
                  <div>
                    <h2 className="text-xl font-bold">{selectedReport.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      Projeção para {selectedReport.targetYear} • {selectedReport.scope === "national" ? "Nacional" : selectedReport.state}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleExportCSV(selectedReport.id)}
                      data-testid="button-export-csv"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      CSV
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteReportMutation.mutate(selectedReport.id)}
                      data-testid="button-delete-report"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                  <TabsTrigger 
                    value="summary" 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    data-testid="tab-summary"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Resumo
                  </TabsTrigger>
                  <TabsTrigger 
                    value="turnout"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    data-testid="tab-turnout"
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Comparecimento
                  </TabsTrigger>
                  <TabsTrigger 
                    value="parties"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    data-testid="tab-parties"
                  >
                    <BarChart3 className="w-4 h-4 mr-1" />
                    Partidos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="candidates"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    data-testid="tab-candidates"
                  >
                    <Target className="w-4 h-4 mr-1" />
                    Candidatos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="risks"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
                    data-testid="tab-risks"
                  >
                    <Shield className="w-4 h-4 mr-1" />
                    Riscos
                  </TabsTrigger>
                </TabsList>

                <ScrollArea className="h-[550px]">
                  <div className="p-4">
                    <TabsContent value="summary" className="mt-0 space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Resumo Executivo</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm whitespace-pre-wrap">{selectedReport.executiveSummary}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Intervalos de Confiança</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Confiança Geral</span>
                                <span className="font-medium">{((selectedReport.confidenceIntervals?.overall || 0) * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={(selectedReport.confidenceIntervals?.overall || 0) * 100} className="h-2" />
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Comparecimento</span>
                                <span className="font-medium">{((selectedReport.confidenceIntervals?.turnout || 0) * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={(selectedReport.confidenceIntervals?.turnout || 0) * 100} className="h-2" />
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Resultados Partidários</span>
                                <span className="font-medium">{((selectedReport.confidenceIntervals?.partyResults || 0) * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={(selectedReport.confidenceIntervals?.partyResults || 0) * 100} className="h-2" />
                            </div>
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Distribuição de Cadeiras</span>
                                <span className="font-medium">{((selectedReport.confidenceIntervals?.seatDistribution || 0) * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={(selectedReport.confidenceIntervals?.seatDistribution || 0) * 100} className="h-2" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {selectedReport.recommendations && selectedReport.recommendations.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Lightbulb className="w-4 h-4 text-yellow-500" />
                              Recomendações
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-2">
                              {selectedReport.recommendations.map((rec, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Metodologia</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">{selectedReport.methodology}</p>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="turnout" className="mt-0 space-y-4">
                      {selectedReport.turnoutProjection && (
                        <>
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base">Projeção de Comparecimento</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center justify-center py-6">
                                <div className="text-center">
                                  <div className="text-5xl font-bold text-primary">
                                    {selectedReport.turnoutProjection.expected}%
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-2">
                                    Intervalo: {selectedReport.turnoutProjection.marginOfError.lower}% - {selectedReport.turnoutProjection.marginOfError.upper}%
                                  </div>
                                  <div className="flex items-center justify-center gap-2 mt-2">
                                    <span className="text-sm">Confiança:</span>
                                    <Badge variant="outline">{(selectedReport.turnoutProjection.confidence * 100).toFixed(0)}%</Badge>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          {selectedReport.turnoutProjection.factors && selectedReport.turnoutProjection.factors.length > 0 && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Fatores de Influência</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3">
                                  {selectedReport.turnoutProjection.factors.map((factor, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                                      <div className={`w-2 h-2 rounded-full mt-2 ${factor.impact > 0 ? "bg-green-500" : factor.impact < 0 ? "bg-red-500" : "bg-gray-400"}`} />
                                      <div className="flex-1">
                                        <div className="font-medium">{factor.factor}</div>
                                        <div className="text-sm text-muted-foreground">{factor.description}</div>
                                      </div>
                                      <Badge variant={factor.impact > 0 ? "default" : factor.impact < 0 ? "destructive" : "secondary"}>
                                        {factor.impact > 0 ? "+" : ""}{(factor.impact * 100).toFixed(0)}%
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}
                    </TabsContent>

                    <TabsContent value="parties" className="mt-0 space-y-4">
                      {selectedReport.partyProjections && selectedReport.partyProjections.length > 0 ? (
                        <div className="space-y-3">
                          {selectedReport.partyProjections.map((party, i) => (
                            <Card key={i}>
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                                      {party.abbreviation.slice(0, 2)}
                                    </div>
                                    <div>
                                      <div className="font-medium flex items-center gap-2">
                                        {party.abbreviation}
                                        {getTrendIcon(party.trend)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">{party.party}</div>
                                    </div>
                                  </div>
                                  <Badge variant="outline">
                                    Confiança: {(party.confidence * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                                <Separator className="my-3" />
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-sm text-muted-foreground">Votos Projetados</div>
                                    <div className="font-medium text-lg">{party.voteShare.expected.toFixed(1)}%</div>
                                    <div className="text-xs text-muted-foreground">
                                      Intervalo: {party.voteShare.min.toFixed(1)}% - {party.voteShare.max.toFixed(1)}%
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-sm text-muted-foreground">Cadeiras Projetadas</div>
                                    <div className="font-medium text-lg">{party.seats.expected}</div>
                                    <div className="text-xs text-muted-foreground">
                                      Intervalo: {party.seats.min} - {party.seats.max}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Margem de erro: ±{party.marginOfError.toFixed(1)}%
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          Nenhuma projeção partidária disponível
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="candidates" className="mt-0 space-y-4">
                      {selectedReport.candidateProjections && selectedReport.candidateProjections.length > 0 ? (
                        <div className="space-y-2">
                          {selectedReport.candidateProjections.map((candidate, i) => (
                            <Card key={i}>
                              <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm">
                                      #{candidate.ranking}
                                    </div>
                                    <div>
                                      <div className="font-medium">{candidate.name}</div>
                                      <div className="text-sm text-muted-foreground">
                                        {candidate.party} • {candidate.position}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium text-lg">
                                      {(candidate.electionProbability * 100).toFixed(0)}%
                                    </div>
                                    <div className="text-xs text-muted-foreground">prob. eleição</div>
                                  </div>
                                </div>
                                <div className="mt-3 flex items-center gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">Votos esperados:</span>
                                    <span className="font-medium ml-1">{candidate.projectedVotes.expected.toLocaleString("pt-BR")}</span>
                                  </div>
                                  <div className="text-muted-foreground">
                                    ({candidate.projectedVotes.min.toLocaleString("pt-BR")} - {candidate.projectedVotes.max.toLocaleString("pt-BR")})
                                  </div>
                                </div>
                                <Progress 
                                  value={candidate.electionProbability * 100} 
                                  className="h-2 mt-2"
                                />
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          Nenhuma projeção de candidatos disponível
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="risks" className="mt-0 space-y-4">
                      {selectedReport.riskAssessment && (
                        <>
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-base flex items-center justify-between">
                                <span>Avaliação de Risco Geral</span>
                                {getRiskBadge(selectedReport.riskAssessment.overallRisk)}
                              </CardTitle>
                            </CardHeader>
                          </Card>

                          {selectedReport.riskAssessment.risks && selectedReport.riskAssessment.risks.length > 0 && (
                            <div className="space-y-3">
                              {selectedReport.riskAssessment.risks.map((risk, i) => (
                                <Card key={i}>
                                  <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                      <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                                        risk.impact === "high" ? "text-red-500" : 
                                        risk.impact === "medium" ? "text-yellow-500" : "text-blue-500"
                                      }`} />
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{risk.risk}</span>
                                          {getRiskBadge(risk.impact)}
                                          <Badge variant="outline">{risk.category}</Badge>
                                        </div>
                                        <div className="mt-2 text-sm">
                                          <span className="text-muted-foreground">Probabilidade: </span>
                                          <span>{(risk.probability * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="mt-2 p-2 rounded bg-muted/50 text-sm">
                                          <span className="font-medium">Mitigação: </span>
                                          {risk.mitigation}
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}

                          {selectedReport.scenarios && selectedReport.scenarios.length > 0 && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Cenários Possíveis</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-4">
                                  {selectedReport.scenarios.map((scenario, i) => (
                                    <div key={i} className="p-3 rounded-lg border">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium">{scenario.name}</span>
                                        <Badge variant="secondary">{(scenario.probability * 100).toFixed(0)}% probabilidade</Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-2">{scenario.description}</p>
                                      {scenario.outcomes && scenario.outcomes.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                          {scenario.outcomes.slice(0, 5).map((outcome, j) => (
                                            <Badge key={j} variant="outline">
                                              {outcome.party}: {outcome.seats} cad. ({outcome.voteShare.toFixed(1)}%)
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </>
                      )}
                    </TabsContent>
                  </div>
                </ScrollArea>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
                <FileText className="w-16 h-16 mb-4 opacity-30" />
                <h3 className="text-lg font-medium">Nenhum relatório selecionado</h3>
                <p className="text-sm">Selecione um relatório da lista ou crie um novo</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
