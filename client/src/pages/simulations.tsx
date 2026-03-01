import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Calculator, PlayCircle, Save, Download, Trophy, Users, AlertTriangle, Info, Shield, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Scenario, Party, Candidate, SimulationResult, PartyResult, ScenarioCandidate } from "@shared/schema";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type VoteInput = { partyId: number; votes: number; candidates: { candidateId: number; votes: number }[] };

export default function Simulations() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const scenarioParam = params.get("scenario");

  const { toast } = useToast();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(scenarioParam || "");
  const [partyVotes, setPartyVotes] = useState<Record<number, number>>({});
  const [candidateVotes, setCandidateVotes] = useState<Record<number, number>>({});
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [dataPreloaded, setDataPreloaded] = useState<string>("");

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const { data: candidates } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  const { data: scenarioCandidatesData } = useQuery<(ScenarioCandidate & { candidate: Candidate; party: Party })[]>({
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
    if (!selectedScenarioId || !scenarioCandidatesData || !scenarioVotesData) return;
    if (dataPreloaded === selectedScenarioId) return;

    const prefilledCandVotes: Record<number, number> = {};
    const prefilledPartyVotes: Record<number, number> = {};

    for (const sc of scenarioCandidatesData) {
      if (sc.votes > 0) {
        prefilledCandVotes[sc.candidateId] = sc.votes;
      }
    }

    for (const sv of scenarioVotesData) {
      if (sv.candidateId === null && sv.votes > 0) {
        prefilledPartyVotes[sv.partyId] = (prefilledPartyVotes[sv.partyId] || 0) + sv.votes;
      }
    }

    setCandidateVotes(prefilledCandVotes);
    setPartyVotes(prefilledPartyVotes);
    setDataPreloaded(selectedScenarioId);
  }, [selectedScenarioId, scenarioCandidatesData, scenarioVotesData, dataPreloaded]);

  const selectedScenario = scenarios?.find((s) => s.id === parseInt(selectedScenarioId));

  const candidatesByParty = useMemo(() => {
    if (!candidates || !parties) return {};
    const grouped: Record<number, Candidate[]> = {};
    parties.forEach((p) => {
      grouped[p.id] = candidates.filter((c) => c.partyId === p.id);
    });
    return grouped;
  }, [candidates, parties]);

  function calculateElectoralQuotient(validVotes: number, seats: number): number {
    return Math.floor(validVotes / seats);
  }

  async function calculateSimulation() {
    if (!selectedScenario || !parties) return;

    setIsCalculating(true);

    try {
      const response = await apiRequest("POST", "/api/electoral/calculate", {
        scenarioId: parseInt(selectedScenarioId),
        partyVotes,
        candidateVotes,
      });
      
      const result: SimulationResult = await response.json();
      setSimulationResult({
        ...result,
        partyResults: result.partyResults ?? [],
      });
      toast({ title: "Simulação concluída", description: "Os resultados foram calculados com sucesso" });
    } catch (error) {
      toast({ title: "Erro", description: "Falha ao calcular simulação", variant: "destructive" });
    } finally {
      setIsCalculating(false);
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/simulations", {
        scenarioId: parseInt(selectedScenarioId),
        name: `Simulação - ${new Date().toLocaleString("pt-BR")}`,
        electoralQuotient: simulationResult?.electoralQuotient,
        results: simulationResult,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Sucesso", description: "Simulação salva com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar simulação", variant: "destructive" });
    },
  });

  const chartData = (simulationResult?.partyResults ?? []).map((pr) => ({
    name: (pr as any).abbreviation || pr.partyName.substring(0, 5),
    vagas: pr.totalSeats,
    votos: pr.totalVotes,
    color: (pr as any).color || "#003366",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulação Eleitoral"
        description="Execute simulações do sistema proporcional brasileiro"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Simulações" },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Configurar Simulação
          </CardTitle>
          <CardDescription>
            Selecione um cenário e insira os votos para cada partido
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Cenário Eleitoral</Label>
              <Select value={selectedScenarioId} onValueChange={(id) => {
                  setSelectedScenarioId(id);
                  setPartyVotes({});
                  setCandidateVotes({});
                  setDataPreloaded("");
                  setSimulationResult(null);
                }}>
                <SelectTrigger data-testid="select-simulation-scenario">
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
            {selectedScenario && (() => {
              const qe = calculateElectoralQuotient(selectedScenario.validVotes, selectedScenario.availableSeats);
              return (
                <>
                  <div className="space-y-2">
                    <Label>Quociente Eleitoral (QE)</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <span className="text-2xl font-mono font-bold">{qe.toLocaleString("pt-BR")}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedScenario.validVotes.toLocaleString("pt-BR")} / {selectedScenario.availableSeats} vagas
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Vagas Disponíveis</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <span className="text-2xl font-mono font-bold">{selectedScenario.availableSeats}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        Barreira: {Math.floor(qe * 0.8).toLocaleString("pt-BR")} | Mín. ind.: {Math.floor(qe * 0.2).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {selectedScenario && parties && parties.length > 0 && (
            <Accordion type="multiple" className="w-full">
              {parties.map((party) => (
                <AccordionItem key={party.id} value={`party-${party.id}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 w-full">
                      <div
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: party.color }}
                      />
                      <Badge variant="outline">{party.abbreviation}</Badge>
                      <span className="flex-1 text-left">{party.name}</span>
                      <span className="font-mono text-muted-foreground mr-4">
                        {((partyVotes[party.id] || 0) + (candidatesByParty[party.id] || []).reduce((sum, c) => sum + (candidateVotes[c.id] || 0), 0)).toLocaleString("pt-BR")} votos
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Votos de Legenda</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={partyVotes[party.id] || ""}
                            onChange={(e) => setPartyVotes((prev) => ({
                              ...prev,
                              [party.id]: parseInt(e.target.value) || 0,
                            }))}
                            className="font-mono"
                            data-testid={`input-party-votes-${party.id}`}
                          />
                        </div>
                      </div>
                      {candidatesByParty[party.id]?.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm">Votos por Candidato</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {candidatesByParty[party.id].map((candidate) => (
                              <div key={candidate.id} className="flex items-center gap-2 p-2 border rounded-md">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {candidate.nickname || candidate.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground font-mono">
                                    #{candidate.number}
                                  </p>
                                </div>
                                <Input
                                  type="number"
                                  placeholder="0"
                                  value={candidateVotes[candidate.id] || ""}
                                  onChange={(e) => setCandidateVotes((prev) => ({
                                    ...prev,
                                    [candidate.id]: parseInt(e.target.value) || 0,
                                  }))}
                                  className="w-24 font-mono text-sm"
                                  data-testid={`input-candidate-votes-${candidate.id}`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          <div className="flex gap-3 pt-4 border-t">
            <Button
              onClick={calculateSimulation}
              disabled={!selectedScenarioId || isCalculating}
              className="bg-accent text-accent-foreground"
              data-testid="button-calculate-simulation"
            >
              {isCalculating ? (
                <>Calculando...</>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Calcular Resultados
                </>
              )}
            </Button>
            {simulationResult && (
              <>
                <Button
                  variant="outline"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-simulation"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Simulação
                </Button>
                <Button variant="outline" data-testid="button-export-simulation">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {simulationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-accent" />
              Resultados da Simulação
            </CardTitle>
            <CardDescription>
              Distribuição de vagas pelo sistema proporcional brasileiro (regras TSE vigentes)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(simulationResult as any).noPartyReachedQE && (
              <div className="flex items-start gap-2 p-3 mb-4 bg-destructive/10 border border-destructive/20 rounded-md" data-testid="warning-no-qe">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Nenhum partido/federação atingiu o Quociente Eleitoral</p>
                  <p className="text-sm text-muted-foreground">Todas as vagas foram distribuídas pelo método D'Hondt entre todos os partidos com votos.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="p-4 bg-primary/10 rounded-lg text-center">
                <p className="text-2xl font-mono font-bold text-primary" data-testid="text-qe-value">
                  {simulationResult.electoralQuotient.toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground">QE (Art. 106)</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-2xl font-mono font-bold" data-testid="text-valid-votes">
                  {simulationResult.totalValidVotes.toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground">Votos Válidos</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-2xl font-mono font-bold" data-testid="text-barrier">
                  {((simulationResult as any).barrierThreshold || 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground">Barreira 80% QE</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-2xl font-mono font-bold" data-testid="text-candidate-min">
                  {((simulationResult as any).candidateMinVotes || 0).toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground">Mín. Individual 20% QE</p>
              </div>
              <div className="p-4 bg-success/10 rounded-lg text-center">
                <p className="text-2xl font-mono font-bold text-success" data-testid="text-seats-quotient">
                  {simulationResult.seatsDistributedByQuotient}
                </p>
                <p className="text-xs text-muted-foreground">Vagas por QP</p>
              </div>
              <div className="p-4 bg-accent/10 rounded-lg text-center">
                <p className="text-2xl font-mono font-bold text-accent-foreground" data-testid="text-seats-remainder">
                  {simulationResult.seatsDistributedByRemainder}
                </p>
                <p className="text-xs text-muted-foreground">Vagas por Sobras</p>
              </div>
            </div>

            <Tabs defaultValue="table" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="table" data-testid="tab-results-table">Tabela</TabsTrigger>
                <TabsTrigger value="chart" data-testid="tab-results-chart">Gráfico</TabsTrigger>
                <TabsTrigger value="elected" data-testid="tab-results-elected">Eleitos</TabsTrigger>
                <TabsTrigger value="rules" data-testid="tab-results-rules">Regras TSE</TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="mt-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Partido</TableHead>
                        <TableHead className="text-right">Votos</TableHead>
                        <TableHead className="text-right">QP</TableHead>
                        <TableHead className="text-center">Barreira</TableHead>
                        <TableHead className="text-right">Vagas QP</TableHead>
                        <TableHead className="text-right">Sobras</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(simulationResult.partyResults ?? []).map((pr, idx) => {
                        const meetsBarrier = (pr as any).meetsBarrier;
                        return (
                          <TableRow key={pr.partyId} data-testid={`row-party-${pr.partyId}`}>
                            <TableCell className="font-mono">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 flex-wrap">
                                <div
                                  className="w-3 h-3 rounded-full shrink-0"
                                  style={{ backgroundColor: (pr as any).color || "#003366" }}
                                />
                                <Badge variant="outline">{(pr as any).abbreviation || pr.partyName}</Badge>
                                {(pr as any).federationName && (
                                  <Badge variant="secondary" className="text-xs">
                                    {(pr as any).federationName}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {pr.totalVotes.toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {pr.partyQuotient.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center">
                              {meetsBarrier ? (
                                <Shield className="h-4 w-4 text-success inline-block" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-destructive inline-block" />
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-success">
                              {pr.seatsFromQuotient}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-accent-foreground">
                              {pr.seatsFromRemainder}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge className="font-mono text-lg">{pr.totalSeats}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="chart" className="mt-4">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === "vagas" ? `${value} vagas` : value.toLocaleString("pt-BR") + " votos",
                          name === "vagas" ? "Vagas" : "Votos",
                        ]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "var(--radius)",
                        }}
                      />
                      <Bar dataKey="vagas" name="Vagas" radius={[0, 4, 4, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              <TabsContent value="elected" className="mt-4">
                <div className="space-y-4">
                  {(simulationResult.partyResults ?? []).filter((pr) => pr.totalSeats > 0).map((pr) => (
                    <div key={pr.partyId} className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: (pr as any).color || "#003366" }}
                        />
                        <h4 className="font-semibold">{pr.partyName}</h4>
                        <Badge>{pr.totalSeats} {pr.totalSeats === 1 ? "vaga" : "vagas"}</Badge>
                        {(pr as any).federationName && (
                          <Badge variant="secondary">{(pr as any).federationName}</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {pr.electedCandidates.filter((c) => c.elected).map((c) => (
                          <div
                            key={c.candidateId}
                            className="flex items-center gap-2 p-2 bg-success/10 rounded-md"
                          >
                            <Trophy className="h-4 w-4 text-success shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {c.votes.toLocaleString("pt-BR")} votos
                              </p>
                            </div>
                            <Badge variant="outline" className="font-mono">
                              #{c.position}
                            </Badge>
                          </div>
                        ))}
                        {pr.electedCandidates.filter((c: any) => c.belowMinThreshold && !c.elected).length > 0 && (
                          <div className="col-span-full mt-2 p-2 bg-destructive/5 rounded-md">
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {pr.electedCandidates.filter((c: any) => c.belowMinThreshold).length} candidato(s) abaixo do mínimo individual (20% QE)
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="rules" className="mt-4">
                <div className="space-y-4">
                  {(simulationResult as any).tseRulesApplied && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Scale className="h-4 w-4" />
                          Regras TSE Aplicadas
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {((simulationResult as any).tseRulesApplied as string[]).map((rule: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm">
                              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {(simulationResult as any).calculationLog && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Calculator className="h-4 w-4" />
                          Detalhamento do Cálculo
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 font-mono text-sm">
                          {Object.entries((simulationResult as any).calculationLog as Record<string, any>)
                            .filter(([key]) => key.startsWith("step"))
                            .map(([key, value]) => (
                              <div key={key} className="flex items-start gap-2 p-2 bg-muted/50 rounded-md">
                                <Badge variant="outline" className="shrink-0 font-mono">
                                  {key.replace("step", "").replace("_", ".")}
                                </Badge>
                                <span className="text-sm">{String(value)}</span>
                              </div>
                            ))}
                        </div>
                        {((simulationResult as any).calculationLog?.warnings as string[] || []).length > 0 && (
                          <div className="mt-4 space-y-2">
                            {((simulationResult as any).calculationLog.warnings as string[]).map((w: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 p-2 bg-destructive/10 rounded-md">
                                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                <span className="text-sm">{w}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {!selectedScenarioId && (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Calculator}
              title="Selecione um cenário"
              description="Para iniciar uma simulação, selecione um cenário eleitoral previamente configurado."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
