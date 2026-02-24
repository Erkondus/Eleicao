import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Loader2, Plus, Flag, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  metricFormSchema, formatCurrency, formatDate,
  type MetricFormData, type CampaignDetail
} from "@/hooks/use-campaigns";
import type { UseMutationResult } from "@tanstack/react-query";

interface MetricsTabProps {
  campaignDetail: CampaignDetail;
  createMetricMutation: UseMutationResult<any, Error, MetricFormData, unknown>;
}

export function MetricsTab({ campaignDetail, createMetricMutation }: MetricsTabProps) {
  const [showMetricDialog, setShowMetricDialog] = useState(false);

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

  const metricsChartData = campaignDetail?.metrics?.slice(0, 10).reverse().map((m: any) => ({
    date: formatDate(m.metricDate),
    value: parseFloat(m.kpiValue),
    target: m.targetValue ? parseFloat(m.targetValue) : null,
  })) || [];

  const handleSubmit = (data: MetricFormData) => {
    createMetricMutation.mutate(data, {
      onSuccess: () => {
        setShowMetricDialog(false);
        metricForm.reset();
      },
    });
  };

  return (
    <div className="space-y-6">
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
              <form onSubmit={metricForm.handleSubmit(handleSubmit)} className="space-y-4">
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
                          <Input type="number" step="0.01" {...field} value={field.value ?? ""} data-testid="input-metric-target" />
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
                        <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
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
    </div>
  );
}

interface KpiGoalsTabProps {
  kpiGoals: any[] | undefined;
  selectedCampaign: number;
  createKpiGoalMutation: UseMutationResult<any, Error, any, unknown>;
  deleteKpiGoalMutation: UseMutationResult<any, Error, number, unknown>;
  fetchAiRecommendations: () => Promise<any[]>;
}

export function KpiGoalsTab({
  kpiGoals,
  selectedCampaign,
  createKpiGoalMutation,
  deleteKpiGoalMutation,
  fetchAiRecommendations,
}: KpiGoalsTabProps) {
  const [showKpiGoalDialog, setShowKpiGoalDialog] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  const [kpiFormKpiName, setKpiFormKpiName] = useState("");
  const [kpiFormTargetValue, setKpiFormTargetValue] = useState("");
  const [kpiFormBaselineValue, setKpiFormBaselineValue] = useState("");
  const [kpiFormUnit, setKpiFormUnit] = useState("number");
  const [kpiFormPriority, setKpiFormPriority] = useState("medium");
  const [kpiFormStartDate, setKpiFormStartDate] = useState("");
  const [kpiFormEndDate, setKpiFormEndDate] = useState("");

  const handleFetchRecommendations = async () => {
    setLoadingRecommendations(true);
    const recs = await fetchAiRecommendations();
    setAiRecommendations(recs);
    setLoadingRecommendations(false);
  };

  const handleCreateKpiGoal = () => {
    if (kpiFormKpiName && kpiFormTargetValue) {
      createKpiGoalMutation.mutate({
        kpiName: kpiFormKpiName,
        targetValue: kpiFormTargetValue,
        baselineValue: kpiFormBaselineValue || null,
        unit: kpiFormUnit,
        priority: kpiFormPriority,
        startDate: kpiFormStartDate || null,
        endDate: kpiFormEndDate || null,
      }, {
        onSuccess: () => {
          setShowKpiGoalDialog(false);
          setKpiFormKpiName("");
          setKpiFormTargetValue("");
          setKpiFormBaselineValue("");
          setKpiFormUnit("number");
          setKpiFormPriority("medium");
          setKpiFormStartDate("");
          setKpiFormEndDate("");
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Metas de KPIs Estratégicos</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleFetchRecommendations}
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
                  onClick={handleCreateKpiGoal}
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
                           goal.kpiName}
                        </h4>
                        <Badge variant={
                          goal.status === 'achieved' ? 'default' :
                          goal.status === 'missed' ? 'destructive' : 'outline'
                        }>
                          {goal.status === 'achieved' ? 'Alcançada' :
                           goal.status === 'missed' ? 'Não Alcançada' :
                           goal.status === 'in_progress' ? 'Em Progresso' : 'Pendente'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Meta: {parseFloat(goal.targetValue).toLocaleString("pt-BR")} {goal.unit === 'percentage' ? '%' : goal.unit === 'currency' ? 'R$' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        goal.priority === 'critical' ? 'destructive' :
                        goal.priority === 'high' ? 'default' : 'secondary'
                      }>
                        {goal.priority === 'critical' ? 'Crítica' :
                         goal.priority === 'high' ? 'Alta' :
                         goal.priority === 'medium' ? 'Média' : 'Baixa'}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteKpiGoalMutation.mutate(goal.id)}
                        data-testid={`button-delete-kpi-${goal.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progresso</span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Base: {baselineVal.toLocaleString("pt-BR")}</span>
                      <span>Atual: {currentVal.toLocaleString("pt-BR")}</span>
                      <span>Meta: {targetVal.toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                  {goal.aiRecommendation && (
                    <div className="mt-3 p-2 bg-primary/5 rounded-md">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> {goal.aiRecommendation}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <TrendingUp className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma meta definida</h3>
            <p className="text-muted-foreground mb-4">Defina metas de KPIs para acompanhar o progresso da campanha</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={handleFetchRecommendations} disabled={loadingRecommendations}>
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
    </div>
  );
}
