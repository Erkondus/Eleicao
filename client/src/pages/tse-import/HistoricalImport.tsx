import { Layers, Download, Loader2, FileText, FileSearch, CheckCircle, Files } from "lucide-react";
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
import { generateHistoricalUrl } from "@/hooks/use-tse-import";
import type { useTseImport } from "@/hooks/use-tse-import";

type TseImportHook = ReturnType<typeof useTseImport>;

interface HistoricalImportProps {
  hook: TseImportHook;
}

export function HistoricalImport({ hook }: HistoricalImportProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Importar Dados Eleitorais Históricos
          </CardTitle>
          <CardDescription>
            Importe estatísticas de votação e votos por partido para cálculo preciso de distribuição de vagas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Arquivo</Label>
            <Select value={hook.historicalImportType} onValueChange={(v) => hook.setHistoricalImportType(v as "detalhe" | "partido")}>
              <SelectTrigger data-testid="select-historical-type">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="detalhe">Detalhe Votação (Totais: aptos, votos válidos, brancos, nulos)</SelectItem>
                <SelectItem value="partido">Votação Partido (Votos por partido/legenda)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Importação Rápida</Label>
            <div className="flex flex-wrap gap-2">
              {[2024, 2022, 2020, 2018, 2016].map((year) => (
                <Button
                  key={year}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    hook.setHistoricalUrl(generateHistoricalUrl(String(year), hook.historicalImportType));
                    hook.setHistoricalYear(String(year));
                  }}
                  data-testid={`button-historical-quick-${year}`}
                >
                  {year}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {hook.historicalImportType === "detalhe"
                ? "Dados de totais: eleitores aptos, comparecimento, votos válidos, brancos, nulos"
                : "Dados de votos: votos nominais e de legenda por partido, federações e coligações"}
            </p>
          </div>

          <div className="space-y-2">
            <Label>URL do Arquivo</Label>
            <Input
              placeholder="https://cdn.tse.jus.br/estatistica/sead/odsele/..."
              value={hook.historicalUrl}
              onChange={(e) => hook.setHistoricalUrl(e.target.value)}
              data-testid="input-historical-url"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ano da Eleição</Label>
              <Input
                placeholder="Ex: 2022"
                value={hook.historicalYear}
                onChange={(e) => hook.setHistoricalYear(e.target.value)}
                data-testid="input-historical-year"
              />
            </div>
            <div className="space-y-2">
              <Label>Filtrar por Cargo</Label>
              <Select value={hook.historicalCargo} onValueChange={hook.setHistoricalCargo}>
                <SelectTrigger data-testid="select-historical-cargo">
                  <SelectValue placeholder="Todos os cargos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cargos</SelectItem>
                  <SelectItem value="13">Vereador (13)</SelectItem>
                  <SelectItem value="11">Prefeito (11)</SelectItem>
                  <SelectItem value="7">Deputado Federal (7)</SelectItem>
                  <SelectItem value="8">Deputado Estadual (8)</SelectItem>
                  <SelectItem value="5">Senador (5)</SelectItem>
                  <SelectItem value="3">Governador (3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={hook.handleHistoricalImport}
            disabled={!hook.historicalUrl || hook.detalheImportMutation.isPending || hook.partidoImportMutation.isPending || hook.previewFilesMutation.isPending}
            className="w-full"
            data-testid="button-import-historical"
          >
            {hook.previewFilesMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando arquivos...</>
            ) : (hook.detalheImportMutation.isPending || hook.partidoImportMutation.isPending) ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Importar Dados Históricos</>
            )}
          </Button>
        </CardContent>
      </Card>

      {hook.showFileSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" data-testid="dialog-file-selector">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5" />
                Selecionar Arquivo CSV
              </CardTitle>
              <CardDescription>
                O ZIP contém {hook.availableFiles.length} arquivos CSV (um por UF). 
                Importe todos de uma vez ou selecione um arquivo específico:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={hook.handleImportAll}
                className="w-full"
                data-testid="button-import-all-files"
              >
                <Files className="h-4 w-4 mr-2" />
                Importar Todos os {hook.availableFiles.length} Arquivos (Dados Nacionais)
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">ou selecione um arquivo</span>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {hook.availableFiles.map((file) => (
                  <label
                    key={file.path}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      hook.selectedCsvFile === file.path ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                    }`}
                    data-testid={`file-option-${file.name}`}
                  >
                    <input
                      type="radio"
                      name="selectedCsvFile"
                      value={file.path}
                      checked={hook.selectedCsvFile === file.path}
                      onChange={(e) => hook.setSelectedCsvFile(e.target.value)}
                      className="sr-only"
                    />
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      {file.size > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      )}
                    </div>
                    {hook.selectedCsvFile === file.path && (
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    hook.setShowFileSelector(false);
                    hook.setSelectedCsvFile("");
                    hook.setPendingImportData(null);
                  }}
                  className="flex-1"
                  data-testid="button-cancel-file-selection"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={hook.handleFileSelection}
                  disabled={!hook.selectedCsvFile}
                  className="flex-1"
                  data-testid="button-confirm-file-selection"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Importar Arquivo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
