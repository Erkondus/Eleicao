import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Database,
  Download,
  RefreshCw,
  MapPin,
  Users,
  Building2,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  Calendar,
  Search,
  StopCircle,
  RotateCcw,
  Ban,
  FileText,
  AlertTriangle,
  Timer,
  Gauge,
} from "lucide-react";

interface IBGEStats {
  totalMunicipios: number;
  totalPopulacaoRecords: number;
  totalIndicadoresRecords: number;
  lastUpdate: string | null;
  populacaoByYear: { ano: number; count: number }[];
}

interface ImportProgress {
  phase: string;
  phaseDescription: string;
  currentBatch: number;
  totalBatches: number;
  recordsPerSecond: number;
  estimatedTimeRemaining: string;
  lastProcessedRecord: string;
  errors: ImportError[];
}

interface ImportError {
  timestamp: string;
  record: string;
  errorType: string;
  errorMessage: string;
  errorCode?: string;
  details?: string;
}

interface IBGEImportJob {
  id: number;
  type: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errorMessage: string | null;
  errorDetails: {
    progress?: ImportProgress;
    allErrors?: ImportError[];
    summary?: {
      duration?: string;
      totalProcessed?: number;
      successRate?: string;
    };
  } | null;
  startedAt: string | null;
  completedAt: string | null;
  source: string;
  createdAt: string;
}

interface ErrorReport {
  job: IBGEImportJob;
  summary: {
    totalErrors: number;
    errorsByType: Record<string, number>;
    affectedRecords: string[];
  };
  errors: ImportError[];
}

