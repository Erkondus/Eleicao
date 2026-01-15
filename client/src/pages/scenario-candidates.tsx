import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Plus, Trash2, Users, Search, Database, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Scenario, Candidate, Party, ScenarioCandidate } from "@shared/schema";

type ScenarioCandidateWithDetails = ScenarioCandidate & {
  candidate: Candidate;
  party: Party;
};

type TseCandidate = {
  nmCandidato: string | null;
  nmUrnaCandidato: string | null;
  nrCandidato: number | null;
  sgPartido: string | null;
  nmPartido: string | null;
  nrPartido: number | null;
  anoEleicao: number | null;
  sgUf: string | null;
  dsCargo: string | null;
  qtVotosNominais: number | null;
};

type TseStats = {
  totalRecords: number;
  years: number[];
  ufs: string[];
  cargos: { code: number; name: string }[];
};

export default function ScenarioCandidates() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [tseSearchQuery, setTseSearchQuery] = useState("");
  const [tseSearchResults, setTseSearchResults] = useState<TseCandidate[]>([]);
  const [isTseSearching, setIsTseSearching] = useState(false);
  const [showTseResults, setShowTseResults] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("");

  const [formData, setFormData] = useState({
    candidateId: "",
    partyId: "",
    ballotNumber: "",
    nickname: "",
    votes: "0",
  });

  const { data: scenario } = useQuery<Scenario>({
    queryKey: ["/api/scenarios", scenarioId],
    enabled: !!scenarioId,
  });

  const { data: scenarioCandidates, isLoading } = useQuery<ScenarioCandidateWithDetails[]>({
    queryKey: ["/api/scenarios", scenarioId, "candidates"],
    enabled: !!scenarioId,
  });

  const { data: allCandidates } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const { data: tseStats } = useQuery<TseStats>({
    queryKey: ["/api/tse/stats"],
  });

  const addMutation = useMutation({
    mutationFn: async (data: { candidateId: number; partyId: number; ballotNumber: number; nickname?: string; votes?: number }) => {
      return apiRequest("POST", `/api/scenarios/${scenarioId}/candidates`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "candidates"] });
      toast({ title: "Sucesso", description: "Candidato adicionado ao cenário" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao adicionar candidato ao cenário", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { votes?: number; status?: string } }) => {
      return apiRequest("PUT", `/api/scenario-candidates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "candidates"] });
      toast({ title: "Sucesso", description: "Candidato atualizado" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar candidato", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scenario-candidates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "candidates"] });
      toast({ title: "Sucesso", description: "Candidato removido do cenário" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao remover candidato", variant: "destructive" });
    },
  });

  const searchTseCandidates = useCallback(async (query: string, year?: string) => {
    if (query.length < 2) {
      setTseSearchResults([]);
      setShowTseResults(false);
      return;
    }
    setIsTseSearching(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (year) params.append("year", year);
      const res = await fetch(`/api/tse/search?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const results = await res.json();
        setTseSearchResults(results);
        setShowTseResults(true);
      }
    } catch (error) {
      console.error("TSE search error:", error);
    } finally {
      setIsTseSearching(false);
    }
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (tseSearchQuery.length >= 2) {
        const yearFilter = selectedYear && selectedYear !== "all" ? selectedYear : undefined;
        searchTseCandidates(tseSearchQuery, yearFilter);
      } else {
        setTseSearchResults([]);
        setShowTseResults(false);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [tseSearchQuery, selectedYear, searchTseCandidates]);

  async function selectTseCandidate(tse: TseCandidate) {
    const matchingParty = parties?.find(
      (p) => p.abbreviation === tse.sgPartido || p.number === tse.nrPartido
    );

    let matchingCandidate = allCandidates?.find(
      (c) => c.number === tse.nrCandidato || c.name === tse.nmCandidato
    );

    if (!matchingCandidate && matchingParty) {
      try {
        const res = await apiRequest("POST", "/api/candidates", {
          name: tse.nmCandidato || "",
          nickname: tse.nmUrnaCandidato || null,
          number: tse.nrCandidato || 0,
          partyId: matchingParty.id,
          position: scenario?.position || "vereador",
        });
        const newCandidate = await res.json();
        matchingCandidate = newCandidate;
        queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      } catch {
        toast({ title: "Erro", description: "Falha ao criar candidato", variant: "destructive" });
        return;
      }
    }

    if (matchingCandidate && matchingParty) {
      // Os votos já vêm somados do backend (agregado por candidato/ano)
      const totalVotes = tse.qtVotosNominais || 0;

      setFormData({
        candidateId: String(matchingCandidate.id),
        partyId: String(matchingParty.id),
        ballotNumber: String(tse.nrCandidato || matchingCandidate.number),
        nickname: tse.nmUrnaCandidato || "",
        votes: String(totalVotes),
      });
      toast({
        title: "Dados importados",
        description: `Candidato ${tse.nmUrnaCandidato || tse.nmCandidato} selecionado com ${totalVotes.toLocaleString("pt-BR")} votos em ${tse.anoEleicao}`,
      });
    } else {
      toast({
        title: "Partido não encontrado",
        description: `O partido ${tse.sgPartido} não está cadastrado. Cadastre-o primeiro.`,
        variant: "destructive",
      });
    }
    setShowTseResults(false);
    setTseSearchQuery("");
  }

  function resetForm() {
    setFormData({
      candidateId: "",
      partyId: "",
      ballotNumber: "",
      nickname: "",
      votes: "0",
    });
    setIsDialogOpen(false);
    setTseSearchQuery("");
    setTseSearchResults([]);
    setShowTseResults(false);
    setSelectedYear("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    addMutation.mutate({
      candidateId: parseInt(formData.candidateId, 10),
      partyId: parseInt(formData.partyId, 10),
      ballotNumber: parseInt(formData.ballotNumber, 10),
      nickname: formData.nickname || undefined,
      votes: parseInt(formData.votes, 10) || 0,
    });
  }

  const columns = [
    {
      key: "ballotNumber",
      header: "Número",
      sortable: true,
      className: "w-24",
      cell: (sc: ScenarioCandidateWithDetails) => (
        <span className="font-mono font-bold text-lg">{sc.ballotNumber}</span>
      ),
    },
    {
      key: "name",
      header: "Candidato",
      sortable: true,
      cell: (sc: ScenarioCandidateWithDetails) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {sc.candidate.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{sc.nickname || sc.candidate.nickname || sc.candidate.name}</span>
            {(sc.nickname || sc.candidate.nickname) && (
              <span className="text-sm text-muted-foreground">{sc.candidate.name}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "party",
      header: "Partido",
      cell: (sc: ScenarioCandidateWithDetails) => (
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: sc.party.color }}
          />
          <Badge variant="outline">{sc.party.abbreviation}</Badge>
        </div>
      ),
    },
    {
      key: "votes",
      header: "Votos",
      sortable: true,
      cell: (sc: ScenarioCandidateWithDetails) => (
        <Input
          type="number"
          value={sc.votes}
          onChange={(e) => {
            const newVotes = parseInt(e.target.value, 10) || 0;
            updateMutation.mutate({ id: sc.id, data: { votes: newVotes } });
          }}
          className="w-28 font-mono"
          data-testid={`input-votes-${sc.id}`}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (sc: ScenarioCandidateWithDetails) => (
        <Badge variant={sc.status === "active" ? "default" : "secondary"}>
          {sc.status === "active" ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      className: "w-16",
      cell: (sc: ScenarioCandidateWithDetails) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeleteConfirmId(sc.id)}
          disabled={!hasPermission("manage_scenarios")}
          data-testid={`button-delete-sc-${sc.id}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ];

  const availableCandidates = allCandidates?.filter(
    (c) => !scenarioCandidates?.some((sc) => sc.candidateId === c.id)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Candidatos: ${scenario?.name || "..."}`}
        description="Gerencie os candidatos que participam deste cenário eleitoral"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Cenários", href: "/scenarios" },
          { label: scenario?.name || "...", href: `/scenarios` },
          { label: "Candidatos" },
        ]}
        action={
          hasPermission("manage_scenarios")
            ? {
                label: "Adicionar Candidato",
                icon: <Plus className="h-4 w-4 mr-2" />,
                onClick: () => setIsDialogOpen(true),
              }
            : undefined
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <Link href="/scenarios">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar aos Cenários
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Candidatos do Cenário
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && (!scenarioCandidates || scenarioCandidates.length === 0) ? (
            <EmptyState
              icon={Users}
              title="Nenhum candidato neste cenário"
              description="Adicione candidatos ao cenário para configurar a simulação eleitoral. Você pode importar dados do TSE."
              actionLabel={hasPermission("manage_scenarios") ? "Adicionar Candidato" : undefined}
              onAction={hasPermission("manage_scenarios") ? () => setIsDialogOpen(true) : undefined}
            />
          ) : (
            <DataTable
              data={scenarioCandidates || []}
              columns={columns}
              isLoading={isLoading}
              searchable
              searchKeys={["candidate.name", "candidate.nickname", "nickname"]}
              pageSize={10}
              emptyMessage="Nenhum candidato encontrado"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Candidato ao Cenário</DialogTitle>
            <DialogDescription>
              Busque nos dados do TSE ou selecione um candidato já cadastrado
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Buscar nos Dados do TSE
              </Label>
              <div className="flex gap-2">
                <Select
                  value={selectedYear}
                  onValueChange={setSelectedYear}
                >
                  <SelectTrigger className="w-32" data-testid="select-tse-year">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os anos</SelectItem>
                    {(tseStats?.years ?? []).map((year) => (
                      <SelectItem key={year} value={String(year)}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite o nome do candidato..."
                    value={tseSearchQuery}
                    onChange={(e) => setTseSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-tse-search-scenario"
                  />
                  {isTseSearching && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              {showTseResults && tseSearchResults.length > 0 && (
                <Card className="border shadow-md">
                  <ScrollArea className="max-h-48">
                    <div className="p-1">
                      {tseSearchResults.map((tse, idx) => (
                        <button
                          key={`${tse.nrCandidato}-${tse.anoEleicao}-${idx}`}
                          type="button"
                          onClick={() => selectTseCandidate(tse)}
                          className="w-full text-left p-2 rounded-md hover-elevate flex flex-col gap-1"
                          data-testid={`tse-result-sc-${idx}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {tse.nmUrnaCandidato || tse.nmCandidato}
                            </span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {tse.nrCandidato}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>{tse.sgPartido}</span>
                            <span>-</span>
                            <span>{tse.dsCargo}</span>
                            <span>-</span>
                            <span>{tse.sgUf} {tse.anoEleicao}</span>
                            {tse.qtVotosNominais && (
                              <>
                                <span>-</span>
                                <span>{tse.qtVotosNominais.toLocaleString("pt-BR")} votos</span>
                              </>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </Card>
              )}
              {showTseResults && tseSearchResults.length === 0 && tseSearchQuery.length >= 2 && !isTseSearching && (
                <p className="text-sm text-muted-foreground">
                  Nenhum candidato encontrado nos dados importados do TSE.
                </p>
              )}
            </div>

            <div className="border-t pt-4 space-y-4">
              <Label>Ou selecione um candidato já cadastrado:</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="candidateId">Candidato</Label>
                  <Select
                    value={formData.candidateId}
                    onValueChange={(v) => {
                      const candidate = allCandidates?.find((c) => c.id === parseInt(v));
                      setFormData((f) => ({
                        ...f,
                        candidateId: v,
                        partyId: candidate ? String(candidate.partyId) : f.partyId,
                        ballotNumber: candidate ? String(candidate.number) : f.ballotNumber,
                        nickname: candidate?.nickname || "",
                      }));
                    }}
                  >
                    <SelectTrigger data-testid="select-candidate">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableCandidates?.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.nickname || c.name} ({c.number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partyId">Partido</Label>
                  <Select
                    value={formData.partyId}
                    onValueChange={(v) => setFormData((f) => ({ ...f, partyId: v }))}
                  >
                    <SelectTrigger data-testid="select-party">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties?.map((party) => (
                        <SelectItem key={party.id} value={String(party.id)}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: party.color }}
                            />
                            {party.abbreviation}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ballotNumber">Número na Urna</Label>
                  <Input
                    id="ballotNumber"
                    type="number"
                    placeholder="Ex: 13123"
                    value={formData.ballotNumber}
                    onChange={(e) => setFormData((f) => ({ ...f, ballotNumber: e.target.value }))}
                    required
                    className="font-mono"
                    data-testid="input-ballot-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">Nome de Urna</Label>
                  <Input
                    id="nickname"
                    placeholder="Ex: João Silva"
                    value={formData.nickname}
                    onChange={(e) => setFormData((f) => ({ ...f, nickname: e.target.value }))}
                    data-testid="input-nickname"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={addMutation.isPending || !formData.candidateId || !formData.partyId || !formData.ballotNumber}
                data-testid="button-save-scenario-candidate"
              >
                Adicionar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Remoção</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover este candidato do cenário? Isso não exclui o candidato do sistema.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-sc"
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
