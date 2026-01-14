import { useQuery } from "@tanstack/react-query";
import { Building2, Users, FileText, PlayCircle, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/stats-card";
import { PageHeader } from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import { Link } from "wouter";
import type { Scenario, Party, Candidate, Simulation } from "@shared/schema";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<{
    parties: number;
    candidates: number;
    scenarios: number;
    simulations: number;
  }>({
    queryKey: ["/api/stats"],
  });

  const { data: recentScenarios, isLoading: scenariosLoading } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
  });

  const { data: recentSimulations, isLoading: simulationsLoading } = useQuery<Simulation[]>({
    queryKey: ["/api/simulations/recent"],
  });

  const { data: parties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
  });

  const chartColors = [
    "hsl(210, 100%, 20%)",
    "hsl(45, 100%, 50%)",
    "hsl(145, 63%, 42%)",
    "hsl(4, 84%, 49%)",
    "hsl(280, 60%, 40%)",
    "hsl(200, 80%, 50%)",
    "hsl(30, 90%, 50%)",
    "hsl(320, 70%, 50%)",
  ];

  const partyChartData = parties?.slice(0, 8).map((party, i) => ({
    name: party.abbreviation,
    value: Math.floor(Math.random() * 50000) + 10000,
    color: party.color || chartColors[i % chartColors.length],
  })) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bem-vindo, ${user?.name.split(" ")[0] || "Usuário"}`}
        description="Painel de controle do sistema de simulação eleitoral"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatsCard
              title="Partidos"
              value={stats?.parties || 0}
              description="Partidos cadastrados"
              icon={Building2}
            />
            <StatsCard
              title="Candidatos"
              value={stats?.candidates || 0}
              description="Candidatos registrados"
              icon={Users}
            />
            <StatsCard
              title="Cenários"
              value={stats?.scenarios || 0}
              description="Cenários eleitorais"
              icon={FileText}
            />
            <StatsCard
              title="Simulações"
              value={stats?.simulations || 0}
              description="Simulações realizadas"
              icon={PlayCircle}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Distribuição de Votos por Partido</CardTitle>
              <CardDescription>Visualização exemplo dos votos</CardDescription>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {partyChartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={partyChartData}>
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString("pt-BR"), "Votos"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {partyChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Cadastre partidos para ver a visualização
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Distribuição de Vagas</CardTitle>
              <CardDescription>Simulação da distribuição proporcional</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {partyChartData.length > 0 ? (
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={partyChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name }) => name}
                      labelLine={false}
                    >
                      {partyChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [value.toLocaleString("pt-BR"), "Votos"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Cadastre partidos para ver a visualização
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Cenários Recentes</CardTitle>
              <CardDescription>Últimos cenários eleitorais criados</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/scenarios" data-testid="link-view-scenarios">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {scenariosLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentScenarios && recentScenarios.length > 0 ? (
              <div className="space-y-3">
                {recentScenarios.slice(0, 5).map((scenario) => (
                  <div
                    key={scenario.id}
                    className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{scenario.name}</span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(scenario.createdAt).toLocaleDateString("pt-BR")}</span>
                        <span className="font-mono">{scenario.availableSeats} vagas</span>
                      </div>
                    </div>
                    <Badge variant={scenario.status === "completed" ? "default" : "secondary"}>
                      {scenario.status === "completed" ? "Concluído" : "Rascunho"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhum cenário criado ainda</p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/scenarios" data-testid="link-create-scenario">Criar primeiro cenário</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Simulações Recentes</CardTitle>
              <CardDescription>Últimas simulações executadas</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/simulations" data-testid="link-view-simulations">Ver todas</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {simulationsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentSimulations && recentSimulations.length > 0 ? (
              <div className="space-y-3">
                {recentSimulations.slice(0, 5).map((simulation) => (
                  <div
                    key={simulation.id}
                    className="flex items-center justify-between p-3 rounded-md border hover-elevate"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{simulation.name}</span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(simulation.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <Badge>Completo</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <PlayCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Nenhuma simulação realizada</p>
                <Button variant="outline" className="mt-4" asChild>
                  <Link href="/simulations" data-testid="link-run-simulation">Executar simulação</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
