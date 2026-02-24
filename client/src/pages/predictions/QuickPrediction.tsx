import { Brain, Loader2, RefreshCw, Lightbulb } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import { trendIcons, trendColors } from "./PredictionCharts";
import type { Scenario, Party, AIPrediction } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

interface QuickPredictionProps {
  scenarios: Scenario[] | undefined;
  parties: Party[] | undefined;
  selectedScenarioId: string;
  setSelectedScenarioId: (id: string) => void;
  prediction: AIPrediction | null;
  predictionMutation: UseMutationResult<AIPrediction, Error, number, unknown>;
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

  const handleGenerate = () => {
    predictionMutation.mutate(parseInt(selectedScenarioId), {
      onSuccess: onPredictionSuccess,
    });
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
            A IA analisa dados históricos e tendências para gerar previsões de distribuição de vagas.
            Esta funcionalidade utiliza Replit AI Integrations e os custos são debitados dos seus créditos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cenário para Análise</Label>
              <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
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
              <div className="flex items-end">
                <Button
                  onClick={handleGenerate}
                  disabled={predictionMutation.isPending}
                  className="w-full md:w-auto"
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
            )}
          </div>
        </CardContent>
      </Card>

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
                          <div className={`flex items-center gap-1 ${trendColor}`}>
                            <TrendIcon className="h-4 w-4" />
                            <span className="text-sm">
                              {pred.trend === "up" ? "Tendência de alta" : pred.trend === "down" ? "Tendência de baixa" : "Estável"}
                            </span>
                          </div>
                          <Badge variant="secondary" className="font-mono">
                            {(pred.confidence * 100).toFixed(0)}% confiança
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
              description="Escolha um cenário eleitoral para gerar previsões baseadas em inteligência artificial."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
