import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, Plus, Target, Calendar, DollarSign, Users, Activity, 
  Brain, BarChart3, Trash2, Edit, ChevronRight, TrendingUp, 
  Clock, CheckCircle2, AlertCircle, Pause, Play, MapPin,
  UserPlus, CalendarDays, Flag, Bell, ChevronLeft, ChevronRight as ChevronRightIcon,
  UserCheck, UserMinus, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend 
} from "recharts";
import type { 
  Campaign, CampaignBudget, CampaignResource, CampaignMetric, 
  CampaignActivity, CampaignInsightSession 
} from "@shared/schema";

const campaignFormSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  description: z.string().optional().nullable(),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  endDate: z.string().min(1, "Data de término é obrigatória"),
  goal: z.string().optional().nullable(),
  targetVotes: z.coerce.number().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  position: z.string().default("vereador"),
  totalBudget: z.string().optional().nullable(),
});

const budgetFormSchema = z.object({
  category: z.string().min(1, "Categoria é obrigatória"),
  categoryLabel: z.string().min(1, "Nome da categoria é obrigatório"),
  allocatedAmount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Valor deve ser positivo"),
  notes: z.string().optional().nullable(),
});

const resourceFormSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  type: z.string().min(1, "Tipo é obrigatório"),
  quantity: z.coerce.number().min(1, "Quantidade deve ser pelo menos 1"),
  unitCost: z.string().optional().nullable(),
  status: z.string().default("available"),
  assignedTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const activityFormSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  description: z.string().optional().nullable(),
  type: z.string().min(1, "Tipo é obrigatório"),
  scheduledDate: z.string().optional().nullable(),
  priority: z.string().default("medium"),
  assignedTo: z.string().optional().nullable(),
  estimatedCost: z.string().optional().nullable(),
});

const metricFormSchema = z.object({
  kpiName: z.string().min(1, "Nome do KPI é obrigatório"),
  kpiValue: z.string().refine(val => !isNaN(parseFloat(val)), "Valor deve ser numérico"),
  targetValue: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  metricDate: z.string().min(1, "Data é obrigatória"),
  notes: z.string().optional().nullable(),
});

type CampaignFormData = z.infer<typeof campaignFormSchema>;
type BudgetFormData = z.infer<typeof budgetFormSchema>;

interface CampaignDetail {
  campaign: Campaign;
  budgets: CampaignBudget[];
  resources: CampaignResource[];
  metrics: CampaignMetric[];
  activities: CampaignActivity[];
  aiSession: CampaignInsightSession | null;
}

interface PerformanceSummary {
  budgetUtilization: number;
  activityCompletionRate: number;
  resourceAllocation: number;
  latestMetrics: Array<{ name: string; value: number; target: number | null }>;
  daysRemaining: number;
  progressPercentage: number;
  activitiesCompleted: number;
  activitiesTotal: number;
}
type ResourceFormData = z.infer<typeof resourceFormSchema>;
type ActivityFormData = z.infer<typeof activityFormSchema>;
type MetricFormData = z.infer<typeof metricFormSchema>;

const BUDGET_CATEGORIES = [
  { value: "advertising", label: "Publicidade e Propaganda" },
  { value: "events", label: "Eventos e Comícios" },
  { value: "staff", label: "Equipe e Funcionários" },
  { value: "materials", label: "Materiais Gráficos" },
  { value: "digital", label: "Marketing Digital" },
  { value: "transport", label: "Transporte e Logística" },
  { value: "other", label: "Outros" },
];

const RESOURCE_TYPES = [
  { value: "staff", label: "Funcionário" },
  { value: "volunteer", label: "Voluntário" },
  { value: "vehicle", label: "Veículo" },
  { value: "equipment", label: "Equipamento" },
  { value: "material", label: "Material" },
];

const ACTIVITY_TYPES = [
  { value: "event", label: "Evento" },
  { value: "meeting", label: "Reunião" },
  { value: "action", label: "Ação de Campo" },
  { value: "milestone", label: "Marco" },
];

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500",
  active: "bg-green-500",
  paused: "bg-yellow-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const CHART_COLORS = ["#003366", "#FFD700", "#4CAF50", "#FF5722", "#9C27B0", "#00BCD4", "#795548"];

