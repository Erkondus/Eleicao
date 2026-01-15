import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Building2, Download } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Party, InsertParty } from "@shared/schema";

export default function Parties() {
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    abbreviation: "",
    number: "",
    color: "#003366",
    coalition: "",
  });

  const { data: parties, isLoading } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertParty) => {
      return apiRequest("POST", "/api/parties", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/parties"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/parties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Sucesso", description: "Partido excluído" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir partido", variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({ name: "", abbreviation: "", number: "", color: "#003366", coalition: "" });
    setEditingParty(null);
    setIsDialogOpen(false);
  }

  function handleEdit(party: Party) {
    setEditingParty(party);
    setFormData({
      name: party.name,
      abbreviation: party.abbreviation,
      number: String(party.number),
      color: party.color,
      coalition: party.coalition || "",
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
    };

    if (editingParty) {
      updateMutation.mutate({ id: editingParty.id, data: payload });
    } else {
      createMutation.mutate(payload as InsertParty);
    }
  }

  const columns = [
    {
      key: "number",
      header: "Número",
      sortable: true,
      className: "w-20",
      cell: (party: Party) => (
        <span className="font-mono font-bold text-lg">{party.number}</span>
      ),
    },
    {
      key: "abbreviation",
      header: "Sigla",
      sortable: true,
      cell: (party: Party) => (
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: party.color }}
          />
          <Badge variant="outline">{party.abbreviation}</Badge>
        </div>
      ),
    },
    {
      key: "name",
      header: "Nome",
      sortable: true,
      cell: (party: Party) => <span className="font-medium">{party.name}</span>,
    },
    {
      key: "coalition",
      header: "Coligação",
      cell: (party: Party) => (
        <span className="text-muted-foreground">{party.coalition || "-"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (party: Party) => (
        <Badge variant={party.active ? "default" : "secondary"}>
          {party.active ? "Ativo" : "Inativo"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      className: "w-24",
      cell: (party: Party) => (
        <div className="flex items-center gap-1">
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
      ),
    },
  ];

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

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => window.open("/api/parties/export/csv", "_blank")}
          disabled={!parties || parties.length === 0}
          data-testid="button-export-parties-csv"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          {!isLoading && (!parties || parties.length === 0) ? (
            <EmptyState
              icon={Building2}
              title="Nenhum partido cadastrado"
              description="Comece cadastrando os partidos políticos que participarão das simulações eleitorais."
              actionLabel={hasPermission("manage_parties") ? "Cadastrar Partido" : undefined}
              onAction={hasPermission("manage_parties") ? () => setIsDialogOpen(true) : undefined}
            />
          ) : (
            <DataTable
              data={parties || []}
              columns={columns}
              isLoading={isLoading}
              searchable
              searchKeys={["name", "abbreviation"]}
              pageSize={10}
              emptyMessage="Nenhum partido encontrado"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-md">
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
    </div>
  );
}
