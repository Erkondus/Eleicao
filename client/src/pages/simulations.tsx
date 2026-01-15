import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Calculator, PlayCircle, Save, Download, Trophy, Users } from "lucide-react";
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
import type { Scenario, Party, Candidate, SimulationResult, PartyResult } from "@shared/schema";
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

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const { data: candidates } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

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
      
      const result = response as unknown as SimulationResult;
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
              <Select value={selectedScenarioId} onValueChange={setSelectedScenarioId}>
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
            {selectedScenario && (
              <>
                <div className="space-y-2">
                  <Label>Quociente Eleitoral</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <span className="text-2xl font-mono font-bold">
                      {calculateElectoralQuotient(selectedScenario.validVotes, selectedScenario.availableSeats).toLocaleString("pt-BR")}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedScenario.validVotes.toLocaleString("pt-BR")} votos / {selectedScenario.availableSeats} vagas
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Vagas Disponíveis</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <span className="text-2xl font-mono font-bold">{selectedScenario.availableSeats}</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Total de vagas a serem preenchidas
                    </p>
                  </div>
                </div>
              </>
            )}
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
                        {(partyVotes[party.id] || 0).toLocaleString("pt-BR")} votos
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
              Distribuição de vagas pelo sistema proporcional brasileiro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-primary/10 rounded-lg text-center">
                <p className="text-3xl font-mono font-bold text-primary">
                  {simulationResult.electoralQuotient.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-muted-foreground">Quociente Eleitoral</p>
              </div>
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-3xl font-mono font-bold">
                  {simulationResult.totalValidVotes.toLocaleString("pt-BR")}
                </p>
                <p className="text-sm text-muted-foreground">Votos Válidos</p>
              </div>
              <div className="p-4 bg-success/10 rounded-lg text-center">
                <p className="text-3xl font-mono font-bold text-success">
                  {simulationResult.seatsDistributedByQuotient}
                </p>
                <p className="text-sm text-muted-foreground">Vagas por Quociente</p>
              </div>
              <div className="p-4 bg-accent/10 rounded-lg text-center">
                <p className="text-3xl font-mono font-bold text-accent-foreground">
                  {simulationResult.seatsDistributedByRemainder}
                </p>
                <p className="text-sm text-muted-foreground">Vagas por Sobras</p>
              </div>
            </div>

            <Tabs defaultValue="table" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="table" data-testid="tab-results-table">Tabela</TabsTrigger>
                <TabsTrigger value="chart" data-testid="tab-results-chart">Gráfico</TabsTrigger>
                <TabsTrigger value="elected" data-testid="tab-results-elected">Eleitos</TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="mt-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Partido</TableHead>
                        <TableHead className="text-right">Votos</TableHead>
                        <TableHead className="text-right">Quociente</TableHead>
                        <TableHead className="text-right">Vagas QE</TableHead>
                        <TableHead className="text-right">Vagas Sobras</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(simulationResult.partyResults ?? []).map((pr, idx) => (
                        <TableRow key={pr.partyId}>
                          <TableCell className="font-mono">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: (pr as any).color || "#003366" }}
                              />
                              <Badge variant="outline">{(pr as any).abbreviation || pr.partyName}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {pr.totalVotes.toLocaleString("pt-BR")}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {pr.partyQuotient.toFixed(2)}
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
                      ))}
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
                      <div className="flex items-center gap-2 mb-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: (pr as any).color || "#003366" }}
                        />
                        <h4 className="font-semibold">{pr.partyName}</h4>
                        <Badge>{pr.totalSeats} {pr.totalSeats === 1 ? "vaga" : "vagas"}</Badge>
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
                      </div>
                    </div>
                  ))}
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
