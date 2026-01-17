import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Database, Link, Download, ShieldCheck, AlertTriangle, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/queryClient";
import type { TseImportJob, TseImportError } from "@shared/schema";

interface ValidationStatus {
  hasValidation: boolean;
  runId?: number;
  status?: string;
  totalRecordsChecked?: number;
  issuesFound?: number;
  summary?: {
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    sampleIssues: Array<{
      type: string;
      severity: string;
      message: string;
      suggestedFix?: {
        action: string;
        newValue?: string | number;
        confidence: number;
        reasoning: string;
      };
    }>;
  };
  aiAnalysis?: {
    analysis?: string;
    recommendations?: Array<{
      issue: string;
      severity: string;
      suggestedAction: string;
      confidence: number;
    }>;
    overallDataQuality?: {
      score: number;
      assessment: string;
      keyFindings: string[];
      risksIdentified: string[];
    };
  };
  completedAt?: string;
}

interface ValidationIssue {
  id: number;
  type: string;
  severity: string;
  category: string;
  rowReference?: string;
  field?: string;
  currentValue?: string;
  message: string;
  suggestedFix?: {
    action: string;
    newValue?: string | number;
    confidence: number;
    reasoning: string;
  };
  status: string;
}

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "BR"
];

const ELECTION_YEARS = Array.from({ length: 30 }, (_, i) => 2024 - i * 2).filter(y => y >= 1998);

const CARGOS = [
  { code: 1, name: "Presidente" },
  { code: 3, name: "Governador" },
  { code: 5, name: "Senador" },
  { code: 6, name: "Deputado Federal" },
  { code: 7, name: "Deputado Estadual" },
  { code: 8, name: "Deputado Distrital" },
  { code: 11, name: "Prefeito" },
  { code: 13, name: "Vereador" },
];

