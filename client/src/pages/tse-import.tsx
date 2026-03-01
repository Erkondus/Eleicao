import { Database, Wifi, WifiOff, XCircle, CheckCircle, Download, AlertTriangle, FileText, Files } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/page-header";
import { useTseImport } from "@/hooks/use-tse-import";
import { ImportControls } from "./tse-import/ImportControls";
import { HistoricalImport } from "./tse-import/HistoricalImport";
import { JobsTable } from "./tse-import/JobsTable";
import { BatchDialog } from "./tse-import/BatchDialog";
import { ValidationDialog } from "./tse-import/ValidationDialog";

export default function TseImport() {
  const hook = useTseImport();

  if (!hook.hasPermission("manage_users")) {
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
      <div className="flex items-center justify-between">
        <PageHeader
          title="Importação de Dados TSE"
          description="Importe dados de candidatos de eleições passadas a partir dos arquivos CSV do TSE"
        />
        <div className="flex items-center gap-2">
          {hook.wsConnected ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <Wifi className="h-3 w-3 mr-1" />
              Tempo Real
            </Badge>
          ) : (
            <Badge variant="secondary">
              <WifiOff className="h-3 w-3 mr-1" />
              Offline
            </Badge>
          )}
        </div>
      </div>

      <ImportControls hook={hook} />

      <div className="grid gap-6 md:grid-cols-2">
        <HistoricalImport hook={hook} />
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
            {hook.stats ? (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold font-mono" data-testid="text-candidate-records">{hook.stats.totalRecords.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-muted-foreground">Votos por Candidato</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold font-mono" data-testid="text-party-records">{(hook.stats.totalPartyRecords || 0).toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-muted-foreground">Votos por Partido</p>
                  </div>
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <p className="text-2xl font-bold font-mono" data-testid="text-stat-records">{(hook.stats.totalStatRecords || 0).toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-muted-foreground">Estatísticas Eleitorais</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="text-center p-2 border rounded">
                    <p className="font-bold">{hook.stats.years.length}</p>
                    <p className="text-xs text-muted-foreground">Anos</p>
                  </div>
                  <div className="text-center p-2 border rounded">
                    <p className="font-bold">{hook.stats.ufs.length}</p>
                    <p className="text-xs text-muted-foreground">UFs</p>
                  </div>
                  <div className="text-center p-2 border rounded">
                    <p className="font-bold">{hook.stats.cargos.length}</p>
                    <p className="text-xs text-muted-foreground">Cargos</p>
                  </div>
                </div>
                {hook.stats.years.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Anos disponíveis:</p>
                    <div className="flex flex-wrap gap-1">
                      {hook.stats.years.slice(0, 10).map((year) => (
                        <Badge key={year} variant="outline">{year}</Badge>
                      ))}
                      {hook.stats.years.length > 10 && (
                        <Badge variant="secondary">+{hook.stats.years.length - 10}</Badge>
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

      <JobsTable hook={hook} />

      <Dialog open={!!hook.errorsDialogJob} onOpenChange={(open) => !open && hook.setErrorsDialogJob(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Relatório de Erros de Importação
            </DialogTitle>
            <DialogDescription>
              Arquivo: {hook.errorsDialogJob?.filename} | Ano: {hook.errorsDialogJob?.electionYear || "-"} | UF: {hook.errorsDialogJob?.uf || "-"}
            </DialogDescription>
          </DialogHeader>

          {hook.jobErrors && hook.jobErrors.length > 0 ? (
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
                          ...(hook.jobErrors || []).map(e => [
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
                        a.download = `erros_importacao_${hook.errorsDialogJob?.id}_${new Date().toISOString().split("T")[0]}.csv`;
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
                      <p className="text-2xl font-bold text-destructive">{hook.jobErrors.length}</p>
                      <p className="text-xs text-muted-foreground">Total de Erros</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold">{new Set(hook.jobErrors.map(e => e.errorType)).size}</p>
                      <p className="text-xs text-muted-foreground">Tipos Diferentes</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold">
                        {hook.jobErrors.filter(e => e.rowNumber).length > 0
                          ? Math.min(...hook.jobErrors.filter(e => e.rowNumber).map(e => e.rowNumber!))
                          : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">Primeira Linha</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-background">
                      <p className="text-2xl font-bold">
                        {hook.jobErrors.filter(e => e.rowNumber).length > 0
                          ? Math.max(...hook.jobErrors.filter(e => e.rowNumber).map(e => e.rowNumber!))
                          : "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">Última Linha</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Distribuição por Tipo de Erro:</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(
                        hook.jobErrors.reduce((acc, e) => {
                          acc[e.errorType || "desconhecido"] = (acc[e.errorType || "desconhecido"] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                        <Badge key={type} variant="destructive" className="text-xs">
                          {type}: {count} ({((count / hook.jobErrors!.length) * 100).toFixed(1)}%)
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
                  {Array.from(new Set(hook.jobErrors.map(e => e.errorType))).slice(0, 5).map(errorType => (
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
                    Detalhes dos Erros ({Math.min(100, hook.jobErrors.length)} de {hook.jobErrors.length})
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
                        {hook.jobErrors.slice(0, 100).map((error) => (
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
                    {hook.jobErrors.length > 100 && (
                      <p className="text-sm text-muted-foreground mt-3 text-center">
                        Mostrando os primeiros 100 erros. Exporte o CSV para ver todos os {hook.jobErrors.length} erros.
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

      <ValidationDialog hook={hook} />
      <BatchDialog hook={hook} />

      <Dialog open={hook.showFileSelector} onOpenChange={(open) => { if (!open) hook.setShowFileSelector(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Files className="h-5 w-5" />
              Selecionar Arquivo por UF
            </DialogTitle>
            <DialogDescription>
              O arquivo ZIP contém {hook.availableFiles.length} arquivos CSV (um por UF).
              Selecione uma UF para importar ou importe todos de uma vez.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            <RadioGroup
              value={hook.selectedCsvFile}
              onValueChange={hook.setSelectedCsvFile}
              className="space-y-1 p-1"
            >
              {hook.availableFiles.map((file) => {
                const ufMatch = file.name.match(/_([A-Z]{2})\.csv$/i);
                const ufLabel = ufMatch ? ufMatch[1] : file.name;
                return (
                  <div key={file.path} className="flex items-center space-x-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => hook.setSelectedCsvFile(file.name)}>
                    <RadioGroupItem value={file.name} id={`file-${file.name}`} data-testid={`radio-file-${ufLabel}`} />
                    <Label htmlFor={`file-${file.name}`} className="flex items-center gap-2 cursor-pointer flex-1">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{ufLabel}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{file.name}</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </ScrollArea>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={hook.handleImportAll}
              data-testid="button-import-all-files"
            >
              <Files className="h-4 w-4 mr-2" />
              Importar Todos
            </Button>
            <Button
              onClick={hook.handleFileSelection}
              disabled={!hook.selectedCsvFile}
              data-testid="button-import-selected-file"
            >
              <Download className="h-4 w-4 mr-2" />
              Importar Selecionado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
