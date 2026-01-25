import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Building2, Download, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Search, Filter, Eye, X, Tag, SortAsc, SortDesc, ChevronLeft, ChevronRight } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Party, InsertParty } from "@shared/schema";

type PaginatedResponse = {
  data: Party[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type PartyDetails = Party & {
  candidateCount: number;
  totalVotes: number;
  recentScenarios: { id: number; name: string; votes: number }[];
  historicalPerformance: { year: number; votes: number; seats: number }[];
};

export default function Parties() {
  const { hasPermission, user } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pagination and filtering state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showFilters, setShowFilters] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    abbreviation: "",
    number: "",
    color: "#003366",
    coalition: "",
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
    if (activeFilter && activeFilter !== "all") params.set("active", activeFilter);
    return `/api/parties/paginated?${params.toString()}`;
  };

  const paginatedUrl = buildQueryUrl();

  const { data: paginatedData, isLoading } = useQuery<PaginatedResponse>({
    queryKey: [paginatedUrl],
  });

  const { data: partyDetails, isLoading: isLoadingDetails } = useQuery<PartyDetails>({
    queryKey: [`/api/parties/${detailsId}/details`],
    enabled: detailsId !== null,
  });

  const invalidatePartiesQueries = () => {
    queryClient.invalidateQueries({ 
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && (key.startsWith('/api/parties') || key === '/api/stats');
      }
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertParty) => {
      return apiRequest("POST", "/api/parties", data);
    },
    onSuccess: () => {
      invalidatePartiesQueries();
      toast({ title: "Sucesso", description: "Partido criado com sucesso" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar partido", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertParty> }) => {
      return apiRequest("PATCH", `/api/parties/${id}`, data);
    },
    onSuccess: () => {
      invalidatePartiesQueries();
      toast({ title: "Sucesso", description: "Partido atualizado" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar partido", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/parties/${id}`);
    },
    onSuccess: () => {
      invalidatePartiesQueries();
      toast({ title: "Sucesso", description: "Partido excluído" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir partido", variant: "destructive" });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: async (csvContent: string) => {
      const res = await apiRequest("POST", "/api/parties/import-csv", { csvContent });
      return res.json();
    },
    onSuccess: (data) => {
      invalidatePartiesQueries();
      setImportResult(data);
      if (data.success) {
        toast({ 
          title: "Importação concluída", 
          description: `${data.created} criados, ${data.updated} atualizados` 
        });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro na importação", 
        description: error.message || "Falha ao importar CSV", 
        variant: "destructive" 
      });
    },
  });

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setImportResult(null);
        importCsvMutation.mutate(content);
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function resetForm() {
    setFormData({ name: "", abbreviation: "", number: "", color: "#003366", coalition: "", notes: "", tags: [] });
    setEditingParty(null);
    setIsDialogOpen(false);
    setTagInput("");
  }

  function handleEdit(party: Party) {
    setEditingParty(party);
    setFormData({
      name: party.name,
      abbreviation: party.abbreviation,
      number: String(party.number),
      color: party.color,
      coalition: party.coalition || "",
      notes: party.notes || "",
      tags: party.tags || [],
    });
    setIsDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: formData.name,
      abbreviation: formData.abbreviation.toUpperCase(),
      number: parseInt(formData.number, 10),
      color: formData.color,
      coalition: formData.coalition || null,
      notes: formData.notes || null,
      tags: formData.tags.length > 0 ? formData.tags : null,
    };

    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: payload });
    } else {
      createMutation.mutate(payload as InsertParty);
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
    setActiveFilter("all");
    setSortBy("name");
    setSortOrder("asc");
    setPage(1);
  }

  const hasActiveFilters = debouncedSearch || activeFilter !== "all";
  const parties = paginatedData?.data || [];
  const totalPages = paginatedData?.totalPages || 1;
  const total = paginatedData?.total || 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partidos Políticos"
        description="Gerencie os partidos políticos cadastrados no sistema"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Partidos" },
        ]}
        action={
          hasPermission("manage_parties")
            ? {
                label: "Novo Partido",
                icon: <Plus className="h-4 w-4 mr-2" />,
                onClick: () => setIsDialogOpen(true),
              }
            : undefined
        }
      />

      <div className="flex justify-end gap-2">
        {user?.role === "admin" && (
          <>
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-import-csv-file"
            />
            <Button
              variant="outline"
              onClick={() => setIsImportDialogOpen(true)}
              disabled={importCsvMutation.isPending}
              data-testid="button-import-parties-csv"
            >
              <Upload className="h-4 w-4 mr-2" />
              {importCsvMutation.isPending ? "Importando..." : "Importar CSV"}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            try {
              const response = await fetch("/api/parties/export/csv", { credentials: "include" });
              if (!response.ok) throw new Error("Falha ao exportar");
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "partidos.csv";
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
            } catch {
              toast({ title: "Erro", description: "Falha ao exportar CSV", variant: "destructive" });
            }
          }}
          disabled={!parties || parties.length === 0}
          data-testid="button-export-parties-csv"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou sigla..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-parties"
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
                    {[debouncedSearch, activeFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg">
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
                        <SelectItem value="abbreviation">Sigla</SelectItem>
                        <SelectItem value="number">Número</SelectItem>
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
                  <div className="flex items-end">
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
              Mostrando {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} de {total} partido{total !== 1 ? "s" : ""}
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : parties.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={hasActiveFilters ? "Nenhum partido encontrado" : "Nenhum partido cadastrado"}
              description={hasActiveFilters ? "Tente ajustar os filtros de busca" : "Comece cadastrando os partidos políticos que participarão das simulações eleitorais"}
              actionLabel={!hasActiveFilters && hasPermission("manage_parties") ? "Cadastrar Partido" : undefined}
              onAction={!hasActiveFilters && hasPermission("manage_parties") ? () => setIsDialogOpen(true) : undefined}
            />
          ) : (
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3 font-medium text-sm w-20">Número</th>
                    <th className="text-left p-3 font-medium text-sm">Sigla</th>
                    <th className="text-left p-3 font-medium text-sm">Nome</th>
                    <th className="text-left p-3 font-medium text-sm">Coligação</th>
                    <th className="text-left p-3 font-medium text-sm">Status</th>
                    <th className="text-left p-3 font-medium text-sm">Tags</th>
                    <th className="text-right p-3 font-medium text-sm w-32">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.map((party) => (
                    <tr key={party.id} className="border-t hover-elevate" data-testid={`row-party-${party.id}`}>
                      <td className="p-3">
                        <span className="font-mono font-bold text-lg">{party.number}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: party.color }}
                          />
                          <Badge variant="outline">{party.abbreviation}</Badge>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="font-medium">{party.name}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-muted-foreground">{party.coalition || "-"}</span>
                      </td>
                      <td className="p-3">
                        <Badge variant={party.active ? "default" : "secondary"}>
                          {party.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {party.tags?.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                          {(party.tags?.length || 0) > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{(party.tags?.length || 0) - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDetailsId(party.id)}
                            data-testid={`button-view-party-${party.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(party)}
                            disabled={!hasPermission("manage_parties")}
                            data-testid={`button-edit-party-${party.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(party.id)}
                            disabled={!hasPermission("manage_parties")}
                            data-testid={`button-delete-party-${party.id}`}
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingParty ? "Editar Partido" : "Novo Partido"}</DialogTitle>
            <DialogDescription>
              {editingParty ? "Atualize as informações do partido" : "Preencha os dados do novo partido político"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="number">Número</Label>
                <Input
                  id="number"
                  type="number"
                  placeholder="Ex: 13"
                  value={formData.number}
                  onChange={(e) => setFormData((f) => ({ ...f, number: e.target.value }))}
                  required
                  className="font-mono"
                  data-testid="input-party-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="abbreviation">Sigla</Label>
                <Input
                  id="abbreviation"
                  placeholder="Ex: PT"
                  value={formData.abbreviation}
                  onChange={(e) => setFormData((f) => ({ ...f, abbreviation: e.target.value.toUpperCase() }))}
                  required
                  maxLength={10}
                  data-testid="input-party-abbreviation"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                placeholder="Ex: Partido dos Trabalhadores"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                required
                data-testid="input-party-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">Cor</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                    className="w-12 h-9 p-1 cursor-pointer"
                    data-testid="input-party-color"
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData((f) => ({ ...f, color: e.target.value }))}
                    className="flex-1 font-mono"
                    placeholder="#003366"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coalition">Coligação</Label>
                <Input
                  id="coalition"
                  placeholder="Opcional"
                  value={formData.coalition}
                  onChange={(e) => setFormData((f) => ({ ...f, coalition: e.target.value }))}
                  data-testid="input-party-coalition"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notas Internas</Label>
              <Textarea
                id="notes"
                placeholder="Notas internas sobre o partido (não visível publicamente)"
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                data-testid="input-party-notes"
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
                  data-testid="input-party-tag"
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
                data-testid="button-save-party"
              >
                {editingParty ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsId !== null} onOpenChange={(open) => !open && setDetailsId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Partido</DialogTitle>
            <DialogDescription>
              Informações detalhadas e histórico de desempenho
            </DialogDescription>
          </DialogHeader>
          {isLoadingDetails ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : partyDetails ? (
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl font-bold"
                  style={{ backgroundColor: partyDetails.color }}
                >
                  {partyDetails.abbreviation.slice(0, 2)}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold">{partyDetails.name}</h3>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <Badge variant="outline" className="font-mono">{partyDetails.number}</Badge>
                    <Badge variant="outline">{partyDetails.abbreviation}</Badge>
                    {partyDetails.coalition && (
                      <Badge variant="secondary">{partyDetails.coalition}</Badge>
                    )}
                    <Badge variant={partyDetails.active ? "default" : "secondary"}>
                      {partyDetails.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total de Candidatos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{partyDetails.candidateCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total de Votos (TSE)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{partyDetails.totalVotes.toLocaleString("pt-BR")}</p>
                  </CardContent>
                </Card>
              </div>

              {partyDetails.notes && (
                <div>
                  <h4 className="font-medium mb-2">Notas Internas</h4>
                  <p className="text-sm text-muted-foreground">{partyDetails.notes}</p>
                </div>
              )}

              {partyDetails.tags && partyDetails.tags.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-1">
                    {partyDetails.tags.map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {partyDetails.historicalPerformance.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Histórico Eleitoral (TSE)</h4>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Ano</th>
                          <th className="text-right p-2">Votos</th>
                          <th className="text-right p-2">Cadeiras</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partyDetails.historicalPerformance.map((h, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2 font-mono">{h.year}</td>
                            <td className="p-2 text-right font-mono">{h.votes.toLocaleString("pt-BR")}</td>
                            <td className="p-2 text-right font-mono">{h.seats}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {partyDetails.recentScenarios.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Cenários de Simulação Recentes</h4>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2">Cenário</th>
                          <th className="text-right p-2">Votos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partyDetails.recentScenarios.map((s) => (
                          <tr key={s.id} className="border-t">
                            <td className="p-2">{s.name}</td>
                            <td className="p-2 text-right font-mono">{s.votes.toLocaleString("pt-BR")}</td>
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
              Tem certeza que deseja excluir este partido? Esta ação não pode ser desfeita.
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
              data-testid="button-confirm-delete"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        setIsImportDialogOpen(open);
        if (!open) setImportResult(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Partidos via CSV
            </DialogTitle>
            <DialogDescription>
              Importe partidos a partir de um arquivo CSV. Partidos existentes serão atualizados.
            </DialogDescription>
          </DialogHeader>

          {!importResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed p-6 text-center">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground mb-4">
                  O arquivo CSV deve conter as colunas:<br />
                  <span className="font-mono text-xs">Numero;Sigla;Nome;Cor;Coligacao;Ativo</span>
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importCsvMutation.isPending}
                  data-testid="button-select-csv-file"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importCsvMutation.isPending ? "Processando..." : "Selecionar Arquivo CSV"}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p><strong>Formato aceito:</strong> CSV com separador ponto e vírgula (;) ou vírgula (,)</p>
                <p><strong>Partidos existentes:</strong> Serão atualizados com base no número ou sigla</p>
                <p><strong>Novos partidos:</strong> Serão criados automaticamente</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-lg p-4 ${importResult.success ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {importResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <span className="font-medium">{importResult.message}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-green-100 dark:bg-green-900 p-3">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">{importResult.created}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">Criados</div>
                </div>
                <div className="rounded-lg bg-blue-100 dark:bg-blue-900 p-3">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{importResult.updated}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">Atualizados</div>
                </div>
                <div className="rounded-lg bg-amber-100 dark:bg-amber-900 p-3">
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">{importResult.skipped}</div>
                  <div className="text-xs text-amber-600 dark:text-amber-400">Ignorados</div>
                </div>
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="rounded-lg border p-3 max-h-32 overflow-y-auto">
                  <p className="text-sm font-medium text-destructive mb-2">Erros encontrados:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {importResult.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {importResult ? (
              <>
                <Button variant="outline" onClick={() => setImportResult(null)}>
                  Importar Outro
                </Button>
                <Button onClick={() => {
                  setIsImportDialogOpen(false);
                  setImportResult(null);
                }}>
                  Concluir
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                Cancelar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
