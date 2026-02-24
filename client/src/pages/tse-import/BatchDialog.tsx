import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle, Layers, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { useTseImport } from "@/hooks/use-tse-import";

type TseImportHook = ReturnType<typeof useTseImport>;

interface BatchDialogProps {
  hook: TseImportHook;
}

export function BatchDialog({ hook }: BatchDialogProps) {
  return (
    <Dialog open={!!hook.batchesDialogJob} onOpenChange={(open) => !open && hook.setBatchesDialogJob(null)}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Lotes de Importação
          </DialogTitle>
          <DialogDescription>
            {hook.batchesDialogJob?.filename} - Histórico detalhado de processamento por lotes
          </DialogDescription>
        </DialogHeader>

        {hook.batchesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : hook.batchesData ? (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold">{hook.batchesData.stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total de Lotes</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{hook.batchesData.stats.completed}</div>
                  <div className="text-sm text-muted-foreground">Concluídos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{hook.batchesData.stats.failed}</div>
                  <div className="text-sm text-muted-foreground">Falharam</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold">{hook.batchesData.stats.processedRows.toLocaleString("pt-BR")}</div>
                  <div className="text-sm text-muted-foreground">Linhas Processadas</div>
                </CardContent>
              </Card>
            </div>

            {hook.batchesData.stats.failed > 0 && (
              <div className="flex justify-end">
                <Button
                  onClick={() => hook.batchesDialogJob && hook.reprocessAllFailedMutation.mutate(hook.batchesDialogJob.id)}
                  disabled={hook.reprocessAllFailedMutation.isPending}
                  variant="outline"
                  data-testid="button-reprocess-all-failed"
                >
                  {hook.reprocessAllFailedMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Reprocessando...</>
                  ) : (
                    <><RotateCw className="h-4 w-4 mr-2" />Reprocessar Todos os Lotes Falhos</>
                  )}
                </Button>
              </div>
            )}

            {hook.batchesData.batches.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lote</TableHead>
                    <TableHead>Linhas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Processadas</TableHead>
                    <TableHead>Inseridas</TableHead>
                    <TableHead>Erros</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hook.batchesData.batches.map((batch) => (
                    <TableRow key={batch.id} data-testid={`row-batch-${batch.id}`}>
                      <TableCell className="font-medium">
                        #{batch.batchIndex + 1}
                      </TableCell>
                      <TableCell>
                        {batch.rowStart.toLocaleString("pt-BR")} - {batch.rowEnd.toLocaleString("pt-BR")}
                        <span className="text-xs text-muted-foreground ml-1">
                          ({batch.totalRows.toLocaleString("pt-BR")})
                        </span>
                      </TableCell>
                      <TableCell>
                        {batch.status === "completed" && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />Concluído
                          </Badge>
                        )}
                        {batch.status === "failed" && (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />Falhou
                          </Badge>
                        )}
                        {batch.status === "processing" && (
                          <Badge variant="default">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />Processando
                          </Badge>
                        )}
                        {batch.status === "pending" && (
                          <Badge variant="secondary">
                            <Clock className="h-3 w-3 mr-1" />Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {(batch.processedRows ?? 0).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {(batch.insertedRows ?? 0).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {(batch.errorCount ?? 0) > 0 ? (
                          <span className="text-red-600 font-medium">{batch.errorCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {batch.startedAt && batch.completedAt ? (
                          (() => {
                            const duration = Math.floor(
                              (new Date(batch.completedAt).getTime() - new Date(batch.startedAt).getTime()) / 1000
                            );
                            return duration < 60 ? `${duration}s` : `${Math.floor(duration / 60)}m ${duration % 60}s`;
                          })()
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {batch.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => hook.batchesDialogJob && hook.reprocessBatchMutation.mutate({
                              jobId: hook.batchesDialogJob.id,
                              batchId: batch.id
                            })}
                            disabled={hook.reprocessingBatchId === batch.id}
                            title="Reprocessar lote"
                            data-testid={`button-reprocess-batch-${batch.id}`}
                          >
                            {hook.reprocessingBatchId === batch.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <><RotateCw className="h-4 w-4 mr-1" />Reprocessar</>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum lote registrado para esta importação.</p>
                <p className="text-sm mt-2">
                  Os lotes são criados durante o processamento de novas importações.
                </p>
              </div>
            )}

            {hook.batchesData.batches.filter(b => b.status === "failed" && b.errorSummary).length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="error-details">
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      Detalhes dos Erros
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {hook.batchesData.batches
                        .filter(b => b.status === "failed" && b.errorSummary)
                        .map((batch) => (
                          <div key={batch.id} className="p-3 bg-muted rounded-md">
                            <div className="font-medium mb-1">Lote #{batch.batchIndex + 1}</div>
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {batch.errorSummary}
                            </div>
                          </div>
                        ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Erro ao carregar dados dos lotes.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
