import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Plus, Edit, Trash2, Users, ArrowLeft, Handshake } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Scenario, Party } from "@shared/schema";

type Alliance = {
  id: number;
  scenarioId: number;
  name: string;
  type: string;
  color: string;
  active: boolean;
  partyIds: number[];
};

export default function Alliances() {
  const params = useParams<{ scenarioId: string }>();
  const scenarioId = parseInt(params.scenarioId || "0");
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlliance, setEditingAlliance] = useState<Alliance | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "coalition",
    color: "#003366",
    partyIds: [] as number[],
  });

  const { data: scenario } = useQuery<Scenario>({
    queryKey: ["/api/scenarios", scenarioId],
    enabled: scenarioId > 0,
  });

  const { data: alliances, isLoading } = useQuery<Alliance[]>({
    queryKey: ["/api/scenarios", scenarioId, "alliances"],
    queryFn: async () => {
      const res = await fetch(`/api/scenarios/${scenarioId}/alliances`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch alliances");
      return res.json();
    },
    enabled: scenarioId > 0,
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const usedPartyIds = new Set(
    alliances
      ?.filter((a) => a.id !== editingAlliance?.id)
      .flatMap((a) => a.partyIds) || []
  );

  const availableParties = parties?.filter((p) => !usedPartyIds.has(p.id)) || [];

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", `/api/scenarios/${scenarioId}/alliances`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "alliances"] });
      toast({ title: "Sucesso", description: "Aliança criada com sucesso" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar aliança", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest("PUT", `/api/alliances/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "alliances"] });
      toast({ title: "Sucesso", description: "Aliança atualizada" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar aliança", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/alliances/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios", scenarioId, "alliances"] });
      toast({ title: "Sucesso", description: "Aliança excluída" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir aliança", variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({ name: "", type: "coalition", color: "#003366", partyIds: [] });
    setEditingAlliance(null);
    setIsDialogOpen(false);
  }

  function openEdit(alliance: Alliance) {
    setEditingAlliance(alliance);
    setFormData({
      name: alliance.name,
      type: alliance.type,
      color: alliance.color,
      partyIds: alliance.partyIds,
    });
    setIsDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingAlliance) {
      updateMutation.mutate({ id: editingAlliance.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  function toggleParty(partyId: number) {
    setFormData((prev) => ({
      ...prev,
      partyIds: prev.partyIds.includes(partyId)
        ? prev.partyIds.filter((id) => id !== partyId)
        : [...prev.partyIds, partyId],
    }));
  }

  function getPartyName(partyId: number) {
    return parties?.find((p) => p.id === partyId)?.abbreviation || `Partido ${partyId}`;
  }

  if (!scenarioId || scenarioId <= 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Federações e Coligações"
          description="Cenário não encontrado"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Cenários", href: "/scenarios" },
            { label: "Alianças" },
          ]}
        />
        <EmptyState
          icon={Handshake}
          title="Cenário não encontrado"
          description="Selecione um cenário válido para gerenciar suas alianças"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title="Federações e Coligações"
          description={scenario ? `Gerenciar alianças do cenário "${scenario.name}"` : "Carregando..."}
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Cenários", href: "/scenarios" },
            { label: scenario?.name || "Cenário" },
            { label: "Alianças" },
          ]}
        />
        <div className="flex gap-2">
          <Link href="/scenarios">
            <Button variant="outline" data-testid="button-back-scenarios">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </Link>
          {hasPermission("manage_scenarios") && (
            <Button
              onClick={() => setIsDialogOpen(true)}
              data-testid="button-add-alliance"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Aliança
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-primary" />
            Alianças do Cenário
          </CardTitle>
          <CardDescription>
            Federações (2022+) e coligações (pré-2022) afetam a distribuição de vagas no sistema proporcional
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !alliances || alliances.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="Nenhuma aliança cadastrada"
              description="Este cenário não possui federações ou coligações. Os partidos serão contabilizados individualmente."
              actionLabel={hasPermission("manage_scenarios") ? "Criar Aliança" : undefined}
              onAction={hasPermission("manage_scenarios") ? () => setIsDialogOpen(true) : undefined}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {alliances.map((alliance) => (
                <Card key={alliance.id} className="relative" data-testid={`card-alliance-${alliance.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: alliance.color }}
                        />
                        <CardTitle className="text-base">{alliance.name}</CardTitle>
                      </div>
                      <Badge variant={alliance.type === "federation" ? "default" : "secondary"}>
                        {alliance.type === "federation" ? "Federação" : "Coligação"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{alliance.partyIds.length} partidos</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {alliance.partyIds.map((partyId) => (
                          <Badge key={partyId} variant="outline" className="text-xs">
                            {getPartyName(partyId)}
                          </Badge>
                        ))}
                      </div>
                      {hasPermission("manage_scenarios") && (
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(alliance)}
                            data-testid={`button-edit-alliance-${alliance.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setDeleteConfirmId(alliance.id)}
                            data-testid={`button-delete-alliance-${alliance.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setIsDialogOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAlliance ? "Editar Aliança" : "Nova Aliança"}</DialogTitle>
            <DialogDescription>
              {editingAlliance
                ? "Modifique os dados da aliança"
                : "Crie uma federação ou coligação para este cenário"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da Aliança</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Federação Brasil da Esperança"
                  required
                  data-testid="input-alliance-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger data-testid="select-alliance-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coalition">Coligação (pré-2022)</SelectItem>
                      <SelectItem value="federation">Federação (2022+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="color">Cor</Label>
                  <div className="flex gap-2">
                    <Input
                      id="color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="w-12 h-9 p-1 cursor-pointer"
                      data-testid="input-alliance-color"
                    />
                    <Input
                      value={formData.color}
                      onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      className="flex-1"
                      placeholder="#003366"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Partidos Membros</Label>
                <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                  {availableParties.length === 0 && formData.partyIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Todos os partidos já pertencem a outras alianças
                    </p>
                  ) : (
                    [...(editingAlliance ? parties?.filter((p) => formData.partyIds.includes(p.id)) || [] : []), ...availableParties]
                      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
                      .map((party) => (
                        <div key={party.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`party-${party.id}`}
                            checked={formData.partyIds.includes(party.id)}
                            onCheckedChange={() => toggleParty(party.id)}
                            data-testid={`checkbox-party-${party.id}`}
                          />
                          <label
                            htmlFor={`party-${party.id}`}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: party.color }}
                            />
                            <span>{party.abbreviation}</span>
                            <span className="text-muted-foreground">- {party.name}</span>
                          </label>
                        </div>
                      ))
                  )}
                </div>
                {formData.partyIds.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {formData.partyIds.length} partido(s) selecionado(s)
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending || formData.partyIds.length < 2}
                data-testid="button-submit-alliance"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Salvando..."
                  : editingAlliance
                  ? "Atualizar"
                  : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta aliança? Os partidos voltarão a ser contabilizados individualmente.
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
              data-testid="button-confirm-delete-alliance"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
