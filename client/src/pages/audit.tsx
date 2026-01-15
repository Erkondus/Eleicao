import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Calendar, User, Eye, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import type { AuditLog, User as UserType } from "@shared/schema";

type AuditLogWithUser = AuditLog & { user?: UserType };

export default function Audit() {
  const [selectedLog, setSelectedLog] = useState<AuditLogWithUser | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery<AuditLogWithUser[]>({
    queryKey: ["/api/audit"],
  });

  const { data: users } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const actions = [
    { value: "all", label: "Todas as ações" },
    { value: "create", label: "Criação" },
    { value: "update", label: "Atualização" },
    { value: "delete", label: "Exclusão" },
    { value: "login", label: "Login" },
    { value: "logout", label: "Logout" },
    { value: "simulation", label: "Simulação" },
    { value: "prediction", label: "Previsão IA" },
  ];

  const entities = [
    { value: "all", label: "Todas as entidades" },
    { value: "user", label: "Usuários" },
    { value: "party", label: "Partidos" },
    { value: "candidate", label: "Candidatos" },
    { value: "scenario", label: "Cenários" },
    { value: "simulation", label: "Simulações" },
    { value: "session", label: "Sessões" },
  ];

  const actionLabels: Record<string, string> = {
    create: "Criação",
    update: "Atualização",
    delete: "Exclusão",
    login: "Login",
    logout: "Logout",
    simulation: "Simulação",
    prediction: "Previsão IA",
  };

  const actionVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    create: "default",
    update: "secondary",
    delete: "destructive",
    login: "outline",
    logout: "outline",
    simulation: "default",
    prediction: "default",
  };

  const entityLabels: Record<string, string> = {
    user: "Usuário",
    party: "Partido",
    candidate: "Candidato",
    scenario: "Cenário",
    simulation: "Simulação",
    session: "Sessão",
  };

  const filteredLogs = logs?.filter((log) => {
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (entityFilter !== "all" && log.entity !== entityFilter) return false;
    return true;
  });

  const columns = [
    {
      key: "createdAt",
      header: "Data/Hora",
      sortable: true,
      cell: (log: AuditLogWithUser) => (
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">
            {new Date(log.createdAt).toLocaleString("pt-BR")}
          </span>
        </div>
      ),
    },
    {
      key: "user",
      header: "Usuário",
      cell: (log: AuditLogWithUser) => {
        const user = users?.find((u) => u.id === log.userId);
        return (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{user?.name || log.userId || "Sistema"}</span>
          </div>
        );
      },
    },
    {
      key: "action",
      header: "Ação",
      cell: (log: AuditLogWithUser) => (
        <Badge variant={actionVariants[log.action] || "outline"}>
          {actionLabels[log.action] || log.action}
        </Badge>
      ),
    },
    {
      key: "entity",
      header: "Entidade",
      cell: (log: AuditLogWithUser) => (
        <span>{entityLabels[log.entity] || log.entity}</span>
      ),
    },
    {
      key: "entityId",
      header: "ID",
      cell: (log: AuditLogWithUser) => (
        <span className="font-mono text-sm text-muted-foreground">
          {log.entityId || "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Detalhes",
      className: "w-20",
      cell: (log: AuditLogWithUser) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSelectedLog(log)}
          data-testid={`button-view-log-${log.id}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registro de Auditoria"
        description="Histórico completo de todas as operações realizadas no sistema"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Auditoria" },
        ]}
      />

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-end gap-4 mb-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Ação
              </Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-48" data-testid="select-audit-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((action) => (
                    <SelectItem key={action.value} value={action.value}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Entidade
              </Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-48" data-testid="select-audit-entity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {entities.map((entity) => (
                    <SelectItem key={entity.value} value={entity.value}>
                      {entity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setActionFilter("all");
                setEntityFilter("all");
              }}
              data-testid="button-clear-filters"
            >
              Limpar Filtros
            </Button>
          </div>

          {!isLoading && (!filteredLogs || filteredLogs.length === 0) ? (
            <EmptyState
              icon={ClipboardList}
              title="Nenhum registro encontrado"
              description="Não há registros de auditoria que correspondam aos filtros selecionados."
            />
          ) : (
            <DataTable
              data={filteredLogs || []}
              columns={columns}
              isLoading={isLoading}
              searchable={false}
              pageSize={15}
              emptyMessage="Nenhum registro de auditoria"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedLog !== null} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Registro</DialogTitle>
            <DialogDescription>
              ID: {selectedLog?.id} - {new Date(selectedLog?.createdAt || "").toLocaleString("pt-BR")}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Ação</Label>
                  <p className="font-medium">{actionLabels[selectedLog.action] || selectedLog.action}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Entidade</Label>
                  <p className="font-medium">{entityLabels[selectedLog.entity] || selectedLog.entity}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID da Entidade</Label>
                  <p className="font-mono">{selectedLog.entityId || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Usuário</Label>
                  <p>{users?.find((u) => u.id === selectedLog.userId)?.name || selectedLog.userId || "Sistema"}</p>
                </div>
              </div>
              {selectedLog.ipAddress && (
                <div>
                  <Label className="text-muted-foreground">Endereço IP</Label>
                  <p className="font-mono">{selectedLog.ipAddress}</p>
                </div>
              )}
              {selectedLog.userAgent && (
                <div>
                  <Label className="text-muted-foreground">User Agent</Label>
                  <p className="text-sm text-muted-foreground truncate">{selectedLog.userAgent}</p>
                </div>
              )}
              {selectedLog.details && (
                <div>
                  <Label className="text-muted-foreground">Detalhes da Operação</Label>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-sm font-mono overflow-auto max-h-48">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
