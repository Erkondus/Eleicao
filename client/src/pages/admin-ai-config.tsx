import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Brain, Plus, Pencil, Trash2, TestTube, Loader2, CheckCircle, XCircle, Copy,
  RefreshCw, Settings2, Zap, Shield, Globe, Server, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AiProvider {
  id: number;
  name: string;
  providerType: string;
  apiKeyEnvVar: string | null;
  baseUrl: string | null;
  enabled: boolean;
  isDefault: boolean;
  capabilities: string[];
  hasApiKey: boolean;
}

interface ProviderType {
  value: string;
  label: string;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface TaskConfig {
  taskKey: string;
  label: string;
  defaultTier: "fast" | "standard";
  defaults: { maxTokens: number; temperature: number };
  configured: boolean;
  config: {
    id: number;
    providerId: number | null;
    providerName: string | null;
    providerType: string | null;
    modelId: string | null;
    fallbackProviderId: number | null;
    fallbackProviderName: string | null;
    fallbackModelId: string | null;
    maxTokens: number | null;
    temperature: string | null;
    enabled: boolean;
  } | null;
}

interface TestResult {
  success: boolean;
  response?: string;
  model?: string;
  provider?: string;
  latencyMs?: number;
  error?: string;
}

const PROVIDER_ICONS: Record<string, typeof Brain> = {
  openai: Zap,
  anthropic: Brain,
  gemini: Globe,
  openai_compatible: Server,
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  gemini: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  openai_compatible: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export default function AdminAiConfig() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [providerForm, setProviderForm] = useState({
    name: "",
    providerType: "openai",
    apiKeyEnvVar: "",
    baseUrl: "",
    enabled: true,
    isDefault: false,
    capabilities: ["chat"],
  });

  const [editingTask, setEditingTask] = useState<TaskConfig | null>(null);
  const [taskForm, setTaskForm] = useState({
    providerId: "",
    modelId: "",
    fallbackProviderId: "",
    fallbackModelId: "",
    maxTokens: "",
    temperature: "",
    enabled: true,
  });

  const [testingProviderId, setTestingProviderId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loadingModels, setLoadingModels] = useState<Set<number>>(new Set());
  const [availableModels, setAvailableModels] = useState<Map<number, ModelInfo[]>>(new Map());
  const [expandedTasks, setExpandedTasks] = useState(false);

  const { data: providers = [], isLoading: providersLoading } = useQuery<AiProvider[]>({
    queryKey: ["/api/admin/ai/providers"],
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<TaskConfig[]>({
    queryKey: ["/api/admin/ai/tasks"],
  });

  const { data: providerTypes = [] } = useQuery<ProviderType[]>({
    queryKey: ["/api/admin/ai/provider-types"],
  });

  const createProviderMutation = useMutation({
    mutationFn: async (data: typeof providerForm) => {
      const response = await apiRequest("POST", "/api/admin/ai/providers", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provedor criado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/providers"] });
      setShowProviderDialog(false);
      resetProviderForm();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao criar provedor", description: error.message, variant: "destructive" });
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof providerForm }) => {
      const response = await apiRequest("PUT", `/api/admin/ai/providers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Provedor atualizado" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/tasks"] });
      setShowProviderDialog(false);
      setEditingProvider(null);
      resetProviderForm();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar provedor", description: error.message, variant: "destructive" });
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/ai/providers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Provedor removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/tasks"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao remover provedor", description: error.message, variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskKey, data }: { taskKey: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/admin/ai/tasks/${taskKey}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Configuração da tarefa atualizada" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/tasks"] });
      setEditingTask(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao atualizar tarefa", description: error.message, variant: "destructive" });
    },
  });

  const resetTaskMutation = useMutation({
    mutationFn: async (taskKey: string) => {
      await apiRequest("DELETE", `/api/admin/ai/tasks/${taskKey}`);
    },
    onSuccess: () => {
      toast({ title: "Tarefa restaurada ao padrão" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/tasks"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao restaurar tarefa", description: error.message, variant: "destructive" });
    },
  });

  const applyToAllMutation = useMutation({
    mutationFn: async (taskKey: string) => {
      const pid = taskForm.providerId && taskForm.providerId !== "none" ? parseInt(taskForm.providerId) : null;
      const fpid = taskForm.fallbackProviderId && taskForm.fallbackProviderId !== "none" ? parseInt(taskForm.fallbackProviderId) : null;
      await apiRequest("PUT", `/api/admin/ai/tasks/${taskKey}`, {
        providerId: pid,
        modelId: taskForm.modelId || null,
        fallbackProviderId: fpid,
        fallbackModelId: taskForm.fallbackModelId || null,
        maxTokens: taskForm.maxTokens ? parseInt(taskForm.maxTokens) : null,
        temperature: taskForm.temperature ? parseFloat(taskForm.temperature) : null,
        enabled: taskForm.enabled,
      });
      const response = await apiRequest("POST", `/api/admin/ai/tasks/${taskKey}/apply-to-all`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Modelo aplicado a todas as tarefas", description: `${data.tasksUpdated} tarefas atualizadas com este provedor/modelo` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/tasks"] });
      setEditingTask(null);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aplicar para todas", description: error.message, variant: "destructive" });
    },
  });

  function resetProviderForm() {
    setProviderForm({
      name: "",
      providerType: "openai",
      apiKeyEnvVar: "",
      baseUrl: "",
      enabled: true,
      isDefault: false,
      capabilities: ["chat"],
    });
  }

  function openEditProvider(provider: AiProvider) {
    setEditingProvider(provider);
    setProviderForm({
      name: provider.name,
      providerType: provider.providerType,
      apiKeyEnvVar: provider.apiKeyEnvVar || "",
      baseUrl: provider.baseUrl || "",
      enabled: provider.enabled,
      isDefault: provider.isDefault,
      capabilities: provider.capabilities || ["chat"],
    });
    setShowProviderDialog(true);
  }

  function openNewProvider() {
    setEditingProvider(null);
    resetProviderForm();
    setShowProviderDialog(true);
  }

  async function loadModelsForProvider(providerId: number, silent = false) {
    setLoadingModels(prev => new Set(prev).add(providerId));
    try {
      const response = await apiRequest("GET", `/api/admin/ai/providers/${providerId}/models`);
      const models = await response.json();
      setAvailableModels(prev => new Map(prev).set(providerId, models));
    } catch (e: any) {
      if (!silent) {
        toast({ title: "Erro ao carregar modelos", description: e.message, variant: "destructive" });
      }
    } finally {
      setLoadingModels(prev => {
        const next = new Set(prev);
        next.delete(providerId);
        return next;
      });
    }
  }

  useEffect(() => {
    if (providers.length > 0) {
      providers.filter(p => p.enabled).forEach(p => {
        if (!availableModels.has(p.id)) {
          loadModelsForProvider(p.id, true);
        }
      });
    }
  }, [providers]);

  async function testProvider(providerId: number, model?: string) {
    setTestingProviderId(providerId);
    setTestResult(null);
    try {
      const response = await apiRequest("POST", `/api/admin/ai/test-provider/${providerId}`, { model });
      const result = await response.json();
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTestingProviderId(null);
    }
  }

  function openEditTask(task: TaskConfig) {
    setEditingTask(task);
    const config = task.config;
    setTaskForm({
      providerId: config?.providerId?.toString() || "",
      modelId: config?.modelId || "",
      fallbackProviderId: config?.fallbackProviderId?.toString() || "",
      fallbackModelId: config?.fallbackModelId || "",
      maxTokens: config?.maxTokens?.toString() || "",
      temperature: config?.temperature || "",
      enabled: config?.enabled !== false,
    });
    if (config?.providerId) {
      loadModelsForProvider(config.providerId);
    }
    if (config?.fallbackProviderId) {
      loadModelsForProvider(config.fallbackProviderId);
    }
  }

  function handleSaveProvider() {
    if (editingProvider) {
      updateProviderMutation.mutate({ id: editingProvider.id, data: providerForm });
    } else {
      createProviderMutation.mutate(providerForm);
    }
  }

  function handleSaveTask() {
    if (!editingTask) return;
    const pid = taskForm.providerId && taskForm.providerId !== "none" ? parseInt(taskForm.providerId) : null;
    const fpid = taskForm.fallbackProviderId && taskForm.fallbackProviderId !== "none" ? parseInt(taskForm.fallbackProviderId) : null;
    updateTaskMutation.mutate({
      taskKey: editingTask.taskKey,
      data: {
        providerId: pid,
        modelId: taskForm.modelId || null,
        fallbackProviderId: fpid,
        fallbackModelId: taskForm.fallbackModelId || null,
        maxTokens: taskForm.maxTokens ? parseInt(taskForm.maxTokens) : null,
        temperature: taskForm.temperature ? parseFloat(taskForm.temperature) : null,
        enabled: taskForm.enabled,
      },
    });
  }

  if (user?.role !== "admin") {
    return (
      <div className="p-8">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>Apenas administradores podem acessar esta página.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const configuredTasks = tasks.filter(t => t.configured);
  const unconfiguredTasks = tasks.filter(t => !t.configured);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Configuração de IA"
        description="Gerencie provedores de IA e configure qual modelo usar em cada tarefa do sistema"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Provedores de IA
              </CardTitle>
              <CardDescription>
                Configure os fornecedores de API de IA disponíveis no sistema
              </CardDescription>
            </div>
            <Button onClick={openNewProvider} data-testid="button-add-provider">
              <Plus className="h-4 w-4 mr-2" />
              Novo Provedor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {providersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum provedor configurado.</p>
              <p className="text-sm mt-1">
                Adicione um provedor para começar. O sistema usará OpenAI diretamente como fallback enquanto nenhum provedor estiver configurado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {providers.map(provider => {
                const Icon = PROVIDER_ICONS[provider.providerType] || Brain;
                const colorClass = PROVIDER_COLORS[provider.providerType] || "";
                return (
                  <div
                    key={provider.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border"
                    data-testid={`provider-card-${provider.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${colorClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{provider.name}</span>
                          {provider.isDefault && (
                            <Badge variant="secondary" className="text-xs">Padrão</Badge>
                          )}
                          {!provider.enabled && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Desativado</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {providerTypes.find(t => t.value === provider.providerType)?.label || provider.providerType}
                          </span>
                          {provider.apiKeyEnvVar && (
                            <span className="text-xs">
                              {provider.hasApiKey ? (
                                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" /> Chave configurada
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <XCircle className="h-3 w-3" /> Chave ausente ({provider.apiKeyEnvVar})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                loadModelsForProvider(provider.id);
                                testProvider(provider.id);
                              }}
                              disabled={testingProviderId === provider.id}
                              data-testid={`button-test-provider-${provider.id}`}
                            >
                              {testingProviderId === provider.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Testar conexão</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditProvider(provider)}
                        data-testid={`button-edit-provider-${provider.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Remover provedor "${provider.name}"?`)) {
                            deleteProviderMutation.mutate(provider.id);
                          }
                        }}
                        data-testid={`button-delete-provider-${provider.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {testResult && (
            <Alert className={`mt-4 ${testResult.success ? "border-green-500" : "border-destructive"}`}>
              <AlertDescription>
                {testResult.success ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="h-4 w-4" />
                      <span className="font-medium">Conexão OK</span>
                      <span className="text-xs text-muted-foreground">({testResult.latencyMs}ms)</span>
                    </div>
                    <p className="text-sm">{testResult.response}</p>
                    <p className="text-xs text-muted-foreground">
                      Modelo: {testResult.model} | Provedor: {testResult.provider}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="h-4 w-4" />
                    <span>Falha: {testResult.error}</span>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Configuração por Tarefa
              </CardTitle>
              <CardDescription>
                Escolha qual provedor e modelo usar em cada tarefa de IA do sistema.
                Tarefas sem configuração usam o provedor padrão.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {configuredTasks.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">
                    Tarefas Configuradas ({configuredTasks.length})
                  </h4>
                  <div className="space-y-2">
                    {configuredTasks.map(task => (
                      <TaskRow
                        key={task.taskKey}
                        task={task}
                        providers={providers}
                        onEdit={() => openEditTask(task)}
                        onReset={() => resetTaskMutation.mutate(task.taskKey)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <button
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2 hover:text-foreground transition-colors"
                  onClick={() => setExpandedTasks(!expandedTasks)}
                  data-testid="button-toggle-unconfigured"
                >
                  {expandedTasks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Tarefas usando padrão ({unconfiguredTasks.length})
                </button>
                {expandedTasks && (
                  <div className="space-y-2">
                    {unconfiguredTasks.map(task => (
                      <TaskRow
                        key={task.taskKey}
                        task={task}
                        providers={providers}
                        onEdit={() => openEditTask(task)}
                        onReset={() => {}}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showProviderDialog} onOpenChange={(open) => {
        if (!open) {
          setShowProviderDialog(false);
          setEditingProvider(null);
          resetProviderForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Editar Provedor" : "Novo Provedor de IA"}
            </DialogTitle>
            <DialogDescription>
              Configure a conexão com um provedor de IA. A chave de API deve ser definida como variável de ambiente no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={providerForm.name}
                onChange={e => setProviderForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: OpenAI Principal"
                data-testid="input-provider-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={providerForm.providerType}
                onValueChange={value => setProviderForm(f => ({ ...f, providerType: value }))}
              >
                <SelectTrigger data-testid="select-provider-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Variável de Ambiente da API Key</Label>
              <Input
                value={providerForm.apiKeyEnvVar}
                onChange={e => setProviderForm(f => ({ ...f, apiKeyEnvVar: e.target.value }))}
                placeholder="Ex: OPENAI_API_KEY"
                data-testid="input-provider-api-key-var"
              />
              <p className="text-xs text-muted-foreground">
                Nome da variável de ambiente que contém a chave da API. A chave em si é armazenada como segredo no sistema.
              </p>
            </div>
            {(providerForm.providerType === "openai_compatible" || providerForm.providerType === "gemini") && (
              <div className="space-y-2">
                <Label>URL Base (opcional)</Label>
                <Input
                  value={providerForm.baseUrl}
                  onChange={e => setProviderForm(f => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="Ex: http://localhost:11434/v1"
                  data-testid="input-provider-base-url"
                />
                <p className="text-xs text-muted-foreground">
                  Para LLMs locais (Ollama, LM Studio, etc.), informe a URL da API compatível com OpenAI.
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={providerForm.enabled}
                  onCheckedChange={checked => setProviderForm(f => ({ ...f, enabled: checked }))}
                  data-testid="switch-provider-enabled"
                />
                <Label>Ativado</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={providerForm.isDefault}
                  onCheckedChange={checked => setProviderForm(f => ({ ...f, isDefault: checked }))}
                  data-testid="switch-provider-default"
                />
                <Label>Provedor Padrão</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProviderDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveProvider}
              disabled={!providerForm.name || createProviderMutation.isPending || updateProviderMutation.isPending}
              data-testid="button-save-provider"
            >
              {(createProviderMutation.isPending || updateProviderMutation.isPending) ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {editingProvider ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTask} onOpenChange={(open) => {
        if (!open) setEditingTask(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurar Tarefa: {editingTask?.label}</DialogTitle>
            <DialogDescription>
              Escolha o provedor e modelo para esta tarefa.
              Complexidade padrão: {editingTask?.defaultTier === "standard" ? "Alta (modelo avançado)" : "Baixa (modelo rápido)"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Provedor Principal</Label>
              <Select
                value={taskForm.providerId}
                onValueChange={value => {
                  setTaskForm(f => ({ ...f, providerId: value, modelId: "" }));
                  if (value && value !== "none") loadModelsForProvider(parseInt(value));
                }}
              >
                <SelectTrigger data-testid="select-task-provider">
                  <SelectValue placeholder="Selecione um provedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Usar padrão do sistema</SelectItem>
                  {providers.filter(p => p.enabled).map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {taskForm.providerId && taskForm.providerId !== "none" && (() => {
              const pid = parseInt(taskForm.providerId);
              const isLoading = loadingModels.has(pid);
              const models = availableModels.get(pid) || [];
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Modelo</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => loadModelsForProvider(pid)}
                      disabled={isLoading}
                      data-testid="button-refresh-models"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span className="ml-1 text-xs">Atualizar lista</span>
                    </Button>
                  </div>
                  {isLoading ? (
                    <div className="flex items-center gap-2 p-2 border rounded-md text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando modelos disponíveis...
                    </div>
                  ) : models.length > 0 ? (
                    <Select
                      value={taskForm.modelId}
                      onValueChange={value => setTaskForm(f => ({ ...f, modelId: value }))}
                    >
                      <SelectTrigger data-testid="select-task-model">
                        <SelectValue placeholder="Selecione um modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={taskForm.modelId}
                      onChange={e => setTaskForm(f => ({ ...f, modelId: e.target.value }))}
                      placeholder="Ex: gpt-4o, claude-3-5-sonnet-20241022"
                      data-testid="input-task-model"
                    />
                  )}
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label>Provedor de Fallback (opcional)</Label>
              <Select
                value={taskForm.fallbackProviderId}
                onValueChange={value => {
                  setTaskForm(f => ({ ...f, fallbackProviderId: value, fallbackModelId: "" }));
                  if (value && value !== "none") loadModelsForProvider(parseInt(value));
                }}
              >
                <SelectTrigger data-testid="select-task-fallback-provider">
                  <SelectValue placeholder="Nenhum fallback" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {providers.filter(p => p.enabled).map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {taskForm.fallbackProviderId && taskForm.fallbackProviderId !== "none" && (() => {
              const fpid = parseInt(taskForm.fallbackProviderId);
              const isLoading = loadingModels.has(fpid);
              const models = availableModels.get(fpid) || [];
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Modelo de Fallback</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => loadModelsForProvider(fpid)}
                      disabled={isLoading}
                      data-testid="button-refresh-fallback-models"
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      <span className="ml-1 text-xs">Atualizar</span>
                    </Button>
                  </div>
                  {isLoading ? (
                    <div className="flex items-center gap-2 p-2 border rounded-md text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando modelos...
                    </div>
                  ) : models.length > 0 ? (
                    <Select
                      value={taskForm.fallbackModelId}
                      onValueChange={value => setTaskForm(f => ({ ...f, fallbackModelId: value }))}
                    >
                      <SelectTrigger data-testid="select-task-fallback-model">
                        <SelectValue placeholder="Selecione modelo de fallback" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={taskForm.fallbackModelId}
                      onChange={e => setTaskForm(f => ({ ...f, fallbackModelId: e.target.value }))}
                      placeholder="Ex: gpt-4o-mini"
                      data-testid="input-task-fallback-model"
                    />
                  )}
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Tokens</Label>
                <Input
                  type="number"
                  value={taskForm.maxTokens}
                  onChange={e => setTaskForm(f => ({ ...f, maxTokens: e.target.value }))}
                  placeholder={`Padrão: ${editingTask?.defaults?.maxTokens ?? ""}`}
                  data-testid="input-task-max-tokens"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para usar o padrão ({editingTask?.defaults?.maxTokens})
                </p>
              </div>
              <div className="space-y-2">
                <Label>Temperatura</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={taskForm.temperature}
                  onChange={e => setTaskForm(f => ({ ...f, temperature: e.target.value }))}
                  placeholder={`Padrão: ${editingTask?.defaults?.temperature ?? ""}`}
                  data-testid="input-task-temperature"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para usar o padrão ({editingTask?.defaults?.temperature})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={taskForm.enabled}
                onCheckedChange={checked => setTaskForm(f => ({ ...f, enabled: checked }))}
                data-testid="switch-task-enabled"
              />
              <Label>Tarefa ativada</Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex-1">
              {taskForm.providerId && taskForm.providerId !== "none" && taskForm.modelId && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => editingTask && applyToAllMutation.mutate(editingTask.taskKey)}
                  disabled={applyToAllMutation.isPending}
                  data-testid="button-apply-to-all"
                >
                  {applyToAllMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Copy className="h-4 w-4 mr-2" />
                  Aplicar provedor/modelo a todas as tarefas
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingTask(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveTask}
                disabled={updateTaskMutation.isPending}
                data-testid="button-save-task"
              >
                {updateTaskMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({
  task,
  providers,
  onEdit,
  onReset,
}: {
  task: TaskConfig;
  providers: AiProvider[];
  onEdit: () => void;
  onReset: () => void;
}) {
  const tierLabel = task.defaultTier === "standard" ? "Avançado" : "Rápido";
  const tierColor = task.defaultTier === "standard"
    ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
    : "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200";

  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 border transition-colors cursor-pointer"
      onClick={onEdit}
      data-testid={`task-row-${task.taskKey}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{task.label}</span>
            <Badge variant="outline" className={`text-xs ${tierColor}`}>
              {tierLabel}
            </Badge>
          </div>
          {task.configured && task.config ? (
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <span className="text-xs text-muted-foreground">
                {task.config.providerName} / {task.config.modelId}
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Usando padrão do sistema</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={onEdit} data-testid={`button-edit-task-${task.taskKey}`}>
          <Pencil className="h-3 w-3" />
        </Button>
        {task.configured && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Restaurar configuração padrão para esta tarefa?")) {
                onReset();
              }
            }}
            data-testid={`button-reset-task-${task.taskKey}`}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
