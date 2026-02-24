import { Loader2, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Download, Info } from "lucide-react";
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

interface ValidationDialogProps {
  hook: TseImportHook;
}

export function ValidationDialog({ hook }: ValidationDialogProps) {
  return (
    <Dialog open={!!hook.validationDialogJob} onOpenChange={(open) => !open && hook.setValidationDialogJob(null)}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Validação de Dados
          </DialogTitle>
          <DialogDescription>
            Arquivo: {hook.validationDialogJob?.filename} | Ano: {hook.validationDialogJob?.electionYear || "-"}
          </DialogDescription>
        </DialogHeader>

        {hook.validationLoading || hook.validatingJobId === hook.validationDialogJob?.id ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {hook.validatingJobId === hook.validationDialogJob?.id ? "Executando validação com IA..." : "Carregando resultados..."}
            </p>
          </div>
        ) : hook.validationStatus?.hasValidation ? (
          <div className="space-y-6">
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const report = {
                    arquivo: hook.validationDialogJob?.filename,
                    ano: hook.validationDialogJob?.electionYear,
                    uf: hook.validationDialogJob?.uf,
                    dataValidacao: hook.validationStatus?.completedAt,
                    score: hook.validationStatus?.aiAnalysis?.overallDataQuality?.score,
                    avaliacao: hook.validationStatus?.aiAnalysis?.overallDataQuality?.assessment,
                    registrosVerificados: hook.validationStatus?.totalRecordsChecked,
                    problemasEncontrados: hook.validationStatus?.issuesFound,
                    descobertas: hook.validationStatus?.aiAnalysis?.overallDataQuality?.keyFindings,
                    riscos: hook.validationStatus?.aiAnalysis?.overallDataQuality?.risksIdentified,
                    analise: hook.validationStatus?.aiAnalysis?.analysis,
                    recomendacoes: hook.validationStatus?.aiAnalysis?.recommendations,
                    resumoPorSeveridade: hook.validationStatus?.summary?.bySeverity,
                    resumoPorTipo: hook.validationStatus?.summary?.byType,
                  };
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `validacao_ia_${hook.validationDialogJob?.id}_${new Date().toISOString().split("T")[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                data-testid="button-export-validation-json"
              >
                <Download className="h-4 w-4 mr-1" />
                Exportar Relatório
              </Button>
            </div>

            {hook.validationStatus?.aiAnalysis?.overallDataQuality && (
              <Card className={
                hook.validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? "border-green-500/50 bg-green-500/5" :
                hook.validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? "border-yellow-500/50 bg-yellow-500/5" :
                "border-destructive/50 bg-destructive/5"
              }>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {hook.validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : hook.validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? (
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
                          hook.validationStatus.aiAnalysis.overallDataQuality.score >= 80 ? "default" :
                          hook.validationStatus.aiAnalysis.overallDataQuality.score >= 60 ? "secondary" :
                          "destructive"
                        }
                        className="text-lg px-4 py-1"
                      >
                        {hook.validationStatus.aiAnalysis.overallDataQuality.score}/100
                      </Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 rounded-lg bg-background border">
                    <p className="text-sm leading-relaxed">{hook.validationStatus.aiAnalysis.overallDataQuality.assessment}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {hook.validationStatus.aiAnalysis.overallDataQuality.keyFindings.length > 0 && (
                      <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <h4 className="font-medium mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-400">
                          <Info className="h-4 w-4" />
                          Principais Descobertas
                        </h4>
                        <ul className="space-y-2">
                          {hook.validationStatus.aiAnalysis.overallDataQuality.keyFindings.map((finding, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-blue-500 mt-1">•</span>
                              <span>{finding}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {hook.validationStatus.aiAnalysis.overallDataQuality.risksIdentified.length > 0 && (
                      <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                        <h4 className="font-medium mb-3 flex items-center gap-2 text-destructive">
                          <AlertTriangle className="h-4 w-4" />
                          Riscos Identificados
                        </h4>
                        <ul className="space-y-2">
                          {hook.validationStatus.aiAnalysis.overallDataQuality.risksIdentified.map((risk, i) => (
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
                  <p className="text-3xl font-bold">{hook.validationStatus?.totalRecordsChecked?.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-muted-foreground">Registros Verificados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{hook.validationStatus?.issuesFound || 0}</p>
                  <p className="text-xs text-muted-foreground">Problemas Encontrados</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold text-destructive">
                    {hook.validationStatus?.summary?.bySeverity?.["error"] || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Erros Críticos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold text-yellow-600">
                    {hook.validationStatus?.summary?.bySeverity?.["warning"] || 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Avisos</p>
                </CardContent>
              </Card>
            </div>

            {hook.validationStatus?.summary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Distribuição de Problemas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium mb-3">Por Severidade</h4>
                      <div className="space-y-2">
                        {Object.entries(hook.validationStatus.summary.bySeverity).sort((a, b) => {
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
                                style={{ width: `${Math.min(100, (count / (hook.validationStatus?.issuesFound || 1)) * 100)}%` }}
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
                        {Object.entries(hook.validationStatus.summary.byType)
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

            {hook.validationStatus?.aiAnalysis?.analysis && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Análise Detalhada da IA
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg bg-muted/50 border">
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{hook.validationStatus.aiAnalysis.analysis}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {hook.validationStatus?.aiAnalysis?.recommendations && hook.validationStatus.aiAnalysis.recommendations.length > 0 && (
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
                    {hook.validationStatus.aiAnalysis.recommendations.map((rec, i) => (
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

            {hook.validationIssues && hook.validationIssues.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="issues">
                  <AccordionTrigger className="text-base">
                    Lista Completa de Problemas ({hook.validationIssues.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="mb-3 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const csvContent = [
                            ["Severidade", "Tipo", "Categoria", "Linha", "Campo", "Valor Atual", "Mensagem", "Ação Sugerida", "Confiança"].join(";"),
                            ...(hook.validationIssues || []).map(issue => [
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
                          a.download = `problemas_validacao_${hook.validationDialogJob?.id}_${new Date().toISOString().split("T")[0]}.csv`;
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
                        {hook.validationIssues.slice(0, 50).map((issue) => (
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
                    {hook.validationIssues.length > 50 && (
                      <p className="text-sm text-muted-foreground mt-3 text-center">
                        Mostrando os primeiros 50 de {hook.validationIssues.length} problemas. Exporte o CSV para ver todos.
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
                if (hook.validationDialogJob) {
                  hook.runValidationMutation.mutate(hook.validationDialogJob.id);
                }
              }}
              disabled={hook.runValidationMutation.isPending}
              data-testid="button-run-validation-dialog"
            >
              {hook.runValidationMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Validando...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" />Executar Validação com IA</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
