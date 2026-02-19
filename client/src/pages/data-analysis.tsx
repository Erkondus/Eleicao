import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  BarChart3,
  PieChartIcon,
  Users,
  Building2,
  MapPin,
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Vote,
  Loader2,
  Filter,
  Brain,
  MessageSquare,
  AlertTriangle,
  Sparkles,
  Send,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Save,
  FolderOpen,
  Trash2,
  GitCompare,
  SlidersHorizontal,
  ZoomIn,
  LayoutDashboard,
  Lightbulb,
  Plus,
  X,
  Eye,
  Globe,
} from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const CHART_COLORS = [
  "#003366", "#1a5490", "#3475b4", "#4e96d8", "#68b7fc",
  "#FFD700", "#e6c200", "#ccad00", "#b39800", "#998300",
  "#2ecc71", "#27ae60", "#1e8449", "#145a32", "#0d3d22",
  "#9b59b6", "#8e44ad", "#7d3c98", "#6c3483", "#5b2c6f",
];

function CustomTooltip({ active, payload, label, type }: any) {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[200px]" data-testid="chart-tooltip">
      <p className="font-semibold text-sm border-b pb-2 mb-2">{label || data.party || data.name || data.state}</p>
      {type === "party" && (
        <>
          <p className="text-sm"><span className="text-muted-foreground">Total:</span> {formatNumber(data.votesTotal ?? data.votes)}</p>
          {data.votesNominais !== undefined && <p className="text-sm"><span className="text-muted-foreground">Nominais:</span> {formatNumber(data.votesNominais)}</p>}
          {data.votesLegenda !== undefined && data.votesLegenda > 0 && <p className="text-sm"><span className="text-muted-foreground">Legenda:</span> {formatNumber(data.votesLegenda)}</p>}
          <p className="text-sm"><span className="text-muted-foreground">Candidatos:</span> {formatNumber(data.candidateCount)}</p>
          {data.partyNumber && <p className="text-sm"><span className="text-muted-foreground">N&uacute;mero:</span> {data.partyNumber}</p>}
        </>
      )}
      {type === "candidate" && (
        <>
          <p className="text-sm"><span className="text-muted-foreground">Nome:</span> {data.name}</p>
          <p className="text-sm"><span className="text-muted-foreground">Partido:</span> {data.party}</p>
          <p className="text-sm"><span className="text-muted-foreground">Votos:</span> {formatNumber(data.votes)}</p>
          {data.position && <p className="text-sm"><span className="text-muted-foreground">Cargo:</span> {data.position}</p>}
          {data.state && <p className="text-sm"><span className="text-muted-foreground">Estado:</span> {data.state}</p>}
        </>
      )}
      {type === "state" && (
        <>
          <p className="text-sm"><span className="text-muted-foreground">Votos:</span> {formatNumber(data.votes)}</p>
          <p className="text-sm"><span className="text-muted-foreground">Candidatos:</span> {formatNumber(data.candidateCount)}</p>
          <p className="text-sm"><span className="text-muted-foreground">Partidos:</span> {formatNumber(data.partyCount)}</p>
        </>
      )}
      {type === "municipality" && (
        <>
          <p className="text-sm"><span className="text-muted-foreground">Município:</span> {data.municipality}</p>
          <p className="text-sm"><span className="text-muted-foreground">Estado:</span> {data.state}</p>
          <p className="text-sm"><span className="text-muted-foreground">Votos:</span> {formatNumber(data.votes)}</p>
          <p className="text-sm"><span className="text-muted-foreground">Candidatos:</span> {formatNumber(data.candidateCount)}</p>
        </>
      )}
      {!type && (
        <p className="text-sm"><span className="text-muted-foreground">Valor:</span> {formatNumber(payload[0].value)}</p>
      )}
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString("pt-BR");
}

