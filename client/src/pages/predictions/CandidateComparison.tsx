import { useState } from "react";
import { Loader2, Plus, Play, Trash2, Users, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ErrorBar, Legend } from "recharts";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { getStatusBadge } from "./PredictionCharts";
import { exportPredictionToPdf } from "@/lib/pdf-export";
import type {
  ComparisonForm,
  CandidateComparison as CandidateComparisonType,
} from "@/hooks/use-predictions";
import {
  DEFAULT_COMPARISON_FORM,
  BRAZILIAN_STATES,
} from "@/hooks/use-predictions";
import type { UseMutationResult } from "@tanstack/react-query";

interface CandidateComparisonProps {
  comparisons: CandidateComparisonType[] | undefined;
  loadingComparisons: boolean;
  createComparisonMutation: UseMutationResult<Response, Error, ComparisonForm, unknown>;
  runComparisonMutation: UseMutationResult<Response, Error, number, unknown>;
  deleteComparisonMutation: UseMutationResult<Response, Error, number, unknown>;
  onCreateSuccess: () => void;
}

export function CandidateComparison({
  comparisons,
  loadingComparisons,
  createComparisonMutation,
  runComparisonMutation,
  deleteComparisonMutation,
  onCreateSuccess,
}: CandidateComparisonProps) {
  const [showComparisonDialog, setShowComparisonDialog] = useState(false);
  const [comparisonForm, setComparisonForm] = useState<ComparisonForm>({ ...DEFAULT_COMPARISON_FORM });

  const addCandidateToComparison = () => {
    if (comparisonForm.candidateInput.trim() && !comparisonForm.candidateIds.includes(comparisonForm.candidateInput.trim())) {
      setComparisonForm({
        ...comparisonForm,
        candidateIds: [...comparisonForm.candidateIds, comparisonForm.candidateInput.trim()],
        candidateInput: "",
      });
    }
  };

  const removeCandidateFromComparison = (candidate: string) => {
    setComparisonForm({
      ...comparisonForm,
      candidateIds: comparisonForm.candidateIds.filter(c => c !== candidate),
    });
  };

  const handleCreate = () => {
    createComparisonMutation.mutate(comparisonForm, {
      onSuccess: () => {
        setShowComparisonDialog(false);
        setComparisonForm({ ...DEFAULT_COMPARISON_FORM });
        onCreateSuccess();
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Comparação de Candidatos</CardTitle>
              <CardDescription>Compare o desempenho projetado de dois ou mais candidatos</CardDescription>
            </div>
            <Dialog open={showComparisonDialog} onOpenChange={setShowComparisonDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-comparison">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Comparação
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Criar Comparação de Candidatos</DialogTitle>
                  <DialogDescription>Compare o desempenho projetado de candidatos</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome da Comparação</Label>
                    <Input
                      value={comparisonForm.name}
                      onChange={(e) => setComparisonForm({ ...comparisonForm, name: e.target.value })}
                      placeholder="Ex: Disputa SP 2026"
                      data-testid="input-comparison-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Adicionar Candidatos</Label>
                    <div className="flex gap-2">
                      <Input
                        value={comparisonForm.candidateInput}
                        onChange={(e) => setComparisonForm({ ...comparisonForm, candidateInput: e.target.value })}
                        placeholder="Nome do candidato"
                        onKeyPress={(e) => e.key === "Enter" && addCandidateToComparison()}
                        data-testid="input-candidate-name"
                      />
                      <Button type="button" onClick={addCandidateToComparison} size="icon" data-testid="button-add-candidate">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {comparisonForm.candidateIds.map((c, i) => (
                        <Badge key={i} variant="secondary" className="gap-1" data-testid={`badge-candidate-${i}`}>
                          {c}
                          <button 
                            onClick={() => removeCandidateFromComparison(c)} 
                            className="ml-1 hover:text-destructive"
                            data-testid={`button-remove-candidate-${i}`}
                          >×</button>
                        </Badge>
                      ))}
                    </div>
                    {comparisonForm.candidateIds.length < 2 && (
                      <p className="text-xs text-muted-foreground">Adicione pelo menos 2 candidatos para comparar</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Estado</Label>
                      <Select value={comparisonForm.state || "NACIONAL"} onValueChange={(v) => setComparisonForm({ ...comparisonForm, state: v })}>
                        <SelectTrigger data-testid="select-comparison-state"><SelectValue placeholder="Nacional" /></SelectTrigger>
                        <SelectContent>
                          {BRAZILIAN_STATES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Ano Alvo</Label>
                      <Input
                        type="number"
                        value={comparisonForm.targetYear}
                        onChange={(e) => setComparisonForm({ ...comparisonForm, targetYear: parseInt(e.target.value) })}
                        data-testid="input-comparison-year"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={createComparisonMutation.isPending || comparisonForm.candidateIds.length < 2 || !comparisonForm.name}
                    data-testid="button-submit-comparison"
                  >
                    {createComparisonMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Criar Comparação
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingComparisons ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : comparisons && comparisons.length > 0 ? (
            <div className="space-y-4">
              {comparisons.map((comp) => (
                <Card key={comp.id} data-testid={`card-comparison-${comp.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{comp.name}</CardTitle>
                        <CardDescription>
                          {(comp.candidateIds as string[]).join(" vs ")} - {comp.targetYear}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(comp.status)}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runComparisonMutation.mutate(comp.id)}
                          disabled={comp.status === "running" || runComparisonMutation.isPending}
                          data-testid={`button-run-comparison-${comp.id}`}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Analisar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteComparisonMutation.mutate(comp.id)}
                          data-testid={`button-delete-comparison-${comp.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {comp.status === "completed" && comp.results && (
                    <CardContent className="space-y-4">
                      <div className="h-48 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={(comp.results.candidates || []).map((c: any) => ({
                            name: c.name.split(" ")[0],
                            votos: c.projectedVoteShare || 0,
                            probabilidade: (c.electionProbability || 0) * 100,
                            errorMargin: (c.projectedVoteShare || 0) * 0.1,
                          }))}>
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tickFormatter={(v) => `${v}%`} />
                            <Tooltip 
                              formatter={(value: number, name: string) => [
                                `${value.toFixed(1)}%`, 
                                name === "votos" ? "Votos Projetados" : "Prob. Eleição"
                              ]}
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                            />
                            <Legend />
                            <Bar dataKey="votos" name="Votos %" fill="hsl(210, 100%, 40%)" radius={[4, 4, 0, 0]}>
                              <ErrorBar dataKey="errorMargin" stroke="hsl(0, 0%, 60%)" strokeWidth={1.5} />
                            </Bar>
                            <Bar dataKey="probabilidade" name="Prob. %" fill="hsl(45, 100%, 50%)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(comp.results.candidates || []).map((c: any, i: number) => (
                          <div key={i} className="p-4 rounded-lg border space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{c.name}</span>
                              <Badge variant={c.name === comp.results.overallWinner ? "default" : "outline"}>
                                {c.party}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Votos Projetados</span>
                                <span>{(c.projectedVoteShare || 0).toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Prob. Eleição</span>
                                <span>{((c.electionProbability || 0) * 100).toFixed(0)}%</span>
                              </div>
                              <Progress value={(c.electionProbability || 0) * 100} className="h-2" />
                            </div>
                          </div>
                        ))}
                      </div>
                      {comp.narrative && (
                        <div className="bg-muted/50 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">{comp.narrative}</p>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportPredictionToPdf({
                            title: comp.name,
                            subtitle: `Comparação: ${(comp.candidateIds as string[]).join(" vs ")}`,
                            type: "comparison",
                            data: comp,
                            narrative: comp.narrative || undefined,
                          })}
                          data-testid={`button-export-comparison-${comp.id}`}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Exportar PDF
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma comparação criada</p>
              <p className="text-sm">Crie uma nova comparação para analisar candidatos</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
