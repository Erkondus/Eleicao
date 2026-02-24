import { useState } from "react";
import { Brain, Settings2, Users, Calendar, Shuffle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { usePredictionQueries, usePredictionMutations } from "@/hooks/use-predictions";
import { QuickPrediction } from "./predictions/QuickPrediction";
import { ScenarioAnalysis } from "./predictions/ScenarioAnalysis";
import { CandidateComparison } from "./predictions/CandidateComparison";
import { EventImpact } from "./predictions/EventImpact";
import { WhatIfSimulation } from "./predictions/WhatIfSimulation";
import type { AIPrediction } from "@shared/schema";

export default function Predictions() {
  const { toast } = useToast();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);
  const [activeTab, setActiveTab] = useState("quick");

  const {
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
  } = usePredictionQueries();

  const {
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
  } = usePredictionMutations();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Previsões com IA"
        description="Análise preditiva de resultados eleitorais utilizando inteligência artificial e cenários personalizados"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Previsões IA" },
        ]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="quick" className="gap-2" data-testid="tab-quick-prediction">
            <Brain className="h-4 w-4" />
            Previsão Rápida
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-2" data-testid="tab-scenarios">
            <Settings2 className="h-4 w-4" />
            Cenários
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-2" data-testid="tab-comparison">
            <Users className="h-4 w-4" />
            Comparar Candidatos
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-2" data-testid="tab-events">
            <Calendar className="h-4 w-4" />
            Impacto de Eventos
          </TabsTrigger>
          <TabsTrigger value="whatif" className="gap-2" data-testid="tab-whatif">
            <Shuffle className="h-4 w-4" />
            E se...?
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="space-y-6">
          <QuickPrediction
            scenarios={scenarios}
            parties={parties}
            selectedScenarioId={selectedScenarioId}
            setSelectedScenarioId={setSelectedScenarioId}
            prediction={prediction}
            predictionMutation={predictionMutation}
            onPredictionSuccess={(data) => {
              setPrediction(data);
              toast({ title: "Previsão gerada", description: "A análise de IA foi concluída com sucesso" });
            }}
          />
        </TabsContent>

        <TabsContent value="scenarios" className="space-y-6">
          <ScenarioAnalysis
            predictionScenarios={predictionScenarios}
            loadingScenarios={loadingScenarios}
            createScenarioMutation={createScenarioMutation}
            runScenarioMutation={runScenarioMutation}
            deleteScenarioMutation={deleteScenarioMutation}
            onCreateSuccess={() => {}}
          />
        </TabsContent>

        <TabsContent value="comparison" className="space-y-6">
          <CandidateComparison
            comparisons={comparisons}
            loadingComparisons={loadingComparisons}
            createComparisonMutation={createComparisonMutation}
            runComparisonMutation={runComparisonMutation}
            deleteComparisonMutation={deleteComparisonMutation}
            onCreateSuccess={() => {}}
          />
        </TabsContent>

        <TabsContent value="events" className="space-y-6">
          <EventImpact
            eventImpacts={eventImpacts}
            loadingEvents={loadingEvents}
            createEventMutation={createEventMutation}
            runEventMutation={runEventMutation}
            deleteEventMutation={deleteEventMutation}
            onCreateSuccess={() => {}}
          />
        </TabsContent>

        <TabsContent value="whatif" className="space-y-6">
          <WhatIfSimulation
            simulations={simulations}
            loadingSimulations={loadingSimulations}
            parties={parties}
            createWhatIfMutation={createWhatIfMutation}
            runWhatIfMutation={runWhatIfMutation}
            deleteWhatIfMutation={deleteWhatIfMutation}
            onCreateSuccess={() => {}}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
