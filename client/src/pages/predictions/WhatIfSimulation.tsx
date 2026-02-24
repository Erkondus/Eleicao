import { useState } from "react";
import { Loader2, Plus, Play, Trash2, Shuffle, AlertTriangle, ArrowRight, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
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
  WhatIfForm,
  ScenarioSimulation,
} from "@/hooks/use-predictions";
import { DEFAULT_WHATIF_FORM } from "@/hooks/use-predictions";
import type { Party } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

interface WhatIfSimulationProps {
  simulations: ScenarioSimulation[] | undefined;
  loadingSimulations: boolean;
  parties: Party[] | undefined;
  createWhatIfMutation: UseMutationResult<Response, Error, WhatIfForm, unknown>;
  runWhatIfMutation: UseMutationResult<Response, Error, number, unknown>;
  deleteWhatIfMutation: UseMutationResult<Response, Error, number, unknown>;
  onCreateSuccess: () => void;
}

export function WhatIfSimulation({
  simulations,
  loadingSimulations,
  parties,
  createWhatIfMutation,
  runWhatIfMutation,
  deleteWhatIfMutation,
  onCreateSuccess,
}: WhatIfSimulationProps) {
  const [showWhatIfDialog, setShowWhatIfDialog] = useState(false);
  const [whatIfForm, setWhatIfForm] = useState<WhatIfForm>({ ...DEFAULT_WHATIF_FORM });

  const handleCreate = () => {
    createWhatIfMutation.mutate(whatIfForm, {
      onSuccess: () => {
        setShowWhatIfDialog(false);
        setWhatIfForm({ ...DEFAULT_WHATIF_FORM });
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
              <CardTitle>Simulações "E se...?"</CardTitle>
              <CardDescription>Simule cenários hipotéticos como mudanças de partido ou coligações</CardDescription>
            </div>
            <Dialog open={showWhatIfDialog} onOpenChange={setShowWhatIfDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-whatif">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Simulação
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Criar Simulação "E se...?"</DialogTitle>
                  <DialogDescription>Simule cenários hipotéticos e veja os impactos projetados</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome da Simulação</Label>
                    <Input
                      value={whatIfForm.name}
                      onChange={(e) => setWhatIfForm({ ...whatIfForm, name: e.target.value })}
                      placeholder="Ex: E se X mudar de partido?"
                      data-testid="input-whatif-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipo de Simulação</Label>
                    <Select value={whatIfForm.simulationType} onValueChange={(v) => setWhatIfForm({ ...whatIfForm, simulationType: v })}>
                      <SelectTrigger data-testid="select-simulation-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="party_change">Mudança de Partido</SelectItem>
                        <SelectItem value="coalition_change">Mudança de Coligação</SelectItem>
                        <SelectItem value="turnout_change">Variação de Comparecimento</SelectItem>
                        <SelectItem value="regional_shift">Mudança Regional</SelectItem>
                        <SelectItem value="custom">Personalizado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {whatIfForm.simulationType === "party_change" && (
                    <>
                      <div className="space-y-2">
                        <Label>Candidato</Label>
                        <Input
                          value={whatIfForm.candidateName}
                          onChange={(e) => setWhatIfForm({ ...whatIfForm, candidateName: e.target.value })}
                          placeholder="Nome do candidato"
                          data-testid="input-whatif-candidate"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Partido Atual</Label>
                          <Select value={whatIfForm.fromParty} onValueChange={(v) => setWhatIfForm({ ...whatIfForm, fromParty: v })}>
                            <SelectTrigger data-testid="select-from-party"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {parties?.map((p) => (
                                <SelectItem key={p.id} value={p.abbreviation}>{p.abbreviation}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Novo Partido</Label>
                          <Select value={whatIfForm.toParty} onValueChange={(v) => setWhatIfForm({ ...whatIfForm, toParty: v })}>
                            <SelectTrigger data-testid="select-to-party"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {parties?.map((p) => (
                                <SelectItem key={p.id} value={p.abbreviation}>{p.abbreviation}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Textarea
                      value={whatIfForm.description}
                      onChange={(e) => setWhatIfForm({ ...whatIfForm, description: e.target.value })}
                      placeholder="Descreva o cenário..."
                      data-testid="input-whatif-description"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={createWhatIfMutation.isPending || !whatIfForm.name}
                    data-testid="button-submit-whatif"
                  >
                    {createWhatIfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Criar Simulação
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSimulations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : simulations && simulations.length > 0 ? (
            <div className="space-y-4">
              {simulations.map((sim) => (
                <Card key={sim.id} data-testid={`card-simulation-${sim.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{sim.name}</CardTitle>
                        <CardDescription>
                          {sim.simulationType === "party_change" && sim.parameters && (
                            <span className="flex items-center gap-1">
                              {sim.parameters.candidateName}: {sim.parameters.fromParty} <ArrowRight className="h-3 w-3" /> {sim.parameters.toParty}
                            </span>
                          )}
                          {sim.simulationType !== "party_change" && sim.description}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(sim.status)}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runWhatIfMutation.mutate(sim.id)}
                          disabled={sim.status === "running" || runWhatIfMutation.isPending}
                          data-testid={`button-run-simulation-${sim.id}`}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Simular
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteWhatIfMutation.mutate(sim.id)}
                          data-testid={`button-delete-simulation-${sim.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {sim.status === "completed" && sim.impactAnalysis && (
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="text-sm font-medium">
                            Impacto: {sim.impactAnalysis.overallImpact === "significativo" ? "Significativo" : 
                                      sim.impactAnalysis.overallImpact === "moderado" ? "Moderado" : "Mínimo"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Confiança: {((sim.impactAnalysis.confidence || 0) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      {sim.impactAnalysis.seatChanges && sim.impactAnalysis.seatChanges.length > 0 && (
                        <>
                          <div className="h-48 mb-4">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={sim.impactAnalysis.seatChanges.slice(0, 6).map((c: any) => ({
                                name: c.party,
                                antes: c.before,
                                depois: c.after,
                                variacao: c.change,
                              }))}>
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis />
                                <Tooltip 
                                  formatter={(value: number, name: string) => [
                                    value, 
                                    name === "antes" ? "Antes" : name === "depois" ? "Depois" : "Variação"
                                  ]}
                                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                                />
                                <Legend />
                                <Bar dataKey="antes" name="Antes" fill="hsl(210, 30%, 60%)" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="depois" name="Depois" fill="hsl(210, 100%, 40%)" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {sim.impactAnalysis.seatChanges.slice(0, 4).map((change: any, i: number) => (
                              <div key={i} className="p-3 rounded-lg border text-center">
                                <span className="font-medium">{change.party}</span>
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <span className="text-muted-foreground">{change.before}</span>
                                  <ArrowRight className="h-3 w-3" />
                                  <span className={change.change > 0 ? "text-success" : change.change < 0 ? "text-destructive" : ""}>
                                    {change.after}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {sim.narrative && (
                        <div className="bg-muted/50 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">{sim.narrative}</p>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportPredictionToPdf({
                            title: sim.name,
                            subtitle: `Simulação: ${sim.simulationType}`,
                            type: "whatif",
                            data: sim,
                            narrative: sim.narrative || undefined,
                          })}
                          data-testid={`button-export-simulation-${sim.id}`}
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
              <Shuffle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma simulação criada</p>
              <p className="text-sm">Crie uma nova simulação para explorar cenários hipotéticos</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
