import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Scenario, Party, AIPrediction, PredictionScenario } from "@shared/schema";

export interface PollingDataItem {
  party: string;
  pollPercent: number;
  source: string;
}

export interface PartyAdjustment {
  voteShareAdjust: number;
  reason: string;
}

export interface ExternalFactor {
  factor: string;
  impact: "positive" | "negative";
  magnitude: number;
}

export interface CandidateComparison {
  id: number;
  name: string;
  description?: string;
  candidateIds: string[];
  state?: string;
  position?: string;
  targetYear: number;
  status: string;
  results?: any;
  narrative?: string;
  aiInsights?: any;
  createdAt: string;
}

export interface EventImpactPrediction {
  id: number;
  name: string;
  eventDescription: string;
  eventType: string;
  eventDate?: string;
  affectedEntities: { parties?: string[]; candidates?: string[]; regions?: string[] };
  state?: string;
  position?: string;
  targetYear: number;
  status: string;
  beforeProjection?: any;
  afterProjection?: any;
  impactDelta?: any;
  narrative?: string;
  createdAt: string;
}

export interface ScenarioSimulation {
  id: number;
  name: string;
  description?: string;
  simulationType: string;
  baseScenario: any;
  modifiedScenario: any;
  parameters?: any;
  scope?: any;
  status: string;
  baselineResults?: any;
  simulatedResults?: any;
  impactAnalysis?: any;
  narrative?: string;
  createdAt: string;
}

export interface NewScenarioForm {
  name: string;
  description: string;
  targetYear: number;
  baseYear: number;
  state: string;
  position: string;
  pollingWeight: number;
  historicalWeight: number;
  adjustmentWeight: number;
  monteCarloIterations: number;
  confidenceLevel: number;
}

export interface ComparisonForm {
  name: string;
  candidateIds: string[];
  candidateInput: string;
  state: string;
  position: string;
  targetYear: number;
}

export interface EventForm {
  name: string;
  eventDescription: string;
  eventType: string;
  affectedParties: string[];
  affectedCandidates: string[];
  state: string;
  position: string;
  targetYear: number;
  impactMagnitude: number;
  impactDuration: string;
}

export interface WhatIfForm {
  name: string;
  description: string;
  simulationType: string;
  candidateName: string;
  fromParty: string;
  toParty: string;
  state: string;
  targetYear: number;
}

export const DEFAULT_NEW_SCENARIO: NewScenarioForm = {
  name: "",
  description: "",
  targetYear: 2026,
  baseYear: 2022,
  state: "",
  position: "DEPUTADO FEDERAL",
  pollingWeight: 30,
  historicalWeight: 50,
  adjustmentWeight: 20,
  monteCarloIterations: 10000,
  confidenceLevel: 95,
};

export const DEFAULT_COMPARISON_FORM: ComparisonForm = {
  name: "",
  candidateIds: [],
  candidateInput: "",
  state: "",
  position: "DEPUTADO FEDERAL",
  targetYear: 2026,
};

export const DEFAULT_EVENT_FORM: EventForm = {
  name: "",
  eventDescription: "",
  eventType: "policy",
  affectedParties: [],
  affectedCandidates: [],
  state: "",
  position: "",
  targetYear: 2026,
  impactMagnitude: 0.5,
  impactDuration: "medium-term",
};

export const DEFAULT_WHATIF_FORM: WhatIfForm = {
  name: "",
  description: "",
  simulationType: "party_change",
  candidateName: "",
  fromParty: "",
  toParty: "",
  state: "",
  targetYear: 2026,
};

export function usePredictionQueries() {
  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const { data: predictionScenarios, isLoading: loadingScenarios } = useQuery<PredictionScenario[]>({
    queryKey: ["/api/prediction-scenarios"],
  });

  const { data: comparisons, isLoading: loadingComparisons } = useQuery<CandidateComparison[]>({
    queryKey: ["/api/candidate-comparisons"],
  });

  const { data: eventImpacts, isLoading: loadingEvents } = useQuery<EventImpactPrediction[]>({
    queryKey: ["/api/event-impacts"],
  });

  const { data: simulations, isLoading: loadingSimulations } = useQuery<ScenarioSimulation[]>({
    queryKey: ["/api/scenario-simulations"],
  });

  return {
    scenarios,
    parties,
    predictionScenarios,
    loadingScenarios,
    comparisons,
    loadingComparisons,
    eventImpacts,
    loadingEvents,
    simulations,
    loadingSimulations,
  };
}

