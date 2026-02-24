import { useState } from "react";
import { Loader2, Plus, Play, Trash2, Settings2, BarChart3, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmptyState } from "@/components/empty-state";
import { getStatusBadge } from "./PredictionCharts";
import type { PredictionScenario } from "@shared/schema";
import type {
  NewScenarioForm,
  PollingDataItem,
  PartyAdjustment,
  ExternalFactor,
} from "@/hooks/use-predictions";
import {
  DEFAULT_NEW_SCENARIO,
  BRAZILIAN_STATES,
  POSITIONS,
} from "@/hooks/use-predictions";
import type { UseMutationResult } from "@tanstack/react-query";

interface ScenarioAnalysisProps {
  predictionScenarios: PredictionScenario[] | undefined;
  loadingScenarios: boolean;
  createScenarioMutation: UseMutationResult<Response, Error, NewScenarioForm & { pollingData: PollingDataItem[]; partyAdjustments: Record<string, PartyAdjustment>; externalFactors: ExternalFactor[] }, unknown>;
  runScenarioMutation: UseMutationResult<Response, Error, number, unknown>;
  deleteScenarioMutation: UseMutationResult<Response, Error, number, unknown>;
  onCreateSuccess: () => void;
}

export function ScenarioAnalysis({
  predictionScenarios,
  loadingScenarios,
  createScenarioMutation,
  runScenarioMutation,
  deleteScenarioMutation,
  onCreateSuccess,
}: ScenarioAnalysisProps) {
  const [showNewScenarioDialog, setShowNewScenarioDialog] = useState(false);
  const [expandedScenarios, setExpandedScenarios] = useState<Set<number>>(new Set());
  const [newScenario, setNewScenario] = useState<NewScenarioForm>({ ...DEFAULT_NEW_SCENARIO });
  const [pollingData, setPollingData] = useState<PollingDataItem[]>([]);
  const [partyAdjustments, setPartyAdjustments] = useState<Record<string, PartyAdjustment>>({});
  const [externalFactors, setExternalFactors] = useState<ExternalFactor[]>([]);

  const resetForm = () => {
    setNewScenario({ ...DEFAULT_NEW_SCENARIO });
    setPollingData([]);
    setPartyAdjustments({});
    setExternalFactors([]);
  };

  const addPollingData = () => {
    setPollingData([...pollingData, { party: "", pollPercent: 0, source: "" }]);
  };

  const updatePollingData = (index: number, field: keyof PollingDataItem, value: string | number) => {
    const updated = [...pollingData];
    updated[index] = { ...updated[index], [field]: value };
    setPollingData(updated);
  };

  const removePollingData = (index: number) => {
    setPollingData(pollingData.filter((_, i) => i !== index));
  };

  const addExternalFactor = () => {
    setExternalFactors([...externalFactors, { factor: "", impact: "positive", magnitude: 5 }]);
  };

  const updateExternalFactor = (index: number, field: keyof ExternalFactor, value: string | number) => {
    const updated = [...externalFactors];
    updated[index] = { ...updated[index], [field]: value } as ExternalFactor;
    setExternalFactors(updated);
  };

  const removeExternalFactor = (index: number) => {
    setExternalFactors(externalFactors.filter((_, i) => i !== index));
  };

  const toggleScenarioExpanded = (id: number) => {
    const newExpanded = new Set(expandedScenarios);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedScenarios(newExpanded);
  };

  const handleCreate = () => {
    createScenarioMutation.mutate(
      { ...newScenario, pollingData, partyAdjustments, externalFactors },
      {
        onSuccess: () => {
          setShowNewScenarioDialog(false);
          resetForm();
          onCreateSuccess();
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Cenários de Previsão</h2>
          <p className="text-sm text-muted-foreground">
            Configure cenários personalizados com dados de pesquisas, ajustes por partido e fatores externos
          </p>
        </div>
        <Dialog open={showNewScenarioDialog} onOpenChange={setShowNewScenarioDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-scenario">
              <Plus className="h-4 w-4 mr-2" />
              Novo Cenário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Cenário de Previsão</DialogTitle>
              <DialogDescription>
                Configure um cenário personalizado para análise preditiva eleitoral
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scenario-name">Nome do Cenário</Label>
                  <Input
                    id="scenario-name"
                    value={newScenario.name}
                    onChange={(e) => setNewScenario({ ...newScenario, name: e.target.value })}
                    placeholder="Ex: Cenário Otimista 2026"
                    data-testid="input-scenario-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scenario-position">Cargo</Label>
                  <Select
                    value={newScenario.position}
                    onValueChange={(v) => setNewScenario({ ...newScenario, position: v })}
                  >
                    <SelectTrigger data-testid="select-scenario-position">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scenario-description">Descrição</Label>
                <Textarea
                  id="scenario-description"
                  value={newScenario.description}
                  onChange={(e) => setNewScenario({ ...newScenario, description: e.target.value })}
                  placeholder="Descreva as premissas deste cenário..."
                  rows={2}
                  data-testid="textarea-scenario-description"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Ano Alvo</Label>
                  <Select
                    value={String(newScenario.targetYear)}
                    onValueChange={(v) => setNewScenario({ ...newScenario, targetYear: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-target-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2026">2026</SelectItem>
                      <SelectItem value="2028">2028</SelectItem>
                      <SelectItem value="2030">2030</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ano Base</Label>
                  <Select
                    value={String(newScenario.baseYear)}
                    onValueChange={(v) => setNewScenario({ ...newScenario, baseYear: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-base-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2022">2022</SelectItem>
                      <SelectItem value="2018">2018</SelectItem>
                      <SelectItem value="2014">2014</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Select
                    value={newScenario.state}
                    onValueChange={(v) => setNewScenario({ ...newScenario, state: v })}
                  >
                    <SelectTrigger data-testid="select-scenario-state">
                      <SelectValue placeholder="Nacional" />
                    </SelectTrigger>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4 border rounded-lg p-4">
                <h4 className="font-medium">Pesos do Modelo</h4>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <Label>Peso das Pesquisas</Label>
                      <span className="text-muted-foreground">{newScenario.pollingWeight}%</span>
                    </div>
                    <Slider
                      value={[newScenario.pollingWeight]}
                      onValueChange={([v]) => setNewScenario({ ...newScenario, pollingWeight: v })}
                      max={100}
                      step={5}
                      data-testid="slider-polling-weight"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <Label>Peso Histórico</Label>
                      <span className="text-muted-foreground">{newScenario.historicalWeight}%</span>
                    </div>
                    <Slider
                      value={[newScenario.historicalWeight]}
                      onValueChange={([v]) => setNewScenario({ ...newScenario, historicalWeight: v })}
                      max={100}
                      step={5}
                      data-testid="slider-historical-weight"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <Label>Peso dos Ajustes</Label>
                      <span className="text-muted-foreground">{newScenario.adjustmentWeight}%</span>
                    </div>
                    <Slider
                      value={[newScenario.adjustmentWeight]}
                      onValueChange={([v]) => setNewScenario({ ...newScenario, adjustmentWeight: v })}
                      max={100}
                      step={5}
                      data-testid="slider-adjustment-weight"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Dados de Pesquisas</h4>
                  <Button variant="outline" size="sm" onClick={addPollingData} data-testid="button-add-polling">
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {pollingData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado de pesquisa adicionado</p>
                ) : (
                  <div className="space-y-3">
                    {pollingData.map((poll, idx) => (
                      <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Partido</Label>
                          <Input
                            value={poll.party}
                            onChange={(e) => updatePollingData(idx, "party", e.target.value)}
                            placeholder="PT, PL..."
                            data-testid={`input-poll-party-${idx}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Percentual</Label>
                          <Input
                            type="number"
                            value={poll.pollPercent}
                            onChange={(e) => updatePollingData(idx, "pollPercent", parseFloat(e.target.value) || 0)}
                            placeholder="15.5"
                            data-testid={`input-poll-percent-${idx}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Fonte</Label>
                          <Input
                            value={poll.source}
                            onChange={(e) => updatePollingData(idx, "source", e.target.value)}
                            placeholder="Datafolha"
                            data-testid={`input-poll-source-${idx}`}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removePollingData(idx)}
                          data-testid={`button-remove-poll-${idx}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Fatores Externos</h4>
                  <Button variant="outline" size="sm" onClick={addExternalFactor} data-testid="button-add-factor">
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {externalFactors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum fator externo adicionado</p>
                ) : (
                  <div className="space-y-3">
                    {externalFactors.map((factor, idx) => (
                      <div key={idx} className="grid grid-cols-4 gap-2 items-end">
                        <div className="space-y-1">
                          <Label className="text-xs">Fator</Label>
                          <Input
                            value={factor.factor}
                            onChange={(e) => updateExternalFactor(idx, "factor", e.target.value)}
                            placeholder="Economia, Escândalo..."
                            data-testid={`input-factor-name-${idx}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Impacto</Label>
                          <Select
                            value={factor.impact}
                            onValueChange={(v) => updateExternalFactor(idx, "impact", v)}
                          >
                            <SelectTrigger data-testid={`select-factor-impact-${idx}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="positive">Positivo</SelectItem>
                              <SelectItem value="negative">Negativo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Magnitude (1-10)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={factor.magnitude}
                            onChange={(e) => updateExternalFactor(idx, "magnitude", parseInt(e.target.value) || 5)}
                            data-testid={`input-factor-magnitude-${idx}`}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeExternalFactor(idx)}
                          data-testid={`button-remove-factor-${idx}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Iterações Monte Carlo</Label>
                  <Select
                    value={String(newScenario.monteCarloIterations)}
                    onValueChange={(v) => setNewScenario({ ...newScenario, monteCarloIterations: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-monte-carlo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1.000 (rápido)</SelectItem>
                      <SelectItem value="5000">5.000 (balanceado)</SelectItem>
                      <SelectItem value="10000">10.000 (padrão)</SelectItem>
                      <SelectItem value="50000">50.000 (preciso)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nível de Confiança</Label>
                  <Select
                    value={String(newScenario.confidenceLevel)}
                    onValueChange={(v) => setNewScenario({ ...newScenario, confidenceLevel: parseInt(v) })}
                  >
                    <SelectTrigger data-testid="select-confidence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90">90%</SelectItem>
                      <SelectItem value="95">95%</SelectItem>
                      <SelectItem value="99">99%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowNewScenarioDialog(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newScenario.name || createScenarioMutation.isPending}
                data-testid="button-save-scenario"
              >
                {createScenarioMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Criar Cenário"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loadingScenarios ? (
        <Card>
          <CardContent className="p-6 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : !predictionScenarios || predictionScenarios.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Settings2}
              title="Nenhum cenário criado"
              description="Crie um cenário personalizado para começar a fazer previsões avançadas."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {predictionScenarios.map((scenario) => (
            <Card key={scenario.id} data-testid={`card-scenario-${scenario.id}`}>
              <Collapsible
                open={expandedScenarios.has(scenario.id)}
                onOpenChange={() => toggleScenarioExpanded(scenario.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          {expandedScenarios.has(scenario.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                      <div>
                        <CardTitle className="text-base">{scenario.name}</CardTitle>
                        <CardDescription>
                          {scenario.targetYear} baseado em {scenario.baseYear}
                          {scenario.state && ` - ${scenario.state}`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(scenario.status)}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runScenarioMutation.mutate(scenario.id)}
                        disabled={scenario.status === "running" || runScenarioMutation.isPending}
                        data-testid={`button-run-scenario-${scenario.id}`}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Executar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteScenarioMutation.mutate(scenario.id)}
                        disabled={deleteScenarioMutation.isPending}
                        data-testid={`button-delete-scenario-${scenario.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    {scenario.description && (
                      <p className="text-sm text-muted-foreground">{scenario.description}</p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Cargo</span>
                        <p className="font-medium">{scenario.position || "Dep. Federal"}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Iterações</span>
                        <p className="font-medium">{scenario.monteCarloIterations?.toLocaleString()}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Confiança</span>
                        <p className="font-medium">{parseFloat(scenario.confidenceLevel || "0.95") * 100}%</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground">Última Execução</span>
                        <p className="font-medium">
                          {scenario.lastRunAt ? new Date(scenario.lastRunAt).toLocaleDateString("pt-BR") : "Nunca"}
                        </p>
                      </div>
                    </div>
                    {scenario.narrative && (
                      <div className="bg-muted/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">Análise IA</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{scenario.narrative}</p>
                      </div>
                    )}
                    {scenario.forecastRunId && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/forecasts?id=${scenario.forecastRunId}`}>
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Ver Resultados Detalhados
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