export default function IBGEDataPage() {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState<string>("2024");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [errorReportJobId, setErrorReportJobId] = useState<number | null>(null);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<IBGEStats>({
    queryKey: ["/api/ibge/stats"],
    refetchInterval: 10000,
  });

  const { data: importJobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<IBGEImportJob[]>({
    queryKey: ["/api/ibge/import-jobs"],
    refetchInterval: 3000,
  });

  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: demographicData, isLoading: demographicLoading } = useQuery<{
    municipios: any[];
    aggregatedData: {
      totalPopulacao: number;
      avgIdh: number | null;
      avgRenda: number | null;
      avgTaxaAlfabetizacao: number | null;
    };
  }>({
    queryKey: ["/api/ibge/demographic-data", { search: debouncedSearch }],
  });

  const { data: errorReport, isLoading: errorReportLoading } = useQuery<ErrorReport>({
    queryKey: ["/api/ibge/import", errorReportJobId, "report"],
    enabled: errorReportJobId !== null,
  });

  const importMunicipiosMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ibge/import/municipios", {});
    },
    onSuccess: () => {
      toast({
        title: "Importação iniciada",
        description: "Importando dados de municípios do IBGE...",
      });
      refetchJobs();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao iniciar importação",
        variant: "destructive",
      });
    },
  });

  const importPopulacaoMutation = useMutation({
    mutationFn: async (ano: number) => {
      return apiRequest("POST", "/api/ibge/import/populacao", { ano });
    },
    onSuccess: () => {
      toast({
        title: "Importação iniciada",
        description: `Importando dados de população (${selectedYear})...`,
      });
      refetchJobs();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao iniciar importação",
        variant: "destructive",
      });
    },
  });

  const importIndicadoresMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/ibge/import/indicadores", {});
    },
    onSuccess: () => {
      toast({
        title: "Importação iniciada",
        description: "Importando indicadores socioeconômicos...",
      });
      refetchJobs();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao iniciar importação",
        variant: "destructive",
      });
    },
  });

  const importAllMutation = useMutation({
    mutationFn: async (ano: number) => {
      return apiRequest("POST", "/api/ibge/import/all", { ano });
    },
    onSuccess: () => {
      toast({
        title: "Importação completa iniciada",
        description: "Importando todos os dados demográficos do IBGE...",
      });
      refetchJobs();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao iniciar importação",
        variant: "destructive",
      });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      return apiRequest("POST", `/api/ibge/import/${jobId}/cancel`, {});
    },
    onSuccess: () => {
      toast({
        title: "Importação cancelada",
        description: "O job de importação foi cancelado com sucesso.",
      });
      refetchJobs();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao cancelar importação",
        variant: "destructive",
      });
    },
  });

  const restartJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      return apiRequest("POST", `/api/ibge/import/${jobId}/restart`, {});
    },
    onSuccess: () => {
      toast({
        title: "Importação reiniciada",
        description: "O job de importação foi reiniciado com sucesso.",
      });
      refetchJobs();
      refetchStats();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao reiniciar importação",
        variant: "destructive",
      });
    },
  });

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("pt-BR").format(num);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("pt-BR");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Concluído</Badge>;
      case "running":
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Em andamento</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Falhou</Badge>;
      case "pending":
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="border-orange-500 text-orange-500"><Ban className="h-3 w-3 mr-1" /> Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getJobTypeName = (type: string) => {
    switch (type) {
      case "municipios": return "Municípios";
      case "populacao": return "População";
      case "indicadores": return "Indicadores";
      case "all": return "Completa";
      default: return type;
    }
  };

  const hasActiveImport = importJobs?.some(j => j.status === "running" || j.status === "pending");

  const renderProgressDetails = (job: IBGEImportJob) => {
    const progress = job.errorDetails?.progress;
    const percentage = job.totalRecords > 0 ? (job.processedRecords / job.totalRecords) * 100 : 0;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Progress value={percentage} className="flex-1" />
          <span className="text-xs font-medium min-w-[50px] text-right">
            {percentage.toFixed(1)}%
          </span>
        </div>
        
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {formatNumber(job.processedRecords)} / {formatNumber(job.totalRecords)}
          </span>
          
          {job.failedRecords > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {job.failedRecords} erros
            </span>
          )}
          
          {progress?.recordsPerSecond && job.status === "running" && (
            <span className="flex items-center gap-1">
              <Gauge className="h-3 w-3" />
              {progress.recordsPerSecond}/s
            </span>
          )}
          
          {progress?.estimatedTimeRemaining && job.status === "running" && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              ~{progress.estimatedTimeRemaining}
            </span>
          )}
        </div>

        {progress?.phaseDescription && job.status === "running" && (
          <p className="text-xs text-muted-foreground italic truncate">
            {progress.phaseDescription}
          </p>
        )}

        {job.errorDetails?.summary?.duration && job.status === "completed" && (
          <p className="text-xs text-muted-foreground">
            Concluído em {job.errorDetails.summary.duration}
            {job.errorDetails.summary.successRate && ` • ${job.errorDetails.summary.successRate} sucesso`}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-ibge-data">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8 text-primary" />
            Dados Demográficos IBGE
          </h1>
          <p className="text-muted-foreground mt-1">
            Importe e gerencie dados demográficos brasileiros para modelos de previsão eleitoral
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]" data-testid="select-year">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
              <SelectItem value="2022">2022 (Censo)</SelectItem>
              <SelectItem value="2021">2021</SelectItem>
              <SelectItem value="2020">2020</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            onClick={() => importAllMutation.mutate(parseInt(selectedYear))}
            disabled={hasActiveImport || importAllMutation.isPending}
            data-testid="button-import-all"
          >
            {importAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Atualizar Dados
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-municipios">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Municípios</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(stats?.totalMunicipios || 0)}</div>
                <p className="text-xs text-muted-foreground">de 5.570 municípios brasileiros</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-populacao">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registros de População</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(stats?.totalPopulacaoRecords || 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {stats?.populacaoByYear?.length || 0} anos disponíveis
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-indicadores">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Indicadores Sociais</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatNumber(stats?.totalIndicadoresRecords || 0)}</div>
                <p className="text-xs text-muted-foreground">IDH, renda, educação</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-stat-ultima-atualizacao">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Última Atualização</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-lg font-bold">
                  {stats?.lastUpdate ? formatDate(stats.lastUpdate) : "Nunca"}
                </div>
                <p className="text-xs text-muted-foreground">via API SIDRA/IBGE</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="imports">Importações</TabsTrigger>
          <TabsTrigger value="data">Dados por Município</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Dados Agregados
                </CardTitle>
                <CardDescription>
                  Resumo dos dados demográficos disponíveis para análise
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">População Total</span>
                    <span className="font-medium">
                      {demographicData?.aggregatedData?.totalPopulacao
                        ? formatNumber(demographicData.aggregatedData.totalPopulacao)
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">IDH Médio</span>
                    <span className="font-medium">
                      {demographicData?.aggregatedData?.avgIdh?.toFixed(3) || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Renda Média Domiciliar</span>
                    <span className="font-medium">
                      {demographicData?.aggregatedData?.avgRenda
                        ? `R$ ${formatNumber(Math.round(demographicData.aggregatedData.avgRenda))}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Taxa de Alfabetização</span>
                    <span className="font-medium">
                      {demographicData?.aggregatedData?.avgTaxaAlfabetizacao
                        ? `${demographicData.aggregatedData.avgTaxaAlfabetizacao.toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Importar Dados
                </CardTitle>
                <CardDescription>
                  Atualize os dados demográficos diretamente do IBGE
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => importMunicipiosMutation.mutate()}
                    disabled={hasActiveImport || importMunicipiosMutation.isPending}
                    data-testid="button-import-municipios"
                  >
                    {importMunicipiosMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4 mr-2" />
                    )}
                    Municípios
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => importPopulacaoMutation.mutate(parseInt(selectedYear))}
                    disabled={hasActiveImport || importPopulacaoMutation.isPending}
                    data-testid="button-import-populacao"
                  >
                    {importPopulacaoMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Users className="h-4 w-4 mr-2" />
                    )}
                    População ({selectedYear})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => importIndicadoresMutation.mutate()}
                    disabled={hasActiveImport || importIndicadoresMutation.isPending}
                    data-testid="button-import-indicadores"
                  >
                    {importIndicadoresMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <TrendingUp className="h-4 w-4 mr-2" />
                    )}
                    Indicadores
                  </Button>
                </div>

                {stats?.populacaoByYear && stats.populacaoByYear.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Anos com dados disponíveis:</p>
                    <div className="flex flex-wrap gap-1">
                      {stats.populacaoByYear.map((item) => (
                        <Badge key={item.ano} variant="secondary">
                          {item.ano} ({formatNumber(item.count)})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Como os Dados Demográficos São Utilizados</CardTitle>
              <CardDescription>
                Integração com modelos de previsão eleitoral baseados em IA
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Análise de Eleitorado
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Os dados populacionais permitem estimar o tamanho do eleitorado e identificar 
                    tendências demográficas que influenciam o comportamento eleitoral.
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Previsões por Região
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Indicadores socioeconômicos como IDH e renda são correlacionados com 
                    padrões históricos de votação para previsões mais precisas.
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Modelos de IA
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    O GPT-4o utiliza estes dados como contexto para gerar análises mais 
                    fundamentadas e previsões com maior acurácia.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imports">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Histórico de Importações</CardTitle>
                <CardDescription>Acompanhe as importações de dados do IBGE com progresso detalhado</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchJobs()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : importJobs && importJobs.length > 0 ? (
                <div className="space-y-4">
                  {importJobs.map((job) => (
                    <Card key={job.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="font-mono">
                                #{job.id}
                              </Badge>
                              <Badge variant="secondary">
                                {getJobTypeName(job.type)}
                              </Badge>
                              {getStatusBadge(job.status)}
                            </div>
                            
                            {renderProgressDetails(job)}
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>Iniciado: {formatDate(job.startedAt)}</span>
                              {job.completedAt && (
                                <span>Concluído: {formatDate(job.completedAt)}</span>
                              )}
                            </div>

                            {job.errorMessage && (
                              <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                                {job.errorMessage}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            {(job.status === "running" || job.status === "pending") && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelJobMutation.mutate(job.id)}
                                disabled={cancelJobMutation.isPending}
                                data-testid={`button-cancel-job-${job.id}`}
                                className="text-orange-600 hover:text-orange-700 border-orange-300"
                              >
                                {cancelJobMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <StopCircle className="h-4 w-4 mr-1" />
                                )}
                                Cancelar
                              </Button>
                            )}
                            
                            {(job.status === "failed" || job.status === "cancelled") && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => restartJobMutation.mutate(job.id)}
                                disabled={restartJobMutation.isPending || hasActiveImport}
                                data-testid={`button-restart-job-${job.id}`}
                              >
                                {restartJobMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                )}
                                Reiniciar
                              </Button>
                            )}

                            {job.failedRecords > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setErrorReportJobId(job.id)}
                                data-testid={`button-view-errors-${job.id}`}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Ver Erros
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma importação realizada ainda.</p>
                  <p className="text-sm">Clique em "Atualizar Dados" para começar.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card>
            <CardHeader>
              <CardTitle>Dados por Município</CardTitle>
              <CardDescription>Consulte os dados demográficos por município</CardDescription>
              <div className="mt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar município..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-municipio"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {demographicLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Buscando...</span>
                </div>
              ) : demographicData?.municipios && demographicData.municipios.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código IBGE</TableHead>
                      <TableHead>Município</TableHead>
                      <TableHead>UF</TableHead>
                      <TableHead>População</TableHead>
                      <TableHead>Ano</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demographicData.municipios.map((mun) => (
                      <TableRow key={mun.codigoIbge}>
                        <TableCell className="font-mono">{mun.codigoIbge}</TableCell>
                        <TableCell className="font-medium">{mun.nome}</TableCell>
                        <TableCell>{mun.uf}</TableCell>
                        <TableCell>
                          {mun.populacao ? formatNumber(mun.populacao) : "—"}
                        </TableCell>
                        <TableCell>{mun.ano || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum dado de município disponível.</p>
                  <p className="text-sm">Importe os dados do IBGE para visualizar.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={errorReportJobId !== null} onOpenChange={(open) => !open && setErrorReportJobId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Relatório de Erros - Job #{errorReportJobId}
            </DialogTitle>
            <DialogDescription>
              Detalhes dos erros ocorridos durante a importação
            </DialogDescription>
          </DialogHeader>

          {errorReportLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : errorReport ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-destructive">
                      {errorReport.summary.totalErrors}
                    </div>
                    <p className="text-sm text-muted-foreground">Total de Erros</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">
                      {Object.keys(errorReport.summary.errorsByType).length}
                    </div>
                    <p className="text-sm text-muted-foreground">Tipos de Erro</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">
                      {errorReport.summary.affectedRecords.length}
                    </div>
                    <p className="text-sm text-muted-foreground">Registros Afetados</p>
                  </CardContent>
                </Card>
              </div>

              {Object.keys(errorReport.summary.errorsByType).length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Erros por Tipo:</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(errorReport.summary.errorsByType).map(([type, count]) => (
                      <Badge key={type} variant="outline" className="font-mono">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2">Lista de Erros:</h4>
                <ScrollArea className="h-[300px] border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Horário</TableHead>
                        <TableHead>Registro</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Mensagem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {errorReport.errors.map((error, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">
                            {new Date(error.timestamp).toLocaleTimeString("pt-BR")}
                          </TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate">
                            {error.record}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-xs">
                              {error.errorType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                            {error.errorMessage}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Nenhum relatório de erro disponível.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