export function usePredictionMutations() {
  const { toast } = useToast();

  const predictionMutation = useMutation({
    mutationFn: async (params: {
      scenarioId: number;
      partyLegendVotes?: Record<number, number>;
      candidateVotes?: Record<number, Record<number, number>>;
    }) => {
      const response = await apiRequest("POST", "/api/ai/predict", params);
      const data = await response.json();
      return data as AIPrediction;
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao gerar previsão", variant: "destructive" });
    },
  });

  const createScenarioMutation = useMutation({
    mutationFn: async (data: NewScenarioForm & { pollingData: PollingDataItem[]; partyAdjustments: Record<string, PartyAdjustment>; externalFactors: ExternalFactor[] }) => {
      return apiRequest("POST", "/api/prediction-scenarios", {
        name: data.name,
        description: data.description,
        targetYear: data.targetYear,
        baseYear: data.baseYear,
        state: data.state || null,
        position: data.position,
        pollingData: data.pollingData,
        partyAdjustments: data.partyAdjustments,
        externalFactors: data.externalFactors,
        parameters: {
          pollingWeight: data.pollingWeight / 100,
          historicalWeight: data.historicalWeight / 100,
          adjustmentWeight: data.adjustmentWeight / 100,
          monteCarloIterations: data.monteCarloIterations,
          confidenceLevel: data.confidenceLevel / 100,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prediction-scenarios"] });
      toast({ title: "Cenário criado", description: "O cenário de previsão foi criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar cenário", variant: "destructive" });
    },
  });

  const runScenarioMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/prediction-scenarios/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prediction-scenarios"] });
      toast({ title: "Execução iniciada", description: "O cenário está sendo processado" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao executar cenário", variant: "destructive" });
    },
  });

  const deleteScenarioMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/prediction-scenarios/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prediction-scenarios"] });
      toast({ title: "Cenário excluído", description: "O cenário foi removido" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir cenário", variant: "destructive" });
    },
  });

  const createComparisonMutation = useMutation({
    mutationFn: async (data: ComparisonForm) => {
      return apiRequest("POST", "/api/candidate-comparisons", {
        name: data.name,
        candidateIds: data.candidateIds,
        state: data.state || null,
        position: data.position,
        targetYear: data.targetYear,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-comparisons"] });
      toast({ title: "Comparação criada", description: "Execute para ver os resultados" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar comparação", variant: "destructive" });
    },
  });

  const runComparisonMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/candidate-comparisons/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-comparisons"] });
      toast({ title: "Comparação executada", description: "Análise concluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao executar comparação", variant: "destructive" });
    },
  });

  const deleteComparisonMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/candidate-comparisons/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidate-comparisons"] });
      toast({ title: "Comparação excluída" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    },
  });

  const createEventMutation = useMutation({
    mutationFn: async (data: EventForm) => {
      return apiRequest("POST", "/api/event-impacts", {
        name: data.name,
        eventDescription: data.eventDescription,
        eventType: data.eventType,
        affectedEntities: { parties: data.affectedParties, candidates: data.affectedCandidates },
        state: data.state || null,
        position: data.position || null,
        targetYear: data.targetYear,
        estimatedImpactMagnitude: data.impactMagnitude,
        impactDuration: data.impactDuration,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-impacts"] });
      toast({ title: "Previsão de evento criada", description: "Execute para ver projeções antes/depois" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar previsão de evento", variant: "destructive" });
    },
  });

  const runEventMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/event-impacts/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-impacts"] });
      toast({ title: "Análise de impacto concluída", description: "Projeções antes/depois geradas" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao analisar impacto", variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/event-impacts/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/event-impacts"] });
      toast({ title: "Previsão excluída" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    },
  });

  const createWhatIfMutation = useMutation({
    mutationFn: async (data: WhatIfForm) => {
      return apiRequest("POST", "/api/scenario-simulations", {
        name: data.name,
        description: data.description,
        simulationType: data.simulationType,
        baseScenario: { candidate: data.candidateName, party: data.fromParty },
        modifiedScenario: { candidate: data.candidateName, party: data.toParty },
        parameters: { candidateName: data.candidateName, fromParty: data.fromParty, toParty: data.toParty },
        scope: { state: data.state || null, year: data.targetYear },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenario-simulations"] });
      toast({ title: "Simulação criada", description: "Execute para ver resultados" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao criar simulação", variant: "destructive" });
    },
  });

  const runWhatIfMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/scenario-simulations/${id}/run`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenario-simulations"] });
      toast({ title: "Simulação concluída", description: "Resultados disponíveis" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao executar simulação", variant: "destructive" });
    },
  });

  const deleteWhatIfMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scenario-simulations/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scenario-simulations"] });
      toast({ title: "Simulação excluída" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir", variant: "destructive" });
    },
  });

  return {
    predictionMutation,
    createScenarioMutation,
    runScenarioMutation,
    deleteScenarioMutation,
    createComparisonMutation,
    runComparisonMutation,
    deleteComparisonMutation,
    createEventMutation,
    runEventMutation,
    deleteEventMutation,
    createWhatIfMutation,
    runWhatIfMutation,
    deleteWhatIfMutation,
  };
}

export const BRAZILIAN_STATES = [
  { value: "", label: "Nacional" },
  { value: "AC", label: "Acre" }, { value: "AL", label: "Alagoas" },
  { value: "AP", label: "Amapá" }, { value: "AM", label: "Amazonas" },
  { value: "BA", label: "Bahia" }, { value: "CE", label: "Ceará" },
  { value: "DF", label: "Distrito Federal" }, { value: "ES", label: "Espírito Santo" },
  { value: "GO", label: "Goiás" }, { value: "MA", label: "Maranhão" },
  { value: "MT", label: "Mato Grosso" }, { value: "MS", label: "Mato Grosso do Sul" },
  { value: "MG", label: "Minas Gerais" }, { value: "PA", label: "Pará" },
  { value: "PB", label: "Paraíba" }, { value: "PR", label: "Paraná" },
  { value: "PE", label: "Pernambuco" }, { value: "PI", label: "Piauí" },
  { value: "RJ", label: "Rio de Janeiro" }, { value: "RN", label: "Rio Grande do Norte" },
  { value: "RS", label: "Rio Grande do Sul" }, { value: "RO", label: "Rondônia" },
  { value: "RR", label: "Roraima" }, { value: "SC", label: "Santa Catarina" },
  { value: "SP", label: "São Paulo" }, { value: "SE", label: "Sergipe" },
  { value: "TO", label: "Tocantins" },
];

export const POSITIONS = [
  { value: "DEPUTADO FEDERAL", label: "Deputado Federal" },
  { value: "DEPUTADO ESTADUAL", label: "Deputado Estadual" },
  { value: "DEPUTADO DISTRITAL", label: "Deputado Distrital" },
  { value: "VEREADOR", label: "Vereador" },
];

