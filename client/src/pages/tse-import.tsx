import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Database, Link, Download, ShieldCheck, AlertTriangle, Info, StopCircle, RotateCcw, Trash2, FolderOpen, HardDrive } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

  const [verifyingIntegrityJobId, setVerifyingIntegrityJobId] = useState<number | null>(null);

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

  const verifyIntegrityMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setVerifyingIntegrityJobId(jobId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/validate-integrity`);
      return response.json();
    },
    onSuccess: async (result, jobId) => {
      toast({ 
        title: result.isValid ? "Integridade OK" : "Discrepância detectada",
        description: result.validationMessage,
        variant: result.isValid ? "default" : "destructive"
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
      setVerifyingIntegrityJobId(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro na verificação", 
        description: error.message, 
        variant: "destructive" 
      });
      setVerifyingIntegrityJobId(null);
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

  const [activeTab, setActiveTab] = useState<"imports" | "files">("imports");
  const [cancellingJobId, setCancellingJobId] = useState<number | null>(null);
  const [restartingJobId, setRestartingJobId] = useState<number | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [deletingFilesJobId, setDeletingFilesJobId] = useState<number | null>(null);

  interface ImportFile {
    jobId: number;
    directory: string;
    files: Array<{ name: string; size: number; modifiedAt: string }>;
    totalSize: number;
  }

  const { data: importFiles, refetch: refetchFiles } = useQuery<ImportFile[]>({
    queryKey: ["/api/imports/files"],
    enabled: activeTab === "files",
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setCancellingJobId(jobId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/cancel`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Importação cancelada", description: "A importação foi cancelada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
      setCancellingJobId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao cancelar", description: error.message, variant: "destructive" });
      setCancellingJobId(null);
    },
  });

  const restartJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setRestartingJobId(jobId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/restart`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Importação reiniciada", description: "A importação foi reiniciada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
      setRestartingJobId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reiniciar", description: error.message, variant: "destructive" });
      setRestartingJobId(null);
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setDeletingJobId(jobId);
      const response = await apiRequest("DELETE", `/api/imports/tse/${jobId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Importação excluída", description: "A importação e seus dados foram excluídos." });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tse/stats"] });
      setDeletingJobId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      setDeletingJobId(null);
    },
  });

  const deleteFilesMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setDeletingFilesJobId(jobId);
      const response = await apiRequest("DELETE", `/api/imports/files/${jobId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Arquivos excluídos", description: "Os arquivos temporários foram excluídos." });
      refetchFiles();
      setDeletingFilesJobId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir arquivos", description: error.message, variant: "destructive" });
      setDeletingFilesJobId(null);
    },
  });

  const isJobInProgress = (status: string) => {
    return ["pending", "downloading", "extracting", "processing", "running"].includes(status);
  };

  const isJobRestartable = (status: string) => {
    return ["failed", "cancelled"].includes(status);
  };

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
      case "cancelled":
        return <Badge variant="secondary"><StopCircle className="h-3 w-3 mr-1" />Cancelado</Badge>;
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "imports" | "files")} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="imports" className="flex items-center gap-2" data-testid="tab-imports">
            <FileText className="h-4 w-4" />
            Importações
          </TabsTrigger>
          <TabsTrigger value="files" className="flex items-center gap-2" data-testid="tab-files">
            <HardDrive className="h-4 w-4" />
            Arquivos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="imports">
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
                  <TableHead>Integridade</TableHead>
                  <TableHead>Validação IA</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
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
                        <div className="flex items-center gap-2">
                          {job.validationStatus === "passed" ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : job.validationStatus === "failed" ? (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Falha
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => verifyIntegrityMutation.mutate(job.id)}
                              disabled={verifyingIntegrityJobId === job.id}
                              data-testid={`button-verify-integrity-${job.id}`}
                            >
                              {verifyingIntegrityJobId === job.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <ShieldCheck className="h-4 w-4 mr-1" />
                                  Verificar
                                </>
                              )}
                            </Button>
                          )}
                          {job.validationStatus && job.validationMessage && (
                            <span className="text-xs text-muted-foreground max-w-[150px] truncate" title={job.validationMessage}>
                              {job.validationMessage.split(":")[0]}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
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
                    <TableCell>
                      <div className="flex gap-1">
                        {isJobInProgress(job.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelJobMutation.mutate(job.id)}
                            disabled={cancellingJobId === job.id}
                            title="Cancelar importação"
                            data-testid={`button-cancel-job-${job.id}`}
                          >
                            {cancellingJobId === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <StopCircle className="h-4 w-4 text-orange-500" />
                            )}
                          </Button>
                        )}
                        {isJobRestartable(job.status) && job.filename?.startsWith("[URL]") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restartJobMutation.mutate(job.id)}
                            disabled={restartingJobId === job.id}
                            title="Reiniciar importação"
                            data-testid={`button-restart-job-${job.id}`}
                          >
                            {restartingJobId === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4 text-blue-500" />
                            )}
                          </Button>
                        )}
                        {!isJobInProgress(job.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Excluir importação "${job.filename}" e todos os seus dados?`)) {
                                deleteJobMutation.mutate(job.id);
                              }
                            }}
                            disabled={deletingJobId === job.id}
                            title="Excluir importação"
                            data-testid={`button-delete-job-${job.id}`}
                          >
                            {deletingJobId === job.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-red-500" />
                            )}
                          </Button>
                        )}
                      </div>
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
        </TabsContent>

        <TabsContent value="files">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Arquivos Temporários
                </CardTitle>
                <CardDescription>
                  Arquivos baixados e extraídos durante as importações
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchFiles()} data-testid="button-refresh-files">
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </CardHeader>
            <CardContent>
              {!importFiles || importFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum arquivo temporário encontrado</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {importFiles.map((group) => (
                    <div key={group.directory} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">
                            {group.directory === "uploads" ? "Uploads" : `Job #${group.jobId}`}
                          </span>
                          <Badge variant="outline">
                            {group.files.length} arquivo(s)
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatFileSize(group.totalSize)}
                          </span>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Excluir todos os arquivos de "${group.directory}"?`)) {
                              deleteFilesMutation.mutate(group.jobId);
                            }
                          }}
                          disabled={deletingFilesJobId === group.jobId}
                          data-testid={`button-delete-files-${group.jobId}`}
                        >
                          {deletingFilesJobId === group.jobId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Excluir
                            </>
                          )}
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Tamanho</TableHead>
                            <TableHead>Modificado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.files.map((file) => (
                            <TableRow key={file.name}>
                              <TableCell className="font-mono text-sm">{file.name}</TableCell>
                              <TableCell>{formatFileSize(file.size)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(file.modifiedAt).toLocaleString("pt-BR")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!errorsDialogJob} onOpenChange={(open) => !open && setErrorsDialogJob(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Relatório de Erros de Importação
            </DialogTitle>
            <DialogDescription>
              Arquivo: {errorsDialogJob?.filename} | Ano: {errorsDialogJob?.electionYear || "-"} | UF: {errorsDialogJob?.uf || "-"}
            </DialogDescription>
          </DialogHeader>
          
          {jobErrors && jobErrors.length > 0 ? (
            <div className="space-y-4">
              <Card className="border-destructive/50 bg-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Resumo de Discrepâncias</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const csvContent = [
                          ["Linha", "Tipo de Erro", "Mensagem", "Dados Brutos"].join(";"),
                          ...jobErrors.map(e => [
                            e.rowNumber || "",
                            e.errorType || "",
                            `"${(e.errorMessage || "").replace(/"/g, '""')}"`,
                            `"${(e.rawData || "").replace(/"/g, '""')}"`
                          ].join(";"))
                        ].join("\n");
                        const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `erros_importacao_${errorsDialogJob?.id}_${new Date().toISOString().split("T")[0]}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      data-testid="button-export-errors-csv"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Exportar CSV
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold text-destructive">{jobErrors.length}</p>
                      <p className="text-xs text-muted-foreground">Total de Erros</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold">{new Set(jobErrors.map(e => e.errorType)).size}</p>
                      <p className="text-xs text-muted-foreground">Tipos Diferentes</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold">
                        {jobErrors.filter(e => e.rowNumber).length > 0 
                          ? Math.min(...jobErrors.filter(e => e.rowNumber).map(e => e.rowNumber!))
                          : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">Primeira Linha</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold">
                        {jobErrors.filter(e => e.rowNumber).length > 0 
                          ? Math.max(...jobErrors.filter(e => e.rowNumber).map(e => e.rowNumber!))
                          : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">Última Linha</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Distribuição por Tipo de Erro:</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(
                        jobErrors.reduce((acc, e) => {
                          acc[e.errorType || "desconhecido"] = (acc[e.errorType || "desconhecido"] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                        <Badge key={type} variant="destructive" className="text-xs">
                          {type}: {count} ({((count / jobErrors.length) * 100).toFixed(1)}%)
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Orientações para Resolução
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {Array.from(new Set(jobErrors.map(e => e.errorType))).slice(0, 5).map(errorType => (
                    <div key={errorType} className="p-3 rounded-lg bg-muted/50">
                      <p className="font-medium text-destructive">{errorType}</p>
                      <p className="text-muted-foreground mt-1">
                        {errorType === "parse_error" && "Verifique se o arquivo CSV está no formato correto do TSE. O separador deve ser ponto-e-vírgula (;) e a codificação Latin1 ou UTF-8."}
                        {errorType === "invalid_format" && "Alguns campos estão em formato inválido. Verifique se o arquivo corresponde ao layout esperado do TSE."}
                        {errorType === "missing_field" && "Campos obrigatórios estão ausentes. Certifique-se de que o arquivo possui todas as colunas necessárias."}
                        {errorType === "duplicate_entry" && "Registros duplicados foram detectados. Verifique se não há linhas repetidas no arquivo original."}
                        {errorType === "invalid_number" && "Valores numéricos inválidos foram encontrados. Verifique se os campos de votos e números de candidato estão corretos."}
                        {errorType === "encoding_error" && "Problemas de codificação detectados. Tente converter o arquivo para UTF-8 antes de importar."}
                        {!["parse_error", "invalid_format", "missing_field", "duplicate_entry", "invalid_number", "encoding_error"].includes(errorType || "") && 
                          "Revise os dados brutos das linhas afetadas para identificar o problema específico."}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Accordion type="single" collapsible defaultValue="errors">
                <AccordionItem value="errors">
                  <AccordionTrigger className="text-base">
                    Detalhes dos Erros ({Math.min(100, jobErrors.length)} de {jobErrors.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Linha</TableHead>
                          <TableHead className="w-32">Tipo</TableHead>
                          <TableHead>Mensagem</TableHead>
                          <TableHead className="w-48">Dados Brutos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobErrors.slice(0, 100).map((error) => (
                          <TableRow key={error.id}>
                            <TableCell className="font-mono text-sm">{error.rowNumber || "-"}</TableCell>
                            <TableCell>
                              <Badge variant="destructive" className="text-xs">{error.errorType}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{error.errorMessage}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate" title={error.rawData || ""}>
                              {error.rawData || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {jobErrors.length > 100 && (
                      <p className="text-sm text-muted-foreground mt-3 text-center">
                        Mostrando os primeiros 100 erros. Exporte o CSV para ver todos os {jobErrors.length} erros.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-70" />
              <p className="text-muted-foreground">Nenhum erro encontrado nesta importação.</p>
            </div>
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
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const report = {
                      arquivo: validationDialogJob?.filename,
                      ano: validationDialogJob?.electionYear,
                      uf: validationDialogJob?.uf,
                      dataValidacao: validationStatus.completedAt,
                      score: validationStatus.aiAnalysis?.overallDataQuality?.score,
                      avaliacao: validationStatus.aiAnalysis?.overallDataQuality?.assessment,
                      registrosVerificados: validationStatus.totalRecordsChecked,
                      problemasEncontrados: validationStatus.issuesFound,
                      descobertas: validationStatus.aiAnalysis?.overallDataQuality?.keyFindings,
                      riscos: validationStatus.aiAnalysis?.overallDataQuality?.risksIdentified,
                      analise: validationStatus.aiAnalysis?.analysis,
                      recomendacoes: validationStatus.aiAnalysis?.recommendations,
                      resumoPorSeveridade: validationStatus.summary?.bySeverity,
                      resumoPorTipo: validationStatus.summary?.byType,
                    };
                    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `validacao_ia_${validationDialogJob?.id}_${new Date().toISOString().split("T")[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="button-export-validation-json"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Exportar Relatório
                </Button>
              </div>

              {validationStatus.aiAnalysis?.overallDataQuality && (
                <Card className={
                  validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? "border-green-500/50 bg-green-500/5" :
                  validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? "border-yellow-500/50 bg-yellow-500/5" :
                  "border-destructive/50 bg-destructive/5"
                }>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? (
                          <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                        Avaliação de Qualidade dos Dados
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Score:</span>
                        <Badge 
                          variant={
                            validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? "default" :
                            validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? "secondary" :
                            "destructive"
                          }
                          className="text-lg px-4 py-1"
                        >
                          {validationStatus.aiAnalysis.overallDataQuality.score}/100
                        </Badge>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg bg-background border">
                      <p className="text-sm leading-relaxed">{validationStatus.aiAnalysis.overallDataQuality.assessment}</p>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      {validationStatus.aiAnalysis.overallDataQuality.keyFindings.length > 0 && (
                        <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                          <h4 className="font-medium mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                            <Info className="h-4 w-4" />
                            Principais Descobertas
                          </h4>
                          <ul className="space-y-2">
                            {validationStatus.aiAnalysis.overallDataQuality.keyFindings.map((finding, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-blue-500 mt-1">•</span>
                                <span>{finding}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {validationStatus.aiAnalysis.overallDataQuality.risksIdentified.length > 0 && (
                        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                          <h4 className="font-medium mb-3 flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-4 w-4" />
                            Riscos Identificados
                          </h4>
                          <ul className="space-y-2">
                            {validationStatus.aiAnalysis.overallDataQuality.risksIdentified.map((risk, i) => (
                              <li key={i} className="text-sm flex items-start gap-2">
                                <span className="text-destructive mt-1">!</span>
                                <span>{risk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">{validationStatus.totalRecordsChecked?.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-muted-foreground">Registros Verificados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold">{validationStatus.issuesFound || 0}</p>
                    <p className="text-xs text-muted-foreground">Problemas Encontrados</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-destructive">
                      {validationStatus.summary?.bySeverity?.["error"] || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Erros Críticos</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-3xl font-bold text-yellow-600">
                      {validationStatus.summary?.bySeverity?.["warning"] || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Avisos</p>
                  </CardContent>
                </Card>
              </div>

              {validationStatus.summary && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Distribuição de Problemas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-sm font-medium mb-3">Por Severidade</h4>
                        <div className="space-y-2">
                          {Object.entries(validationStatus.summary.bySeverity).sort((a, b) => {
                            const order = { error: 0, warning: 1, info: 2 };
                            return (order[a[0] as keyof typeof order] || 3) - (order[b[0] as keyof typeof order] || 3);
                          }).map(([sev, count]) => (
                            <div key={sev} className="flex items-center gap-2">
                              <Badge 
                                variant={sev === "error" ? "destructive" : sev === "warning" ? "secondary" : "outline"}
                                className="w-20 justify-center"
                              >
                                {sev === "error" ? "Erro" : sev === "warning" ? "Aviso" : "Info"}
                              </Badge>
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${sev === "error" ? "bg-destructive" : sev === "warning" ? "bg-yellow-500" : "bg-blue-500"}`}
                                  style={{ width: `${Math.min(100, (count / (validationStatus.issuesFound || 1)) * 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12 text-right">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium mb-3">Por Tipo de Problema</h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(validationStatus.summary.byType)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 8)
                            .map(([type, count]) => (
                              <Badge key={type} variant="outline" className="text-xs">
                                {type.replace(/_/g, " ")}: {count}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {validationStatus.aiAnalysis?.analysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Análise Detalhada da IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-lg bg-muted/50 border">
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{validationStatus.aiAnalysis.analysis}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {validationStatus.aiAnalysis?.recommendations && validationStatus.aiAnalysis.recommendations.length > 0 && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      Recomendações de Ação
                    </CardTitle>
                    <CardDescription>
                      Ações sugeridas pela IA para melhorar a qualidade dos dados
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {validationStatus.aiAnalysis.recommendations.map((rec, i) => (
                        <div key={i} className="p-3 rounded-lg border bg-background flex items-start gap-3">
                          <Badge variant={
                            rec.severity === "error" ? "destructive" : 
                            rec.severity === "warning" ? "secondary" : "outline"
                          } className="shrink-0 mt-0.5">
                            {rec.severity === "error" ? "Crítico" : rec.severity === "warning" ? "Importante" : "Sugestão"}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{rec.issue}</p>
                            <p className="text-sm text-muted-foreground mt-1">{rec.suggestedAction}</p>
                            {rec.confidence && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Confiança: {Math.round(rec.confidence * 100)}%
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {validationIssues && validationIssues.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="issues">
                    <AccordionTrigger className="text-base">
                      Lista Completa de Problemas ({validationIssues.length})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="mb-3 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const csvContent = [
                              ["Severidade", "Tipo", "Categoria", "Linha", "Campo", "Valor Atual", "Mensagem", "Ação Sugerida", "Confiança"].join(";"),
                              ...validationIssues.map(issue => [
                                issue.severity,
                                issue.type,
                                issue.category || "",
                                issue.rowReference || "",
                                issue.field || "",
                                `"${(issue.currentValue || "").replace(/"/g, '""')}"`,
                                `"${(issue.message || "").replace(/"/g, '""')}"`,
                                `"${(issue.suggestedFix?.reasoning || "").replace(/"/g, '""')}"`,
                                issue.suggestedFix?.confidence ? `${Math.round(issue.suggestedFix.confidence * 100)}%` : ""
                              ].join(";"))
                            ].join("\n");
                            const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `problemas_validacao_${validationDialogJob?.id}_${new Date().toISOString().split("T")[0]}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          data-testid="button-export-issues-csv"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Exportar CSV
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-24">Severidade</TableHead>
                            <TableHead className="w-32">Tipo</TableHead>
                            <TableHead>Mensagem</TableHead>
                            <TableHead className="w-48">Ação Sugerida</TableHead>
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
                                  {issue.severity === "error" ? "Erro" : issue.severity === "warning" ? "Aviso" : "Info"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {issue.type.replace(/_/g, " ")}
                              </TableCell>
                              <TableCell className="text-sm">
                                <div>
                                  <p>{issue.message}</p>
                                  {issue.rowReference && (
                                    <p className="text-xs text-muted-foreground mt-1">Linha: {issue.rowReference}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {issue.suggestedFix?.reasoning || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {validationIssues.length > 50 && (
                        <p className="text-sm text-muted-foreground mt-3 text-center">
                          Mostrando os primeiros 50 de {validationIssues.length} problemas. Exporte o CSV para ver todos.
                        </p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
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
