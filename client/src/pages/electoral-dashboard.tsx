import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, Tooltip as RechartsTooltip
} from "recharts";
import { 
  Vote, Users, Building2, MapPin, TrendingUp, Download, 
  CheckCircle2, XCircle, Loader2, Clock, RefreshCw, 
  BarChart3, Activity, Database
} from "lucide-react";
import { Link } from "wouter";
import type { TseImportJob } from "@shared/schema";

const CHART_COLORS = [
  "#003366", "#1a5490", "#3475b4", "#4e96d8", "#68b7fc",
  "#FFD700", "#e6c200", "#ccad00", "#b39800", "#998300",
  "#2ecc71", "#27ae60", "#1e8449", "#145a32", "#0d3d22",
  "#e74c3c", "#c0392b", "#a93226", "#922b21", "#7b241c",
];

const BRAZIL_STATES: { [key: string]: { name: string; path: string; cx: number; cy: number } } = {
  AC: { name: "Acre", path: "M85,280 L105,275 L110,290 L95,300 L80,295 Z", cx: 95, cy: 287 },
  AL: { name: "Alagoas", path: "M490,260 L510,255 L515,270 L495,275 Z", cx: 502, cy: 265 },
  AP: { name: "Amapá", path: "M280,80 L310,75 L320,110 L295,120 L275,105 Z", cx: 297, cy: 95 },
  AM: { name: "Amazonas", path: "M100,150 L220,140 L240,200 L200,250 L120,260 L80,220 Z", cx: 160, cy: 195 },
  BA: { name: "Bahia", path: "M400,220 L480,200 L510,280 L470,340 L410,320 L390,270 Z", cx: 445, cy: 270 },
  CE: { name: "Ceará", path: "M450,160 L490,150 L500,190 L465,200 L445,185 Z", cx: 472, cy: 175 },
  DF: { name: "Distrito Federal", path: "M355,300 L370,295 L375,310 L360,315 Z", cx: 365, cy: 305 },
  ES: { name: "Espírito Santo", path: "M455,340 L475,335 L480,365 L460,370 Z", cx: 467, cy: 352 },
  GO: { name: "Goiás", path: "M320,290 L380,280 L400,340 L350,360 L310,340 Z", cx: 355, cy: 320 },
  MA: { name: "Maranhão", path: "M360,140 L420,130 L435,180 L390,200 L350,180 Z", cx: 392, cy: 165 },
  MT: { name: "Mato Grosso", path: "M220,250 L320,240 L340,340 L280,380 L200,350 L190,290 Z", cx: 265, cy: 310 },
  MS: { name: "Mato Grosso do Sul", path: "M280,380 L340,360 L360,430 L300,460 L260,430 Z", cx: 310, cy: 410 },
  MG: { name: "Minas Gerais", path: "M360,320 L450,300 L480,370 L430,420 L360,400 L340,360 Z", cx: 405, cy: 360 },
  PA: { name: "Pará", path: "M240,120 L350,100 L380,170 L340,220 L260,230 L220,180 Z", cx: 295, cy: 165 },
  PB: { name: "Paraíba", path: "M475,210 L510,205 L515,225 L480,230 Z", cx: 495, cy: 217 },
  PR: { name: "Paraná", path: "M320,430 L390,420 L410,470 L350,490 L310,470 Z", cx: 360, cy: 455 },
  PE: { name: "Pernambuco", path: "M450,220 L510,210 L520,245 L460,255 Z", cx: 485, cy: 235 },
  PI: { name: "Piauí", path: "M400,170 L450,160 L465,220 L420,240 L390,210 Z", cx: 427, cy: 200 },
  RJ: { name: "Rio de Janeiro", path: "M430,400 L470,390 L485,420 L450,435 Z", cx: 457, cy: 410 },
  RN: { name: "Rio Grande do Norte", path: "M480,180 L515,175 L520,200 L490,205 Z", cx: 500, cy: 190 },
  RS: { name: "Rio Grande do Sul", path: "M310,500 L380,490 L400,560 L340,580 L290,550 Z", cx: 345, cy: 535 },
  RO: { name: "Rondônia", path: "M160,280 L220,270 L230,330 L190,350 L150,330 Z", cx: 190, cy: 310 },
  RR: { name: "Roraima", path: "M180,60 L230,50 L250,110 L210,130 L170,100 Z", cx: 210, cy: 90 },
  SC: { name: "Santa Catarina", path: "M350,490 L410,480 L425,520 L375,535 Z", cx: 387, cy: 505 },
  SP: { name: "São Paulo", path: "M350,400 L430,380 L460,440 L400,470 L340,450 Z", cx: 395, cy: 425 },
  SE: { name: "Sergipe", path: "M485,270 L510,265 L515,285 L490,290 Z", cx: 500, cy: 277 },
  TO: { name: "Tocantins", path: "M340,200 L390,190 L410,260 L370,290 L330,260 Z", cx: 365, cy: 240 },
};

