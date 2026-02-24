import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useImportWebSocket } from "@/hooks/use-import-websocket";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import type { TseImportJob, TseImportError } from "@shared/schema";

export interface ValidationStatus {
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

export interface ValidationIssue {
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

export interface QueueStatus {
  isProcessing: boolean;
  currentJob: number | null;
  queueLength: number;
  queue: Array<{
    position: number;
    jobId: number;
    type: string;
    isProcessing?: boolean;
  }>;
}

export interface BatchData {
  batches: Array<{
    id: number;
    importJobId: number;
    batchIndex: number;
    status: string;
    rowStart: number;
    rowEnd: number;
    totalRows: number;
    processedRows: number | null;
    insertedRows: number | null;
    skippedRows: number | null;
    errorCount: number | null;
    errorSummary: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
  stats: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    totalRows: number;
    processedRows: number;
    errorCount: number;
  };
}

export interface ImportFile {
  jobId: number;
  directory: string;
  files: Array<{ name: string; size: number; modifiedAt: string }>;
  totalSize: number;
}

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO", "BR"
];

export const ELECTION_YEARS = Array.from({ length: 30 }, (_, i) => 2024 - i * 2).filter(y => y >= 1998);

export const CARGOS = [
  { code: 1, name: "Presidente" },
  { code: 3, name: "Governador" },
  { code: 5, name: "Senador" },
  { code: 6, name: "Deputado Federal" },
  { code: 7, name: "Deputado Estadual" },
  { code: 8, name: "Deputado Distrital" },
  { code: 11, name: "Prefeito" },
  { code: 13, name: "Vereador" },
];

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(date: string | Date | null) {
  if (!date) return "-";
  return new Date(date).toLocaleString("pt-BR");
}

export function isJobInProgress(status: string) {
  return ["pending", "queued", "downloading", "extracting", "processing", "running"].includes(status);
}

export function isJobRestartable(status: string) {
  return ["failed", "cancelled"].includes(status);
}

export function formatElapsedTime(startDate: string | Date | null) {
  if (!startDate) return "";
  const start = new Date(startDate).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
}

export function calculateProcessingSpeed(job: TseImportJob) {
  if (!job.startedAt || !job.processedRows) return null;
  const startTime = new Date(job.startedAt).getTime();
  const now = Date.now();
  const elapsedSeconds = (now - startTime) / 1000;
  if (elapsedSeconds < 1) return null;
  return Math.round(job.processedRows / elapsedSeconds);
}

export function calculateETA(job: TseImportJob, speed: number | null) {
  if (!speed || speed === 0) return null;
  const totalRows = job.totalFileRows || job.totalRows || 0;
  const processed = job.processedRows || 0;
  const skipped = job.skippedRows || 0;
  const remaining = Math.max(0, totalRows - processed - skipped);
  if (remaining === 0) return null;
  const seconds = Math.round(remaining / speed);
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.round(seconds / 60)}min`;
  return `~${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}min`;
}

export function getStageDescription(job: TseImportJob) {
  const stage = job.stage || job.status;
  switch (stage) {
    case "pending": return "Aguardando início";
    case "downloading": return "Baixando arquivo...";
    case "extracting": return "Extraindo ZIP...";
    case "counting": return "Contando registros...";
    case "processing": return "Processando dados...";
    case "inserting": return "Inserindo no banco...";
    case "validating": return "Validando dados...";
    case "running": return "Processando...";
    default: return stage;
  }
}

export function generateTseUrl(year: string) {
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`;
}

export function generateHistoricalUrl(year: string, type: "detalhe" | "partido") {
  if (type === "detalhe") {
    return `https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_${year}.zip`;
  }
  return `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_partido_munzona/votacao_partido_munzona_${year}.zip`;
}

