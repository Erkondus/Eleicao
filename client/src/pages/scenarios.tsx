import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, FileText, PlayCircle, Eye, Handshake, Users, History, Loader2, Copy } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Scenario, InsertScenario } from "@shared/schema";

export default function Scenarios() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    totalVoters: "",
    validVotes: "",
    availableSeats: "",
    position: "vereador",
  });

  // Historical election selection
  const [useHistoricalData, setUseHistoricalData] = useState(false);
  const [historicalYear, setHistoricalYear] = useState("");
  const [historicalUf, setHistoricalUf] = useState("");
  const [historicalCargo, setHistoricalCargo] = useState("");

  interface AvailableElection {
    year: number;
    ufs: string[];
    cargos: Array<{ code: number; name: string }>;
  }

  const { data: scenarios, isLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: availableElections } = useQuery<AvailableElection[]>({
    queryKey: ["/api/historical-elections/available"],
  });

  interface ElectionSummary {
    totalVoters: number;
    validVotes: number;
    availableSeats: number;
  }

  const { data: electionSummary, isLoading: isLoadingSummary } = useQuery<ElectionSummary>({
    queryKey: ["/api/historical-elections", historicalYear, historicalUf, historicalCargo],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("year", historicalYear);
      params.set("cargo", historicalCargo);
      if (historicalUf && historicalUf !== "all") params.set("uf", historicalUf);
      const response = await fetch(`/api/historical-elections?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch election summary");
      return response.json();
    },
    enabled: !!historicalYear && !!historicalCargo,
  });

  useEffect(() => {
    if (electionSummary && useHistoricalData) {
      setFormData(f => ({
        ...f,
        totalVoters: String(electionSummary.totalVoters || 0),
        validVotes: String(electionSummary.validVotes || 0),
        availableSeats: String(electionSummary.availableSeats || 0),
      }));
    }
  }, [electionSummary, useHistoricalData]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertScenario) => {
      return apiRequest("POST", "/api/scenarios", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Sucesso", description: "Cenário criado com sucesso" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar cenário", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, expectedUpdatedAt }: { id: number; data: Partial<InsertScenario>; expectedUpdatedAt?: string }) => {
      return apiRequest("PATCH", `/api/scenarios/${id}`, { ...data, expectedUpdatedAt });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      toast({ title: "Sucesso", description: "Cenário atualizado" });
      resetForm();
    },
    onError: (error: Error) => {
      if (error.message.startsWith("409")) {
        queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
        toast({
          title: "Conflito detectado",
          description: "Outro usuário modificou este cenário. Os dados foram recarregados. Tente novamente.",
          variant: "destructive",
        });
        resetForm();
      } else {
        toast({ title: "Erro", description: "Falha ao atualizar cenário", variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scenarios/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Sucesso", description: "Cenário excluído" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir cenário", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/scenarios/${id}/duplicate`);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      const data = await response.json();
      toast({ title: "Sucesso", description: `Cenário duplicado: "${data.name}"` });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao duplicar cenário", variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({
      name: "",
      description: "",
      totalVoters: "",
      validVotes: "",
      availableSeats: "",
      position: "vereador",
    });
    setUseHistoricalData(false);
    setHistoricalYear("");
    setHistoricalUf("");
    setHistoricalCargo("");
    setEditingScenario(null);
    setIsDialogOpen(false);
  }

  const selectedElection = availableElections?.find(e => e.year === parseInt(historicalYear));
  const cargoCodeToPosition: Record<number, string> = {
    1: "presidente",
    3: "governador",
    5: "senador",
    6: "deputado_federal",
    7: "deputado_federal",
    8: "deputado_estadual",
    11: "prefeito",
    13: "vereador",
  };
  const cargoCodeToLabel: Record<number, string> = {
    7: "Deputado Federal",
    8: "Deputado Estadual",
    13: "Vereador",
    11: "Prefeito",
    3: "Governador",
    5: "Senador",
    1: "Presidente",
  };

  function handleEdit(scenario: Scenario) {
    setEditingScenario(scenario);
    setFormData({
      name: scenario.name,
      description: scenario.description || "",
      totalVoters: String(scenario.totalVoters),
      validVotes: String(scenario.validVotes),
      availableSeats: String(scenario.availableSeats),
      position: scenario.position,
    });
    setIsDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, any> = {
      name: formData.name,
      description: formData.description || null,
      totalVoters: parseInt(formData.totalVoters, 10),
      validVotes: parseInt(formData.validVotes, 10),
      availableSeats: parseInt(formData.availableSeats, 10),
      position: formData.position,
    };

    // Include historical election reference if using historical data
    if (useHistoricalData && historicalYear) {
      payload.historicalYear = parseInt(historicalYear, 10);
      payload.historicalUf = historicalUf && historicalUf !== "all" ? historicalUf : null;
      payload.historicalMunicipio = null;
    }

    if (editingScenario) {
      updateMutation.mutate({
        id: editingScenario.id,
        data: payload,
        expectedUpdatedAt: editingScenario.updatedAt ? new Date(editingScenario.updatedAt).toISOString() : undefined,
      });
    } else {
      createMutation.mutate(payload as InsertScenario);
    }
  }

  const positions = [
    { value: "vereador", label: "Vereador" },
    { value: "deputado_estadual", label: "Deputado Estadual" },
    { value: "deputado_federal", label: "Deputado Federal" },
  ];

  const statusLabels: Record<string, string> = {
    draft: "Rascunho",
    configured: "Configurado",
    completed: "Concluído",
  };

  const statusVariants: Record<string, "default" | "secondary" | "outline"> = {
    draft: "outline",
    configured: "secondary",
    completed: "default",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cenários Eleitorais"
        description="Crie e gerencie cenários para simulações eleitorais"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Cenários" },
        ]}
        action={
          hasPermission("manage_scenarios")
            ? {
                label: "Novo Cenário",
                icon: <Plus className="h-4 w-4 mr-2" />,
                onClick: () => setIsDialogOpen(true),
              }
            : undefined
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 animate-pulse bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !scenarios || scenarios.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={FileText}
              title="Nenhum cenário criado"
              description="Crie cenários eleitorais para configurar simulações com diferentes parâmetros de votação."
              actionLabel={hasPermission("manage_scenarios") ? "Criar Cenário" : undefined}
              onAction={hasPermission("manage_scenarios") ? () => setIsDialogOpen(true) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((scenario) => (
            <Card key={scenario.id} className="hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{scenario.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1">
                      {scenario.description || "Sem descrição"}
                    </CardDescription>
                  </div>
                  <Badge variant={statusVariants[scenario.status]}>
                    {statusLabels[scenario.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-2 bg-muted rounded-md overflow-hidden">
                    <p className="text-sm sm:text-base lg:text-sm xl:text-base font-mono font-bold leading-tight" title={scenario.totalVoters.toLocaleString("pt-BR")}>{scenario.totalVoters.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Eleitores</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded-md overflow-hidden">
                    <p className="text-sm sm:text-base lg:text-sm xl:text-base font-mono font-bold leading-tight" title={scenario.validVotes.toLocaleString("pt-BR")}>{scenario.validVotes.toLocaleString("pt-BR")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Votos Válidos</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded-md overflow-hidden">
                    <p className="text-sm sm:text-base lg:text-sm xl:text-base font-mono font-bold leading-tight">{scenario.availableSeats}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Vagas</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {positions.find((p) => p.value === scenario.position)?.label}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" asChild data-testid={`button-view-scenario-${scenario.id}`}>
                      <Link href={`/simulations?scenario=${scenario.id}`}>
                        <PlayCircle className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" asChild data-testid={`button-candidates-scenario-${scenario.id}`}>
                          <Link href={`/scenarios/${scenario.id}/candidates`}>
                            <Users className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Candidatos</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" asChild data-testid={`button-alliances-scenario-${scenario.id}`}>
                          <Link href={`/scenarios/${scenario.id}/alliances`}>
                            <Handshake className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Federações e Coligações</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => duplicateMutation.mutate(scenario.id)}
                          disabled={!hasPermission("manage_scenarios") || duplicateMutation.isPending}
                          data-testid={`button-duplicate-scenario-${scenario.id}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Duplicar Cenário</p>
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(scenario)}
                      disabled={!hasPermission("manage_scenarios")}
                      data-testid={`button-edit-scenario-${scenario.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirmId(scenario.id)}
                      disabled={!hasPermission("manage_scenarios")}
                      data-testid={`button-delete-scenario-${scenario.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {hasPermission("manage_scenarios") && (
            <Card
              className="border-dashed cursor-pointer hover-elevate flex items-center justify-center min-h-[200px]"
              onClick={() => setIsDialogOpen(true)}
              data-testid="card-create-scenario"
            >
              <div className="text-center p-6">
                <Plus className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">Criar Novo Cenário</p>
              </div>
            </Card>
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingScenario ? "Editar Cenário" : "Novo Cenário"}</DialogTitle>
            <DialogDescription>
              {editingScenario ? "Atualize os parâmetros do cenário" : "Configure os parâmetros do cenário eleitoral"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Cenário</Label>
              <Input
                id="name"
                placeholder="Ex: Eleição Municipal 2024"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                required
                data-testid="input-scenario-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descrição do cenário (opcional)"
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                data-testid="input-scenario-description"
              />
            </div>

            {!editingScenario && availableElections && availableElections.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="useHistorical"
                      checked={useHistoricalData}
                      onCheckedChange={(checked) => setUseHistoricalData(checked === true)}
                      data-testid="checkbox-use-historical"
                    />
                    <Label htmlFor="useHistorical" className="flex items-center gap-2 cursor-pointer">
                      <History className="h-4 w-4" />
                      Usar dados de eleição histórica
                    </Label>
                  </div>
                  
                  {useHistoricalData && (
                    <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
                      <div className="space-y-1">
                        <Label className="text-xs">Ano</Label>
                        <Select value={historicalYear} onValueChange={(v) => { setHistoricalYear(v); setHistoricalUf(""); setHistoricalCargo(""); }}>
                          <SelectTrigger data-testid="select-historical-year">
                            <SelectValue placeholder="Ano" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableElections.map((e) => (
                              <SelectItem key={e.year} value={String(e.year)}>{e.year}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">UF</Label>
                        <Select value={historicalUf} onValueChange={setHistoricalUf} disabled={!selectedElection}>
                          <SelectTrigger data-testid="select-historical-uf">
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            {selectedElection?.ufs.map((uf) => (
                              <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cargo</Label>
                        <Select value={historicalCargo} onValueChange={(v) => {
                          setHistoricalCargo(v);
                          const pos = cargoCodeToPosition[parseInt(v)];
                          if (pos) setFormData(f => ({ ...f, position: pos }));
                        }} disabled={!selectedElection}>
                          <SelectTrigger data-testid="select-historical-cargo">
                            <SelectValue placeholder="Cargo" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedElection?.cargos.map((c) => (
                              <SelectItem key={c.code} value={String(c.code)}>
                                {cargoCodeToLabel[c.code] || c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {isLoadingSummary && (
                        <div className="col-span-3 flex items-center justify-center py-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Carregando dados...
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalVoters">Total de Eleitores</Label>
                <Input
                  id="totalVoters"
                  type="number"
                  placeholder="Ex: 500000"
                  value={formData.totalVoters}
                  onChange={(e) => setFormData((f) => ({ ...f, totalVoters: e.target.value }))}
                  required
                  className="font-mono"
                  data-testid="input-scenario-voters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validVotes">Votos Válidos</Label>
                <Input
                  id="validVotes"
                  type="number"
                  placeholder="Ex: 400000"
                  value={formData.validVotes}
                  onChange={(e) => setFormData((f) => ({ ...f, validVotes: e.target.value }))}
                  required
                  className="font-mono"
                  data-testid="input-scenario-votes"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="availableSeats">Vagas Disponíveis</Label>
                <Input
                  id="availableSeats"
                  type="number"
                  placeholder="Ex: 15"
                  value={formData.availableSeats}
                  onChange={(e) => setFormData((f) => ({ ...f, availableSeats: e.target.value }))}
                  required
                  className="font-mono"
                  data-testid="input-scenario-seats"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">Cargo</Label>
                <Select
                  value={formData.position}
                  onValueChange={(v) => setFormData((f) => ({ ...f, position: v }))}
                >
                  <SelectTrigger data-testid="select-scenario-position">
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-scenario"
              >
                {editingScenario ? "Salvar" : "Criar"}
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
              Tem certeza que deseja excluir este cenário? Todas as simulações associadas também serão excluídas.
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
              data-testid="button-confirm-delete-scenario"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