export default function Campaigns() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  const [showResourceDialog, setShowResourceDialog] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [showMetricDialog, setShowMetricDialog] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("list");

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      goal: "",
      targetVotes: "",
      targetRegion: "",
      position: "vereador",
      totalBudget: "",
    },
  });

  const budgetForm = useForm<BudgetFormData>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      category: "",
      categoryLabel: "",
      allocatedAmount: "0",
      notes: "",
    },
  });

  const resourceForm = useForm<ResourceFormData>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      name: "",
      type: "",
      quantity: "1",
      unitCost: "",
      status: "available",
      assignedTo: "",
      notes: "",
    },
  });

  const activityForm = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "",
      scheduledDate: "",
      priority: "medium",
      assignedTo: "",
      estimatedCost: "",
    },
  });

  const metricForm = useForm<MetricFormData>({
    resolver: zodResolver(metricFormSchema),
    defaultValues: {
      kpiName: "",
      kpiValue: "",
      targetValue: "",
      unit: "",
      source: "manual",
      metricDate: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });

  const { data: campaigns, isLoading: loadingCampaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns"],
  });

  const { data: campaignDetail, isLoading: loadingDetail } = useQuery<CampaignDetail>({
    queryKey: ["/api/campaigns", selectedCampaign],
    enabled: !!selectedCampaign,
  });

  const { data: performance } = useQuery<PerformanceSummary>({
    queryKey: ["/api/campaigns", selectedCampaign, "performance"],
    enabled: !!selectedCampaign,
  });

  const { data: aiSessions } = useQuery<CampaignInsightSession[]>({
    queryKey: ["/api/campaign-insights/sessions"],
  });

  const { data: parties } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/parties"],
  });

  const { data: users } = useQuery<Array<{ id: string; name: string; username: string; email: string; role: string }>>({
    queryKey: ["/api/users"],
  });

  const { data: teamMembers, refetch: refetchTeam } = useQuery<any[]>({
    queryKey: ["/api/campaigns", selectedCampaign, "team"],
    enabled: !!selectedCampaign,
  });

  const { data: kpiGoals, refetch: refetchKpiGoals } = useQuery<any[]>({
    queryKey: ["/api/campaigns", selectedCampaign, "kpi-goals"],
    enabled: !!selectedCampaign,
  });

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [showKpiGoalDialog, setShowKpiGoalDialog] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Team form state
  const [teamFormUserId, setTeamFormUserId] = useState("");
  const [teamFormRole, setTeamFormRole] = useState("member");

  // KPI form state
  const [kpiFormKpiName, setKpiFormKpiName] = useState("");
  const [kpiFormTargetValue, setKpiFormTargetValue] = useState("");
  const [kpiFormBaselineValue, setKpiFormBaselineValue] = useState("");
  const [kpiFormUnit, setKpiFormUnit] = useState("number");
  const [kpiFormPriority, setKpiFormPriority] = useState("medium");
  const [kpiFormStartDate, setKpiFormStartDate] = useState("");
  const [kpiFormEndDate, setKpiFormEndDate] = useState("");

  // Calendar activities query - use activities from campaign detail
  const { data: calendarActivities, isLoading: loadingCalendar } = useQuery<any[]>({
    queryKey: ["/api/campaigns", selectedCampaign, "activities"],
    enabled: !!selectedCampaign,
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      return apiRequest("POST", "/api/campaigns", {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        targetVotes: data.targetVotes || undefined,
        totalBudget: data.totalBudget || "0",
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Campanha criada com sucesso" });
      setShowCreateDialog(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createBudgetMutation = useMutation({
    mutationFn: async (data: BudgetFormData) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/budgets`, {
        ...data,
        allocatedAmount: data.allocatedAmount,
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Orçamento criado com sucesso" });
      setShowBudgetDialog(false);
      budgetForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createResourceMutation = useMutation({
    mutationFn: async (data: ResourceFormData) => {
      const unitCost = data.unitCost ? parseFloat(data.unitCost) : 0;
      const quantity = parseInt(data.quantity);
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/resources`, {
        ...data,
        quantity,
        unitCost: unitCost.toString(),
        totalCost: (unitCost * quantity).toString(),
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Recurso criado com sucesso" });
      setShowResourceDialog(false);
      resourceForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: async (data: ActivityFormData) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/activities`, {
        ...data,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
        estimatedCost: data.estimatedCost || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Atividade criada com sucesso" });
      setShowActivityDialog(false);
      activityForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createMetricMutation = useMutation({
    mutationFn: async (data: MetricFormData) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/metrics`, {
        ...data,
        metricDate: new Date(data.metricDate),
        kpiValue: data.kpiValue,
        targetValue: data.targetValue || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Métrica registrada com sucesso" });
      setShowMetricDialog(false);
      metricForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const linkAiSessionMutation = useMutation({
    mutationFn: async (aiSessionId: number) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/link-ai-session`, { aiSessionId });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Sessão de IA vinculada com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/campaigns/${selectedCampaign}`, { status });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Status atualizado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  // Team member mutations
  const addTeamMemberMutation = useMutation({
    mutationFn: async (data: { userId: string; role: string; notes?: string }) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/team`, data);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Membro adicionado à equipe" });
      setShowTeamDialog(false);
      setTeamFormUserId("");
      setTeamFormRole("member");
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign, "team"] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      return apiRequest("DELETE", `/api/campaigns/${selectedCampaign}/team/${memberId}`);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Membro removido da equipe" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign, "team"] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  // KPI goal mutations
  const createKpiGoalMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/kpi-goals`, data);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Meta de KPI criada" });
      setShowKpiGoalDialog(false);
      setKpiFormKpiName("");
      setKpiFormTargetValue("");
      setKpiFormBaselineValue("");
      setKpiFormUnit("number");
      setKpiFormPriority("medium");
      setKpiFormStartDate("");
      setKpiFormEndDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign, "kpi-goals"] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const updateKpiGoalMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; [key: string]: any }) => {
      return apiRequest("PATCH", `/api/campaigns/${selectedCampaign}/kpi-goals/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Meta de KPI atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign, "kpi-goals"] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteKpiGoalMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/campaigns/${selectedCampaign}/kpi-goals/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Meta de KPI removida" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign, "kpi-goals"] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  // Fetch AI recommendations for KPIs
  const fetchAiRecommendations = async () => {
    setLoadingRecommendations(true);
    try {
      const response = await apiRequest("POST", `/api/campaigns/${selectedCampaign}/kpi-goals/ai-recommendations`);
      setAiRecommendations(response.recommendations || []);
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao obter recomendações de IA", variant: "destructive" });
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const formatCurrency = (value: string | number | null | undefined) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (!num && num !== 0) return "R$ 0,00";
    return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const budgetChartData = campaignDetail?.budgets?.map((b: any) => ({
    name: b.categoryLabel,
    allocated: parseFloat(b.allocatedAmount || 0),
    spent: parseFloat(b.spentAmount || 0),
  })) || [];

  const metricsChartData = campaignDetail?.metrics?.slice(0, 10).reverse().map((m: any) => ({
    date: formatDate(m.metricDate),
    value: parseFloat(m.kpiValue),
    target: m.targetValue ? parseFloat(m.targetValue) : null,
  })) || [];

  if (loadingCampaigns) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Gestão de Campanhas</h1>
          <p className="text-muted-foreground">Gerencie campanhas eleitorais, orçamentos e recursos</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-campaign">
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Nova Campanha</DialogTitle>
              <DialogDescription>Defina os detalhes da campanha eleitoral</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createCampaignMutation.mutate(data))} className="space-y-4">
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
                        <Textarea {...field} placeholder="Descrição da campanha..." data-testid="input-campaign-description" />
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
                          <Input {...field} placeholder="Ex: São Paulo" data-testid="input-campaign-region" />
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
                          <Input type="number" {...field} placeholder="100000" data-testid="input-campaign-votes" />
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
                          <Input type="number" step="0.01" {...field} placeholder="500000" data-testid="input-campaign-budget" />
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
                        <Textarea {...field} placeholder="Qual o objetivo principal desta campanha?" data-testid="input-campaign-goal" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-campaign">
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
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="list" data-testid="tab-list">Lista de Campanhas</TabsTrigger>
          {selectedCampaign && (
            <>
              <TabsTrigger value="overview" data-testid="tab-overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="team" data-testid="tab-team">Equipe</TabsTrigger>
              <TabsTrigger value="budget" data-testid="tab-budget">Orçamento</TabsTrigger>
              <TabsTrigger value="resources" data-testid="tab-resources">Recursos</TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-activities">Atividades</TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">Calendário</TabsTrigger>
              <TabsTrigger value="kpi-goals" data-testid="tab-kpi-goals">Metas KPI</TabsTrigger>
              <TabsTrigger value="performance" data-testid="tab-performance">Desempenho</TabsTrigger>
              <TabsTrigger value="ai" data-testid="tab-ai">IA Estratégica</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {campaigns && campaigns.length > 0 ? (
            <div className="grid gap-4">
              {campaigns.map((campaign: any) => (
                <Card 
                  key={campaign.id} 
                  className="hover-elevate cursor-pointer"
                  onClick={() => {
                    setSelectedCampaign(campaign.id);
                    setActiveTab("overview");
                  }}
                  data-testid={`card-campaign-${campaign.id}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[campaign.status]}`} />
                        <div>
                          <h3 className="font-semibold text-lg" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Orçamento</p>
                          <p className="font-semibold">{formatCurrency(campaign.totalBudget)}</p>
                        </div>
                        <Badge variant="outline">{STATUS_LABELS[campaign.status]}</Badge>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card data-testid="empty-campaigns">
              <CardContent className="p-12 text-center">
                <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhuma campanha criada</h3>
                <p className="text-muted-foreground mb-4">Crie sua primeira campanha eleitoral para começar</p>
                <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-campaign">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Campanha
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {selectedCampaign && campaignDetail && (
          <>
            <TabsContent value="overview" className="space-y-6">
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => { setSelectedCampaign(null); setActiveTab("list"); }} data-testid="button-back-list">
                  Voltar para lista
                </Button>
                <div className="flex gap-2">
                  {campaignDetail.campaign.status === "planning" && (
                    <Button onClick={() => updateStatusMutation.mutate("active")} data-testid="button-start-campaign">
                      <Play className="h-4 w-4 mr-2" />
                      Iniciar Campanha
                    </Button>
                  )}
                  {campaignDetail.campaign.status === "active" && (
                    <Button variant="outline" onClick={() => updateStatusMutation.mutate("paused")} data-testid="button-pause-campaign">
                      <Pause className="h-4 w-4 mr-2" />
                      Pausar
                    </Button>
                  )}
                  {campaignDetail.campaign.status === "paused" && (
                    <Button onClick={() => updateStatusMutation.mutate("active")} data-testid="button-resume-campaign">
                      <Play className="h-4 w-4 mr-2" />
                      Retomar
                    </Button>
                  )}
                  {(campaignDetail.campaign.status === "active" || campaignDetail.campaign.status === "paused") && (
                    <Button variant="outline" onClick={() => updateStatusMutation.mutate("completed")} data-testid="button-complete-campaign">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Concluir
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card data-testid="stat-progress">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Activity className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Progresso</p>
                        <p className="text-2xl font-bold">{Math.round(performance?.progressPercentage || 0)}%</p>
                        <Progress value={performance?.progressPercentage || 0} className="mt-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="stat-days-remaining">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-blue-500/10">
                        <Clock className="h-6 w-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Dias Restantes</p>
                        <p className="text-2xl font-bold">{performance?.daysRemaining || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="stat-budget-utilization">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-green-500/10">
                        <DollarSign className="h-6 w-6 text-green-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Uso do Orçamento</p>
                        <p className="text-2xl font-bold">{Math.round(performance?.budgetUtilization || 0)}%</p>
                        <Progress value={performance?.budgetUtilization || 0} className="mt-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="stat-activities">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-purple-500/10">
                        <CheckCircle2 className="h-6 w-6 text-purple-500" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Atividades</p>
                        <p className="text-2xl font-bold">{performance?.activitiesCompleted || 0}/{performance?.activitiesTotal || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Detalhes da Campanha</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge variant="outline" className="mt-1">{STATUS_LABELS[campaignDetail.campaign.status]}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Cargo</p>
                        <p className="font-medium">{campaignDetail.campaign.position}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Região</p>
                        <p className="font-medium">{campaignDetail.campaign.targetRegion || "-"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Meta de Votos</p>
                        <p className="font-medium">{campaignDetail.campaign.targetVotes?.toLocaleString("pt-BR") || "-"}</p>
                      </div>
                    </div>
                    {campaignDetail.campaign.goal && (
                      <div>
                        <p className="text-sm text-muted-foreground">Objetivo</p>
                        <p className="text-sm mt-1">{campaignDetail.campaign.goal}</p>
                      </div>
                    )}
                    {campaignDetail.campaign.description && (
                      <div>
                        <p className="text-sm text-muted-foreground">Descrição</p>
                        <p className="text-sm mt-1">{campaignDetail.campaign.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Métricas Recentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {performance?.latestMetrics && performance.latestMetrics.length > 0 ? (
                      <div className="space-y-4">
                        {performance.latestMetrics.map((metric: any, index: number) => (
                          <div key={index} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{metric.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Meta: {metric.target?.toLocaleString("pt-BR") || "-"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold">{metric.value.toLocaleString("pt-BR")}</p>
                              {metric.target && (
                                <p className={`text-sm ${metric.value >= metric.target ? "text-green-500" : "text-yellow-500"}`}>
                                  {Math.round((metric.value / metric.target) * 100)}% da meta
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">Nenhuma métrica registrada</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Team Tab */}
            <TabsContent value="team" className="space-y-6">
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
                        onClick={() => {
                          if (teamFormUserId) {
                            addTeamMemberMutation.mutate({ userId: teamFormUserId, role: teamFormRole });
                          }
                        }}
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
            </TabsContent>

            <TabsContent value="budget" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Orçamento da Campanha</h2>
                  <p className="text-muted-foreground">Gerencie a alocação de recursos financeiros</p>
                </div>
                <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-budget">
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Categoria
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova Categoria de Orçamento</DialogTitle>
                    </DialogHeader>
                    <Form {...budgetForm}>
                      <form onSubmit={budgetForm.handleSubmit((data) => createBudgetMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={budgetForm.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Categoria</FormLabel>
                              <Select onValueChange={(value) => {
                                field.onChange(value);
                                const label = BUDGET_CATEGORIES.find(c => c.value === value)?.label || "";
                                budgetForm.setValue("categoryLabel", label);
                              }}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-budget-category">
                                    <SelectValue placeholder="Selecione a categoria" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {BUDGET_CATEGORIES.map(cat => (
                                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={budgetForm.control}
                          name="allocatedAmount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Valor Alocado (R$)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" {...field} data-testid="input-budget-amount" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={budgetForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Observações</FormLabel>
                              <FormControl>
                                <Textarea {...field} data-testid="input-budget-notes" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button type="submit" disabled={createBudgetMutation.isPending} data-testid="button-submit-budget">
                            {createBudgetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Adicionar
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Distribuição por Categoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {budgetChartData.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={budgetChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                            <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                            <Tooltip formatter={(v: number) => formatCurrency(v)} />
                            <Legend />
                            <Bar dataKey="allocated" name="Alocado" fill="#003366" />
                            <Bar dataKey="spent" name="Gasto" fill="#FFD700" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-12">Nenhum orçamento definido</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Detalhamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Categoria</TableHead>
                          <TableHead className="text-right">Alocado</TableHead>
                          <TableHead className="text-right">Gasto</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {campaignDetail.budgets.map((budget: any) => (
                          <TableRow key={budget.id} data-testid={`row-budget-${budget.id}`}>
                            <TableCell>{budget.categoryLabel}</TableCell>
                            <TableCell className="text-right">{formatCurrency(budget.allocatedAmount)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(budget.spentAmount)}</TableCell>
                            <TableCell className="text-right">
                              {Math.round((parseFloat(budget.spentAmount || 0) / parseFloat(budget.allocatedAmount || 1)) * 100)}%
                            </TableCell>
                          </TableRow>
                        ))}
                        {campaignDetail.budgets.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              Nenhum orçamento definido
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="resources" className="space-y-6">
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
                      <form onSubmit={resourceForm.handleSubmit((data) => createResourceMutation.mutate(data))} className="space-y-4">
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
                                  <Input type="number" step="0.01" {...field} data-testid="input-resource-cost" />
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
                                <Input {...field} placeholder="Nome do responsável" data-testid="input-resource-assigned" />
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
            </TabsContent>

            <TabsContent value="activities" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Atividades</h2>
                  <p className="text-muted-foreground">Eventos, reuniões e ações de campanha</p>
                </div>
                <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-activity">
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Atividade
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova Atividade</DialogTitle>
                    </DialogHeader>
                    <Form {...activityForm}>
                      <form onSubmit={activityForm.handleSubmit((data) => createActivityMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={activityForm.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Título</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ex: Comício no Centro" data-testid="input-activity-title" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={activityForm.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Tipo</FormLabel>
                                <Select onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-activity-type">
                                      <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {ACTIVITY_TYPES.map(t => (
                                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={activityForm.control}
                            name="scheduledDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Data Programada</FormLabel>
                                <FormControl>
                                  <Input type="datetime-local" {...field} data-testid="input-activity-date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={activityForm.control}
                            name="priority"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Prioridade</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-activity-priority">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="low">Baixa</SelectItem>
                                    <SelectItem value="medium">Média</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                    <SelectItem value="critical">Crítica</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={activityForm.control}
                            name="estimatedCost"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Custo Estimado (R$)</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid="input-activity-cost" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={activityForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Descrição</FormLabel>
                              <FormControl>
                                <Textarea {...field} data-testid="input-activity-description" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <Button type="submit" disabled={createActivityMutation.isPending} data-testid="button-submit-activity">
                            {createActivityMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Criar Atividade
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4">
                {campaignDetail.activities.length > 0 ? (
                  campaignDetail.activities.map((activity: any) => (
                    <Card key={activity.id} data-testid={`card-activity-${activity.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-lg ${
                              activity.status === "completed" ? "bg-green-500/10" :
                              activity.status === "in_progress" ? "bg-blue-500/10" :
                              activity.status === "cancelled" ? "bg-red-500/10" : "bg-gray-500/10"
                            }`}>
                              {activity.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                               activity.status === "in_progress" ? <Activity className="h-5 w-5 text-blue-500" /> :
                               activity.status === "cancelled" ? <AlertCircle className="h-5 w-5 text-red-500" /> :
                               <Clock className="h-5 w-5 text-gray-500" />}
                            </div>
                            <div>
                              <h4 className="font-semibold">{activity.title}</h4>
                              <p className="text-sm text-muted-foreground">
                                {ACTIVITY_TYPES.find(t => t.value === activity.type)?.label} • {formatDate(activity.scheduledDate)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              activity.priority === "critical" ? "destructive" :
                              activity.priority === "high" ? "default" :
                              activity.priority === "medium" ? "secondary" : "outline"
                            }>
                              {activity.priority === "critical" ? "Crítica" :
                               activity.priority === "high" ? "Alta" :
                               activity.priority === "medium" ? "Média" : "Baixa"}
                            </Badge>
                            {activity.estimatedCost && (
                              <span className="text-sm text-muted-foreground">{formatCurrency(activity.estimatedCost)}</span>
                            )}
                          </div>
                        </div>
                        {activity.description && (
                          <p className="text-sm text-muted-foreground mt-2 ml-14">{activity.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">Nenhuma atividade</h3>
                      <p className="text-muted-foreground">Adicione eventos e ações para sua campanha</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Calendar Tab */}
            <TabsContent value="calendar" className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold">Calendário de Atividades</h3>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                    data-testid="button-calendar-prev"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="font-medium min-w-[150px] text-center">
                    {calendarDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                  </span>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                    data-testid="button-calendar-next"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-4">
                  {loadingCalendar ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                  <>
                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => (
                      <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                        {day}
                      </div>
                    ))}
                    
                    {/* Generate calendar days */}
                    {(() => {
                      const year = calendarDate.getFullYear();
                      const month = calendarDate.getMonth();
                      const firstDay = new Date(year, month, 1).getDay();
                      const daysInMonth = new Date(year, month + 1, 0).getDate();
                      const days = [];
                      
                      // Empty cells for days before the first of the month
                      for (let i = 0; i < firstDay; i++) {
                        days.push(<div key={`empty-${i}`} className="p-2 min-h-[100px]" />);
                      }
                      
                      // Days of the month
                      for (let day = 1; day <= daysInMonth; day++) {
                        const date = new Date(year, month, day);
                        const dayActivities = calendarActivities?.filter((a: any) => {
                          const actDate = new Date(a.scheduledDate);
                          return actDate.getDate() === day && 
                                 actDate.getMonth() === month && 
                                 actDate.getFullYear() === year;
                        }) || [];
                        
                        const isToday = new Date().toDateString() === date.toDateString();
                        
                        days.push(
                          <div 
                            key={day} 
                            className={`p-2 min-h-[100px] border rounded-md ${isToday ? 'bg-primary/5 border-primary' : 'border-border'}`}
                            data-testid={`calendar-day-${day}`}
                          >
                            <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                              {day}
                            </div>
                            <div className="space-y-1">
                              {dayActivities.slice(0, 3).map((activity: any) => (
                                <div 
                                  key={activity.id}
                                  className={`text-xs p-1 rounded truncate ${
                                    activity.type === 'event' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                    activity.type === 'meeting' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                    activity.type === 'milestone' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                                    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                  }`}
                                  title={activity.title}
                                >
                                  {activity.title}
                                </div>
                              ))}
                              {dayActivities.length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{dayActivities.length - 3} mais
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      
                      return days;
                    })()}
                  </div>
                  
                  {/* Legend */}
                  <div className="mt-4 flex flex-wrap gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-blue-500" />
                      <span>Evento</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-purple-500" />
                      <span>Reunião</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-amber-500" />
                      <span>Marco</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-green-500" />
                      <span>Ação</span>
                    </div>
                  </div>
                  </>
                  )}
                </CardContent>
              </Card>

              {/* Upcoming activities list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Próximas Atividades</CardTitle>
                </CardHeader>
                <CardContent>
                  {calendarActivities && calendarActivities.length > 0 ? (
                    <div className="space-y-2">
                      {calendarActivities
                        .filter((a: any) => new Date(a.scheduledDate) >= new Date())
                        .slice(0, 5)
                        .map((activity: any) => (
                          <div key={activity.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                            <div className="flex items-center gap-3">
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{activity.title}</p>
                                <p className="text-sm text-muted-foreground">{formatDate(activity.scheduledDate)}</p>
                              </div>
                            </div>
                            <Badge variant={activity.priority === 'high' ? 'destructive' : activity.priority === 'critical' ? 'destructive' : 'secondary'}>
                              {activity.priority === 'high' ? 'Alta' : activity.priority === 'critical' ? 'Crítica' : activity.priority === 'low' ? 'Baixa' : 'Média'}
                            </Badge>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">Nenhuma atividade programada</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* KPI Goals Tab */}
            <TabsContent value="kpi-goals" className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold">Metas de KPIs Estratégicos</h3>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={fetchAiRecommendations}
                    disabled={loadingRecommendations}
                    data-testid="button-ai-recommendations"
                  >
                    {loadingRecommendations ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Sugestões IA
                  </Button>
                  <Dialog open={showKpiGoalDialog} onOpenChange={setShowKpiGoalDialog}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-kpi-goal">
                        <Flag className="h-4 w-4 mr-2" />
                        Nova Meta
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Criar Meta de KPI</DialogTitle>
                        <DialogDescription>Defina uma meta estratégica para acompanhar</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Nome do KPI</label>
                          <Select value={kpiFormKpiName} onValueChange={setKpiFormKpiName}>
                            <SelectTrigger data-testid="select-kpi-name">
                              <SelectValue placeholder="Selecione o KPI" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="voter_reach">Alcance de Eleitores</SelectItem>
                              <SelectItem value="engagement_rate">Taxa de Engajamento</SelectItem>
                              <SelectItem value="conversion_rate">Taxa de Conversão</SelectItem>
                              <SelectItem value="sentiment_score">Score de Sentimento</SelectItem>
                              <SelectItem value="poll_position">Posição em Pesquisas</SelectItem>
                              <SelectItem value="donation_amount">Valor de Doações</SelectItem>
                              <SelectItem value="volunteer_count">Número de Voluntários</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Valor Meta</label>
                            <Input value={kpiFormTargetValue} onChange={(e) => setKpiFormTargetValue(e.target.value)} type="number" step="0.01" data-testid="input-kpi-target" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Valor Base</label>
                            <Input value={kpiFormBaselineValue} onChange={(e) => setKpiFormBaselineValue(e.target.value)} type="number" step="0.01" data-testid="input-kpi-baseline" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Unidade</label>
                            <Select value={kpiFormUnit} onValueChange={setKpiFormUnit}>
                              <SelectTrigger data-testid="select-kpi-unit">
                                <SelectValue placeholder="Unidade" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">Percentual (%)</SelectItem>
                                <SelectItem value="number">Número</SelectItem>
                                <SelectItem value="currency">Moeda (R$)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Prioridade</label>
                            <Select value={kpiFormPriority} onValueChange={setKpiFormPriority}>
                              <SelectTrigger data-testid="select-kpi-priority">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">Baixa</SelectItem>
                                <SelectItem value="medium">Média</SelectItem>
                                <SelectItem value="high">Alta</SelectItem>
                                <SelectItem value="critical">Crítica</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Data Início</label>
                            <Input value={kpiFormStartDate} onChange={(e) => setKpiFormStartDate(e.target.value)} type="date" data-testid="input-kpi-start-date" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Data Fim</label>
                            <Input value={kpiFormEndDate} onChange={(e) => setKpiFormEndDate(e.target.value)} type="date" data-testid="input-kpi-end-date" />
                          </div>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowKpiGoalDialog(false)}>Cancelar</Button>
                        <Button 
                          onClick={() => {
                            if (kpiFormKpiName && kpiFormTargetValue) {
                              createKpiGoalMutation.mutate({
                                kpiName: kpiFormKpiName,
                                targetValue: kpiFormTargetValue,
                                baselineValue: kpiFormBaselineValue || null,
                                unit: kpiFormUnit,
                                priority: kpiFormPriority,
                                startDate: kpiFormStartDate || null,
                                endDate: kpiFormEndDate || null,
                              });
                            }
                          }}
                          disabled={createKpiGoalMutation.isPending || !kpiFormKpiName || !kpiFormTargetValue}
                          data-testid="button-submit-kpi-goal"
                        >
                          {createKpiGoalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Meta"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* AI Recommendations */}
              {aiRecommendations.length > 0 && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Recomendações de IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {aiRecommendations.map((rec: any, index: number) => (
                        <Card key={index} className="bg-background">
                          <CardContent className="p-4">
                            <div className="flex justify-between items-start mb-2">
                              <p className="font-medium">{rec.kpiName}</p>
                              <Badge variant={rec.priority === 'high' ? 'destructive' : 'secondary'}>
                                {rec.priority === 'high' ? 'Alta' : rec.priority === 'low' ? 'Baixa' : 'Média'}
                              </Badge>
                            </div>
                            <p className="text-2xl font-bold text-primary mb-2">{rec.suggestedTarget}</p>
                            <p className="text-sm text-muted-foreground mb-3">{rec.rationale}</p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Confiança: {rec.confidence}%</span>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => createKpiGoalMutation.mutate({
                                  kpiName: rec.kpiName,
                                  targetValue: rec.suggestedTarget,
                                  priority: rec.priority,
                                  aiRecommendation: rec.rationale,
                                  aiConfidence: rec.confidence,
                                })}
                                data-testid={`button-use-ai-rec-${index}`}
                              >
                                Usar
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* KPI Goals List */}
              {kpiGoals && kpiGoals.length > 0 ? (
                <div className="grid gap-4">
                  {kpiGoals.map((goal: any) => {
                    const currentVal = parseFloat(goal.currentValue || 0);
                    const targetVal = parseFloat(goal.targetValue);
                    const baselineVal = parseFloat(goal.baselineValue || 0);
                    const progress = targetVal > baselineVal 
                      ? Math.min(100, ((currentVal - baselineVal) / (targetVal - baselineVal)) * 100)
                      : 0;
                    
                    return (
                      <Card key={goal.id} data-testid={`card-kpi-goal-${goal.id}`}>
                        <CardContent className="p-6">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-lg">
                                  {goal.kpiName === 'voter_reach' ? 'Alcance de Eleitores' :
                                   goal.kpiName === 'engagement_rate' ? 'Taxa de Engajamento' :
                                   goal.kpiName === 'conversion_rate' ? 'Taxa de Conversão' :
                                   goal.kpiName === 'sentiment_score' ? 'Score de Sentimento' :
                                   goal.kpiName === 'poll_position' ? 'Posição em Pesquisas' :
                                   goal.kpiName}
                                </h4>
                                <Badge variant={
                                  goal.status === 'achieved' ? 'default' : 
                                  goal.status === 'missed' ? 'destructive' : 'outline'
                                }>
                                  {goal.status === 'achieved' ? 'Alcançada' :
                                   goal.status === 'missed' ? 'Não Alcançada' :
                                   goal.status === 'cancelled' ? 'Cancelada' : 'Ativa'}
                                </Badge>
                                <Badge variant="secondary">
                                  {goal.priority === 'critical' ? 'Crítica' :
                                   goal.priority === 'high' ? 'Alta' :
                                   goal.priority === 'low' ? 'Baixa' : 'Média'}
                                </Badge>
                              </div>
                              {goal.aiRecommendation && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  {goal.aiRecommendation}
                                </p>
                              )}
                            </div>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              onClick={() => deleteKpiGoalMutation.mutate(goal.id)}
                              data-testid={`button-delete-kpi-${goal.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                              <span>Progresso</span>
                              <span className="font-medium">{progress.toFixed(1)}%</span>
                            </div>
                            <Progress value={progress} className="h-2" />
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div className="p-3 bg-muted/50 rounded-md">
                                <p className="text-xs text-muted-foreground">Base</p>
                                <p className="font-semibold">{baselineVal.toLocaleString("pt-BR")}{goal.unit === 'percentage' ? '%' : ''}</p>
                              </div>
                              <div className="p-3 bg-primary/10 rounded-md">
                                <p className="text-xs text-muted-foreground">Atual</p>
                                <p className="font-semibold text-primary">{currentVal.toLocaleString("pt-BR")}{goal.unit === 'percentage' ? '%' : ''}</p>
                              </div>
                              <div className="p-3 bg-muted/50 rounded-md">
                                <p className="text-xs text-muted-foreground">Meta</p>
                                <p className="font-semibold">{targetVal.toLocaleString("pt-BR")}{goal.unit === 'percentage' ? '%' : ''}</p>
                              </div>
                            </div>
                            {goal.startDate && goal.endDate && (
                              <p className="text-xs text-muted-foreground text-center">
                                Período: {formatDate(goal.startDate)} - {formatDate(goal.endDate)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Flag className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Nenhuma meta definida</h3>
                    <p className="text-muted-foreground mb-4">Defina metas de KPIs para acompanhar o progresso da campanha</p>
                    <div className="flex gap-2 justify-center">
                      <Button variant="outline" onClick={fetchAiRecommendations} disabled={loadingRecommendations}>
                        {loadingRecommendations ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                        Obter Sugestões IA
                      </Button>
                      <Button onClick={() => setShowKpiGoalDialog(true)}>
                        <Flag className="h-4 w-4 mr-2" />
                        Criar Meta Manualmente
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Desempenho e Métricas</h2>
                  <p className="text-muted-foreground">Acompanhe os KPIs da campanha em tempo real</p>
                </div>
                <Dialog open={showMetricDialog} onOpenChange={setShowMetricDialog}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-add-metric">
                      <Plus className="h-4 w-4 mr-2" />
                      Registrar Métrica
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Registrar Métrica</DialogTitle>
                    </DialogHeader>
                    <Form {...metricForm}>
                      <form onSubmit={metricForm.handleSubmit((data) => createMetricMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={metricForm.control}
                          name="kpiName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome do KPI</FormLabel>
                              <Select onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-metric-kpi">
                                    <SelectValue placeholder="Selecione ou digite" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="voter_reach">Alcance de Eleitores</SelectItem>
                                  <SelectItem value="engagement_rate">Taxa de Engajamento</SelectItem>
                                  <SelectItem value="conversion_rate">Taxa de Conversão</SelectItem>
                                  <SelectItem value="sentiment_score">Score de Sentimento</SelectItem>
                                  <SelectItem value="poll_position">Posição nas Pesquisas</SelectItem>
                                  <SelectItem value="social_followers">Seguidores Redes Sociais</SelectItem>
                                  <SelectItem value="events_attendance">Presença em Eventos</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={metricForm.control}
                            name="kpiValue"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Valor</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid="input-metric-value" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={metricForm.control}
                            name="targetValue"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Meta</FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} data-testid="input-metric-target" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={metricForm.control}
                            name="metricDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Data</FormLabel>
                                <FormControl>
                                  <Input type="date" {...field} data-testid="input-metric-date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={metricForm.control}
                            name="source"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Fonte</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-metric-source">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="manual">Manual</SelectItem>
                                    <SelectItem value="ai_analysis">Análise IA</SelectItem>
                                    <SelectItem value="survey">Pesquisa</SelectItem>
                                    <SelectItem value="social_media">Redes Sociais</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <DialogFooter>
                          <Button type="submit" disabled={createMetricMutation.isPending} data-testid="button-submit-metric">
                            {createMetricMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Registrar
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Evolução das Métricas</CardTitle>
                </CardHeader>
                <CardContent>
                  {metricsChartData.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metricsChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="value" name="Valor" stroke="#003366" strokeWidth={2} />
                          <Line type="monotone" dataKey="target" name="Meta" stroke="#FFD700" strokeWidth={2} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-12">Nenhuma métrica registrada</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Histórico de Métricas</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Meta</TableHead>
                        <TableHead>Fonte</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignDetail.metrics.slice(0, 20).map((metric: any) => (
                        <TableRow key={metric.id} data-testid={`row-metric-${metric.id}`}>
                          <TableCell>{formatDate(metric.metricDate)}</TableCell>
                          <TableCell>{metric.kpiName}</TableCell>
                          <TableCell className="text-right font-medium">{parseFloat(metric.kpiValue).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {metric.targetValue ? parseFloat(metric.targetValue).toLocaleString("pt-BR") : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{metric.source || "manual"}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {campaignDetail.metrics.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Nenhuma métrica registrada
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai" className="space-y-6">
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
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
