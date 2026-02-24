import { FileText, RefreshCw, Loader2, CheckCircle, XCircle, ShieldCheck, Layers, StopCircle, RotateCcw, Trash2, HardDrive, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFileSize, formatDate, isJobInProgress, isJobRestartable } from "@/hooks/use-tse-import";
import { getStatusBadge, getProgressDisplay } from "./ProgressMonitor";
import type { useTseImport } from "@/hooks/use-tse-import";

type TseImportHook = ReturnType<typeof useTseImport>;

interface JobsTableProps {
  hook: TseImportHook;
}

export function JobsTable({ hook }: JobsTableProps) {
  return (
    <Tabs value={hook.activeTab} onValueChange={(v) => hook.setActiveTab(v as "imports" | "files")} className="w-full">
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
            <div className="flex items-center gap-2">
              {hook.queueStatus && (hook.queueStatus.isProcessing || hook.queueStatus.queueLength > 0) && (
                <Badge variant="outline" className="text-blue-600 border-blue-600">
                  <Layers className="h-3 w-3 mr-1" />
                  Fila: {hook.queueStatus.queueLength} aguardando
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={() => hook.refetchJobs()} data-testid="button-refresh">
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {hook.jobsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : hook.jobs && hook.jobs.length > 0 ? (
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
                  {hook.jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={job.filename}>
                        {job.filename}
                      </TableCell>
                      <TableCell>{formatFileSize(job.fileSize)}</TableCell>
                      <TableCell>{job.electionYear || "-"}</TableCell>
                      <TableCell>{job.uf || "-"}</TableCell>
                      <TableCell>{getStatusBadge(job.status, job.id, hook.queueStatus)}</TableCell>
                      <TableCell>
                        {getProgressDisplay(job)}
                      </TableCell>
                      <TableCell>
                        {(job.errorCount || 0) > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => hook.setErrorsDialogJob(job)}
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
                                onClick={() => hook.verifyIntegrityMutation.mutate(job.id)}
                                disabled={hook.verifyingIntegrityJobId === job.id}
                                data-testid={`button-verify-integrity-${job.id}`}
                              >
                                {hook.verifyingIntegrityJobId === job.id ? (
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
                              onClick={() => hook.setValidationDialogJob(job)}
                              data-testid={`button-view-validation-${job.id}`}
                            >
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => hook.runValidationMutation.mutate(job.id)}
                              disabled={hook.validatingJobId === job.id}
                              data-testid={`button-run-validation-${job.id}`}
                            >
                              {hook.validatingJobId === job.id ? (
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => hook.setBatchesDialogJob(job)}
                            title="Ver lotes de importação"
                            data-testid={`button-view-batches-${job.id}`}
                          >
                            <Layers className="h-4 w-4 text-blue-500" />
                          </Button>
                          {isJobInProgress(job.status) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => hook.cancelJobMutation.mutate(job.id)}
                              disabled={hook.cancellingJobId === job.id}
                              title="Cancelar importação"
                              data-testid={`button-cancel-job-${job.id}`}
                            >
                              {hook.cancellingJobId === job.id ? (
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
                              onClick={() => hook.restartJobMutation.mutate(job.id)}
                              disabled={hook.restartingJobId === job.id}
                              title="Reiniciar importação"
                              data-testid={`button-restart-job-${job.id}`}
                            >
                              {hook.restartingJobId === job.id ? (
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
                                  hook.deleteJobMutation.mutate(job.id);
                                }
                              }}
                              disabled={hook.deletingJobId === job.id}
                              title="Excluir importação"
                              data-testid={`button-delete-job-${job.id}`}
                            >
                              {hook.deletingJobId === job.id ? (
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
            <Button variant="outline" size="sm" onClick={() => hook.refetchFiles()} data-testid="button-refresh-files">
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            {!hook.importFiles || hook.importFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum arquivo temporário encontrado</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hook.importFiles.map((group) => (
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
                            hook.deleteFilesMutation.mutate(group.jobId);
                          }
                        }}
                        disabled={hook.deletingFilesJobId === group.jobId}
                        data-testid={`button-delete-files-${group.jobId}`}
                      >
                        {hook.deletingFilesJobId === group.jobId ? (
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
  );
}
