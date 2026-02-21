import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AlertTriangle, Database, Trash2, Shield, Users, FileText, BarChart3, Loader2, CheckCircle, XCircle, RefreshCw, Wrench } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { queryClient } from "@/lib/queryClient";

interface DatabaseStats {
  users: number;
  parties: number;
  candidates: number;
  scenarios: number;
  simulations: number;
  importJobs: number;
  candidateVotes: number;
  forecasts: number;
  auditLogs: number;
}

const CONFIRMATION_PHRASE = "CONFIRMO ZERAR BANCO DE DADOS";

export default function AdminSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showFinalConfirmation, setShowFinalConfirmation] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState("");
  const [preserveAdmin, setPreserveAdmin] = useState(true);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DatabaseStats>({
    queryKey: ["/api/admin/database-stats"],
  });

  const resetDatabaseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/reset-database", {
        confirmationPhrase: CONFIRMATION_PHRASE,
        preserveAdmin,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Banco de dados zerado",
        description: data.message,
      });
      setShowFinalConfirmation(false);
      setShowResetDialog(false);
      setConfirmationInput("");
      queryClient.invalidateQueries();
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao zerar banco de dados",
        description: error.message || "Falha na operação",
        variant: "destructive",
      });
    },
  });

  const refreshSummariesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/analytics/refresh-summaries");
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Resumos atualizados",
        description: `Tabelas atualizadas em ${data.duration || 0}ms: ${(data.tables || []).join(", ")}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar resumos",
        description: error.message || "Falha na operação",
        variant: "destructive",
      });
    },
  });

  const totalRecords = stats 
    ? stats.users + stats.parties + stats.candidates + stats.scenarios + 
      stats.simulations + stats.importJobs + stats.candidateVotes + 
      stats.forecasts + stats.auditLogs
    : 0;

  const handleFirstConfirmation = () => {
    if (confirmationInput === CONFIRMATION_PHRASE) {
      setShowFinalConfirmation(true);
    } else {
      toast({
        title: "Frase incorreta",
        description: "A frase de confirmação não corresponde. Digite exatamente como indicado.",
        variant: "destructive",
      });
    }
  };

  const handleFinalReset = () => {
    resetDatabaseMutation.mutate();
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertTitle>Acesso Negado</AlertTitle>
          <AlertDescription>
            Apenas administradores podem acessar esta página.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Configurações do Sistema"
        description="Gerenciamento administrativo e manutenção do banco de dados"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "-" : stats?.users || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Partidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "-" : stats?.parties || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Candidatos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "-" : stats?.candidates || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Cenários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "-" : stats?.scenarios || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Votos Importados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "-" : (stats?.candidateVotes || 0).toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Importações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "-" : stats?.importJobs || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Manutenção do Sistema
          </CardTitle>
          <CardDescription>
            Ferramentas de manutenção e otimização do banco de dados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
            <div>
              <h4 className="font-medium">Atualizar Tabelas de Resumo</h4>
              <p className="text-sm text-muted-foreground">
                Recalcula os resumos de votos por partido, candidato e estado para acelerar as consultas de análise. 
                Isso acontece automaticamente após cada importação, mas pode ser feito manualmente se necessário.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => refreshSummariesMutation.mutate()}
              disabled={refreshSummariesMutation.isPending}
              data-testid="button-refresh-summaries"
              className="ml-4 shrink-0"
            >
              {refreshSummariesMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Atualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar Resumos
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
          <CardDescription>
            Operações críticas que afetam permanentemente o sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atenção!</AlertTitle>
            <AlertDescription>
              A operação de zerar o banco de dados é <strong>irreversível</strong>. 
              Todos os dados serão permanentemente apagados, incluindo usuários, partidos, 
              candidatos, cenários, simulações, importações do TSE e previsões.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <div>
              <h4 className="font-medium">Zerar Banco de Dados</h4>
              <p className="text-sm text-muted-foreground">
                Remove todos os {totalRecords.toLocaleString("pt-BR")} registros do sistema
              </p>
            </div>
            <Button 
              variant="destructive"
              onClick={() => setShowResetDialog(true)}
              data-testid="button-open-reset-dialog"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Zerar Banco de Dados
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showResetDialog} onOpenChange={(open) => {
        if (!open) {
          setShowResetDialog(false);
          setShowFinalConfirmation(false);
          setConfirmationInput("");
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Exclusão de Dados
            </DialogTitle>
            <DialogDescription>
              Esta ação é <strong>permanente e irreversível</strong>. Todos os dados serão apagados.
            </DialogDescription>
          </DialogHeader>

          {!showFinalConfirmation ? (
            <div className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Você está prestes a apagar:</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>{stats?.users || 0} usuários</li>
                    <li>{stats?.parties || 0} partidos</li>
                    <li>{stats?.candidates || 0} candidatos</li>
                    <li>{stats?.scenarios || 0} cenários</li>
                    <li>{stats?.simulations || 0} simulações</li>
                    <li>{stats?.importJobs || 0} importações do TSE</li>
                    <li>{(stats?.candidateVotes || 0).toLocaleString("pt-BR")} registros de votos</li>
                    <li>{stats?.forecasts || 0} previsões</li>
                    <li>{stats?.auditLogs || 0} logs de auditoria</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="preserve-admin" 
                    checked={preserveAdmin}
                    onCheckedChange={(checked) => setPreserveAdmin(checked as boolean)}
                    data-testid="checkbox-preserve-admin"
                  />
                  <Label htmlFor="preserve-admin" className="text-sm">
                    Manter meu usuário administrador após a exclusão
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmation-phrase">
                    Para confirmar, digite a frase abaixo:
                  </Label>
                  <p className="text-sm font-mono bg-muted p-2 rounded text-center select-all">
                    {CONFIRMATION_PHRASE}
                  </p>
                  <Input
                    id="confirmation-phrase"
                    value={confirmationInput}
                    onChange={(e) => setConfirmationInput(e.target.value)}
                    placeholder="Digite a frase de confirmação"
                    className="font-mono"
                    data-testid="input-confirmation-phrase"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setShowResetDialog(false)}>
                  Cancelar
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleFirstConfirmation}
                  disabled={confirmationInput !== CONFIRMATION_PHRASE}
                  data-testid="button-first-confirmation"
                >
                  Continuar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert variant="destructive" className="border-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>ÚLTIMA CONFIRMAÇÃO</AlertTitle>
                <AlertDescription className="font-medium">
                  Você tem certeza absoluta de que deseja apagar TODOS os dados do sistema?
                  Esta ação NÃO pode ser desfeita.
                </AlertDescription>
              </Alert>

              <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30 text-center">
                <p className="text-sm text-muted-foreground mb-2">Serão apagados permanentemente:</p>
                <p className="text-2xl font-bold text-destructive">
                  {totalRecords.toLocaleString("pt-BR")} registros
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowFinalConfirmation(false)}
                >
                  Voltar
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleFinalReset}
                  disabled={resetDatabaseMutation.isPending}
                  data-testid="button-final-reset"
                >
                  {resetDatabaseMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Apagando...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      SIM, APAGAR TUDO
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