export default function TseImport() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [electionYear, setElectionYear] = useState<string>("");
  const [uf, setUf] = useState<string>("");
  const [cargoFilter, setCargoFilter] = useState<string>("");
  const [errorsDialogJob, setErrorsDialogJob] = useState<TseImportJob | null>(null);
  const [urlInput, setUrlInput] = useState<string>("");
  const [urlYear, setUrlYear] = useState<string>("");
  const [urlCargo, setUrlCargo] = useState<string>("");
  const [validationDialogJob, setValidationDialogJob] = useState<TseImportJob | null>(null);
  const [validatingJobId, setValidatingJobId] = useState<number | null>(null);

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<TseImportJob[]>({
    queryKey: ["/api/imports/tse"],
    refetchInterval: (query) => {
      const data = query.state.data as TseImportJob[] | undefined;
      const hasActive = data?.some(job => 
        ["pending", "downloading", "extracting", "running", "processing"].includes(job.status)
      );
      return hasActive ? 2000 : 10000;
    },
  });

  const { data: stats } = useQuery<{
    totalRecords: number;
    years: number[];
    ufs: string[];
    cargos: { code: number; name: string }[];
  }>({
    queryKey: ["/api/tse/stats"],
  });

  const { data: jobErrors } = useQuery<TseImportError[]>({
    queryKey: ["/api/imports/tse", errorsDialogJob?.id, "errors"],
    enabled: !!errorsDialogJob,
  });

  const { data: validationStatus, refetch: refetchValidation, isLoading: validationLoading } = useQuery<ValidationStatus>({
    queryKey: ["/api/imports/tse", validationDialogJob?.id, "validation"],
    enabled: !!validationDialogJob,
  });

  const { data: validationIssues, isLoading: issuesLoading } = useQuery<ValidationIssue[]>({
    queryKey: ["/api/validation-runs", validationStatus?.runId, "issues"],
    enabled: !!validationStatus?.runId,
  });

  const runValidationMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setValidatingJobId(jobId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/validation/run`);
      return response.json();
    },
    onSuccess: async (_, jobId) => {
      toast({ 
        title: "Validação concluída", 
        description: "A análise dos dados foi realizada com sucesso." 
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/imports/tse", jobId, "validation"] });
      if (validationDialogJob?.id === jobId) {
        await refetchValidation();
      }
      setValidatingJobId(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro na validação", 
        description: error.message, 
        variant: "destructive" 
      });
      setValidatingJobId(null);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/imports/tse", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        if (response.status === 409) {
          throw new Error(error.message || "Dados já importados");
        }
        throw new Error(error.error || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Importação iniciada", description: "O arquivo está sendo processado em segundo plano." });
      setSelectedFile(null);
      setElectionYear("");
      setUf("");
      setCargoFilter("");
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
    },
    onError: (error: Error) => {
      const isInProgress = error.message.includes("sendo processado");
      const isDuplicate = error.message.includes("já foi importado");
      toast({ 
        title: isInProgress ? "Importação em andamento" : (isDuplicate ? "Dados já importados" : "Erro no upload"), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const urlImportMutation = useMutation({
    mutationFn: async (data: { url: string; electionYear?: string; cargoFilter?: string }) => {
      const response = await fetch("/api/imports/tse/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        if (response.status === 409) {
          throw new Error(error.message || "Dados já importados");
        }
        throw new Error(error.error || "Falha na importação");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Download iniciado", description: "O arquivo está sendo baixado e processado." });
      setUrlInput("");
      setUrlYear("");
      setUrlCargo("");
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
    },
    onError: (error: Error) => {
      const isInProgress = error.message.includes("sendo processada");
      const isDuplicate = error.message.includes("já foram importados");
      toast({ 
        title: isInProgress ? "Importação em andamento" : (isDuplicate ? "Dados já importados" : "Erro na importação"), 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleUrlImport = () => {
    if (!urlInput) {
      toast({ title: "Digite uma URL", variant: "destructive" });
      return;
    }
    urlImportMutation.mutate({ 
      url: urlInput, 
      electionYear: urlYear || undefined,
      cargoFilter: urlCargo && urlCargo !== "all" ? urlCargo : undefined
    });
  };

  const generateTseUrl = (year: string) => {
    return `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`;
  };

  const handleQuickImport = (year: string) => {
    const url = generateTseUrl(year);
    setUrlInput(url);
    setUrlYear(year);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (electionYear) formData.append("electionYear", electionYear);
    if (uf) formData.append("uf", uf);
    if (cargoFilter && cargoFilter !== "all") formData.append("cargoFilter", cargoFilter);

    uploadMutation.mutate(formData);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case "downloading":
        return <Badge variant="default"><Download className="h-3 w-3 mr-1 animate-pulse" />Baixando</Badge>;
      case "extracting":
        return <Badge variant="default"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Extraindo</Badge>;
      case "running":
      case "processing":
        return <Badge variant="default"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processando</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="h-3 w-3 mr-1" />Concluído</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatElapsedTime = (startDate: string | Date | null) => {
    if (!startDate) return "";
    const start = new Date(startDate).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000);
    
    if (elapsed < 60) return `${elapsed}s`;
    if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
    return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
  };

  const getProgressDisplay = (job: TseImportJob) => {
    const downloadedBytes = Number(job.downloadedBytes) || 0;
    
    if (job.status === "downloading") {
      if (job.fileSize > 0) {
        const percent = Math.min(100, (downloadedBytes / job.fileSize) * 100);
        return (
          <div className="w-32 space-y-1">
            <Progress value={percent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{percent.toFixed(0)}%</span>
              <span>{formatFileSize(downloadedBytes)} / {formatFileSize(job.fileSize)}</span>
            </div>
            {job.startedAt && (
              <p className="text-xs text-muted-foreground">{formatElapsedTime(job.startedAt)}</p>
            )}
          </div>
        );
      }
      return (
        <div className="w-32 space-y-1">
          <Progress value={0} className="h-2 animate-pulse" />
          <p className="text-xs text-muted-foreground">Iniciando download...</p>
        </div>
      );
    }

    if (job.status === "extracting") {
      return (
        <div className="w-32 space-y-1">
          <Progress value={100} className="h-2 animate-pulse" />
          <p className="text-xs text-muted-foreground">Extraindo ZIP...</p>
          {job.startedAt && (
            <p className="text-xs text-muted-foreground">{formatElapsedTime(job.startedAt)}</p>
          )}
        </div>
      );
    }

    if (job.status === "running" || job.status === "processing") {
      const processed = job.processedRows || 0;
      return (
        <div className="w-32 space-y-1">
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-sm font-medium">{processed.toLocaleString("pt-BR")}</span>
          </div>
          <p className="text-xs text-muted-foreground">linhas processadas</p>
          {job.startedAt && (
            <p className="text-xs text-muted-foreground">{formatElapsedTime(job.startedAt)}</p>
          )}
        </div>
      );
    }

    if (job.status === "completed") {
      const duration = job.startedAt && job.completedAt 
        ? Math.floor((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
        : null;
      return (
        <div className="space-y-1">
          <span className="text-sm font-medium text-green-600">
            {(job.processedRows || 0).toLocaleString("pt-BR")} linhas
          </span>
          {duration !== null && (
            <p className="text-xs text-muted-foreground">
              em {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
            </p>
          )}
        </div>
      );
    }

    if (job.status === "failed") {
      return <span className="text-sm text-destructive">Erro</span>;
    }

    return <span className="text-sm text-muted-foreground">-</span>;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleString("pt-BR");
  };

  if (!hasPermission("manage_users")) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Acesso restrito a administradores.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Importação de Dados TSE"
        description="Importe dados de candidatos de eleições passadas a partir dos arquivos CSV do TSE"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload de Arquivo CSV
            </CardTitle>
            <CardDescription>
              Selecione um arquivo CSV do repositório de dados abertos do TSE. 
              O arquivo deve estar no formato padrão com codificação Latin-1.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">Arquivo CSV</Label>
              <Input
                id="file"
                type="file"
                accept=".csv"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                data-testid="input-csv-file"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ano da Eleição (opcional)</Label>
                <Select value={electionYear} onValueChange={setElectionYear}>
                  <SelectTrigger data-testid="select-election-year">
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {ELECTION_YEARS.map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>UF (opcional)</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger data-testid="select-uf">
                    <SelectValue placeholder="Selecione a UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UFS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cargo (opcional)</Label>
              <Select value={cargoFilter} onValueChange={setCargoFilter}>
                <SelectTrigger data-testid="select-cargo">
                  <SelectValue placeholder="Todos os cargos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cargos</SelectItem>
                  {CARGOS.map((cargo) => (
                    <SelectItem key={cargo.code} value={String(cargo.code)}>{cargo.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione para importar apenas dados de um cargo específico
              </p>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              className="w-full"
              data-testid="button-upload"
            >
              {uploadMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" />Iniciar Importação</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Importar via URL do TSE
            </CardTitle>
            <CardDescription>
              Baixe e importe arquivos ZIP diretamente do repositório do TSE
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Importação Rápida</Label>
              <div className="flex flex-wrap gap-2">
                {[2024, 2022, 2020, 2018].map((year) => (
                  <Button
                    key={year}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickImport(String(year))}
                    data-testid={`button-quick-import-${year}`}
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url-input">URL do Arquivo ZIP</Label>
              <Input
                id="url-input"
                type="url"
                placeholder="https://cdn.tse.jus.br/estatistica/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                data-testid="input-tse-url"
              />
              <p className="text-xs text-muted-foreground">
                Cole a URL de um arquivo .zip do repositório de dados abertos do TSE
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ano da Eleição</Label>
              <Select value={urlYear} onValueChange={setUrlYear}>
                <SelectTrigger data-testid="select-url-year">
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  {ELECTION_YEARS.map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cargo (opcional)</Label>
              <Select value={urlCargo} onValueChange={setUrlCargo}>
                <SelectTrigger data-testid="select-url-cargo">
                  <SelectValue placeholder="Todos os cargos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cargos</SelectItem>
                  {CARGOS.map((cargo) => (
                    <SelectItem key={cargo.code} value={String(cargo.code)}>{cargo.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Selecione para importar apenas dados de um cargo específico
              </p>
            </div>

            <Button
              onClick={handleUrlImport}
              disabled={!urlInput || urlImportMutation.isPending}
              className="w-full"
              data-testid="button-import-url"
            >
              {urlImportMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Baixar e Importar</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Dados Importados
            </CardTitle>
            <CardDescription>
              Estatísticas dos dados já importados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats ? (
              <div className="space-y-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <p className="text-3xl font-bold font-mono">{stats.totalRecords.toLocaleString("pt-BR")}</p>
                  <p className="text-sm text-muted-foreground">Registros totais</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="text-center p-2 border rounded">
                    <p className="font-bold">{stats.years.length}</p>
                    <p className="text-xs text-muted-foreground">Anos</p>
                  </div>
                  <div className="text-center p-2 border rounded">
                    <p className="font-bold">{stats.ufs.length}</p>
                    <p className="text-xs text-muted-foreground">UFs</p>
                  </div>
                  <div className="text-center p-2 border rounded">
                    <p className="font-bold">{stats.cargos.length}</p>
                    <p className="text-xs text-muted-foreground">Cargos</p>
                  </div>
                </div>
                {stats.years.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Anos disponíveis:</p>
                    <div className="flex flex-wrap gap-1">
                      {stats.years.slice(0, 10).map((year) => (
                        <Badge key={year} variant="outline">{year}</Badge>
                      ))}
                      {stats.years.length > 10 && (
                        <Badge variant="secondary">+{stats.years.length - 10}</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum dado importado ainda</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Histórico de Importações
            </CardTitle>
            <CardDescription>
              Acompanhe o status das importações em andamento e concluídas
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchJobs()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : jobs && jobs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Ano</TableHead>
                  <TableHead>UF</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Erros</TableHead>
                  <TableHead>Validação</TableHead>
                  <TableHead>Criado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium max-w-[200px] truncate" title={job.filename}>
                      {job.filename}
                    </TableCell>
                    <TableCell>{formatFileSize(job.fileSize)}</TableCell>
                    <TableCell>{job.electionYear || "-"}</TableCell>
                    <TableCell>{job.uf || "-"}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      {getProgressDisplay(job)}
                    </TableCell>
                    <TableCell>
                      {(job.errorCount || 0) > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setErrorsDialogJob(job)}
                          data-testid={`button-view-errors-${job.id}`}
                        >
                          {job.errorCount} erros
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {job.status === "completed" ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setValidationDialogJob(job)}
                            data-testid={`button-view-validation-${job.id}`}
                          >
                            <ShieldCheck className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => runValidationMutation.mutate(job.id)}
                            disabled={validatingJobId === job.id}
                            data-testid={`button-run-validation-${job.id}`}
                          >
                            {validatingJobId === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Validar"
                            )}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(job.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma importação realizada ainda</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!errorsDialogJob} onOpenChange={(open) => !open && setErrorsDialogJob(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Erros de Importação</DialogTitle>
            <DialogDescription>
              Arquivo: {errorsDialogJob?.filename}
            </DialogDescription>
          </DialogHeader>
          {jobErrors && jobErrors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobErrors.slice(0, 100).map((error) => (
                  <TableRow key={error.id}>
                    <TableCell>{error.rowNumber || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{error.errorType}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate" title={error.errorMessage}>
                      {error.errorMessage}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">Nenhum erro encontrado.</p>
          )}
          {jobErrors && jobErrors.length > 100 && (
            <p className="text-sm text-muted-foreground">
              Mostrando os primeiros 100 erros de {jobErrors.length} total.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!validationDialogJob} onOpenChange={(open) => !open && setValidationDialogJob(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Validação de Dados
            </DialogTitle>
            <DialogDescription>
              Arquivo: {validationDialogJob?.filename} | Ano: {validationDialogJob?.electionYear || "-"}
            </DialogDescription>
          </DialogHeader>
          
          {validationLoading || validatingJobId === validationDialogJob?.id ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {validatingJobId === validationDialogJob?.id ? "Executando validação com IA..." : "Carregando resultados..."}
              </p>
            </div>
          ) : validationStatus?.hasValidation ? (
            <div className="space-y-6">
              {validationStatus.aiAnalysis?.overallDataQuality && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>Qualidade dos Dados</span>
                      <Badge 
                        variant={
                          validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? "default" :
                          validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? "secondary" :
                          "destructive"
                        }
                        className="text-lg px-3"
                      >
                        {validationStatus.aiAnalysis.overallDataQuality.score}/100
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm">{validationStatus.aiAnalysis.overallDataQuality.assessment}</p>
                    
                    {validationStatus.aiAnalysis.overallDataQuality.keyFindings.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1">
                          <Info className="h-4 w-4" />
                          Principais Descobertas
                        </h4>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {validationStatus.aiAnalysis.overallDataQuality.keyFindings.map((finding, i) => (
                            <li key={i}>{finding}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {validationStatus.aiAnalysis.overallDataQuality.risksIdentified.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-4 w-4" />
                          Riscos Identificados
                        </h4>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {validationStatus.aiAnalysis.overallDataQuality.risksIdentified.map((risk, i) => (
                            <li key={i}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 grid-cols-3">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">{validationStatus.totalRecordsChecked?.toLocaleString("pt-BR")}</p>
                    <p className="text-sm text-muted-foreground">Registros Verificados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">{validationStatus.issuesFound || 0}</p>
                    <p className="text-sm text-muted-foreground">Problemas Encontrados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">
                      {validationStatus.summary?.bySeverity?.["error"] || 0}
                    </p>
                    <p className="text-sm text-muted-foreground text-destructive">Erros Críticos</p>
                  </CardContent>
                </Card>
              </div>

              {validationStatus.summary && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Por Severidade</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(validationStatus.summary.bySeverity).map(([sev, count]) => (
                          <Badge 
                            key={sev} 
                            variant={sev === "error" ? "destructive" : sev === "warning" ? "secondary" : "outline"}
                          >
                            {sev}: {count}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Por Tipo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(validationStatus.summary.byType).slice(0, 6).map(([type, count]) => (
                          <Badge key={type} variant="outline">
                            {type.replace(/_/g, " ")}: {count}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {validationStatus.aiAnalysis?.analysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Análise com IA</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{validationStatus.aiAnalysis.analysis}</p>
                  </CardContent>
                </Card>
              )}

              {validationIssues && validationIssues.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="issues">
                    <AccordionTrigger>
                      Ver Todos os Problemas ({validationIssues.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Severidade</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Mensagem</TableHead>
                            <TableHead>Sugestão</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validationIssues.slice(0, 50).map((issue) => (
                            <TableRow key={issue.id}>
                              <TableCell>
                                <Badge variant={
                                  issue.severity === "error" ? "destructive" : 
                                  issue.severity === "warning" ? "secondary" : "outline"
                                }>
                                  {issue.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {issue.type.replace(/_/g, " ")}
                              </TableCell>
                              <TableCell className="text-sm max-w-xs truncate" title={issue.message}>
                                {issue.message}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={issue.suggestedFix?.reasoning}>
                                {issue.suggestedFix?.reasoning || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {validationIssues.length > 50 && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Mostrando os primeiros 50 de {validationIssues.length} problemas.
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {validationStatus.aiAnalysis?.recommendations && validationStatus.aiAnalysis.recommendations.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Recomendações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {validationStatus.aiAnalysis.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Badge variant={
                            rec.severity === "error" ? "destructive" : 
                            rec.severity === "warning" ? "secondary" : "outline"
                          } className="mt-0.5 shrink-0">
                            {rec.severity}
                          </Badge>
                          <div>
                            <p className="font-medium">{rec.issue}</p>
                            <p className="text-muted-foreground">{rec.suggestedAction}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">
                Nenhuma validação foi executada para esta importação.
              </p>
              <Button
                onClick={() => {
                  if (validationDialogJob) {
                    runValidationMutation.mutate(validationDialogJob.id);
                  }
                }}
                disabled={runValidationMutation.isPending}
                data-testid="button-run-validation-dialog"
              >
                {runValidationMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Validando...</>
                ) : (
                  <><ShieldCheck className="h-4 w-4 mr-2" />Executar Validação com IA</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
