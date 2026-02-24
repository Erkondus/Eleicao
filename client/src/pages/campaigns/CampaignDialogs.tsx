import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Brain } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import {
  campaignFormSchema, resourceFormSchema, RESOURCE_TYPES, formatCurrency, formatDate,
  type CampaignFormData, type ResourceFormData, type CampaignDetail
} from "@/hooks/use-campaigns";
import type { CampaignInsightSession } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createCampaignMutation: UseMutationResult<any, Error, CampaignFormData, unknown>;
}

export function CreateCampaignDialog({ open, onOpenChange, createCampaignMutation }: CreateCampaignDialogProps) {
  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      goal: "",
      targetVotes: "" as any,
      targetRegion: "",
      position: "vereador",
      totalBudget: "",
    },
  });

  const handleSubmit = (data: CampaignFormData) => {
    createCampaignMutation.mutate(data, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Nova Campanha</DialogTitle>
          <DialogDescription>Defina os detalhes da campanha eleitoral</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da Campanha</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Campanha Municipal 2026" data-testid="input-campaign-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} placeholder="Descrição da campanha..." data-testid="input-campaign-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Início</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-campaign-start-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Término</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-campaign-end-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-campaign-position">
                          <SelectValue placeholder="Selecione o cargo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="vereador">Vereador</SelectItem>
                        <SelectItem value="prefeito">Prefeito</SelectItem>
                        <SelectItem value="deputado_estadual">Deputado Estadual</SelectItem>
                        <SelectItem value="deputado_federal">Deputado Federal</SelectItem>
                        <SelectItem value="senador">Senador</SelectItem>
                        <SelectItem value="governador">Governador</SelectItem>
                        <SelectItem value="presidente">Presidente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetRegion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Região Alvo</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} placeholder="Ex: São Paulo" data-testid="input-campaign-region" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="targetVotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta de Votos</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} value={field.value ?? ""} placeholder="100000" data-testid="input-campaign-votes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="totalBudget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orçamento Total (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} value={field.value ?? ""} placeholder="500000" data-testid="input-campaign-budget" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="goal"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objetivo Principal</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} placeholder="Qual o objetivo principal desta campanha?" data-testid="input-campaign-goal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-campaign">
                Cancelar
              </Button>
              <Button type="submit" disabled={createCampaignMutation.isPending} data-testid="button-submit-campaign">
                {createCampaignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Campanha
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface ResourcesTabProps {
  campaignDetail: CampaignDetail;
  createResourceMutation: UseMutationResult<any, Error, ResourceFormData, unknown>;
}

export function ResourcesTab({ campaignDetail, createResourceMutation }: ResourcesTabProps) {
  const [showResourceDialog, setShowResourceDialog] = useState(false);

  const resourceForm = useForm<ResourceFormData>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: "",
      type: "",
      quantity: "1" as any,
      unitCost: "",
      status: "available",
      assignedTo: "",
      notes: "",
    },
  });

  const handleSubmit = (data: ResourceFormData) => {
    createResourceMutation.mutate(data, {
      onSuccess: () => {
        setShowResourceDialog(false);
        resourceForm.reset();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Recursos da Campanha</h2>
          <p className="text-muted-foreground">Gerencie pessoas, veículos e materiais</p>
        </div>
        <Dialog open={showResourceDialog} onOpenChange={setShowResourceDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-resource">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Recurso
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Recurso</DialogTitle>
            </DialogHeader>
            <Form {...resourceForm}>
              <form onSubmit={resourceForm.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={resourceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: João Silva" data-testid="input-resource-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={resourceForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-resource-type">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {RESOURCE_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={resourceForm.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantidade</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} data-testid="input-resource-quantity" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={resourceForm.control}
                    name="unitCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custo Unitário (R$)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value ?? ""} data-testid="input-resource-cost" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={resourceForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-resource-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="available">Disponível</SelectItem>
                            <SelectItem value="allocated">Alocado</SelectItem>
                            <SelectItem value="unavailable">Indisponível</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={resourceForm.control}
                  name="assignedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Atribuído a</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="Nome do responsável" data-testid="input-resource-assigned" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createResourceMutation.isPending} data-testid="button-submit-resource">
                    {createResourceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Adicionar
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead className="text-right">Custo Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Atribuído</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignDetail.resources.map((resource: any) => (
                <TableRow key={resource.id} data-testid={`row-resource-${resource.id}`}>
                  <TableCell className="font-medium">{resource.name}</TableCell>
                  <TableCell>{RESOURCE_TYPES.find(t => t.value === resource.type)?.label || resource.type}</TableCell>
                  <TableCell className="text-center">{resource.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(resource.totalCost)}</TableCell>
                  <TableCell>
                    <Badge variant={resource.status === "available" ? "outline" : resource.status === "allocated" ? "default" : "secondary"}>
                      {resource.status === "available" ? "Disponível" : resource.status === "allocated" ? "Alocado" : "Indisponível"}
                    </Badge>
                  </TableCell>
                  <TableCell>{resource.assignedTo || "-"}</TableCell>
                </TableRow>
              ))}
              {campaignDetail.resources.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum recurso cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

interface AiTabProps {
  campaignDetail: CampaignDetail;
  aiSessions: CampaignInsightSession[] | undefined;
  linkAiSessionMutation: UseMutationResult<any, Error, number, unknown>;
}

export function AiTab({ campaignDetail, aiSessions, linkAiSessionMutation }: AiTabProps) {
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">IA Estratégica</h2>
          <p className="text-muted-foreground">Insights do Estrategista de Campanha com GPT-4o</p>
        </div>
      </div>

      {campaignDetail.aiSession ? (
        <div className="space-y-6">
          <Card className="border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle>Sessão de IA Vinculada</CardTitle>
                  <CardDescription>{campaignDetail.aiSession.name}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Ano Eleitoral</p>
                  <p className="font-medium">{campaignDetail.aiSession.electionYear}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Região</p>
                  <p className="font-medium">{campaignDetail.aiSession.targetRegion || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant="outline">{campaignDetail.aiSession.status}</Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Criada em</p>
                  <p className="font-medium">{formatDate(campaignDetail.aiSession.createdAt)}</p>
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={() => navigate("/campaign-insights")} data-testid="button-view-ai-session">
                  <Brain className="h-4 w-4 mr-2" />
                  Abrir Análises Completas
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Brain className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Vincular Análise de IA</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Conecte esta campanha a uma sessão do Estrategista de Campanha IA para obter insights avançados sobre segmentos,
              estratégias de mensagem e previsões de impacto.
            </p>
            {aiSessions && aiSessions.length > 0 ? (
              <div className="space-y-4">
                <Select onValueChange={(value) => linkAiSessionMutation.mutate(parseInt(value))}>
                  <SelectTrigger className="max-w-md mx-auto" data-testid="select-link-ai-session">
                    <SelectValue placeholder="Selecione uma sessão de IA" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiSessions.map((session: any) => (
                      <SelectItem key={session.id} value={session.id.toString()}>
                        {session.name} ({session.electionYear})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">ou</p>
                <Button variant="outline" onClick={() => navigate("/campaign-insights")} data-testid="button-create-ai-session">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Nova Sessão de IA
                </Button>
              </div>
            ) : (
              <Button onClick={() => navigate("/campaign-insights")} data-testid="button-go-ai-insights">
                <Brain className="h-4 w-4 mr-2" />
                Ir para Estrategista de Campanha
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
