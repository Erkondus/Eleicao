import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type {
  Campaign, CampaignBudget, CampaignResource, CampaignMetric,
  CampaignActivity, CampaignInsightSession
} from "@shared/schema";

export const campaignFormSchema = z.object({
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

export const budgetFormSchema = z.object({
  category: z.string().min(1, "Categoria é obrigatória"),
  categoryLabel: z.string().min(1, "Nome da categoria é obrigatório"),
  allocatedAmount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Valor deve ser positivo"),
  notes: z.string().optional().nullable(),
});

export const resourceFormSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  type: z.string().min(1, "Tipo é obrigatório"),
  quantity: z.coerce.number().min(1, "Quantidade deve ser pelo menos 1"),
  unitCost: z.string().optional().nullable(),
  status: z.string().default("available"),
  assignedTo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const activityFormSchema = z.object({
  title: z.string().min(3, "Título deve ter pelo menos 3 caracteres"),
  description: z.string().optional().nullable(),
  type: z.string().min(1, "Tipo é obrigatório"),
  scheduledDate: z.string().optional().nullable(),
  priority: z.string().default("medium"),
  assignedTo: z.string().optional().nullable(),
  estimatedCost: z.string().optional().nullable(),
});

export const metricFormSchema = z.object({
  kpiName: z.string().min(1, "Nome do KPI é obrigatório"),
  kpiValue: z.string().refine(val => !isNaN(parseFloat(val)), "Valor deve ser numérico"),
  targetValue: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  metricDate: z.string().min(1, "Data é obrigatória"),
  notes: z.string().optional().nullable(),
});

export type CampaignFormData = z.infer<typeof campaignFormSchema>;
export type BudgetFormData = z.infer<typeof budgetFormSchema>;
export type ResourceFormData = z.infer<typeof resourceFormSchema>;
export type ActivityFormData = z.infer<typeof activityFormSchema>;
export type MetricFormData = z.infer<typeof metricFormSchema>;

export interface CampaignDetail {
  campaign: Campaign;
  budgets: CampaignBudget[];
  resources: CampaignResource[];
  metrics: CampaignMetric[];
  activities: CampaignActivity[];
  aiSession: CampaignInsightSession | null;
}

export interface PerformanceSummary {
  budgetUtilization: number;
  activityCompletionRate: number;
  resourceAllocation: number;
  latestMetrics: Array<{ name: string; value: number; target: number | null }>;
  daysRemaining: number;
  progressPercentage: number;
  activitiesCompleted: number;
  activitiesTotal: number;
}

export const BUDGET_CATEGORIES = [
  { value: "advertising", label: "Publicidade e Propaganda" },
  { value: "events", label: "Eventos e Comícios" },
  { value: "staff", label: "Equipe e Funcionários" },
  { value: "materials", label: "Materiais Gráficos" },
  { value: "digital", label: "Marketing Digital" },
  { value: "transport", label: "Transporte e Logística" },
  { value: "other", label: "Outros" },
];

export const RESOURCE_TYPES = [
  { value: "staff", label: "Funcionário" },
  { value: "volunteer", label: "Voluntário" },
  { value: "vehicle", label: "Veículo" },
  { value: "equipment", label: "Equipamento" },
  { value: "material", label: "Material" },
];

export const ACTIVITY_TYPES = [
  { value: "event", label: "Evento" },
  { value: "meeting", label: "Reunião" },
  { value: "action", label: "Ação de Campo" },
  { value: "milestone", label: "Marco" },
];

export const STATUS_COLORS: Record<string, string> = {
  planning: "bg-blue-500",
  active: "bg-green-500",
  paused: "bg-yellow-500",
  completed: "bg-gray-500",
  cancelled: "bg-red-500",
};

export const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export const CHART_COLORS = ["#003366", "#FFD700", "#4CAF50", "#FF5722", "#9C27B0", "#00BCD4", "#795548"];

export function formatCurrency(value: string | number | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!num && num !== 0) return "R$ 0,00";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date | null | undefined) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
}

export function useCampaigns(selectedCampaign: number | null) {
  const { toast } = useToast();

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
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedCampaign] });
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const createResourceMutation = useMutation({
    mutationFn: async (data: ResourceFormData) => {
      const unitCost = data.unitCost ? parseFloat(data.unitCost) : 0;
      const quantity = parseInt(data.quantity as unknown as string);
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/resources`, {
        ...data,
        quantity,
        unitCost: unitCost.toString(),
        totalCost: (unitCost * quantity).toString(),
      });
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Recurso criado com sucesso" });
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

  const addTeamMemberMutation = useMutation({
    mutationFn: async (data: { userId: string; role: string; notes?: string }) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/team`, data);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Membro adicionado à equipe" });
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

  const createKpiGoalMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/campaigns/${selectedCampaign}/kpi-goals`, data);
    },
    onSuccess: () => {
      toast({ title: "Sucesso", description: "Meta de KPI criada" });
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

  const fetchAiRecommendations = async () => {
    try {
      const response = await apiRequest("POST", `/api/campaigns/${selectedCampaign}/kpi-goals/ai-recommendations`);
      const data = await response.json();
      return data.recommendations || [];
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao obter recomendações de IA", variant: "destructive" });
      return [];
    }
  };

  return {
    campaigns,
    loadingCampaigns,
    campaignDetail,
    loadingDetail,
    performance,
    aiSessions,
    parties,
    users,
    teamMembers,
    refetchTeam,
    kpiGoals,
    refetchKpiGoals,
    calendarActivities,
    loadingCalendar,
    createCampaignMutation,
    createBudgetMutation,
    createResourceMutation,
    createActivityMutation,
    createMetricMutation,
    linkAiSessionMutation,
    updateStatusMutation,
    addTeamMemberMutation,
    removeTeamMemberMutation,
    createKpiGoalMutation,
    updateKpiGoalMutation,
    deleteKpiGoalMutation,
    fetchAiRecommendations,
  };
}