export function useTseImport() {
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
  const [verifyingIntegrityJobId, setVerifyingIntegrityJobId] = useState<number | null>(null);
  const [batchesDialogJob, setBatchesDialogJob] = useState<TseImportJob | null>(null);
  const [reprocessingBatchId, setReprocessingBatchId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"imports" | "files">("imports");
  const [cancellingJobId, setCancellingJobId] = useState<number | null>(null);
  const [restartingJobId, setRestartingJobId] = useState<number | null>(null);
  const [deletingJobId, setDeletingJobId] = useState<number | null>(null);
  const [deletingFilesJobId, setDeletingFilesJobId] = useState<number | null>(null);

  const [historicalImportType, setHistoricalImportType] = useState<"detalhe" | "partido">("detalhe");
  const [historicalUrl, setHistoricalUrl] = useState("");
  const [historicalYear, setHistoricalYear] = useState("");
  const [historicalCargo, setHistoricalCargo] = useState("");

  const [showFileSelector, setShowFileSelector] = useState(false);
  const [availableFiles, setAvailableFiles] = useState<Array<{ path: string; name: string; size: number; isBrasil: boolean }>>([]);
  const [selectedCsvFile, setSelectedCsvFile] = useState<string>("");
  const [pendingImportData, setPendingImportData] = useState<{ url: string; electionYear?: string; cargoFilter?: string } | null>(null);
  const [pendingImportSource, setPendingImportSource] = useState<"candidato" | "detalhe" | "partido">("candidato");

  const { connected: wsConnected, lastEvent } = useImportWebSocket(true);

  useEffect(() => {
    if (lastEvent) {
      console.log("WebSocket event:", lastEvent);
    }
  }, [lastEvent]);

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<TseImportJob[]>({
    queryKey: ["/api/imports/tse"],
    refetchInterval: (query) => {
      const data = query.state.data as TseImportJob[] | undefined;
      const hasActive = data?.some(job =>
        ["pending", "queued", "downloading", "extracting", "running", "processing"].includes(job.status)
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

  const { data: queueStatus } = useQuery<QueueStatus>({
    queryKey: ["/api/imports/tse/queue/status"],
    refetchInterval: (query) => {
      const data = query.state.data as QueueStatus | undefined;
      return data?.isProcessing || (data?.queueLength ?? 0) > 0 ? 2000 : 10000;
    },
  });

  const { data: importFiles, refetch: refetchFiles } = useQuery<ImportFile[]>({
    queryKey: ["/api/imports/files"],
    enabled: activeTab === "files",
  });

  const { data: batchesData, refetch: refetchBatches, isLoading: batchesLoading } = useQuery<BatchData>({
    queryKey: ["/api/imports/tse", batchesDialogJob?.id, "batches"],
    enabled: !!batchesDialogJob,
  });

  const runValidationMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setValidatingJobId(jobId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/validation/run`);
      return response.json();
    },
    onSuccess: async (_, jobId) => {
      toast({ title: "Validação concluída", description: "A análise dos dados foi realizada com sucesso." });
      await queryClient.invalidateQueries({ queryKey: ["/api/imports/tse", jobId, "validation"] });
      if (validationDialogJob?.id === jobId) {
        await refetchValidation();
      }
      setValidatingJobId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro na validação", description: error.message, variant: "destructive" });
      setValidatingJobId(null);
    },
  });

  const verifyIntegrityMutation = useMutation({
    mutationFn: async (jobId: number) => {
      setVerifyingIntegrityJobId(jobId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/validate-integrity`);
      return response.json();
    },
    onSuccess: async (result) => {
      toast({
        title: result.isValid ? "Integridade OK" : "Discrepância detectada",
        description: result.validationMessage,
        variant: result.isValid ? "default" : "destructive"
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
      setVerifyingIntegrityJobId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro na verificação", description: error.message, variant: "destructive" });
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
    mutationFn: async (data: { url: string; electionYear?: string; cargoFilter?: string; selectedFile?: string }) => {
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

  const detalheImportMutation = useMutation({
    mutationFn: async (data: { url: string; electionYear?: string; cargoFilter?: string; selectedFile?: string }) => {
      const response = await fetch("/api/imports/tse/detalhe-votacao/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Importação iniciada", description: "Estatísticas eleitorais estão sendo importadas." });
      setHistoricalUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    },
  });

  const partidoImportMutation = useMutation({
    mutationFn: async (data: { url: string; electionYear?: string; cargoFilter?: string; selectedFile?: string }) => {
      const response = await fetch("/api/imports/tse/partido/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Import failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Importação iniciada", description: "Votos por partido estão sendo importados." });
      setHistoricalUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
    },
    onError: (error: Error) => {
      toast({ title: "Erro na importação", description: error.message, variant: "destructive" });
    },
  });

  const previewFilesMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/imports/tse/preview-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to preview files");
      return response.json();
    },
    onSuccess: (result, url) => {
      if (result.hasBrasilFile) {
        const data = {
          url,
          electionYear: historicalYear || undefined,
          cargoFilter: historicalCargo && historicalCargo !== "all" ? historicalCargo : undefined,
        };
        if (historicalImportType === "detalhe") {
          detalheImportMutation.mutate(data);
        } else {
          partidoImportMutation.mutate(data);
        }
      } else {
        setAvailableFiles(result.files);
        setPendingImportData({
          url,
          electionYear: historicalYear || undefined,
          cargoFilter: historicalCargo && historicalCargo !== "all" ? historicalCargo : undefined,
        });
        setPendingImportSource(historicalImportType === "detalhe" ? "detalhe" : "partido");
        setShowFileSelector(true);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao verificar arquivos", description: error.message, variant: "destructive" });
    },
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

  const reprocessBatchMutation = useMutation({
    mutationFn: async ({ jobId, batchId }: { jobId: number; batchId: number }) => {
      setReprocessingBatchId(batchId);
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/batches/${batchId}/reprocess`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Reprocessamento iniciado", description: "O lote está sendo reprocessado." });
      refetchBatches();
      setReprocessingBatchId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro no reprocessamento", description: error.message, variant: "destructive" });
      setReprocessingBatchId(null);
    },
  });

  const reprocessAllFailedMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest("POST", `/api/imports/tse/${jobId}/batches/reprocess-all-failed`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Reprocessamento em lote iniciado",
        description: `${data.batchCount} lotes estão sendo reprocessados.`
      });
      refetchBatches();
    },
    onError: (error: Error) => {
      toast({ title: "Erro no reprocessamento", description: error.message, variant: "destructive" });
    },
  });

  const getQueueInfo = (jobId: number): { position: number | null; isProcessing: boolean } => {
    if (!queueStatus) return { position: null, isProcessing: false };
    const item = queueStatus.queue.find(q => q.jobId === jobId);
    if (!item) return { position: null, isProcessing: false };
    return {
      position: item.position > 0 ? item.position : null,
      isProcessing: item.isProcessing ?? false
    };
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

  const previewCandidatoFilesMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/imports/tse/preview-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to preview files");
      return response.json();
    },
    onSuccess: (result, url) => {
      if (result.hasBrasilFile || result.files.length <= 1) {
        urlImportMutation.mutate({
          url,
          electionYear: urlYear || undefined,
          cargoFilter: urlCargo && urlCargo !== "all" ? urlCargo : undefined,
        });
      } else {
        setAvailableFiles(result.files);
        setPendingImportData({
          url,
          electionYear: urlYear || undefined,
          cargoFilter: urlCargo && urlCargo !== "all" ? urlCargo : undefined,
        });
        setPendingImportSource("candidato");
        setShowFileSelector(true);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao verificar arquivos", description: error.message, variant: "destructive" });
    },
  });

  const handleUrlImport = () => {
    if (!urlInput) {
      toast({ title: "Digite uma URL", variant: "destructive" });
      return;
    }
    previewCandidatoFilesMutation.mutate(urlInput);
  };

  const handleQuickImport = (year: string) => {
    const url = generateTseUrl(year);
    setUrlInput(url);
    setUrlYear(year);
  };

  const handleHistoricalImport = () => {
    if (!historicalUrl) {
      toast({ title: "Digite uma URL", variant: "destructive" });
      return;
    }
    previewFilesMutation.mutate(historicalUrl);
  };

  const handleFileSelection = () => {
    if (!selectedCsvFile || !pendingImportData) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }
    const data = { ...pendingImportData, selectedFile: selectedCsvFile };
    if (pendingImportSource === "candidato") {
      urlImportMutation.mutate(data);
    } else if (pendingImportSource === "detalhe") {
      detalheImportMutation.mutate(data);
    } else {
      partidoImportMutation.mutate(data);
    }
    setShowFileSelector(false);
    setSelectedCsvFile("");
    setPendingImportData(null);
  };

  return {
    hasPermission,
    wsConnected,

    selectedFile, setSelectedFile,
    electionYear, setElectionYear,
    uf, setUf,
    cargoFilter, setCargoFilter,
    urlInput, setUrlInput,
    urlYear, setUrlYear,
    urlCargo, setUrlCargo,
    activeTab, setActiveTab,

    errorsDialogJob, setErrorsDialogJob,
    validationDialogJob, setValidationDialogJob,
    batchesDialogJob, setBatchesDialogJob,

    validatingJobId,
    verifyingIntegrityJobId,
    cancellingJobId,
    restartingJobId,
    deletingJobId,
    deletingFilesJobId,
    reprocessingBatchId,

    historicalImportType, setHistoricalImportType,
    historicalUrl, setHistoricalUrl,
    historicalYear, setHistoricalYear,
    historicalCargo, setHistoricalCargo,

    showFileSelector, setShowFileSelector,
    availableFiles,
    selectedCsvFile, setSelectedCsvFile,
    pendingImportData, setPendingImportData,
    pendingImportSource,

    jobs, jobsLoading, refetchJobs,
    stats,
    jobErrors,
    validationStatus, validationLoading, refetchValidation,
    validationIssues, issuesLoading,
    queueStatus,
    importFiles, refetchFiles,
    batchesData, batchesLoading, refetchBatches,

    runValidationMutation,
    verifyIntegrityMutation,
    uploadMutation,
    urlImportMutation,
    detalheImportMutation,
    partidoImportMutation,
    previewFilesMutation,
    previewCandidatoFilesMutation,
    cancelJobMutation,
    restartJobMutation,
    deleteJobMutation,
    deleteFilesMutation,
    reprocessBatchMutation,
    reprocessAllFailedMutation,

    getQueueInfo,
    handleUpload,
    handleUrlImport,
    handleQuickImport,
    handleHistoricalImport,
    handleFileSelection,
  };
}
