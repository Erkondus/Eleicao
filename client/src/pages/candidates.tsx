import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Users, Search, Database, Loader2, ChevronLeft, ChevronRight, Eye, X, Tag, Filter, SortAsc, SortDesc } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
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

type PaginatedResponse = {
  data: CandidateWithParty[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type CandidateDetails = Candidate & {
  party?: Party;
  totalVotes: number;
  scenarioParticipations: { scenarioId: number; scenarioName: string; votes: number; elected: boolean }[];
  historicalPerformance: { year: number; votes: number; position: string; result: string }[];
};

export default function Candidates() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);

  // Pagination and filtering state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);

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
    notes: "",
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Build query params and URL
  const buildQueryUrl = () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sortBy,
      sortOrder,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (partyFilter && partyFilter !== "all") params.set("partyId", partyFilter);
    if (positionFilter && positionFilter !== "all") params.set("position", positionFilter);
    if (activeFilter && activeFilter !== "all") params.set("active", activeFilter);
    return `/api/candidates/paginated?${params.toString()}`;
  };

  const paginatedUrl = buildQueryUrl();

  const { data: paginatedData, isLoading } = useQuery<PaginatedResponse>({
    queryKey: [paginatedUrl],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const { data: candidateDetails, isLoading: isLoadingDetails } = useQuery<CandidateDetails>({
    queryKey: [`/api/candidates/${detailsId}/details`],
    enabled: detailsId !== null,
  });

  const invalidateCandidatesQueries = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (key.startsWith('/api/candidates') || key === '/api/stats');
      }
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertCandidate) => {
      return apiRequest("POST", "/api/candidates", data);
    },
    onSuccess: () => {
      invalidateCandidatesQueries();
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
      invalidateCandidatesQueries();
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
      invalidateCandidatesQueries();
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
      notes: "",
      tags: [],
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
      notes: "",
      tags: [],
    });
    setEditingCandidate(null);
    setIsDialogOpen(false);
    setTseSearchQuery("");
    setTseSearchResults([]);
    setShowTseResults(false);
    setTagInput("");
  }

  function handleEdit(candidate: CandidateWithParty) {
    setEditingCandidate(candidate);
    setFormData({
      name: candidate.name,
      nickname: candidate.nickname || "",
      number: String(candidate.number),
      partyId: String(candidate.partyId),
      position: candidate.position,
      biography: candidate.biography || "",
      notes: candidate.notes || "",
      tags: candidate.tags || [],
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
      notes: formData.notes || null,
      tags: formData.tags.length > 0 ? formData.tags : null,
    };

    if (editingCandidate) {
      updateMutation.mutate({ id: editingCandidate.id, data: payload });
    } else {
      createMutation.mutate(payload as InsertCandidate);
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((f) => ({ ...f, tags: [...f.tags, tag] }));
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setFormData((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  }

  function clearFilters() {
    setSearchQuery("");
    setPartyFilter("all");
    setPositionFilter("all");
    setActiveFilter("all");
    setSortBy("name");
    setSortOrder("asc");
    setPage(1);
  }

  const hasActiveFilters = debouncedSearch || partyFilter !== "all" || positionFilter !== "all" || activeFilter !== "all";

  const positions = [
    { value: "vereador", label: "Vereador" },
    { value: "deputado_estadual", label: "Deputado Estadual" },
    { value: "deputado_federal", label: "Deputado Federal" },
  ];

  const candidates = paginatedData?.data || [];
  const totalPages = paginatedData?.totalPages || 1;
  const total = paginatedData?.total || 0;

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
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou apelido..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-candidates"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="shrink-0"
                data-testid="button-toggle-filters"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtros
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    {[debouncedSearch, partyFilter !== "all", positionFilter !== "all", activeFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-1.5">
                  <Label className="text-xs">Partido</Label>
                  <Select value={partyFilter} onValueChange={setPartyFilter}>
                    <SelectTrigger data-testid="select-filter-party">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {parties?.map((party) => (
                        <SelectItem key={party.id} value={String(party.id)}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: party.color }}
                            />
                            {party.abbreviation}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Cargo</Label>
                  <Select value={positionFilter} onValueChange={setPositionFilter}>
                    <SelectTrigger data-testid="select-filter-position">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {positions.map((pos) => (
                        <SelectItem key={pos.value} value={pos.value}>
                          {pos.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={activeFilter} onValueChange={setActiveFilter}>
                    <SelectTrigger data-testid="select-filter-status">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="true">Ativo</SelectItem>
                      <SelectItem value="false">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Ordenar por</Label>
                  <div className="flex gap-1">
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="flex-1" data-testid="select-sort-by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">Nome</SelectItem>
                        <SelectItem value="number">Número</SelectItem>
                        <SelectItem value="position">Cargo</SelectItem>
                        <SelectItem value="createdAt">Data Cadastro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                      data-testid="button-toggle-sort-order"
                    >
                      {sortOrder === "asc" ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {hasActiveFilters && (
                  <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                      <X className="h-4 w-4 mr-1" />
                      Limpar Filtros
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Results info */}
          {!isLoading && total > 0 && (
            <div className="text-sm text-muted-foreground mb-4">
              Mostrando {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} de {total} candidato{total !== 1 ? "s" : ""}
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : candidates.length === 0 ? (
            <EmptyState
              icon={Users}
              title={hasActiveFilters ? "Nenhum candidato encontrado" : "Nenhum candidato cadastrado"}
              description={hasActiveFilters ? "Tente ajustar os filtros de busca" : "Cadastre candidatos para incluí-los nas simulações eleitorais"}
              actionLabel={!hasActiveFilters && hasPermission("manage_candidates") ? "Cadastrar Candidato" : undefined}
              onAction={!hasActiveFilters && hasPermission("manage_candidates") ? () => setIsDialogOpen(true) : undefined}
            />
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium text-sm w-20">Número</th>
                    <th className="text-left p-3 font-medium text-sm">Candidato</th>
                    <th className="text-left p-3 font-medium text-sm">Partido</th>
                    <th className="text-left p-3 font-medium text-sm">Cargo</th>
                    <th className="text-left p-3 font-medium text-sm">Status</th>
                    <th className="text-left p-3 font-medium text-sm">Tags</th>
                    <th className="text-right p-3 font-medium text-sm w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={candidate.id} className="border-t hover-elevate" data-testid={`row-candidate-${candidate.id}`}>
                      <td className="p-3">
                        <span className="font-mono font-bold text-lg">{candidate.number}</span>
                      </td>
                      <td className="p-3">
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
                      </td>
                      <td className="p-3">
                        {candidate.party ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: candidate.party.color }}
                            />
                            <Badge variant="outline">{candidate.party.abbreviation}</Badge>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span>{positions.find((p) => p.value === candidate.position)?.label || candidate.position}</span>
                      </td>
                      <td className="p-3">
                        <Badge variant={candidate.active ? "default" : "secondary"}>
                          {candidate.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {candidate.tags?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {(candidate.tags?.length || 0) > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{(candidate.tags?.length || 0) - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailsId(candidate.id)}
                            data-testid={`button-view-candidate-${candidate.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <div className="flex items-center gap-1">
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setPage(pageNum)}
                        data-testid={`button-page-${pageNum}`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  Próximo
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-2">
              <Label htmlFor="notes">Notas Internas</Label>
              <Textarea
                id="notes"
                placeholder="Notas internas sobre o candidato (não visível publicamente)"
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                data-testid="input-candidate-notes"
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  data-testid="input-candidate-tag"
                />
                <Button type="button" variant="outline" onClick={addTag} data-testid="button-add-tag">
                  <Tag className="h-4 w-4" />
                </Button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                      {tag}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
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

      {/* Details Dialog */}
      <Dialog open={detailsId !== null} onOpenChange={(open) => !open && setDetailsId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Candidato</DialogTitle>
            <DialogDescription>
              Informações detalhadas e histórico de desempenho
            </DialogDescription>
          </DialogHeader>
          {isLoadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : candidateDetails ? (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {candidateDetails.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">{candidateDetails.nickname || candidateDetails.name}</h3>
                  {candidateDetails.nickname && (
                    <p className="text-muted-foreground">{candidateDetails.name}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <Badge variant="outline" className="font-mono">{candidateDetails.number}</Badge>
                    {candidateDetails.party && (
                      <div className="flex items-center gap-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: candidateDetails.party.color }}
                        />
                        <Badge variant="outline">{candidateDetails.party.abbreviation}</Badge>
                      </div>
                    )}
                    <Badge>{positions.find((p) => p.value === candidateDetails.position)?.label}</Badge>
                    <Badge variant={candidateDetails.active ? "default" : "secondary"}>
                      {candidateDetails.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total de Votos (TSE)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{candidateDetails.totalVotes.toLocaleString("pt-BR")}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Participações em Cenários</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{candidateDetails.scenarioParticipations.length}</p>
                  </CardContent>
                </Card>
              </div>

              {candidateDetails.biography && (
                <div>
                  <h4 className="font-medium mb-2">Biografia</h4>
                  <p className="text-sm text-muted-foreground">{candidateDetails.biography}</p>
                </div>
              )}

              {candidateDetails.notes && (
                <div>
                  <h4 className="font-medium mb-2">Notas Internas</h4>
                  <p className="text-sm text-muted-foreground">{candidateDetails.notes}</p>
                </div>
              )}

              {candidateDetails.tags && candidateDetails.tags.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {candidateDetails.tags.map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {candidateDetails.historicalPerformance.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Histórico Eleitoral (TSE)</h4>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Ano</th>
                          <th className="text-left p-2">Cargo</th>
                          <th className="text-right p-2">Votos</th>
                          <th className="text-left p-2">Resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateDetails.historicalPerformance.map((h, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2 font-mono">{h.year}</td>
                            <td className="p-2">{h.position}</td>
                            <td className="p-2 text-right font-mono">{h.votes.toLocaleString("pt-BR")}</td>
                            <td className="p-2">
                              <Badge variant={h.result === "ELEITO" ? "default" : "outline"}>
                                {h.result}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {candidateDetails.scenarioParticipations.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Cenários de Simulação</h4>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Cenário</th>
                          <th className="text-right p-2">Votos</th>
                          <th className="text-left p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateDetails.scenarioParticipations.map((s) => (
                          <tr key={s.scenarioId} className="border-t">
                            <td className="p-2">{s.scenarioName}</td>
                            <td className="p-2 text-right font-mono">{s.votes.toLocaleString("pt-BR")}</td>
                            <td className="p-2">
                              <Badge variant={s.elected ? "default" : "secondary"}>
                                {s.elected ? "Eleito" : "Não Eleito"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
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
