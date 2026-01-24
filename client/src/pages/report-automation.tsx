import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import {
  Clock,
  FileText,
  Mail,
  Play,
  Plus,
  Trash2,
  Edit,
  Calendar,
  Check,
  X,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  Users,
  Settings,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ReportTemplate {
  id: number;
  name: string;
  description?: string;
  reportType: string;
  filters: Record<string, any>;
  columns?: string[];
  isActive: boolean;
  createdAt: string;
  createdBy?: number;
}

interface ReportSchedule {
  id: number;
  templateId: number;
  name: string;
  description?: string;
  frequency: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
  timezone: string;
  recipientEmails: string[];
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
}

interface ReportRun {
  id: number;
  templateId: number;
  scheduleId?: number;
  triggeredBy: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  rowCount?: number;
  fileSize?: number;
  filePath?: string;
  errorMessage?: string;
  emailsSent?: number;
  executionTimeMs?: number;
  createdAt: string;
}

interface Recipient {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

interface EmailStatus {
  configured: boolean;
  provider?: string;
  message: string;
}

const REPORT_TYPES = [
  { value: "candidates", label: "Candidatos", description: "Lista detalhada de candidatos e votos" },
  { value: "parties", label: "Partidos", description: "Resumo de votos por partido" },
  { value: "voting_details", label: "Detalhes de Votação", description: "Dados completos de votação" },
  { value: "summary", label: "Resumo", description: "Estatísticas gerais" },
];

const FREQUENCIES = [
  { value: "once", label: "Única vez" },
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
];

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

export default function ReportAutomation() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  
  const [activeTab, setActiveTab] = useState<"templates" | "schedules" | "runs" | "recipients">("templates");
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showRecipientDialog, setShowRecipientDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    reportType: "candidates",
    filters: {} as Record<string, string | undefined>,
    isActive: true,
  });
  
  const [scheduleForm, setScheduleForm] = useState({
    templateId: 0,
    name: "",
    description: "",
    frequency: "daily",
    dayOfWeek: 1,
    dayOfMonth: 1,
    timeOfDay: "08:00",
    timezone: "America/Sao_Paulo",
    recipientEmails: [] as string[],
    isActive: true,
  });
  
  const [recipientForm, setRecipientForm] = useState({
    name: "",
    email: "",
    isActive: true,
  });
  
  const { data: templates, isLoading: templatesLoading } = useQuery<ReportTemplate[]>({
    queryKey: ["/api/report-templates"],
  });
  
  const { data: schedules, isLoading: schedulesLoading } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/report-schedules"],
  });
  
  const { data: runs, isLoading: runsLoading } = useQuery<ReportRun[]>({
    queryKey: ["/api/report-runs", { limit: 50 }],
  });
  
  const { data: recipients, isLoading: recipientsLoading } = useQuery<Recipient[]>({
    queryKey: ["/api/report-recipients"],
  });
  
  const { data: emailStatus } = useQuery<EmailStatus>({
    queryKey: ["/api/email/status"],
    enabled: isAdmin,
  });
  
  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });
  
  const { data: states } = useQuery<string[]>({
    queryKey: ["/api/analytics/states"],
  });
  
  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      return apiRequest("POST", "/api/report-templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-templates"] });
      setShowTemplateDialog(false);
      resetTemplateForm();
      toast({ title: "Template criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar template", variant: "destructive" });
    },
  });
  
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof templateForm> }) => {
      return apiRequest("PATCH", `/api/report-templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-templates"] });
      setShowTemplateDialog(false);
      setEditingTemplate(null);
      resetTemplateForm();
      toast({ title: "Template atualizado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar template", variant: "destructive" });
    },
  });
  
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/report-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-templates"] });
      toast({ title: "Template excluído" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir template", variant: "destructive" });
    },
  });
  
  const createScheduleMutation = useMutation({
    mutationFn: async (data: typeof scheduleForm) => {
      return apiRequest("POST", "/api/report-schedules", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setShowScheduleDialog(false);
      resetScheduleForm();
      toast({ title: "Agendamento criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar agendamento", variant: "destructive" });
    },
  });
  
  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof scheduleForm> }) => {
      return apiRequest("PATCH", `/api/report-schedules/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      setShowScheduleDialog(false);
      setEditingSchedule(null);
      resetScheduleForm();
      toast({ title: "Agendamento atualizado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar agendamento", variant: "destructive" });
    },
  });
  
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/report-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-schedules"] });
      toast({ title: "Agendamento excluído" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir agendamento", variant: "destructive" });
    },
  });
  
  const triggerReportMutation = useMutation({
    mutationFn: async ({ templateId, recipients }: { templateId: number; recipients?: string[] }) => {
      return apiRequest("POST", `/api/report-runs/trigger/${templateId}`, { recipients });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-runs"] });
      toast({ title: "Relatório em geração", description: "O relatório será gerado em breve." });
    },
    onError: () => {
      toast({ title: "Erro ao gerar relatório", variant: "destructive" });
    },
  });
  
  const createRecipientMutation = useMutation({
    mutationFn: async (data: typeof recipientForm) => {
      return apiRequest("POST", "/api/report-recipients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-recipients"] });
      setShowRecipientDialog(false);
      resetRecipientForm();
      toast({ title: "Destinatário adicionado" });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar destinatário", variant: "destructive" });
    },
  });
  
  const deleteRecipientMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/report-recipients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/report-recipients"] });
      toast({ title: "Destinatário removido" });
    },
    onError: () => {
      toast({ title: "Erro ao remover destinatário", variant: "destructive" });
    },
  });
  
  function resetTemplateForm() {
    setTemplateForm({
      name: "",
      description: "",
      reportType: "candidates",
      filters: {},
      isActive: true,
    });
  }
  
  function resetScheduleForm() {
    setScheduleForm({
      templateId: 0,
      name: "",
      description: "",
      frequency: "daily",
      dayOfWeek: 1,
      dayOfMonth: 1,
      timeOfDay: "08:00",
      timezone: "America/Sao_Paulo",
      recipientEmails: [],
      isActive: true,
    });
  }
  
  function resetRecipientForm() {
    setRecipientForm({
      name: "",
      email: "",
      isActive: true,
    });
  }
  
  function openEditTemplate(template: ReportTemplate) {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      reportType: template.reportType,
      filters: template.filters || {},
      isActive: template.isActive,
    });
    setShowTemplateDialog(true);
  }
  
  function openEditSchedule(schedule: ReportSchedule) {
    setEditingSchedule(schedule);
    setScheduleForm({
      templateId: schedule.templateId,
      name: schedule.name,
      description: schedule.description || "",
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek || 1,
      dayOfMonth: schedule.dayOfMonth || 1,
      timeOfDay: schedule.timeOfDay,
      timezone: schedule.timezone,
      recipientEmails: schedule.recipientEmails || [],
      isActive: schedule.isActive,
    });
    setShowScheduleDialog(true);
  }
  
  function handleSaveTemplate() {
    if (!templateForm.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateForm });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  }
  
  function handleSaveSchedule() {
    if (!scheduleForm.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (!scheduleForm.templateId) {
      toast({ title: "Selecione um template", variant: "destructive" });
      return;
    }
    
    if (editingSchedule) {
      updateScheduleMutation.mutate({ id: editingSchedule.id, data: scheduleForm });
    } else {
      createScheduleMutation.mutate(scheduleForm);
    }
  }
  
  function handleSaveRecipient() {
    if (!recipientForm.name.trim() || !recipientForm.email.trim()) {
      toast({ title: "Nome e email são obrigatórios", variant: "destructive" });
      return;
    }
    
    createRecipientMutation.mutate(recipientForm);
  }
  
  function formatDate(dateStr?: string) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("pt-BR");
  }
  
  function getStatusBadge(status: string) {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600"><Check className="h-3 w-3 mr-1" />Concluído</Badge>;
      case "running":
        return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Executando</Badge>;
      case "pending":
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case "failed":
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }
  
  const getReportTypeName = (type: string) => {
    return REPORT_TYPES.find(t => t.value === type)?.label || type;
  };
  
  const getFrequencyName = (freq: string) => {
    return FREQUENCIES.find(f => f.value === freq)?.label || freq;
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-automation">Automação de Relatórios</h1>
          <p className="text-muted-foreground">Crie templates e agende geração automática de relatórios</p>
        </div>
        {isAdmin && emailStatus && (
          <div className="flex items-center gap-2">
            {emailStatus.configured ? (
              <Badge variant="default" className="bg-green-600">
                <Mail className="h-3 w-3 mr-1" />
                Email Configurado
              </Badge>
            ) : (
              <Badge variant="outline">
                <AlertCircle className="h-3 w-3 mr-1" />
                Email não configurado
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === "templates" ? "default" : "ghost"}
          onClick={() => setActiveTab("templates")}
          data-testid="tab-templates"
        >
          <FileText className="h-4 w-4 mr-2" />
          Templates
        </Button>
        <Button
          variant={activeTab === "schedules" ? "default" : "ghost"}
          onClick={() => setActiveTab("schedules")}
          data-testid="tab-schedules"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Agendamentos
        </Button>
        <Button
          variant={activeTab === "runs" ? "default" : "ghost"}
          onClick={() => setActiveTab("runs")}
          data-testid="tab-runs"
        >
          <Clock className="h-4 w-4 mr-2" />
          Execuções
        </Button>
        <Button
          variant={activeTab === "recipients" ? "default" : "ghost"}
          onClick={() => setActiveTab("recipients")}
          data-testid="tab-recipients"
        >
          <Users className="h-4 w-4 mr-2" />
          Destinatários
        </Button>
      </div>

      {activeTab === "templates" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Templates de Relatório</CardTitle>
              <CardDescription>Defina modelos de relatórios para geração automatizada</CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={() => { resetTemplateForm(); setEditingTemplate(null); setShowTemplateDialog(true); }} data-testid="button-new-template">
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !templates?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum template criado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Filtros</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{template.name}</p>
                          {template.description && (
                            <p className="text-sm text-muted-foreground">{template.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getReportTypeName(template.reportType)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {template.filters?.year && <Badge variant="secondary" className="text-xs">Ano: {template.filters.year}</Badge>}
                          {template.filters?.state && <Badge variant="secondary" className="text-xs">UF: {template.filters.state}</Badge>}
                          {template.filters?.position && <Badge variant="secondary" className="text-xs">{template.filters.position}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {template.isActive ? (
                          <Badge variant="default" className="bg-green-600">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => triggerReportMutation.mutate({ templateId: template.id })}
                            disabled={triggerReportMutation.isPending}
                            title="Gerar agora"
                            data-testid={`button-trigger-${template.id}`}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditTemplate(template)}
                                title="Editar"
                                data-testid={`button-edit-${template.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => deleteTemplateMutation.mutate(template.id)}
                                disabled={deleteTemplateMutation.isPending}
                                title="Excluir"
                                data-testid={`button-delete-${template.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "schedules" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Agendamentos</CardTitle>
              <CardDescription>Configure quando os relatórios devem ser gerados automaticamente</CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={() => { resetScheduleForm(); setEditingSchedule(null); setShowScheduleDialog(true); }} data-testid="button-new-schedule">
                <Plus className="h-4 w-4 mr-2" />
                Novo Agendamento
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {schedulesLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !schedules?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum agendamento criado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Frequência</TableHead>
                    <TableHead>Próxima Execução</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map((schedule) => {
                    const template = templates?.find(t => t.id === schedule.templateId);
                    return (
                      <TableRow key={schedule.id} data-testid={`row-schedule-${schedule.id}`}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{schedule.name}</p>
                            {schedule.description && (
                              <p className="text-sm text-muted-foreground">{schedule.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{template?.name || `ID: ${schedule.templateId}`}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{getFrequencyName(schedule.frequency)}</p>
                            <p className="text-sm text-muted-foreground">{schedule.timeOfDay}</p>
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(schedule.nextRunAt)}</TableCell>
                        <TableCell>
                          {schedule.isActive ? (
                            <Badge variant="default" className="bg-green-600">Ativo</Badge>
                          ) : (
                            <Badge variant="outline">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {isAdmin && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditSchedule(schedule)}
                                  title="Editar"
                                  data-testid={`button-edit-schedule-${schedule.id}`}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteScheduleMutation.mutate(schedule.id)}
                                  disabled={deleteScheduleMutation.isPending}
                                  title="Excluir"
                                  data-testid={`button-delete-schedule-${schedule.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "runs" && (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Execuções</CardTitle>
            <CardDescription>Últimos relatórios gerados</CardDescription>
          </CardHeader>
          <CardContent>
            {runsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !runs?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma execução registrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Iniciado</TableHead>
                    <TableHead>Linhas</TableHead>
                    <TableHead>Emails</TableHead>
                    <TableHead>Tempo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => {
                    const template = templates?.find(t => t.id === run.templateId);
                    return (
                      <TableRow key={run.id} data-testid={`row-run-${run.id}`}>
                        <TableCell className="font-mono">#{run.id}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{template?.name || `ID: ${run.templateId}`}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{run.triggeredBy === "manual" ? "Manual" : "Agendado"}</Badge>
                        </TableCell>
                        <TableCell>{getStatusBadge(run.status)}</TableCell>
                        <TableCell>{formatDate(run.startedAt || run.createdAt)}</TableCell>
                        <TableCell>{run.rowCount?.toLocaleString("pt-BR") || "-"}</TableCell>
                        <TableCell>{run.emailsSent || 0}</TableCell>
                        <TableCell>
                          {run.executionTimeMs ? `${(run.executionTimeMs / 1000).toFixed(1)}s` : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "recipients" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Destinatários</CardTitle>
              <CardDescription>Lista de emails para receber relatórios</CardDescription>
            </div>
            {isAdmin && (
              <Button onClick={() => { resetRecipientForm(); setShowRecipientDialog(true); }} data-testid="button-new-recipient">
                <Plus className="h-4 w-4 mr-2" />
                Novo Destinatário
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!emailStatus?.configured && (
              <div className="mb-4 p-4 border rounded-lg bg-muted/50">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                  <div>
                    <p className="font-medium">Email não configurado</p>
                    <p className="text-sm text-muted-foreground">
                      Configure o secret RESEND_API_KEY para habilitar o envio de emails.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {recipientsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !recipients?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum destinatário cadastrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((recipient) => (
                    <TableRow key={recipient.id} data-testid={`row-recipient-${recipient.id}`}>
                      <TableCell className="font-medium">{recipient.name}</TableCell>
                      <TableCell>{recipient.email}</TableCell>
                      <TableCell>
                        {recipient.isActive ? (
                          <Badge variant="default" className="bg-green-600">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteRecipientMutation.mutate(recipient.id)}
                            disabled={deleteRecipientMutation.isPending}
                            title="Remover"
                            data-testid={`button-delete-recipient-${recipient.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template de Relatório"}</DialogTitle>
            <DialogDescription>Configure o modelo de relatório que será gerado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Nome</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Candidatos SP 2022"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">Descrição</Label>
              <Textarea
                id="template-description"
                value={templateForm.description}
                onChange={(e) => setTemplateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descrição opcional do relatório"
                data-testid="input-template-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Relatório</Label>
              <Select
                value={templateForm.reportType}
                onValueChange={(v) => setTemplateForm(f => ({ ...f, reportType: v }))}
              >
                <SelectTrigger data-testid="select-report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div>
                        <p>{type.label}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ano</Label>
                <Select
                  value={templateForm.filters.year || "all"}
                  onValueChange={(v) => setTemplateForm(f => ({ 
                    ...f, 
                    filters: { ...f.filters, year: v === "all" ? undefined : v } 
                  }))}
                >
                  <SelectTrigger data-testid="select-filter-year">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {years?.map((year) => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={templateForm.filters.state || "all"}
                  onValueChange={(v) => setTemplateForm(f => ({ 
                    ...f, 
                    filters: { ...f.filters, state: v === "all" ? undefined : v } 
                  }))}
                >
                  <SelectTrigger data-testid="select-filter-state">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {states?.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="template-active"
                checked={templateForm.isActive}
                onCheckedChange={(c) => setTemplateForm(f => ({ ...f, isActive: c }))}
              />
              <Label htmlFor="template-active">Template ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending}
              data-testid="button-save-template"
            >
              {(createTemplateMutation.isPending || updateTemplateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingTemplate ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
            <DialogDescription>Configure quando o relatório deve ser gerado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="schedule-name">Nome</Label>
              <Input
                id="schedule-name"
                value={scheduleForm.name}
                onChange={(e) => setScheduleForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Relatório semanal SP"
                data-testid="input-schedule-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select
                value={String(scheduleForm.templateId) || "0"}
                onValueChange={(v) => setScheduleForm(f => ({ ...f, templateId: parseInt(v) }))}
              >
                <SelectTrigger data-testid="select-schedule-template">
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.filter(t => t.isActive).map((template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select
                  value={scheduleForm.frequency}
                  onValueChange={(v) => setScheduleForm(f => ({ ...f, frequency: v }))}
                >
                  <SelectTrigger data-testid="select-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((freq) => (
                      <SelectItem key={freq.value} value={freq.value}>{freq.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={scheduleForm.timeOfDay}
                  onChange={(e) => setScheduleForm(f => ({ ...f, timeOfDay: e.target.value }))}
                  data-testid="input-time"
                />
              </div>
            </div>
            {scheduleForm.frequency === "weekly" && (
              <div className="space-y-2">
                <Label>Dia da Semana</Label>
                <Select
                  value={String(scheduleForm.dayOfWeek)}
                  onValueChange={(v) => setScheduleForm(f => ({ ...f, dayOfWeek: parseInt(v) }))}
                >
                  <SelectTrigger data-testid="select-day-of-week">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {scheduleForm.frequency === "monthly" && (
              <div className="space-y-2">
                <Label>Dia do Mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={scheduleForm.dayOfMonth}
                  onChange={(e) => setScheduleForm(f => ({ ...f, dayOfMonth: parseInt(e.target.value) }))}
                  data-testid="input-day-of-month"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="schedule-active"
                checked={scheduleForm.isActive}
                onCheckedChange={(c) => setScheduleForm(f => ({ ...f, isActive: c }))}
              />
              <Label htmlFor="schedule-active">Agendamento ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveSchedule}
              disabled={createScheduleMutation.isPending || updateScheduleMutation.isPending}
              data-testid="button-save-schedule"
            >
              {(createScheduleMutation.isPending || updateScheduleMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingSchedule ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRecipientDialog} onOpenChange={setShowRecipientDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Destinatário</DialogTitle>
            <DialogDescription>Adicione um email para receber relatórios</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient-name">Nome</Label>
              <Input
                id="recipient-name"
                value={recipientForm.name}
                onChange={(e) => setRecipientForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Nome do destinatário"
                data-testid="input-recipient-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipient-email">Email</Label>
              <Input
                id="recipient-email"
                type="email"
                value={recipientForm.email}
                onChange={(e) => setRecipientForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
                data-testid="input-recipient-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecipientDialog(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveRecipient}
              disabled={createRecipientMutation.isPending}
              data-testid="button-save-recipient"
            >
              {createRecipientMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
