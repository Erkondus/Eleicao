import { useState, useMemo, useEffect } from "react";
import { Brain, Loader2, RefreshCw, Lightbulb, ChevronDown, ChevronUp, Users, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { trendIcons, trendColors } from "./PredictionCharts";
import { useQuery } from "@tanstack/react-query";
import type { Scenario, Party, Candidate, ScenarioCandidate, AIPrediction } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

interface ScenarioCandidateWithDetails extends ScenarioCandidate {
  candidate: Candidate;
  party: Party;
}

interface PredictParams {
  scenarioId: number;
  partyLegendVotes?: Record<number, number>;
  candidateVotes?: Record<number, Record<number, number>>;
}

interface QuickPredictionProps {
  scenarios: Scenario[] | undefined;
  parties: Party[] | undefined;
  selectedScenarioId: string;
  setSelectedScenarioId: (id: string) => void;
  prediction: AIPrediction | null;
  predictionMutation: UseMutationResult<AIPrediction, Error, PredictParams, unknown>;
  onPredictionSuccess: (data: AIPrediction) => void;
}

export function QuickPrediction({
  scenarios,
  parties,
  selectedScenarioId,
  setSelectedScenarioId,
  prediction,
  predictionMutation,
  onPredictionSuccess,
}: QuickPredictionProps) {
  const selectedScenario = scenarios?.find((s) => s.id === parseInt(selectedScenarioId));

  const [partyLegendVotes, setPartyLegendVotes] = useState<Record<number, number>>({});
  const [candidateVotes, setCandidateVotes] = useState<Record<number, Record<number, number>>>({});
  const [expandedParties, setExpandedParties] = useState<Record<number, boolean>>({});
  const [dataPreloaded, setDataPreloaded] = useState<string>("");

  const { data: scenarioCandidates } = useQuery<ScenarioCandidateWithDetails[]>({
    queryKey: ["/api/scenarios", parseInt(selectedScenarioId), "candidates"],
    queryFn: async () => {
      if (!selectedScenarioId) return [];
      const res = await fetch(`/api/scenarios/${selectedScenarioId}/candidates`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedScenarioId,
  });

  const { data: scenarioVotesData } = useQuery<{ id: number; partyId: number; candidateId: number | null; votes: number }[]>({
    queryKey: ["/api/scenarios", parseInt(selectedScenarioId), "votes"],
    queryFn: async () => {
      if (!selectedScenarioId) return [];
      const res = await fetch(`/api/scenarios/${selectedScenarioId}/votes`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedScenarioId,
  });

  useEffect(() => {
    if (!selectedScenarioId || !scenarioCandidates || !scenarioVotesData) return;
    if (dataPreloaded === selectedScenarioId) return;

    const prefilledCandVotes: Record<number, Record<number, number>> = {};
    const expandParties: Record<number, boolean> = {};
    for (const sc of scenarioCandidates) {
      if (sc.votes > 0) {
        if (!prefilledCandVotes[sc.partyId]) prefilledCandVotes[sc.partyId] = {};
        prefilledCandVotes[sc.partyId][sc.candidateId] = sc.votes;
        expandParties[sc.partyId] = true;
      }
    }

    const prefilledLegend: Record<number, number> = {};
    for (const sv of scenarioVotesData) {
      if (sv.candidateId === null && sv.votes > 0) {
        prefilledLegend[sv.partyId] = (prefilledLegend[sv.partyId] || 0) + sv.votes;
        expandParties[sv.partyId] = true;
      }
    }

    setCandidateVotes(prefilledCandVotes);
    setPartyLegendVotes(prefilledLegend);
    setExpandedParties(expandParties);
    setDataPreloaded(selectedScenarioId);
  }, [selectedScenarioId, scenarioCandidates, scenarioVotesData, dataPreloaded]);

  const scenarioParties = useMemo(() => {
    if (!scenarioCandidates || scenarioCandidates.length === 0) return parties || [];
    const partyIdsWithCandidates = new Set(scenarioCandidates.map(sc => sc.partyId));
    const scenParties = (parties || []).filter(p => partyIdsWithCandidates.has(p.id));
    return scenParties.length > 0 ? scenParties : (parties || []);
  }, [parties, scenarioCandidates]);

  const candidatesByParty = useMemo(() => {
    if (!scenarioCandidates) return {};
    const grouped: Record<number, ScenarioCandidateWithDetails[]> = {};
    for (const sc of scenarioCandidates) {
      if (!grouped[sc.partyId]) grouped[sc.partyId] = [];
      grouped[sc.partyId].push(sc);
    }
    return grouped;
  }, [scenarioCandidates]);

  const partyTotals = useMemo(() => {
    const totals: Record<number, { legend: number; nominal: number; total: number }> = {};
    for (const p of (scenarioParties || [])) {
      const legend = partyLegendVotes[p.id] || 0;
      const candVotes = candidateVotes[p.id] || {};
      const nominal = Object.values(candVotes).reduce((sum, v) => sum + (v || 0), 0);
      totals[p.id] = { legend, nominal, total: legend + nominal };
    }
    return totals;
  }, [scenarioParties, partyLegendVotes, candidateVotes]);

  const grandTotal = useMemo(() => {
    return Object.values(partyTotals).reduce((sum, t) => sum + t.total, 0);
  }, [partyTotals]);

  const toggleParty = (partyId: number) => {
    setExpandedParties(prev => ({ ...prev, [partyId]: !prev[partyId] }));
  };

  const handleLegendVoteChange = (partyId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setPartyLegendVotes(prev => ({ ...prev, [partyId]: numValue }));
  };

  const handleCandidateVoteChange = (partyId: number, candidateId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    setCandidateVotes(prev => ({
      ...prev,
      [partyId]: { ...(prev[partyId] || {}), [candidateId]: numValue },
    }));
  };

  const handleGenerate = () => {
    const hasAnyVotes = grandTotal > 0;
    predictionMutation.mutate({
      scenarioId: parseInt(selectedScenarioId),
      ...(hasAnyVotes ? { partyLegendVotes, candidateVotes } : {}),
    }, {
      onSuccess: onPredictionSuccess,
    });
  };

  const handleScenarioChange = (id: string) => {
    setSelectedScenarioId(id);
    setPartyLegendVotes({});
    setCandidateVotes({});
    setExpandedParties({});
    setDataPreloaded("");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Gerar Previsão Eleitoral
          </CardTitle>
          <CardDescription>
            Insira os votos de legenda e votos nominais dos candidatos de cada partido.
            O sistema soma automaticamente para calcular a distribuição proporcional de vagas conforme as regras do TSE.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cenário para Análise</Label>
              <Select value={selectedScenarioId} onValueChange={handleScenarioChange}>
                <SelectTrigger data-testid="select-prediction-scenario">
                  <SelectValue placeholder="Selecione um cenário" />
                </SelectTrigger>
                <SelectContent>
                  {scenarios?.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.availableSeats} vagas)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedScenario && (
              <div className="flex items-end gap-2">
                <div className="text-sm text-muted-foreground space-y-1">
                  <div><strong>Cargo:</strong> {selectedScenario.position}</div>
                  <div><strong>Votos válidos:</strong> {selectedScenario.validVotes.toLocaleString("pt-BR")}</div>
                  <div><strong>Vagas:</strong> {selectedScenario.availableSeats}</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedScenario && scenarioParties.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Vote className="h-5 w-5 text-primary" />
                  Votação por Partido e Candidato
                </CardTitle>
                <CardDescription>
                  Informe os votos de legenda e a votação nominal de cada candidato. O total do partido será calculado automaticamente.
                </CardDescription>
              </div>
              {grandTotal > 0 && (
                <Badge variant="secondary" className="font-mono text-base px-3 py-1" data-testid="badge-grand-total">
                  Total geral: {grandTotal.toLocaleString("pt-BR")} votos
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {scenarioParties.map((party) => {
              const partyCands = candidatesByParty[party.id] || [];
              const isExpanded = expandedParties[party.id] || false;
              const totals = partyTotals[party.id] || { legend: 0, nominal: 0, total: 0 };

              return (
                <Collapsible
                  key={party.id}
                  open={isExpanded}
                  onOpenChange={() => toggleParty(party.id)}
                >
                  <div className="border rounded-lg overflow-hidden" data-testid={`party-section-${party.id}`}>
                    <CollapsibleTrigger asChild>
                      <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: party.color || "#003366" }}
                          />
                          <span className="font-medium">{party.name}</span>
                          <Badge variant="outline">{party.abbreviation} ({party.number})</Badge>
                          <Badge variant="secondary" className="font-mono">
                            <Users className="h-3 w-3 mr-1" />
                            {partyCands.length} candidatos
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          {totals.total > 0 && (
                            <Badge className="font-mono" data-testid={`party-total-${party.id}`}>
                              {totals.total.toLocaleString("pt-BR")} votos
                            </Badge>
                          )}
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="border-t p-4 space-y-4 bg-muted/20">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Votos de Legenda</Label>
                            <Input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={partyLegendVotes[party.id] || ""}
                              onChange={(e) => handleLegendVoteChange(party.id, e.target.value)}
                              data-testid={`input-legend-votes-${party.id}`}
                            />
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <div>Legenda: <span className="font-mono">{totals.legend.toLocaleString("pt-BR")}</span></div>
                            <div>Nominais: <span className="font-mono">{totals.nominal.toLocaleString("pt-BR")}</span></div>
                          </div>
                          <div className="text-sm font-medium text-right">
                            Total: <span className="font-mono text-primary text-base">{totals.total.toLocaleString("pt-BR")}</span>
                          </div>
                        </div>

                        {partyCands.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              Votos Nominais dos Candidatos
                            </Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {partyCands.map((sc) => (
                                <div key={sc.id} className="flex items-center gap-2 bg-background rounded-md border p-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate" title={sc.candidate?.name || sc.nickname || ""}>
                                      {sc.nickname || sc.candidate?.name || `Candidato #${sc.ballotNumber}`}
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono">{sc.ballotNumber}</div>
                                  </div>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="0"
                                    className="w-28"
                                    value={candidateVotes[party.id]?.[sc.candidateId] || ""}
                                    onChange={(e) => handleCandidateVoteChange(party.id, sc.candidateId, e.target.value)}
                                    data-testid={`input-candidate-votes-${sc.candidateId}`}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {grandTotal > 0 ? (
                  <>
                    {grandTotal.toLocaleString("pt-BR")} votos inseridos de {selectedScenario.validVotes.toLocaleString("pt-BR")} votos válidos
                    {grandTotal !== selectedScenario.validVotes && (
                      <span className="ml-2 text-amber-500">
                        (diferença: {Math.abs(selectedScenario.validVotes - grandTotal).toLocaleString("pt-BR")})
                      </span>
                    )}
                  </>
                ) : (
                  "Sem votos inseridos — a IA projetará com base no perfil dos partidos"
                )}
              </div>
              <Button
                onClick={handleGenerate}
                disabled={predictionMutation.isPending}
                data-testid="button-generate-prediction"
              >
                {predictionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Gerar Previsão
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedScenario && scenarioParties.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Users}
              title="Nenhum partido cadastrado"
              description="Cadastre partidos para inserir votações. Você ainda pode gerar uma previsão baseada no perfil do cenário."
            />
            <div className="flex justify-center mt-4">
              <Button
                onClick={handleGenerate}
                disabled={predictionMutation.isPending}
                data-testid="button-generate-prediction-no-parties"
              >
                {predictionMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Gerar Previsão sem Votação
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {prediction && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle>Análise da IA</CardTitle>
                  <CardDescription>
                    Gerado em {new Date(prediction.generatedAt).toLocaleString("pt-BR")}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={predictionMutation.isPending}
                  data-testid="button-refresh-prediction"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{prediction.analysis}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Previsão de Distribuição de Vagas</CardTitle>
              <CardDescription>
                Estimativa de vagas por partido com intervalo de confiança
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(prediction.predictions || []).map((pred) => {
                  const party = parties?.find((p) => p.id === pred.partyId);
                  const TrendIcon = trendIcons[pred.trend];
                  const trendColor = trendColors[pred.trend];
                  const avgSeats = (pred.predictedSeats.min + pred.predictedSeats.max) / 2;
                  const maxPossible = selectedScenario?.availableSeats || 20;

                  return (
                    <div key={pred.partyId} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full shrink-0"
                            style={{ backgroundColor: party?.color || "#003366" }}
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{pred.partyName}</span>
                              <Badge variant="outline">{party?.abbreviation}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {pred.totalVotes != null && (
                            <span className="text-sm font-mono text-muted-foreground">
                              {Number(pred.totalVotes).toLocaleString("pt-BR")} votos
                            </span>
                          )}
                          <div className={`flex items-center gap-1 ${trendColor}`}>
                            <TrendIcon className="h-4 w-4" />
                            <span className="text-sm">
                              {pred.trend === "up" ? "Alta" : pred.trend === "down" ? "Baixa" : "Estável"}
                            </span>
                          </div>
                          <Badge variant="secondary" className="font-mono">
                            {(pred.confidence * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Previsão de vagas</span>
                          <span className="font-mono font-bold">
                            {pred.predictedSeats.min} - {pred.predictedSeats.max}
                          </span>
                        </div>
                        <Progress value={(avgSeats / maxPossible) * 100} className="h-2" />
                        {pred.electedCandidates && pred.electedCandidates.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Eleitos: {pred.electedCandidates.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {(prediction.recommendations || []).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-accent" />
                  Recomendações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(prediction.recommendations || []).map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium shrink-0">
                        {idx + 1}
                      </span>
                      <span className="text-muted-foreground">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!selectedScenarioId && !prediction && (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Brain}
              title="Selecione um cenário"
              description="Escolha um cenário eleitoral para inserir votações e gerar previsões baseadas em inteligência artificial."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
