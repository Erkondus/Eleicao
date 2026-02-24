import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, UserPlus, UserMinus } from "lucide-react";
import { formatDate } from "@/hooks/use-campaigns";
import type { UseMutationResult } from "@tanstack/react-query";

interface TeamTabProps {
  teamMembers: any[] | undefined;
  users: Array<{ id: string; name: string; username: string; email: string; role: string }> | undefined;
  addTeamMemberMutation: UseMutationResult<any, Error, { userId: string; role: string; notes?: string }, unknown>;
  removeTeamMemberMutation: UseMutationResult<any, Error, number, unknown>;
}

export function TeamTab({ teamMembers, users, addTeamMemberMutation, removeTeamMemberMutation }: TeamTabProps) {
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [teamFormUserId, setTeamFormUserId] = useState("");
  const [teamFormRole, setTeamFormRole] = useState("member");

  const handleAddMember = () => {
    if (teamFormUserId) {
      addTeamMemberMutation.mutate({ userId: teamFormUserId, role: teamFormRole }, {
        onSuccess: () => {
          setShowTeamDialog(false);
          setTeamFormUserId("");
          setTeamFormRole("member");
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Equipe da Campanha</h3>
        <Dialog open={showTeamDialog} onOpenChange={setShowTeamDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-team-member">
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar Membro
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Membro à Equipe</DialogTitle>
              <DialogDescription>Selecione um usuário para adicionar à equipe da campanha</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuário</label>
                <Select value={teamFormUserId} onValueChange={setTeamFormUserId}>
                  <SelectTrigger data-testid="select-team-user">
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {users?.filter(u => !teamMembers?.some(tm => tm.userId === u.id)).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Função</label>
                <Select value={teamFormRole} onValueChange={setTeamFormRole}>
                  <SelectTrigger data-testid="select-team-role">
                    <SelectValue placeholder="Selecione a função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordinator">Coordenador</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="member">Membro</SelectItem>
                    <SelectItem value="volunteer">Voluntário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTeamDialog(false)}>Cancelar</Button>
              <Button
                onClick={handleAddMember}
                disabled={addTeamMemberMutation.isPending || !teamFormUserId}
                data-testid="button-submit-team-member"
              >
                {addTeamMemberMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {teamMembers && teamMembers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teamMembers.map((member: any) => (
            <Card key={member.id} data-testid={`card-team-member-${member.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{member.user?.name || "Usuário"}</p>
                      <p className="text-sm text-muted-foreground">@{member.user?.username}</p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeTeamMemberMutation.mutate(member.id)}
                    data-testid={`button-remove-member-${member.id}`}
                  >
                    <UserMinus className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="outline">
                    {member.role === "coordinator" ? "Coordenador" :
                     member.role === "manager" ? "Gerente" :
                     member.role === "volunteer" ? "Voluntário" : "Membro"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Desde {formatDate(member.joinedAt)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum membro na equipe</h3>
            <p className="text-muted-foreground mb-4">Adicione membros para gerenciar tarefas e atribuições</p>
            <Button onClick={() => setShowTeamDialog(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Adicionar Primeiro Membro
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
