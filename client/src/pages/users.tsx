import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Shield, Info } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User, InsertUser, Permission } from "@shared/schema";
import {
  PERMISSION_LABELS,
  PERMISSION_GROUPS,
  ROLE_DEFAULT_PERMISSIONS,
} from "@shared/schema";

export default function Users() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);

  const [formData, setFormData] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    role: "viewer",
    permissions: [] as string[],
  });

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sucesso", description: "Usuário criado com sucesso" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar usuário", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sucesso", description: "Usuário atualizado" });
      resetForm();
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao atualizar usuário", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sucesso", description: "Usuário excluído" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir usuário", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      return apiRequest("PATCH", `/api/users/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Sucesso", description: "Status do usuário alterado" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao alterar status", variant: "destructive" });
    },
  });

  function resetForm() {
    setFormData({ username: "", password: "", name: "", email: "", role: "viewer", permissions: [] });
    setEditingUser(null);
    setIsDialogOpen(false);
    setUseCustomPermissions(false);
  }

  function handleEdit(user: User) {
    setEditingUser(user);
    const hasCustom = user.permissions && user.permissions.length > 0;
    setUseCustomPermissions(!!hasCustom);
    setFormData({
      username: user.username,
      password: "",
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: hasCustom ? (user.permissions as string[]) : [],
    });
    setIsDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      username: formData.username,
      name: formData.name,
      email: formData.email,
      role: formData.role,
      permissions: useCustomPermissions ? formData.permissions : null,
    };
    if (formData.password) {
      payload.password = formData.password;
    }

    if (editingUser) {
      updateMutation.mutate({ id: editingUser.id, data: payload });
    } else {
      payload.password = formData.password;
      createMutation.mutate(payload);
    }
  }

  function handleRoleChange(role: string) {
    setFormData(f => ({ ...f, role }));
    if (useCustomPermissions) {
      setFormData(f => ({ ...f, role, permissions: [...(ROLE_DEFAULT_PERMISSIONS[role] || [])] }));
    }
  }

  function togglePermission(perm: Permission) {
    setFormData(f => ({
      ...f,
      permissions: f.permissions.includes(perm)
        ? f.permissions.filter(p => p !== perm)
        : [...f.permissions, perm],
    }));
  }

  function handleToggleCustom(checked: boolean) {
    setUseCustomPermissions(checked);
    if (checked) {
      setFormData(f => ({ ...f, permissions: [...(ROLE_DEFAULT_PERMISSIONS[f.role] || [])] }));
    } else {
      setFormData(f => ({ ...f, permissions: [] }));
    }
  }

  const activePermissions = useCustomPermissions
    ? formData.permissions
    : (ROLE_DEFAULT_PERMISSIONS[formData.role] || []);

  const roles = [
    { value: "admin", label: "Administrador", description: "Acesso total ao sistema" },
    { value: "analyst", label: "Analista", description: "Dados eleitorais, IA e campanhas" },
    { value: "viewer", label: "Visualizador", description: "Simulações e relatórios" },
  ];

  const roleLabels: Record<string, string> = {
    admin: "Administrador",
    analyst: "Analista",
    viewer: "Visualizador",
  };

  const roleVariants: Record<string, "default" | "secondary" | "outline"> = {
    admin: "default",
    analyst: "secondary",
    viewer: "outline",
  };

  function getUserPermissionCount(user: User): number {
    if (user.permissions && user.permissions.length > 0) return user.permissions.length;
    return (ROLE_DEFAULT_PERMISSIONS[user.role] || []).length;
  }

  const columns = [
    {
      key: "name",
      header: "Usuário",
      sortable: true,
      cell: (user: User) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{user.name}</span>
            <span className="text-sm text-muted-foreground">@{user.username}</span>
          </div>
        </div>
      ),
    },
    {
      key: "email",
      header: "Email",
      cell: (user: User) => <span className="text-muted-foreground">{user.email}</span>,
    },
    {
      key: "role",
      header: "Função",
      cell: (user: User) => (
        <div className="flex flex-col gap-1">
          <Badge variant={roleVariants[user.role]}>
            {roleLabels[user.role] || user.role}
          </Badge>
          {user.permissions && user.permissions.length > 0 && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Personalizado</span>
          )}
        </div>
      ),
    },
    {
      key: "permissions",
      header: "Permissões",
      cell: (user: User) => (
        <span className="text-sm text-muted-foreground">
          {getUserPermissionCount(user)} de {Object.keys(PERMISSION_LABELS).length}
        </span>
      ),
    },
    {
      key: "active",
      header: "Status",
      cell: (user: User) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={user.active}
            onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: user.id, active: checked })}
            data-testid={`switch-user-active-${user.id}`}
          />
          <span className={user.active ? "text-success" : "text-muted-foreground"}>
            {user.active ? "Ativo" : "Inativo"}
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      header: "Criado em",
      cell: (user: User) => (
        <span className="text-sm text-muted-foreground">
          {new Date(user.createdAt).toLocaleDateString("pt-BR")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      className: "w-24",
      cell: (user: User) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleEdit(user)}
            data-testid={`button-edit-user-${user.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteConfirmId(user.id)}
            data-testid={`button-delete-user-${user.id}`}
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
        title="Gerenciamento de Usuários"
        description="Controle de acesso e permissões do sistema"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Usuários" },
        ]}
        action={{
          label: "Novo Usuário",
          icon: <Plus className="h-4 w-4 mr-2" />,
          onClick: () => setIsDialogOpen(true),
        }}
      />

      <Card>
        <CardContent className="p-6">
          {!isLoading && (!users || users.length === 0) ? (
            <EmptyState
              icon={Shield}
              title="Nenhum usuário cadastrado"
              description="Cadastre usuários para controlar o acesso ao sistema."
              actionLabel="Cadastrar Usuário"
              onAction={() => setIsDialogOpen(true)}
            />
          ) : (
            <DataTable
              data={users || []}
              columns={columns}
              isLoading={isLoading}
              searchable
              searchKeys={["name", "username", "email"]}
              pageSize={10}
              emptyMessage="Nenhum usuário encontrado"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Atualize as informações e permissões do usuário" : "Preencha os dados e defina as permissões do novo usuário"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo</Label>
              <Input
                id="name"
                placeholder="Ex: João da Silva"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                required
                data-testid="input-user-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  placeholder="Ex: joao.silva"
                  value={formData.username}
                  onChange={(e) => setFormData((f) => ({ ...f, username: e.target.value }))}
                  required
                  data-testid="input-user-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="joao@exemplo.com"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                  required
                  data-testid="input-user-email"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="password">
                  Senha {editingUser && <span className="text-muted-foreground">(deixe vazio para manter)</span>}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={editingUser ? "••••••••" : "Mínimo 6 caracteres"}
                  value={formData.password}
                  onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                  required={!editingUser}
                  minLength={6}
                  data-testid="input-user-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Função</Label>
                <Select
                  value={formData.role}
                  onValueChange={handleRoleChange}
                >
                  <SelectTrigger data-testid="select-user-role">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <div className="flex flex-col">
                          <span>{role.label}</span>
                          <span className="text-xs text-muted-foreground">{role.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Permissões</Label>
                  <p className="text-sm text-muted-foreground">
                    {useCustomPermissions
                      ? "Permissões personalizadas para este usuário"
                      : `Usando permissões padrão do perfil "${roleLabels[formData.role]}"`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={useCustomPermissions}
                    onCheckedChange={handleToggleCustom}
                    data-testid="switch-custom-permissions"
                  />
                  <Label className="text-sm">Personalizar</Label>
                </div>
              </div>

              {!useCustomPermissions && (
                <div className="p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Ative "Personalizar" para ajustar individualmente quais funcionalidades este usuário pode acessar.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label} className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">{group.label}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {group.permissions.map((perm) => {
                        const isActive = activePermissions.includes(perm);
                        return (
                          <div
                            key={perm}
                            className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                              isActive
                                ? "bg-primary/5 border-primary/20"
                                : "bg-muted/30 border-transparent"
                            } ${!useCustomPermissions ? "opacity-60" : ""}`}
                          >
                            <Checkbox
                              checked={isActive}
                              disabled={!useCustomPermissions}
                              onCheckedChange={() => togglePermission(perm)}
                              data-testid={`checkbox-perm-${perm}`}
                            />
                            <label className="text-sm cursor-pointer select-none">
                              {PERMISSION_LABELS[perm]}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground text-right">
                {activePermissions.length} de {Object.keys(PERMISSION_LABELS).length} permissões ativas
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-user"
              >
                {editingUser ? "Salvar" : "Criar"}
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
              Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.
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
              data-testid="button-confirm-delete-user"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
