import { Upload, Link, Download, Loader2 } from "lucide-react";
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
import { ELECTION_YEARS, UFS, CARGOS, formatFileSize } from "@/hooks/use-tse-import";
import type { useTseImport } from "@/hooks/use-tse-import";

type TseImportHook = ReturnType<typeof useTseImport>;

interface ImportControlsProps {
  hook: TseImportHook;
}

export function ImportControls({ hook }: ImportControlsProps) {
  return (
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
              onChange={(e) => hook.setSelectedFile(e.target.files?.[0] || null)}
              data-testid="input-csv-file"
            />
            {hook.selectedFile && (
              <p className="text-sm text-muted-foreground">
                {hook.selectedFile.name} ({formatFileSize(hook.selectedFile.size)})
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Ano da Eleição (opcional)</Label>
              <Select value={hook.electionYear} onValueChange={hook.setElectionYear}>
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
              <Select value={hook.uf} onValueChange={hook.setUf}>
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
            <Select value={hook.cargoFilter} onValueChange={hook.setCargoFilter}>
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
            onClick={hook.handleUpload}
            disabled={!hook.selectedFile || hook.uploadMutation.isPending}
            className="w-full"
            data-testid="button-upload"
          >
            {hook.uploadMutation.isPending ? (
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
                  onClick={() => hook.handleQuickImport(String(year))}
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
              value={hook.urlInput}
              onChange={(e) => hook.setUrlInput(e.target.value)}
              data-testid="input-tse-url"
            />
            <p className="text-xs text-muted-foreground">
              Cole a URL de um arquivo .zip do repositório de dados abertos do TSE
            </p>
          </div>

          <div className="space-y-2">
            <Label>Ano da Eleição</Label>
            <Select value={hook.urlYear} onValueChange={hook.setUrlYear}>
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
            <Select value={hook.urlCargo} onValueChange={hook.setUrlCargo}>
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
            onClick={hook.handleUrlImport}
            disabled={!hook.urlInput || hook.urlImportMutation.isPending || hook.previewCandidatoFilesMutation.isPending}
            className="w-full"
            data-testid="button-import-url"
          >
            {hook.previewCandidatoFilesMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verificando arquivos...</>
            ) : hook.urlImportMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Iniciando...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Baixar e Importar</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
