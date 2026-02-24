import { CheckCircle, XCircle, Clock, Loader2, Download, AlertTriangle, StopCircle, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  formatFileSize,
  formatElapsedTime,
  calculateProcessingSpeed,
  calculateETA,
  getStageDescription,
} from "@/hooks/use-tse-import";
import type { QueueStatus } from "@/hooks/use-tse-import";
import type { TseImportJob } from "@shared/schema";

export function getStatusBadge(
  status: string,
  jobId: number | undefined,
  queueStatus: QueueStatus | undefined
) {
  const getQueueInfo = (id: number) => {
    if (!queueStatus) return { position: null, isProcessing: false };
    const item = queueStatus.queue.find(q => q.jobId === id);
    if (!item) return { position: null, isProcessing: false };
    return {
      position: item.position > 0 ? item.position : null,
      isProcessing: item.isProcessing ?? false
    };
  };

  const queueInfo = jobId ? getQueueInfo(jobId) : { position: null, isProcessing: false };

  switch (status) {
    case "pending":
      if (queueInfo.isProcessing) {
        return <Badge variant="default"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Iniciando...</Badge>;
      }
      if (queueInfo.position !== null) {
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Na fila ({queueInfo.position}º)</Badge>;
      }
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
    case "queued":
      if (queueInfo.position !== null) {
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Na fila ({queueInfo.position}º)</Badge>;
      }
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Na fila</Badge>;
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
}

export function getProgressDisplay(job: TseImportJob) {
  const downloadedBytes = Number(job.downloadedBytes) || 0;
  const speed = calculateProcessingSpeed(job);
  const eta = calculateETA(job, speed);

  if (job.status === "downloading") {
    if (job.fileSize > 0) {
      const percent = Math.min(100, (downloadedBytes / job.fileSize) * 100);
      const downloadSpeed = job.startedAt
        ? Math.round(downloadedBytes / ((Date.now() - new Date(job.startedAt).getTime()) / 1000))
        : 0;
      return (
        <div className="w-44 space-y-1">
          <Progress value={percent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="font-medium">{percent.toFixed(0)}%</span>
            <span>{formatFileSize(downloadedBytes)} / {formatFileSize(job.fileSize)}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {downloadSpeed > 0 && (
              <span className="flex items-center gap-1">
                <Download className="h-3 w-3" />
                {formatFileSize(downloadSpeed)}/s
              </span>
            )}
            {job.startedAt && <span>{formatElapsedTime(job.startedAt)}</span>}
          </div>
        </div>
      );
    }
    return (
      <div className="w-44 space-y-1">
        <Progress value={0} className="h-2 animate-pulse" />
        <p className="text-xs text-muted-foreground">Iniciando download...</p>
      </div>
    );
  }

  if (job.status === "extracting") {
    return (
      <div className="w-44 space-y-1">
        <Progress value={100} className="h-2 animate-pulse" />
        <p className="text-xs text-muted-foreground font-medium">Extraindo ZIP...</p>
        {job.startedAt && (
          <p className="text-xs text-muted-foreground">{formatElapsedTime(job.startedAt)}</p>
        )}
      </div>
    );
  }

  if (job.status === "running" || job.status === "processing") {
    const processed = job.processedRows || 0;
    const skipped = job.skippedRows || 0;
    const totalRows = job.totalFileRows || job.totalRows || 0;
    const totalProcessed = processed + skipped;
    const percent = totalRows > 0 ? Math.min(100, (totalProcessed / totalRows) * 100) : 0;

    return (
      <div className="w-44 space-y-1">
        {totalRows > 0 ? (
          <>
            <Progress value={percent} className="h-2" />
            <div className="flex justify-between text-xs">
              <span className="font-medium text-primary">{percent.toFixed(1)}%</span>
              <span className="text-muted-foreground">
                {totalProcessed.toLocaleString("pt-BR")} / {totalRows.toLocaleString("pt-BR")}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="text-sm font-medium">{processed.toLocaleString("pt-BR")}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {speed && speed > 0 && (
            <span className="flex items-center gap-0.5">
              <Play className="h-3 w-3" />
              {speed.toLocaleString("pt-BR")}/s
            </span>
          )}
          {eta && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {eta}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
          {processed > 0 && (
            <span className="text-green-600">{processed.toLocaleString("pt-BR")} inseridas</span>
          )}
          {skipped > 0 && (
            <span className="text-amber-600">{skipped.toLocaleString("pt-BR")} ignoradas</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground italic truncate">
          {getStageDescription(job)}
        </p>
      </div>
    );
  }

  if (job.status === "completed") {
    const duration = job.startedAt && job.completedAt
      ? Math.floor((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
      : null;
    const processed = job.processedRows || 0;
    const skipped = job.skippedRows || 0;
    const avgSpeed = duration && duration > 0 ? Math.round((processed + skipped) / duration) : null;
    const allDuplicates = processed === 0 && skipped > 0;

    return (
      <div className="w-44 space-y-1">
        <div className="flex items-center gap-1">
          {allDuplicates ? (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-600">Já importado</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">Concluído</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-x-2 text-xs">
          {processed > 0 && (
            <span className="text-green-600">{processed.toLocaleString("pt-BR")} inseridas</span>
          )}
          {skipped > 0 && (
            <span className={allDuplicates ? "text-amber-600" : "text-muted-foreground"}>
              {skipped.toLocaleString("pt-BR")} {allDuplicates ? "duplicadas" : "ignoradas"}
            </span>
          )}
        </div>
        {job.validationMessage && (
          <p className="text-xs text-muted-foreground italic truncate" title={job.validationMessage}>
            {job.validationMessage.substring(0, 50)}...
          </p>
        )}
        {!job.validationMessage && duration !== null && (
          <p className="text-xs text-muted-foreground">
            {duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`}
            {avgSpeed && ` • ${avgSpeed.toLocaleString("pt-BR")}/s`}
          </p>
        )}
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="w-44 space-y-1">
        <div className="flex items-center gap-1">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Erro</span>
        </div>
        {(job.processedRows || 0) > 0 && (
          <p className="text-xs text-muted-foreground">
            {(job.processedRows || 0).toLocaleString("pt-BR")} processadas
          </p>
        )}
      </div>
    );
  }

  if (job.status === "pending") {
    return (
      <div className="w-44 space-y-1">
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Aguardando</span>
        </div>
      </div>
    );
  }

  return <span className="text-sm text-muted-foreground">-</span>;
}