export default function DataAnalysis() {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedElectionType, setSelectedElectionType] = useState<string>("all");
  const [selectedPosition, setSelectedPosition] = useState<string>("all");
  const [selectedParty, setSelectedParty] = useState<string>("all");
  const [minVotes, setMinVotes] = useState<string>("");
  const [maxVotes, setMaxVotes] = useState<string>("");
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  // Comparison States
  const [compareMode, setCompareMode] = useState(false);
  const [compareYears, setCompareYears] = useState<number[]>([]);
  const [compareStates, setCompareStates] = useState<string[]>([]);
  const [compareGroupBy, setCompareGroupBy] = useState<"party" | "state" | "position">("party");
  
  // Saved Reports States
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  
  // AI States
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<{ question: string; answer: string } | null>(null);
  const [historicalPrediction, setHistoricalPrediction] = useState<any>(null);
  const [anomalyReport, setAnomalyReport] = useState<any>(null);
  
  // AI Suggestions States
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  
  // Custom Dashboard States
  const [showDashboardDialog, setShowDashboardDialog] = useState(false);
  const [dashboardName, setDashboardName] = useState("");
  const [dashboardDescription, setDashboardDescription] = useState("");
  const [dashboardIsPublic, setDashboardIsPublic] = useState(false);
  const [selectedDashboard, setSelectedDashboard] = useState<number | null>(null);
  
  // Municipality filter
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>("all");

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (selectedYear !== "all") f.year = selectedYear;
    if (selectedState !== "all") f.uf = selectedState;
    if (selectedElectionType !== "all") f.electionType = selectedElectionType;
    if (selectedPosition !== "all") f.position = selectedPosition;
    if (selectedParty !== "all") f.party = selectedParty;
    if (selectedMunicipality !== "all") f.municipality = selectedMunicipality;
    if (minVotes) f.minVotes = minVotes;
    if (maxVotes) f.maxVotes = maxVotes;
    return f;
  }, [selectedYear, selectedState, selectedElectionType, selectedPosition, selectedParty, selectedMunicipality, minVotes, maxVotes]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(filters);
    return params.toString() ? `?${params.toString()}` : "";
  }, [filters]);

  const statesQuery = useMemo(() => {
    return selectedYear !== "all" ? `?year=${selectedYear}` : "";
  }, [selectedYear]);

  const { data: years, isLoading: yearsLoading } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });

  const { data: states, isLoading: statesLoading } = useQuery<string[]>({
    queryKey: [`/api/analytics/states${statesQuery}`],
  });

  const { data: electionTypes, isLoading: typesLoading } = useQuery<string[]>({
    queryKey: [`/api/analytics/election-types${statesQuery}`],
  });

  const { data: positions } = useQuery<string[]>({
    queryKey: [`/api/analytics/positions${statesQuery}`],
  });

  const { data: partiesList } = useQuery<{ party: string; number: number }[]>({
    queryKey: [`/api/analytics/parties-list${statesQuery}`],
  });

  const { data: savedReports, refetch: refetchReports } = useQuery<{
    id: number;
    name: string;
    description: string | null;
    filters: Record<string, string>;
    columns: string[];
    chartType: string;
    createdAt: string;
  }[]>({
    queryKey: ["/api/reports"],
  });

  // AI Suggestions query
  const { data: aiSuggestions, refetch: refetchSuggestions } = useQuery<{
    id: number;
    suggestionType: string;
    title: string;
    description: string;
    configuration: Record<string, any>;
    relevanceScore: string;
    dismissed: boolean;
    applied: boolean;
    createdAt: string;
  }[]>({
    queryKey: ["/api/ai/suggestions?dismissed=false"],
  });

  // Custom Dashboards query
  const { data: customDashboards, refetch: refetchDashboards } = useQuery<{
    id: number;
    name: string;
    description: string | null;
    layout: Record<string, any>;
    filters: Record<string, any>;
    widgets: Record<string, any>[];
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
  }[]>({
    queryKey: ["/api/dashboards"],
  });

  // Municipalities query
  const { data: municipalities } = useQuery<{
    code: number;
    name: string;
    uf: string;
  }[]>({
    queryKey: ["/api/analytics/municipalities", { uf: selectedState !== "all" ? selectedState : undefined }],
    enabled: selectedState !== "all",
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<{
    totalVotes: number;
    totalVotesNominais: number;
    totalVotesLegenda: number;
    totalVotesValidos: number;
    totalCandidates: number;
    totalParties: number;
    totalMunicipalities: number;
  }>({
    queryKey: [`/api/analytics/summary${queryString}`],
  });

  const { data: votesByParty, isLoading: partyLoading } = useQuery<{
    party: string;
    partyNumber: number | null;
    votes: number;
    votesNominais: number;
    votesLegenda: number;
    votesTotal: number;
    candidateCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-party${queryString}`],
  });

  const { data: topCandidates, isLoading: candidatesLoading } = useQuery<{
    name: string;
    nickname: string | null;
    party: string | null;
    number: number | null;
    state: string | null;
    position: string | null;
    votes: number;
  }[]>({
    queryKey: [`/api/analytics/top-candidates${queryString}`],
  });

  const { data: votesByState, isLoading: stateVotesLoading } = useQuery<{
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-state${queryString}`],
  });

  const { data: votesByMunicipality, isLoading: municipalityLoading } = useQuery<{
    municipality: string;
    state: string | null;
    votes: number;
    candidateCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-municipality${queryString}`],
  });

  // AI Mutations
  const assistantMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/ai/assistant", { question, filters });
      return res.json();
    },
    onSuccess: (data) => {
      setAiAnswer({ question: data.question, answer: data.answer });
      toast({ title: "Resposta gerada", description: "O assistente respondeu sua pergunta." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao processar pergunta.", variant: "destructive" });
    },
  });

  const predictionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/predict-historical", { filters });
      return res.json();
    },
    onSuccess: (data) => {
      setHistoricalPrediction(data);
      toast({ title: "Previsão gerada", description: "Análise de tendências concluída." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao gerar previsão.", variant: "destructive" });
    },
  });

  const anomalyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/anomalies", { filters });
      return res.json();
    },
    onSuccess: (data) => {
      setAnomalyReport(data);
      toast({ title: "Análise concluída", description: "Relatório de anomalias gerado." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha na detecção de anomalias.", variant: "destructive" });
    },
  });

  const handleAskQuestion = () => {
    if (aiQuestion.trim().length >= 5) {
      assistantMutation.mutate(aiQuestion);
    }
  };

  // Comparison mutation
  const compareMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/analytics/compare", {
        years: compareYears,
        states: compareStates,
        groupBy: compareGroupBy,
      });
      return res.json();
    },
  });

  // Save report mutation
  const saveReportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reports", {
        name: reportName,
        description: reportDescription,
        filters,
        columns: ["name", "party", "votes", "position"],
        chartType: "bar",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Relatório salvo", description: "Relatório salvo com sucesso." });
      setShowSaveDialog(false);
      setReportName("");
      setReportDescription("");
      refetchReports();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar relatório.", variant: "destructive" });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/reports/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Relatório excluído", description: "Relatório excluído com sucesso." });
      refetchReports();
    },
  });

  // AI Suggestions mutations
  const generateSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/generate-suggestions", { filters });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sugestões geradas", description: "Novas sugestões de IA criadas com base nos dados." });
      refetchSuggestions();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao gerar sugestões.", variant: "destructive" });
    },
  });

  const dismissSuggestionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/ai/suggestions/${id}/dismiss`);
    },
    onSuccess: () => {
      toast({ title: "Sugestão descartada" });
      refetchSuggestions();
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/ai/suggestions/${id}/apply`);
    },
    onSuccess: () => {
      toast({ title: "Sugestão aplicada", description: "A visualização foi marcada como aplicada." });
      refetchSuggestions();
    },
  });

  // Custom Dashboard mutations
  const createDashboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/dashboards", {
        name: dashboardName,
        description: dashboardDescription,
        layout: { columns: 2 },
        filters,
        widgets: [],
        isPublic: dashboardIsPublic,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Dashboard criado", description: "Novo dashboard salvo com sucesso." });
      setShowDashboardDialog(false);
      setDashboardName("");
      setDashboardDescription("");
      setDashboardIsPublic(false);
      refetchDashboards();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar dashboard.", variant: "destructive" });
    },
  });

  const deleteDashboardMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/dashboards/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Dashboard excluído" });
      refetchDashboards();
    },
  });

  const loadDashboard = (dashboard: { filters: Record<string, any> }) => {
    if (dashboard.filters.year) setSelectedYear(String(dashboard.filters.year));
    if (dashboard.filters.uf) setSelectedState(dashboard.filters.uf);
    if (dashboard.filters.electionType) setSelectedElectionType(dashboard.filters.electionType);
    if (dashboard.filters.position) setSelectedPosition(dashboard.filters.position);
    if (dashboard.filters.party) setSelectedParty(dashboard.filters.party);
    if (dashboard.filters.municipality) setSelectedMunicipality(dashboard.filters.municipality);
    if (dashboard.filters.minVotes) setMinVotes(String(dashboard.filters.minVotes));
    if (dashboard.filters.maxVotes) setMaxVotes(String(dashboard.filters.maxVotes));
    toast({ title: "Dashboard carregado", description: "Filtros aplicados com sucesso." });
  };

  const loadReport = (report: { filters: Record<string, string> }) => {
    if (report.filters.year) setSelectedYear(report.filters.year);
    if (report.filters.uf) setSelectedState(report.filters.uf);
    if (report.filters.electionType) setSelectedElectionType(report.filters.electionType);
    if (report.filters.position) setSelectedPosition(report.filters.position);
    if (report.filters.party) setSelectedParty(report.filters.party);
    if (report.filters.minVotes) setMinVotes(report.filters.minVotes);
    if (report.filters.maxVotes) setMaxVotes(report.filters.maxVotes);
    toast({ title: "Relatório carregado", description: "Filtros aplicados com sucesso." });
  };

  const handleExportCSV = async (reportType: string) => {
    setExportLoading(reportType);
    try {
      const params = new URLSearchParams({ ...filters, reportType });
      const response = await fetch(`/api/analytics/export/csv?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to export");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_${reportType}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({ title: "Exportação concluída", description: "Arquivo CSV baixado com sucesso." });
    } catch (error) {
      toast({ title: "Erro na exportação", description: "Falha ao exportar dados.", variant: "destructive" });
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportPDF = async (reportType: string, title: string, data: any[]) => {
    setExportLoading(`pdf-${reportType}`);
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.setTextColor(0, 51, 102);
      doc.text("SimulaVoto - Relatório de Análise", 14, 22);
      
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(title, 14, 32);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const filterText = [];
      if (selectedYear !== "all") filterText.push(`Ano: ${selectedYear}`);
      if (selectedState !== "all") filterText.push(`Estado: ${selectedState}`);
      if (selectedElectionType !== "all") filterText.push(`Tipo: ${selectedElectionType}`);
      doc.text(filterText.length > 0 ? filterText.join(" | ") : "Todos os dados", 14, 40);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 46);

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const rows = data.map((row) => headers.map((h) => String(row[h] ?? "")));
        
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 55,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [0, 51, 102] },
        });
      }

      doc.save(`relatorio_${reportType}_${Date.now()}.pdf`);
      toast({ title: "PDF gerado", description: "Relatório PDF baixado com sucesso." });
    } catch (error) {
      toast({ title: "Erro ao gerar PDF", description: "Falha ao criar relatório.", variant: "destructive" });
    } finally {
      setExportLoading(null);
    }
  };

  const hasData = summary && summary.totalVotes > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
            Análise de Dados
          </h1>
          <p className="text-muted-foreground">
            Explore dados eleitorais importados do TSE com filtros e visualizações
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1 w-fit">
          <BarChart3 className="h-3 w-3" />
          Relatórios Personalizados
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
            <div className="flex items-center gap-2">
              {savedReports && savedReports.length > 0 && (
                <Select value={selectedReport?.toString() ?? ""} onValueChange={(v) => {
                  const report = savedReports.find(r => r.id === parseInt(v));
                  if (report) {
                    setSelectedReport(parseInt(v));
                    loadReport(report);
                  }
                }}>
                  <SelectTrigger className="w-48" data-testid="select-saved-report">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Carregar relatório" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedReports.map((report) => (
                      <SelectItem key={report.id} value={String(report.id)}>
                        {report.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowSaveDialog(true)} data-testid="button-save-report">
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ano da Eleição</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger data-testid="select-year">
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os anos</SelectItem>
                  {(years ?? []).map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cargo</label>
              <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                <SelectTrigger data-testid="select-position">
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cargos</SelectItem>
                  {(positions ?? []).map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado (UF)</label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger data-testid="select-state">
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {(states ?? []).map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Eleição</label>
              <Select value={selectedElectionType} onValueChange={setSelectedElectionType}>
                <SelectTrigger data-testid="select-election-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {(electionTypes ?? []).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full" data-testid="button-advanced-filters">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filtros Avançados
                {showAdvancedFilters ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Partido</label>
                  <Select value={selectedParty} onValueChange={setSelectedParty}>
                    <SelectTrigger data-testid="select-party">
                      <SelectValue placeholder="Selecione o partido" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os partidos</SelectItem>
                      {(partiesList ?? []).map((p) => (
                        <SelectItem key={p.party} value={p.party}>
                          {p.party} ({p.number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Município</label>
                  <Select 
                    value={selectedMunicipality} 
                    onValueChange={setSelectedMunicipality}
                    disabled={selectedState === "all"}
                  >
                    <SelectTrigger data-testid="select-municipality">
                      <SelectValue placeholder={selectedState === "all" ? "Selecione um estado primeiro" : "Selecione o município"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os municípios</SelectItem>
                      {(municipalities ?? []).map((m) => (
                        <SelectItem key={m.code} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Votos Mínimos</label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={minVotes}
                    onChange={(e) => setMinVotes(e.target.value)}
                    data-testid="input-min-votes"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Votos Máximos</label>
                  <Input
                    type="number"
                    placeholder="Sem limite"
                    value={maxVotes}
                    onChange={(e) => setMaxVotes(e.target.value)}
                    data-testid="input-max-votes"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="compare-mode"
                  checked={compareMode}
                  onCheckedChange={setCompareMode}
                  data-testid="switch-compare-mode"
                />
                <Label htmlFor="compare-mode" className="flex items-center gap-1">
                  <GitCompare className="h-4 w-4" />
                  Modo Comparação
                </Label>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedYear("all");
                setSelectedState("all");
                setSelectedElectionType("all");
                setSelectedPosition("all");
                setSelectedParty("all");
                setSelectedMunicipality("all");
                setMinVotes("");
                setMaxVotes("");
                setSelectedReport(null);
              }}
              data-testid="button-clear-filters"
            >
              Limpar Filtros
            </Button>
          </div>

          {compareMode && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <p className="text-sm font-medium">Selecione anos ou estados para comparar:</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Anos para comparar</label>
                  <div className="flex flex-wrap gap-2">
                    {(years ?? []).map((year) => (
                      <div key={year} className="flex items-center gap-1">
                        <Checkbox
                          id={`year-${year}`}
                          checked={compareYears.includes(year)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCompareYears([...compareYears, year]);
                            } else {
                              setCompareYears(compareYears.filter(y => y !== year));
                            }
                          }}
                          data-testid={`checkbox-year-${year}`}
                        />
                        <label htmlFor={`year-${year}`} className="text-sm">{year}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Estados para comparar</label>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                    {(states ?? []).slice(0, 10).map((state) => (
                      <div key={state} className="flex items-center gap-1">
                        <Checkbox
                          id={`state-${state}`}
                          checked={compareStates.includes(state)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCompareStates([...compareStates, state]);
                            } else {
                              setCompareStates(compareStates.filter(s => s !== state));
                            }
                          }}
                          data-testid={`checkbox-state-${state}`}
                        />
                        <label htmlFor={`state-${state}`} className="text-sm">{state}</label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Agrupar por</label>
                  <Select value={compareGroupBy} onValueChange={(v) => setCompareGroupBy(v as "party" | "state" | "position")}>
                    <SelectTrigger className="w-40" data-testid="select-compare-group-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="party">Partido</SelectItem>
                      <SelectItem value="state">Estado</SelectItem>
                      <SelectItem value="position">Cargo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => compareMutation.mutate()}
                  disabled={compareMutation.isPending || (compareYears.length === 0 && compareStates.length === 0)}
                  data-testid="button-compare"
                >
                  {compareMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitCompare className="h-4 w-4 mr-2" />}
                  Comparar
                </Button>
              </div>
              {compareMutation.data && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Resultado da Comparação:</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compareMutation.data.flatMap((d: any) => d.data.slice(0, 5).map((item: any) => ({ ...item, group: d.label })))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="key" />
                        <YAxis tickFormatter={formatNumber} />
                        <Tooltip
                          formatter={(value: number) => [formatNumber(value), "Votos"]}
                          labelFormatter={(label) => `${label}`}
                        />
                        <Legend />
                        <Bar dataKey="votes" fill="#003366" name="Votos" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Relatório</DialogTitle>
            <DialogDescription>
              Salve os filtros atuais como um relatório para acesso rápido
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-name">Nome do Relatório</Label>
              <Input
                id="report-name"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Ex: Vereadores SP 2024"
                data-testid="input-report-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-description">Descrição (opcional)</Label>
              <Textarea
                id="report-description"
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                placeholder="Descreva o relatório..."
                data-testid="input-report-description"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Filtros que serão salvos:</p>
              <ul className="list-disc list-inside mt-1">
                {Object.entries(filters).map(([key, value]) => (
                  <li key={key}>{key}: {value}</li>
                ))}
                {Object.keys(filters).length === 0 && <li>Nenhum filtro aplicado</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveReportMutation.mutate()}
              disabled={saveReportMutation.isPending || !reportName.trim()}
              data-testid="button-confirm-save-report"
            >
              {saveReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {savedReports && savedReports.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="h-4 w-4" />
              Relatórios Salvos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {savedReports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                  onClick={() => loadReport(report)}
                  data-testid={`card-report-${report.id}`}
                >
                  <div>
                    <p className="font-medium text-sm">{report.name}</p>
                    {report.description && (
                      <p className="text-xs text-muted-foreground">{report.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteReportMutation.mutate(report.id);
                    }}
                    data-testid={`button-delete-report-${report.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Votos V&aacute;lidos</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <>
                    <p className="text-2xl font-bold" data-testid="text-total-votes">
                      {formatNumber(summary?.totalVotesValidos ?? summary?.totalVotes ?? 0)}
                    </p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground" data-testid="text-votes-nominais">
                        Nominais: {formatNumber(summary?.totalVotesNominais ?? 0)}
                      </span>
                      <span className="text-xs text-muted-foreground" data-testid="text-votes-legenda">
                        Legenda: {formatNumber(summary?.totalVotesLegenda ?? 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="p-3 rounded-full bg-primary/10">
                <Vote className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Candidatos</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-candidates">
                    {formatNumber(summary?.totalCandidates ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-green-500/10">
                <Users className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Partidos</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-parties">
                    {formatNumber(summary?.totalParties ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-orange-500/10">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Municípios</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-municipalities">
                    {formatNumber(summary?.totalMunicipalities ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-purple-500/10">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!hasData && !summaryLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              Nenhum dado disponível
            </h3>
            <p className="text-sm text-muted-foreground">
              Importe dados do TSE na seção "Importação TSE" para visualizar análises.
            </p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <Tabs defaultValue="parties" className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="parties" data-testid="tab-parties">
              <Building2 className="h-4 w-4 mr-2" />
              Partidos
            </TabsTrigger>
            <TabsTrigger value="candidates" data-testid="tab-candidates">
              <Users className="h-4 w-4 mr-2" />
              Candidatos
            </TabsTrigger>
            <TabsTrigger value="states" data-testid="tab-states">
              <MapPin className="h-4 w-4 mr-2" />
              Estados
            </TabsTrigger>
            <TabsTrigger value="municipalities" data-testid="tab-municipalities">
              <TrendingUp className="h-4 w-4 mr-2" />
              Municípios
            </TabsTrigger>
            <TabsTrigger value="ai" data-testid="tab-ai">
              <Brain className="h-4 w-4 mr-2" />
              IA
            </TabsTrigger>
            <TabsTrigger value="suggestions" data-testid="tab-suggestions">
              <Lightbulb className="h-4 w-4 mr-2" />
              Sugestões
            </TabsTrigger>
            <TabsTrigger value="dashboards" data-testid="tab-dashboards">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Dashboards
            </TabsTrigger>
          </TabsList>

          <TabsContent value="parties" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("parties")}
                disabled={exportLoading === "parties"}
                data-testid="button-export-parties-csv"
              >
                {exportLoading === "parties" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("parties", "Votos por Partido", votesByParty ?? [])}
                disabled={exportLoading === "pdf-parties"}
                data-testid="button-export-parties-pdf"
              >
                {exportLoading === "pdf-parties" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribuição de Votos por Partido</CardTitle>
                  <CardDescription>Top 10 partidos mais votados</CardDescription>
                </CardHeader>
                <CardContent>
                  {partyLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={(votesByParty ?? []).slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={formatNumber} />
                        <YAxis type="category" dataKey="party" width={60} />
                        <Tooltip content={<CustomTooltip type="party" />} />
                        <Bar dataKey="votes" fill="#003366" name="Votos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Proporção de Votos</CardTitle>
                  <CardDescription>Participação percentual dos partidos</CardDescription>
                </CardHeader>
                <CardContent>
                  {partyLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={(votesByParty ?? []).slice(0, 8)}
                          dataKey="votes"
                          nameKey="party"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ party, percent }) => `${party} (${(percent * 100).toFixed(1)}%)`}
                        >
                          {(votesByParty ?? []).slice(0, 8).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip type="party" />} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="candidates" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("candidates")}
                disabled={exportLoading === "candidates"}
                data-testid="button-export-candidates-csv"
              >
                {exportLoading === "candidates" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("candidates", "Candidatos Mais Votados", topCandidates ?? [])}
                disabled={exportLoading === "pdf-candidates"}
                data-testid="button-export-candidates-pdf"
              >
                {exportLoading === "pdf-candidates" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Candidatos Mais Votados</CardTitle>
                <CardDescription>Top 20 candidatos por número de votos</CardDescription>
              </CardHeader>
              <CardContent>
                {candidatesLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(topCandidates ?? []).slice(0, 15)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nickname" angle={-45} textAnchor="end" height={80} interval={0} fontSize={10} />
                      <YAxis tickFormatter={formatNumber} />
                      <Tooltip content={<CustomTooltip type="candidate" />} />
                      <Bar dataKey="votes" fill="#FFD700" name="Votos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="states" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("states")}
                disabled={exportLoading === "states"}
                data-testid="button-export-states-csv"
              >
                {exportLoading === "states" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("states", "Votos por Estado", votesByState ?? [])}
                disabled={exportLoading === "pdf-states"}
                data-testid="button-export-states-pdf"
              >
                {exportLoading === "pdf-states" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Votos por Estado</CardTitle>
                  <CardDescription>Distribuição geográfica de votos</CardDescription>
                </CardHeader>
                <CardContent>
                  {stateVotesLoading ? (
                    <div className="h-[350px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={votesByState ?? []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="state" />
                        <YAxis tickFormatter={formatNumber} />
                        <Tooltip content={<CustomTooltip type="state" />} />
                        <Area type="monotone" dataKey="votes" stroke="#003366" fill="#003366" fillOpacity={0.3} name="Votos" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Candidatos por Estado</CardTitle>
                  <CardDescription>Número de candidatos em cada UF</CardDescription>
                </CardHeader>
                <CardContent>
                  {stateVotesLoading ? (
                    <div className="h-[350px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={votesByState ?? []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="state" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="candidateCount" fill="#2ecc71" name="Candidatos" />
                        <Bar dataKey="partyCount" fill="#9b59b6" name="Partidos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="municipalities" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("municipalities")}
                disabled={exportLoading === "municipalities"}
                data-testid="button-export-municipalities-csv"
              >
                {exportLoading === "municipalities" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("municipalities", "Votos por Município", votesByMunicipality ?? [])}
                disabled={exportLoading === "pdf-municipalities"}
                data-testid="button-export-municipalities-pdf"
              >
                {exportLoading === "pdf-municipalities" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top 20 Municípios</CardTitle>
                <CardDescription>Municípios com maior número de votos</CardDescription>
              </CardHeader>
              <CardContent>
                {municipalityLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votesByMunicipality ?? []).slice(0, 20)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={formatNumber} />
                      <YAxis type="category" dataKey="municipality" width={120} fontSize={10} />
                      <Tooltip
                        formatter={(value: number) => formatNumber(value)}
                        labelFormatter={(label) => {
                          const muni = (votesByMunicipality ?? []).find((m) => m.municipality === label);
                          return muni ? `${muni.municipality} - ${muni.state}` : label;
                        }}
                      />
                      <Bar dataKey="votes" fill="#e74c3c" name="Votos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Assistente de IA
                  </CardTitle>
                  <CardDescription>
                    Faça perguntas sobre os dados eleitorais em linguagem natural
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Ex: Quais partidos tiveram mais votos? Quem foi o candidato mais votado?"
                      value={aiQuestion}
                      onChange={(e) => setAiQuestion(e.target.value)}
                      className="flex-1"
                      data-testid="input-ai-question"
                    />
                    <Button
                      onClick={handleAskQuestion}
                      disabled={assistantMutation.isPending || aiQuestion.trim().length < 5}
                      data-testid="button-ask-ai"
                    >
                      {assistantMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {aiAnswer && (
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2" data-testid="container-ai-answer">
                      <p className="text-sm font-medium text-muted-foreground" data-testid="text-ai-question">
                        Pergunta: {aiAnswer.question}
                      </p>
                      <p className="text-sm whitespace-pre-wrap" data-testid="text-ai-answer">{aiAnswer.answer}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-yellow-500" />
                    Previsão Histórica
                  </CardTitle>
                  <CardDescription>
                    Analise tendências baseadas em dados históricos
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={() => predictionMutation.mutate()}
                    disabled={predictionMutation.isPending}
                    className="w-full"
                    data-testid="button-generate-prediction"
                  >
                    {predictionMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Gerar Previsão
                      </>
                    )}
                  </Button>
                  {historicalPrediction && (
                    <div className="space-y-4" data-testid="container-prediction">
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm whitespace-pre-wrap" data-testid="text-prediction-analysis">{historicalPrediction.analysis}</p>
                      </div>
                      {historicalPrediction.trends && (
                        <div className="space-y-2" data-testid="container-prediction-trends">
                          <p className="text-sm font-medium">Tendências:</p>
                          {historicalPrediction.trends.slice(0, 5).map((trend: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-sm" data-testid={`item-trend-${i}`}>
                              {trend.trend === "crescimento" && <TrendingUp className="h-4 w-4 text-green-500" />}
                              {trend.trend === "declínio" && <TrendingDown className="h-4 w-4 text-red-500" />}
                              {trend.trend === "estável" && <Minus className="h-4 w-4 text-gray-500" />}
                              <span className="font-medium">{trend.party}</span>
                              <span className="text-muted-foreground">{trend.observation}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {historicalPrediction.insights && (
                        <div className="space-y-1" data-testid="container-prediction-insights">
                          <p className="text-sm font-medium">Insights:</p>
                          {historicalPrediction.insights.map((insight: string, i: number) => (
                            <p key={i} className="text-sm text-muted-foreground" data-testid={`text-insight-${i}`}>• {insight}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    Detecção de Anomalias
                  </CardTitle>
                  <CardDescription>
                    Identifique padrões incomuns nos dados de votação
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button
                    onClick={() => anomalyMutation.mutate()}
                    disabled={anomalyMutation.isPending}
                    className="w-full"
                    variant="outline"
                    data-testid="button-detect-anomalies"
                  >
                    {anomalyMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analisando...
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Detectar Anomalias
                      </>
                    )}
                  </Button>
                  {anomalyReport && (
                    <div className="space-y-4" data-testid="container-anomaly">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Risco Geral:</span>
                        <Badge
                          variant={
                            anomalyReport.overallRisk === "alto" ? "destructive" :
                            anomalyReport.overallRisk === "médio" ? "secondary" : "outline"
                          }
                          data-testid="badge-anomaly-risk"
                        >
                          {anomalyReport.overallRisk?.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/50">
                        <p className="text-sm whitespace-pre-wrap" data-testid="text-anomaly-summary">{anomalyReport.summary}</p>
                      </div>
                      {anomalyReport.anomalies && anomalyReport.anomalies.length > 0 && (
                        <div className="space-y-2" data-testid="container-anomaly-list">
                          <p className="text-sm font-medium">Anomalias Detectadas:</p>
                          {anomalyReport.anomalies.slice(0, 5).map((anomaly: any, i: number) => (
                            <div key={i} className="p-2 rounded border text-sm" data-testid={`item-anomaly-${i}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">{anomaly.type}</Badge>
                                <Badge
                                  variant={anomaly.severity === "alta" ? "destructive" : "secondary"}
                                  className="text-xs"
                                >
                                  {anomaly.severity}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground">{anomaly.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {anomalyReport.observations && (
                        <div className="space-y-1" data-testid="container-anomaly-observations">
                          <p className="text-sm font-medium">Observações:</p>
                          {anomalyReport.observations.map((obs: string, i: number) => (
                            <p key={i} className="text-sm text-muted-foreground" data-testid={`text-observation-${i}`}>• {obs}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* AI Suggestions Tab */}
          <TabsContent value="suggestions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-amber-500" />
                      Sugestões Inteligentes
                    </CardTitle>
                    <CardDescription>
                      Recomendações de gráficos e análises baseadas em IA
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => generateSuggestionsMutation.mutate()}
                    disabled={generateSuggestionsMutation.isPending}
                    data-testid="button-generate-suggestions"
                  >
                    {generateSuggestionsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Gerar Sugestões
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(!aiSuggestions || aiSuggestions.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Lightbulb className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhuma sugestão disponível.</p>
                    <p className="text-sm">Clique em "Gerar Sugestões" para receber recomendações baseadas nos dados atuais.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {aiSuggestions.map((suggestion) => (
                      <Card key={suggestion.id} className="relative" data-testid={`card-suggestion-${suggestion.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <Badge variant="outline" className="mb-2">
                                {suggestion.suggestionType === "chart" ? "Gráfico" :
                                 suggestion.suggestionType === "report" ? "Relatório" : "Insight"}
                              </Badge>
                              <CardTitle className="text-base">{suggestion.title}</CardTitle>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-xs">
                                {suggestion.relevanceScore}%
                              </Badge>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => dismissSuggestionMutation.mutate(suggestion.id)}
                                data-testid={`button-dismiss-${suggestion.id}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <p className="text-sm text-muted-foreground mb-3">{suggestion.description}</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => applySuggestionMutation.mutate(suggestion.id)}
                              disabled={suggestion.applied}
                              data-testid={`button-apply-${suggestion.id}`}
                            >
                              {suggestion.applied ? (
                                <>Aplicado</>
                              ) : (
                                <>
                                  <Eye className="h-3 w-3 mr-1" />
                                  Aplicar
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Custom Dashboards Tab */}
          <TabsContent value="dashboards" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <LayoutDashboard className="h-5 w-5 text-blue-500" />
                      Dashboards Personalizados
                    </CardTitle>
                    <CardDescription>
                      Crie e gerencie dashboards com filtros e visualizações personalizadas
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowDashboardDialog(true)} data-testid="button-create-dashboard">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Dashboard
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {(!customDashboards || customDashboards.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <LayoutDashboard className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhum dashboard criado ainda.</p>
                    <p className="text-sm">Crie um dashboard personalizado para salvar suas visualizações favoritas.</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {customDashboards.map((dashboard) => (
                      <Card key={dashboard.id} className="relative" data-testid={`card-dashboard-${dashboard.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <CardTitle className="text-base">{dashboard.name}</CardTitle>
                                {dashboard.isPublic && (
                                  <Badge variant="outline" className="text-xs">
                                    <Globe className="h-3 w-3 mr-1" />
                                    Público
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteDashboardMutation.mutate(dashboard.id)}
                              data-testid={`button-delete-dashboard-${dashboard.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                          {dashboard.description && (
                            <p className="text-sm text-muted-foreground mb-3">{dashboard.description}</p>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Atualizado em: {new Date(dashboard.updatedAt).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="mt-3">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => loadDashboard(dashboard)}
                              data-testid={`button-view-dashboard-${dashboard.id}`}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Aplicar Filtros
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Create Dashboard Dialog */}
      <Dialog open={showDashboardDialog} onOpenChange={setShowDashboardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Dashboard</DialogTitle>
            <DialogDescription>
              Salve suas configurações de filtros e visualizações em um dashboard personalizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dashboardName">Nome do Dashboard</Label>
              <Input
                id="dashboardName"
                placeholder="Ex: Análise Eleição 2022"
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                data-testid="input-dashboard-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dashboardDesc">Descrição (opcional)</Label>
              <Textarea
                id="dashboardDesc"
                placeholder="Descreva o propósito deste dashboard..."
                value={dashboardDescription}
                onChange={(e) => setDashboardDescription(e.target.value)}
                data-testid="input-dashboard-description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="dashboardPublic"
                checked={dashboardIsPublic}
                onCheckedChange={setDashboardIsPublic}
                data-testid="switch-dashboard-public"
              />
              <Label htmlFor="dashboardPublic" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Dashboard público
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDashboardDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createDashboardMutation.mutate()}
              disabled={!dashboardName || createDashboardMutation.isPending}
              data-testid="button-save-dashboard"
            >
              {createDashboardMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
