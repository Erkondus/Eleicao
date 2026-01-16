import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Database, Link, Download } from "lucide-react";
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
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/queryClient";
import type { TseImportJob, TseImportError } from "@shared/schema";

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

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = useQuery<TseImportJob[]>({
    queryKey: ["/api/imports/tse"],
    refetchInterval: 5000,
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
        return <Badge variant="default"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processando</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="h-3 w-3 mr-1" />Concluído</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
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
                      {job.status === "running" && job.totalRows && job.totalRows > 0 ? (
                        <div className="w-24">
                          <Progress value={(job.processedRows || 0) / job.totalRows * 100} className="h-2" />
                          <p className="text-xs text-muted-foreground mt-1">
                            {((job.processedRows || 0) / job.totalRows * 100).toFixed(0)}%
                          </p>
                        </div>
                      ) : job.status === "completed" ? (
                        <span className="text-sm">{(job.processedRows || 0).toLocaleString("pt-BR")} linhas</span>
                      ) : (
                        "-"
                      )}
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
    </div>
  );
}
