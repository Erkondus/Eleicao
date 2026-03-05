import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { History, Trash2, Eye, Search, Filter, Brain, Users, Calendar, Shuffle, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SavedPrediction } from "@shared/schema";

const typeLabels: Record<string, string> = {
  quick_prediction: "Previsão Rápida",
  scenario_analysis: "Cenário",
  candidate_comparison: "Comparação",
  event_impact: "Impacto de Evento",
  what_if: "E se...?",
};

const typeIcons: Record<string, typeof Brain> = {
  quick_prediction: Brain,
  scenario_analysis: Settings2,
  candidate_comparison: Users,
  event_impact: Calendar,
  what_if: Shuffle,
};

const typeColors: Record<string, string> = {
  quick_prediction: "bg-blue-500/10 text-blue-500",
  scenario_analysis: "bg-purple-500/10 text-purple-500",
  candidate_comparison: "bg-green-500/10 text-green-500",
  event_impact: "bg-orange-500/10 text-orange-500",
  what_if: "bg-pink-500/10 text-pink-500",
};

export function PredictionHistory() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewingPrediction, setViewingPrediction] = useState<SavedPrediction | null>(null);
  const [expandedResults, setExpandedResults] = useState<Set<number>>(new Set());

  const { data: predictions, isLoading } = useQuery<SavedPrediction[]>({
    queryKey: ["/api/saved-predictions"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/saved-predictions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-predictions"] });
      toast({ title: "Sucesso", description: "Registro excluído do histórico" });
      if (viewingPrediction) setViewingPrediction(null);
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao excluir registro", variant: "destructive" });
    },
  });

  const filtered = (predictions || []).filter((p) => {
    const matchesType = typeFilter === "all" || p.predictionType === typeFilter;
    const matchesSearch =
      !searchTerm ||
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.scenarioName || "").toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  const toggleExpanded = (id: number) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatResultPreview = (result: any): string => {
    if (!result) return "Sem dados";
    if (result.analysis) return result.analysis.substring(0, 200) + "...";
    if (result.narrative) return result.narrative.substring(0, 200) + "...";
    if (result.overallWinner) return `Vencedor projetado: ${result.overallWinner}`;
    if (result.impactDelta?.biggestGainer) return `Maior beneficiado: ${result.impactDelta.biggestGainer.party}`;
    if (result.impactAnalysis?.overallImpact) return `Impacto geral: ${result.impactAnalysis.overallImpact}`;
    return JSON.stringify(result).substring(0, 200) + "...";
  };

  const renderResultDetail = (prediction: SavedPrediction) => {
    const result = prediction.fullResult as any;
    if (!result) return <p className="text-muted-foreground">Sem dados detalhados</p>;

    return (
      <div className="space-y-4 text-sm">
        {result.analysis && (
          <div>
            <h4 className="font-semibold mb-1">Análise</h4>
            <p className="text-muted-foreground whitespace-pre-wrap">{result.analysis}</p>
          </div>
        )}
        {result.narrative && (
          <div>
            <h4 className="font-semibold mb-1">Narrativa</h4>
            <p className="text-muted-foreground whitespace-pre-wrap">{result.narrative}</p>
          </div>
        )}
        {result.predictions && Array.isArray(result.predictions) && (
          <div>
            <h4 className="font-semibold mb-2">Previsões por Partido</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {result.predictions.map((pred: any, i: number) => (
                <div key={i} className="p-2 bg-muted rounded-md">
                  <p className="font-medium">{pred.party || pred.partyName}</p>
                  {pred.seats !== undefined && (
                    <p className="text-muted-foreground">Vagas: {pred.seats?.min ?? pred.seats}-{pred.seats?.max ?? pred.seats}</p>
                  )}
                  {pred.voteShare !== undefined && (
                    <p className="text-muted-foreground">Votos: {typeof pred.voteShare === 'number' ? `${(pred.voteShare * 100).toFixed(1)}%` : pred.voteShare}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {result.candidates && Array.isArray(result.candidates) && (
          <div>
            <h4 className="font-semibold mb-2">Candidatos</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {result.candidates.map((c: any, i: number) => (
                <div key={i} className="p-2 bg-muted rounded-md">
                  <p className="font-medium">{c.name}</p>
                  {c.party && <p className="text-xs text-muted-foreground">{c.party}</p>}
                  {c.projectedVoteShare !== undefined && (
                    <p className="text-muted-foreground">Votos: {(c.projectedVoteShare * 100).toFixed(1)}%</p>
                  )}
                  {c.electionProbability !== undefined && (
                    <p className="text-muted-foreground">Prob. Eleição: {(c.electionProbability * 100).toFixed(1)}%</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {result.overallWinner && (
          <div className="p-3 bg-primary/10 rounded-md">
            <p className="font-semibold">Vencedor Projetado: {result.overallWinner}</p>
          </div>
        )}
        {result.impactDelta && (
          <div>
            <h4 className="font-semibold mb-2">Impacto</h4>
            <div className="grid grid-cols-2 gap-2">
              {result.impactDelta.biggestGainer && (
                <div className="p-2 bg-green-500/10 rounded-md">
                  <p className="text-xs text-muted-foreground">Maior Beneficiado</p>
                  <p className="font-medium text-green-600">{result.impactDelta.biggestGainer.party}</p>
                </div>
              )}
              {result.impactDelta.biggestLoser && (
                <div className="p-2 bg-red-500/10 rounded-md">
                  <p className="text-xs text-muted-foreground">Maior Prejudicado</p>
                  <p className="font-medium text-red-600">{result.impactDelta.biggestLoser.party}</p>
                </div>
              )}
            </div>
          </div>
        )}
        {result.impactAnalysis && (
          <div>
            <h4 className="font-semibold mb-2">Análise de Impacto</h4>
            {result.impactAnalysis.overallImpact && (
              <p className="text-muted-foreground mb-2">Impacto Geral: <Badge variant="outline">{result.impactAnalysis.overallImpact}</Badge></p>
            )}
            {result.impactAnalysis.seatChanges && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {result.impactAnalysis.seatChanges.map((sc: any, i: number) => (
                  <div key={i} className="p-2 bg-muted rounded-md flex justify-between items-center">
                    <span className="font-medium">{sc.party}</span>
                    <span className={sc.change > 0 ? "text-green-600" : sc.change < 0 ? "text-red-600" : ""}>
                      {sc.change > 0 ? "+" : ""}{sc.change} vagas
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {result.recommendations && Array.isArray(result.recommendations) && (
          <div>
            <h4 className="font-semibold mb-1">Recomendações</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              {result.recommendations.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {result.keyInsights && Array.isArray(result.keyInsights) && (
          <div>
            <h4 className="font-semibold mb-1">Insights Principais</h4>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              {result.keyInsights.map((r: string, i: number) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-3 text-muted-foreground">Carregando histórico...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Previsões IA
          </CardTitle>
          <CardDescription>
            Todas as previsões geradas pela IA são salvas automaticamente. Visualize ou exclua registros anteriores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, descrição ou cenário..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-history"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-type-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                <SelectItem value="quick_prediction">Previsão Rápida</SelectItem>
                <SelectItem value="scenario_analysis">Cenário</SelectItem>
                <SelectItem value="candidate_comparison">Comparação</SelectItem>
                <SelectItem value="event_impact">Impacto de Evento</SelectItem>
                <SelectItem value="what_if">E se...?</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={History}
              title="Nenhum registro encontrado"
              description={searchTerm || typeFilter !== "all"
                ? "Tente alterar os filtros de busca"
                : "As previsões geradas pela IA aparecerão aqui automaticamente"}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {filtered.length} registro{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
              </p>
              {filtered.map((prediction) => {
                const Icon = typeIcons[prediction.predictionType] || Brain;
                const isExpanded = expandedResults.has(prediction.id);

                return (
                  <div
                    key={prediction.id}
                    className="border rounded-lg overflow-hidden"
                    data-testid={`card-history-${prediction.id}`}
                  >
                    <div className="p-4 flex items-start gap-3">
                      <div className={`p-2 rounded-md ${typeColors[prediction.predictionType] || "bg-muted"}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate" data-testid={`text-history-title-${prediction.id}`}>
                            {prediction.title}
                          </p>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {typeLabels[prediction.predictionType] || prediction.predictionType}
                          </Badge>
                        </div>
                        {prediction.description && (
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{prediction.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>{new Date(prediction.createdAt).toLocaleString("pt-BR")}</span>
                          {prediction.scenarioName && <span>Cenário: {prediction.scenarioName}</span>}
                          {prediction.confidence && (
                            <span>Confiança: {(Number(prediction.confidence) * 100).toFixed(0)}%</span>
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                            {formatResultPreview(prediction.fullResult)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => toggleExpanded(prediction.id)}
                          data-testid={`button-expand-history-${prediction.id}`}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setViewingPrediction(prediction)}
                          data-testid={`button-view-history-${prediction.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm("Tem certeza que deseja excluir este registro do histórico?")) {
                              deleteMutation.mutate(prediction.id);
                            }
                          }}
                          data-testid={`button-delete-history-${prediction.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t pt-3">
                        {renderResultDetail(prediction)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingPrediction} onOpenChange={(open) => !open && setViewingPrediction(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {viewingPrediction && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {
                    const Icon = typeIcons[viewingPrediction.predictionType] || Brain;
                    return <Icon className="h-5 w-5" />;
                  })()}
                  {viewingPrediction.title}
                </DialogTitle>
                <DialogDescription>
                  <span className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{typeLabels[viewingPrediction.predictionType] || viewingPrediction.predictionType}</Badge>
                    <span>{new Date(viewingPrediction.createdAt).toLocaleString("pt-BR")}</span>
                    {viewingPrediction.scenarioName && <span>| {viewingPrediction.scenarioName}</span>}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4">
                {renderResultDetail(viewingPrediction)}
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm("Tem certeza que deseja excluir este registro?")) {
                      deleteMutation.mutate(viewingPrediction.id);
                    }
                  }}
                  data-testid="button-delete-history-modal"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