function formatNumber(num: number): string {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + "B";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString("pt-BR");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed": return "text-green-500";
    case "failed": return "text-red-500";
    case "downloading": case "processing": case "running": case "extracting": return "text-blue-500";
    default: return "text-muted-foreground";
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
    case "downloading": return <Download className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "processing": case "running": case "extracting": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    default: return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3">
      <p className="font-semibold text-sm">{data.party}</p>
      <p className="text-sm"><span className="text-muted-foreground">Votos:</span> {formatNumber(data.votes)}</p>
      <p className="text-sm"><span className="text-muted-foreground">Percentual:</span> {data.percentage?.toFixed(1)}%</p>
    </div>
  );
}

export default function ElectoralDashboard() {
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedState, setSelectedState] = useState<string | null>(null);

  const yearQuery = selectedYear !== "all" ? `?year=${selectedYear}` : "";

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<{
    totalVotes: number;
    totalCandidates: number;
    totalParties: number;
    totalMunicipalities: number;
  }>({
    queryKey: [`/api/analytics/summary${yearQuery}`],
  });

  const { data: votesByParty, isLoading: partyLoading } = useQuery<{
    party: string;
    partyNumber: number | null;
    votes: number;
    candidateCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-party${yearQuery}`],
  });

  const { data: topCandidates, isLoading: candidatesLoading } = useQuery<{
    name: string;
    nickname: string | null;
    party: string | null;
    number: number | null;
    state: string | null;
    position: string | null;
    votes: number;
  }[]>({
    queryKey: [`/api/analytics/top-candidates${yearQuery}`],
  });

  const { data: votesByState, isLoading: stateLoading } = useQuery<{
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-state${yearQuery}`],
  });

  const { data: importJobs, isLoading: importsLoading, refetch: refetchImports } = useQuery<TseImportJob[]>({
    queryKey: ["/api/imports/tse"],
    refetchInterval: 5000,
  });

  const partyChartData = useMemo(() => {
    if (!votesByParty) return [];
    const totalVotes = votesByParty.reduce((sum, p) => sum + p.votes, 0);
    return votesByParty.slice(0, 10).map(p => ({
      ...p,
      percentage: (p.votes / totalVotes) * 100,
    }));
  }, [votesByParty]);

  const candidateChartData = useMemo(() => {
    if (!topCandidates) return [];
    return topCandidates.slice(0, 10).map(c => ({
      name: c.nickname || c.name.split(" ").slice(0, 2).join(" "),
      fullName: c.name,
      party: c.party,
      votes: c.votes,
      state: c.state,
    }));
  }, [topCandidates]);

  const stateVotesMap = useMemo(() => {
    if (!votesByState) return {};
    const map: { [key: string]: number } = {};
    votesByState.forEach(s => { map[s.state] = s.votes; });
    return map;
  }, [votesByState]);

  const maxStateVotes = useMemo(() => {
    if (!votesByState || votesByState.length === 0) return 1;
    return Math.max(...votesByState.map(s => s.votes));
  }, [votesByState]);

  const getStateColor = (stateCode: string) => {
    const votes = stateVotesMap[stateCode] || 0;
    if (votes === 0) return "#e5e7eb";
    const intensity = Math.min(0.9, 0.2 + (votes / maxStateVotes) * 0.7);
    return `rgba(0, 51, 102, ${intensity})`;
  };

  const selectedStateData = useMemo(() => {
    if (!selectedState || !votesByState) return null;
    return votesByState.find(s => s.state === selectedState) || null;
  }, [selectedState, votesByState]);

  const importStats = useMemo(() => {
    if (!importJobs) return { total: 0, completed: 0, failed: 0, active: 0, totalRows: 0, totalSize: 0 };
    return {
      total: importJobs.length,
      completed: importJobs.filter(j => j.status === "completed").length,
      failed: importJobs.filter(j => j.status === "failed").length,
      active: importJobs.filter(j => ["downloading", "processing", "running", "extracting", "pending"].includes(j.status)).length,
      totalRows: importJobs.reduce((sum, j) => sum + (j.processedRows || 0), 0),
      totalSize: importJobs.reduce((sum, j) => sum + j.fileSize, 0),
    };
  }, [importJobs]);

  const recentImports = useMemo(() => {
    if (!importJobs) return [];
    return importJobs.slice(0, 5);
  }, [importJobs]);

  const hasData = summary && (summary.totalVotes > 0 || summary.totalCandidates > 0);

  return (
    <div className="p-6 space-y-6" data-testid="electoral-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-dashboard-title">
            <BarChart3 className="h-8 w-8 text-primary" />
            Dashboard Eleitoral
          </h1>
          <p className="text-muted-foreground mt-1">
            Visão geral consolidada dos dados eleitorais e status das importações
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[150px]" data-testid="select-year">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-year-all">Todos os anos</SelectItem>
              {years?.map(year => (
                <SelectItem key={year} value={String(year)} data-testid={`select-year-${year}`}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetchImports()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-votes">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Votos</CardTitle>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-votes">
                {formatNumber(summary?.totalVotes || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">votos registrados</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-candidates">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Candidatos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-candidates">
                {formatNumber(summary?.totalCandidates || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">candidaturas</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-parties">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partidos</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-parties">
                {formatNumber(summary?.totalParties || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">partidos ativos</p>
          </CardContent>
        </Card>

        <Card data-testid="card-imports-status">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Importações</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {importsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold" data-testid="text-imports-completed">{importStats.completed}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-lg">{importStats.total}</span>
                {importStats.active > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {importStats.active} ativa{importStats.active > 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">{formatNumber(importStats.totalRows)} registros importados</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-1" data-testid="card-brazil-map">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Distribuição por Estado
            </CardTitle>
            <CardDescription>Clique em um estado para ver detalhes</CardDescription>
          </CardHeader>
          <CardContent>
            {stateLoading ? (
              <div className="flex items-center justify-center h-[400px]" data-testid="loading-map">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="relative">
                <svg viewBox="50 30 500 580" className="w-full h-[300px]" data-testid="brazil-map-svg">
                  {Object.entries(BRAZIL_STATES).map(([code, state]) => (
                    <Tooltip key={code}>
                      <TooltipTrigger asChild>
                        <g 
                          className="cursor-pointer"
                          onClick={() => setSelectedState(selectedState === code ? null : code)}
                          data-testid={`map-state-group-${code}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${state.name}: ${formatNumber(stateVotesMap[code] || 0)} votos`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setSelectedState(selectedState === code ? null : code);
                            }
                          }}
                        >
                          <path
                            d={state.path}
                            fill={getStateColor(code)}
                            stroke={selectedState === code ? "#FFD700" : "#fff"}
                            strokeWidth={selectedState === code ? "3" : "1"}
                            data-testid={`map-state-${code}`}
                          />
                          <text
                            x={state.cx}
                            y={state.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="10"
                            fill={stateVotesMap[code] ? "#fff" : "#666"}
                            fontWeight="bold"
                            data-testid={`text-state-code-${code}`}
                          >
                            {code}
                          </text>
                        </g>
                      </TooltipTrigger>
                      <TooltipContent data-testid={`tooltip-state-${code}`}>
                        <div className="text-sm">
                          <p className="font-semibold">{state.name} ({code})</p>
                          <p>Votos: {formatNumber(stateVotesMap[code] || 0)}</p>
                          <p className="text-xs text-muted-foreground mt-1">Clique para detalhes</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </svg>
                <div className="flex items-center justify-between mt-2" data-testid="map-legend">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: "rgba(0, 51, 102, 0.2)" }} data-testid="legend-color-min" />
                      <span data-testid="legend-label-min">Menos votos</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: "rgba(0, 51, 102, 0.9)" }} data-testid="legend-color-max" />
                      <span data-testid="legend-label-max">Mais votos</span>
                    </div>
                  </div>
                  {selectedState && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setSelectedState(null)}
                      data-testid="button-clear-selection"
                    >
                      Limpar seleção
                    </Button>
                  )}
                </div>
                {selectedState && selectedStateData && (
                  <Card className="mt-4" data-testid="state-detail-panel">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-lg" data-testid="text-selected-state-name">
                          {BRAZIL_STATES[selectedState]?.name} ({selectedState})
                        </h4>
                        <Badge variant="secondary" data-testid="badge-selected-state">{selectedState}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-state-votes">
                            {formatNumber(selectedStateData.votes)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid="label-state-votes">Votos</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-state-candidates">
                            {formatNumber(selectedStateData.candidateCount)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid="label-state-candidates">Candidatos</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold" data-testid="text-state-parties">
                            {formatNumber(selectedStateData.partyCount)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid="label-state-parties">Partidos</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {selectedState && !selectedStateData && (
                  <Card className="mt-4" data-testid="state-no-data">
                    <CardContent className="pt-4 text-center text-muted-foreground">
                      <p>Sem dados disponíveis para {BRAZIL_STATES[selectedState]?.name}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-party-performance">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Top 10 Partidos
            </CardTitle>
            <CardDescription>Distribuição de votos por partido</CardDescription>
          </CardHeader>
          <CardContent>
            {partyLoading ? (
              <div className="flex items-center justify-center h-[350px]" data-testid="loading-party-chart">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : partyChartData.length > 0 ? (
              <div data-testid="chart-party-pie">
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={partyChartData}
                      dataKey="votes"
                      nameKey="party"
                      cx="50%"
                      cy="50%"
                      outerRadius={120}
                      label={({ party, percentage }) => `${party} (${percentage.toFixed(1)}%)`}
                      labelLine={false}
                    >
                      {partyChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[350px] text-muted-foreground" data-testid="empty-party-chart">
                <Building2 className="h-12 w-12 mb-2 opacity-50" />
                <p>Sem dados de partidos</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2" data-testid="card-top-candidates">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Candidatos Mais Votados
            </CardTitle>
            <CardDescription>Top 10 candidatos por número de votos</CardDescription>
          </CardHeader>
          <CardContent>
            {candidatesLoading ? (
              <div className="flex items-center justify-center h-[300px]" data-testid="loading-candidates-chart">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : candidateChartData.length > 0 ? (
              <div data-testid="chart-candidates-bar">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={candidateChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" tickFormatter={formatNumber} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3" data-testid="tooltip-candidate">
                            <p className="font-semibold">{data.fullName}</p>
                            <p className="text-sm"><span className="text-muted-foreground">Partido:</span> {data.party}</p>
                            <p className="text-sm"><span className="text-muted-foreground">Estado:</span> {data.state}</p>
                            <p className="text-sm"><span className="text-muted-foreground">Votos:</span> {formatNumber(data.votes)}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="votes" fill="#003366" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground" data-testid="empty-candidates-chart">
                <Users className="h-12 w-12 mb-2 opacity-50" />
                <p>Sem dados de candidatos</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-import-status">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Status das Importações
              </span>
              <Link href="/tse-import">
                <Button variant="ghost" size="sm" data-testid="link-view-all-imports">
                  Ver todas
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importsLoading ? (
              <div className="space-y-3" data-testid="loading-imports">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentImports.length > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center pb-3 border-b">
                  <div>
                    <p className="text-2xl font-bold text-green-500" data-testid="text-completed-count">{importStats.completed}</p>
                    <p className="text-xs text-muted-foreground">Concluídas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-500" data-testid="text-active-count">{importStats.active}</p>
                    <p className="text-xs text-muted-foreground">Em andamento</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500" data-testid="text-failed-count">{importStats.failed}</p>
                    <p className="text-xs text-muted-foreground">Falhas</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {recentImports.map(job => (
                    <div key={job.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50" data-testid={`import-job-${job.id}`}>
                      {getStatusIcon(job.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{job.filename.replace("[URL] ", "")}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{job.electionYear || "—"}</span>
                          <span>•</span>
                          <span>{formatBytes(job.fileSize)}</span>
                          {job.processedRows && job.processedRows > 0 && (
                            <>
                              <span>•</span>
                              <span>{formatNumber(job.processedRows)} registros</span>
                            </>
                          )}
                        </div>
                        {["downloading", "processing", "running", "extracting"].includes(job.status) && (
                          <Progress value={job.processedRows && job.totalRows ? (job.processedRows / job.totalRows) * 100 : 30} className="mt-1 h-1" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground" data-testid="empty-imports">
                <Database className="h-12 w-12 mb-2 opacity-50" />
                <p>Nenhuma importação registrada</p>
                <Link href="/tse-import">
                  <Button variant="link" size="sm" className="mt-2" data-testid="button-start-import-small">
                    Iniciar importação
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!hasData && !summaryLoading && (
        <Card className="border-dashed" data-testid="card-empty-state">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BarChart3 className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum dado eleitoral encontrado</h3>
            <p className="text-muted-foreground text-center max-w-md mb-4">
              Importe dados do TSE para começar a visualizar análises eleitorais detalhadas.
            </p>
            <Link href="/tse-import">
              <Button data-testid="button-start-import">
                <Download className="h-4 w-4 mr-2" />
                Importar Dados do TSE
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
