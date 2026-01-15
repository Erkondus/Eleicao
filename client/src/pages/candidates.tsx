import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Users, Search, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
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
import type { Candidate, Party, InsertCandidate } from "@shared/schema";

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

type CandidateWithParty = Candidate & { party?: Party };

export default function Candidates() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [tseSearchQuery, setTseSearchQuery] = useState("");
  const [tseSearchResults, setTseSearchResults] = useState<TseCandidate[]>([]);
  const [isTseSearching, setIsTseSearching] = useState(false);
  const [showTseResults, setShowTseResults] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    nickname: "",
    number: "",
    partyId: "",
    position: "vereador",
    biography: "",
  });

  const { data: candidates, isLoading } = useQuery<CandidateWithParty[]>({
    queryKey: ["/api/candidates"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertCandidate) => {
      return apiRequest("POST", "/api/candidates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Sucesso", description: "Candidato cadastrado com sucesso" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao cadastrar candidato", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertCandidate> }) => {
      return apiRequest("PATCH", `/api/candidates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      toast({ title: "Sucesso", description: "Candidato atualizado" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar candidato", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/candidates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Sucesso", description: "Candidato excluído" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir candidato", variant: "destructive" });
    },
  });

  const searchTseCandidates = useCallback(async (query: string) => {
    if (query.length < 2) {
      setTseSearchResults([]);
      setShowTseResults(false);
      return;
    }
    setIsTseSearching(true);
    try {
      const res = await fetch(`/api/tse/search?q=${encodeURIComponent(query)}`);
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
        searchTseCandidates(tseSearchQuery);
      } else {
        setTseSearchResults([]);
        setShowTseResults(false);
      }
    }, 300);
    return () => clearTimeout(debounce);
  }, [tseSearchQuery, searchTseCandidates]);

  function selectTseCandidate(tse: TseCandidate) {
    const matchingParty = parties?.find(
      (p) => p.abbreviation === tse.sgPartido || p.number === tse.nrPartido
    );
    setFormData({
      name: tse.nmCandidato || "",
      nickname: tse.nmUrnaCandidato || "",
      number: tse.nrCandidato?.toString() || "",
      partyId: matchingParty ? String(matchingParty.id) : "",
      position: "vereador",
      biography: "",
    });
    setShowTseResults(false);
    setTseSearchQuery("");
    toast({
      title: "Dados importados",
      description: `Candidato ${tse.nmUrnaCandidato || tse.nmCandidato} selecionado dos dados do TSE`,
    });
  }

  function resetForm() {
    setFormData({
      name: "",
      nickname: "",
      number: "",
      partyId: "",
      position: "vereador",
      biography: "",
    });
    setEditingCandidate(null);
    setIsDialogOpen(false);
    setTseSearchQuery("");
    setTseSearchResults([]);
    setShowTseResults(false);
  }

  function handleEdit(candidate: Candidate) {
    setEditingCandidate(candidate);
    setFormData({
      name: candidate.name,
      nickname: candidate.nickname || "",
      number: String(candidate.number),
      partyId: String(candidate.partyId),
      position: candidate.position,
      biography: candidate.biography || "",
    });
    setIsDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: formData.name,
      nickname: formData.nickname || null,
      number: parseInt(formData.number, 10),
      partyId: parseInt(formData.partyId, 10),
      position: formData.position,
      biography: formData.biography || null,
    };

    if (editingCandidate) {
      updateMutation.mutate({ id: editingCandidate.id, data: payload });
    } else {
      createMutation.mutate(payload as InsertCandidate);
    }
  }

  const positions = [
    { value: "vereador", label: "Vereador" },
    { value: "deputado_estadual", label: "Deputado Estadual" },
    { value: "deputado_federal", label: "Deputado Federal" },
  ];

  const columns = [
    {
      key: "number",
      header: "Número",
      sortable: true,
      className: "w-24",
      cell: (candidate: CandidateWithParty) => (
        <span className="font-mono font-bold text-lg">{candidate.number}</span>
      ),
    },
    {
      key: "name",
      header: "Candidato",
      sortable: true,
      cell: (candidate: CandidateWithParty) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {candidate.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{candidate.nickname || candidate.name}</span>
            {candidate.nickname && (
              <span className="text-sm text-muted-foreground">{candidate.name}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "party",
      header: "Partido",
      cell: (candidate: CandidateWithParty) => {
        const party = parties?.find((p) => p.id === candidate.partyId);
        return party ? (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: party.color }}
            />
            <Badge variant="outline">{party.abbreviation}</Badge>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      key: "position",
      header: "Cargo",
      cell: (candidate: CandidateWithParty) => {
        const pos = positions.find((p) => p.value === candidate.position);
        return <span>{pos?.label || candidate.position}</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (candidate: CandidateWithParty) => (
        <Badge variant={candidate.active ? "default" : "secondary"}>
          {candidate.active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      className: "w-24",
      cell: (candidate: CandidateWithParty) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleEdit(candidate)}
            disabled={!hasPermission("manage_candidates")}
            data-testid={`button-edit-candidate-${candidate.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteConfirmId(candidate.id)}
            disabled={!hasPermission("manage_candidates")}
            data-testid={`button-delete-candidate-${candidate.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidatos"
        description="Gerencie os candidatos vinculados aos partidos políticos"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Candidatos" },
        ]}
        action={
          hasPermission("manage_candidates")
            ? {
                label: "Novo Candidato",
                icon: <Plus className="h-4 w-4 mr-2" />,
                onClick: () => setIsDialogOpen(true),
              }
            : undefined
        }
      />

      <Card>
        <CardContent className="p-6">
          {!isLoading && (!candidates || candidates.length === 0) ? (
            <EmptyState
              icon={Users}
              title="Nenhum candidato cadastrado"
              description="Cadastre candidatos para incluí-los nas simulações eleitorais. Certifique-se de ter partidos cadastrados primeiro."
              actionLabel={hasPermission("manage_candidates") ? "Cadastrar Candidato" : undefined}
              onAction={hasPermission("manage_candidates") ? () => setIsDialogOpen(true) : undefined}
            />
          ) : (
            <DataTable
              data={candidates || []}
              columns={columns}
              isLoading={isLoading}
              searchable
              searchKeys={["name", "nickname"]}
              pageSize={10}
              emptyMessage="Nenhum candidato encontrado"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCandidate ? "Editar Candidato" : "Novo Candidato"}</DialogTitle>
            <DialogDescription>
              {editingCandidate ? "Atualize as informações do candidato" : "Preencha os dados do novo candidato"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingCandidate && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Buscar nos Dados do TSE
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite o nome do candidato para buscar..."
                    value={tseSearchQuery}
                    onChange={(e) => setTseSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-tse-search"
                  />
                  {isTseSearching && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
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
                            data-testid={`tse-result-${idx}`}
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
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                placeholder="Ex: João da Silva"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                required
                data-testid="input-candidate-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nickname">Nome de Urna</Label>
                <Input
                  id="nickname"
                  placeholder="Ex: João Silva"
                  value={formData.nickname}
                  onChange={(e) => setFormData((f) => ({ ...f, nickname: e.target.value }))}
                  data-testid="input-candidate-nickname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="number">Número</Label>
                <Input
                  id="number"
                  type="number"
                  placeholder="Ex: 13123"
                  value={formData.number}
                  onChange={(e) => setFormData((f) => ({ ...f, number: e.target.value }))}
                  required
                  className="font-mono"
                  data-testid="input-candidate-number"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partyId">Partido</Label>
                <Select
                  value={formData.partyId}
                  onValueChange={(v) => setFormData((f) => ({ ...f, partyId: v }))}
                >
                  <SelectTrigger data-testid="select-candidate-party">
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
                          {party.abbreviation} - {party.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Cargo</Label>
                <Select
                  value={formData.position}
                  onValueChange={(v) => setFormData((f) => ({ ...f, position: v }))}
                >
                  <SelectTrigger data-testid="select-candidate-position">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((pos) => (
                      <SelectItem key={pos.value} value={pos.value}>
                        {pos.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="biography">Biografia</Label>
              <Textarea
                id="biography"
                placeholder="Breve descrição do candidato (opcional)"
                value={formData.biography}
                onChange={(e) => setFormData((f) => ({ ...f, biography: e.target.value }))}
                rows={3}
                data-testid="input-candidate-biography"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-candidate"
              >
                {editingCandidate ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este candidato? Esta ação não pode ser desfeita.
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
              data-testid="button-confirm-delete-candidate"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
