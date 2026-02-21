import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, Tooltip as RechartsTooltip, 
  AreaChart, Area, Treemap
} from "recharts";
import { 
  Vote, Users, Building2, MapPin, TrendingUp, 
  ChevronRight, Home, ArrowLeft, BarChart3, 
  PieChartIcon, Map, Filter, Maximize2, X, Award
} from "lucide-react";

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

interface DrillDownContext {
  level: "overview" | "state" | "party" | "municipality" | "candidate";
  year?: number;
  state?: string;
  party?: string;
  position?: string;
}

interface PartyVotes {
  party: string;
  partyNumber: number | null;
  votes: number;
  percentage: number;
}

interface StateVotes {
  state: string;
  votes: number;
  candidateCount: number;
}

interface MunicipalityVotes {
  municipality: string;
  state: string | null;
  votes: number;
  candidateCount: number;
}

interface CandidateDetails {
  name: string;
  nickname: string | null;
  number: number | null;
  votes: number;
  municipality: string | null;
  state: string | null;
  position: string | null;
  result: string | null;
}

interface PositionVotes {
  position: string;
  votes: number;
  candidateCount: number;
  partyCount: number;
}

function formatNumber(num: number): string {
  if (num >= 1000000000) return (num / 1000000000).toFixed(1) + "B";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString("pt-BR");
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-lg p-3">
      <p className="font-semibold text-sm">{label || payload[0]?.payload?.party || payload[0]?.payload?.state}</p>
      <p className="text-sm"><span className="text-muted-foreground">Votos:</span> {formatNumber(payload[0]?.value || 0)}</p>
      {payload[0]?.payload?.percentage !== undefined && (
        <p className="text-sm"><span className="text-muted-foreground">Percentual:</span> {payload[0].payload.percentage.toFixed(1)}%</p>
      )}
    </div>
  );
}

function Breadcrumbs({ context, onNavigate }: { context: DrillDownContext; onNavigate: (level: DrillDownContext["level"], params?: Partial<DrillDownContext>) => void }) {
  const items: { level: DrillDownContext["level"]; label: string; icon: typeof Home }[] = [
    { level: "overview", label: "Visão Geral", icon: Home },
  ];

  if (context.state) {
    items.push({ level: "state", label: BRAZIL_STATES[context.state]?.name || context.state, icon: MapPin });
  }
  if (context.party) {
    items.push({ level: "party", label: context.party, icon: Building2 });
  }

  return (
    <nav className="flex items-center gap-1 text-sm" data-testid="breadcrumb-nav">
      {items.map((item, index) => (
        <div key={item.level} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1" />}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => onNavigate(item.level)}
            data-testid={`breadcrumb-${item.level}`}
          >
            <item.icon className="h-3 w-3" />
            {item.label}
          </Button>
        </div>
      ))}
    </nav>
  );
}

export default function InteractiveDashboard() {
  const [context, setContext] = useState<DrillDownContext>({ level: "overview" });
  const [activeTab, setActiveTab] = useState("region");

  const { data: years, isLoading: yearsLoading } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });

  const { data: positions } = useQuery<{ code: number; name: string; votes: number }[]>({
    queryKey: ["/api/analytics/positions"],
  });

  useEffect(() => {
    if (positions && positions.length > 0 && !context.position) {
      setContext(prev => ({ ...prev, position: positions[0].name }));
    }
  }, [positions]);

  const { data: summary, isLoading: summaryLoading } = useQuery<{
    totalVotes: number;
    totalCandidates: number;
    totalParties: number;
    totalMunicipalities: number;
  }>({
    queryKey: ["/api/analytics/summary", context.year, context.state, context.position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.state) params.append("uf", context.state);
      if (context.position) params.append("position", context.position);
      const res = await fetch(`/api/analytics/summary?${params}`);
      return res.json();
    },
    enabled: !!context.position,
  });

  const { data: votesByParty, isLoading: partyLoading } = useQuery<PartyVotes[]>({
    queryKey: ["/api/analytics/votes-by-party", context.year, context.state, context.position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.state) params.append("uf", context.state);
      if (context.position) params.append("position", context.position);
      params.append("limit", "15");
      const res = await fetch(`/api/analytics/votes-by-party?${params}`);
      return res.json();
    },
  });

  const { data: votesByState, isLoading: stateLoading } = useQuery<StateVotes[]>({
    queryKey: ["/api/analytics/votes-by-state", context.year, context.position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.position) params.append("position", context.position);
      const res = await fetch(`/api/analytics/votes-by-state?${params}`);
      return res.json();
    },
    enabled: !context.state && !!context.position,
  });

  const { data: votesByMunicipality, isLoading: municipalityLoading } = useQuery<MunicipalityVotes[]>({
    queryKey: ["/api/analytics/votes-by-municipality", context.year, context.state, context.position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.state) params.append("uf", context.state);
      if (context.position) params.append("position", context.position);
      params.append("limit", "20");
      const res = await fetch(`/api/analytics/votes-by-municipality?${params}`);
      return res.json();
    },
    enabled: !!context.state && !!context.position,
  });

  const { data: candidatesByParty, isLoading: candidatesLoading } = useQuery<CandidateDetails[]>({
    queryKey: ["/api/analytics/drill-down/candidates-by-party", context.year, context.state, context.party, context.position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.state) params.append("uf", context.state);
      if (context.party) params.append("party", context.party);
      if (context.position) params.append("position", context.position);
      params.append("limit", "50");
      const res = await fetch(`/api/analytics/drill-down/candidates-by-party?${params}`);
      return res.json();
    },
    enabled: !!context.party,
  });

  const { data: votesByPosition, isLoading: positionLoading } = useQuery<PositionVotes[]>({
    queryKey: ["/api/analytics/drill-down/votes-by-position", context.year, context.state],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.state) params.append("uf", context.state);
      const res = await fetch(`/api/analytics/drill-down/votes-by-position?${params}`);
      return res.json();
    },
  });

  const { data: partyByState, isLoading: partyByStateLoading } = useQuery<{
    state: string;
    party: string;
    votes: number;
    candidateCount: number;
    percentage: number;
  }[]>({
    queryKey: ["/api/analytics/drill-down/party-by-state", context.year, context.party, context.position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (context.year) params.append("year", String(context.year));
      if (context.party) params.append("party", context.party);
      if (context.position) params.append("position", context.position);
      const res = await fetch(`/api/analytics/drill-down/party-by-state?${params}`);
      return res.json();
    },
    enabled: !!context.party,
  });

  const stateVotesMap = useMemo(() => {
    const map: Record<string, number> = {};
    votesByState?.forEach(s => { map[s.state] = s.votes; });
    return map;
  }, [votesByState]);

  const maxStateVotes = useMemo(() => {
    return Math.max(...(votesByState?.map(s => s.votes) || [1]));
  }, [votesByState]);

  const getStateColor = (stateCode: string) => {
    const votes = stateVotesMap[stateCode] || 0;
    if (votes === 0) return "hsl(var(--muted))";
    const intensity = Math.min(votes / maxStateVotes, 1);
    return `hsl(210, 80%, ${70 - intensity * 40}%)`;
  };

  const handleStateClick = (stateCode: string) => {
    setContext(prev => ({ ...prev, level: "state", state: stateCode }));
    setActiveTab("region");
  };

  const handlePartyClick = (party: string) => {
    setContext(prev => ({ ...prev, level: "party", party }));
    setActiveTab("party");
  };

  const handleBreadcrumbNavigate = (level: DrillDownContext["level"]) => {
    switch (level) {
      case "overview":
        setContext({ level: "overview", year: context.year, position: context.position });
        break;
      case "state":
        setContext({ level: "state", year: context.year, state: context.state, position: context.position });
        break;
    }
  };

  const hasData = (summary?.totalVotes ?? 0) > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8" style={{ color: "#003366" }} />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Painel Interativo</h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              Explore dados eleitorais com visualizações interativas
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={context.year?.toString() || "all"}
            onValueChange={(v) => setContext(prev => ({ ...prev, year: v === "all" ? undefined : parseInt(v) }))}
          >
            <SelectTrigger className="w-[130px]" data-testid="select-year">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-year-all">Todos os anos</SelectItem>
              {years?.map((year) => (
                <SelectItem key={year} value={String(year)} data-testid={`option-year-${year}`}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={context.position || "all"}
            onValueChange={(v) => setContext(prev => ({ ...prev, position: v === "all" ? undefined : v }))}
          >
            <SelectTrigger className="w-[180px]" data-testid="select-position">
              <SelectValue placeholder="Cargo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="option-position-all">Todos os cargos</SelectItem>
              {positions?.map((pos) => (
                <SelectItem key={pos.name} value={pos.name} data-testid={`option-position-${pos.name}`}>
                  {pos.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(context.state || context.party) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setContext({ level: "overview", year: context.year, position: context.position })}
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-1" />
              Limpar seleção
            </Button>
          )}
        </div>
      </div>

      <Breadcrumbs context={context} onNavigate={handleBreadcrumbNavigate} />

      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-votes">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Vote className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-votes">{formatNumber(summary?.totalVotes || 0)}</p>
                  <p className="text-xs text-muted-foreground">Votos Totais</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-candidates">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-candidates">{formatNumber(summary?.totalCandidates || 0)}</p>
                  <p className="text-xs text-muted-foreground">Candidatos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-parties">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-parties">{formatNumber(summary?.totalParties || 0)}</p>
                  <p className="text-xs text-muted-foreground">Partidos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="card-total-municipalities">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-municipalities">{formatNumber(summary?.totalMunicipalities || 0)}</p>
                  <p className="text-xs text-muted-foreground">Municípios</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3" data-testid="tabs-navigation">
            <TabsTrigger value="region" className="gap-2" data-testid="tab-region">
              <Map className="h-4 w-4" />
              Por Região
            </TabsTrigger>
            <TabsTrigger value="party" className="gap-2" data-testid="tab-party">
              <Building2 className="h-4 w-4" />
              Por Partido
            </TabsTrigger>
            <TabsTrigger value="position" className="gap-2" data-testid="tab-position">
              <Award className="h-4 w-4" />
              Por Cargo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="region" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {!context.state ? (
                <Card data-testid="card-brazil-map">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Map className="h-5 w-5" />
                      Mapa do Brasil
                    </CardTitle>
                    <CardDescription>Clique em um estado para ver detalhes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stateLoading ? (
                      <Skeleton className="h-[400px]" />
                    ) : (
                      <svg viewBox="0 0 600 620" className="w-full h-auto max-h-[400px]">
                        {Object.entries(BRAZIL_STATES).map(([code, state]) => (
                          <g 
                            key={code} 
                            className="cursor-pointer transition-all hover:brightness-110"
                            onClick={() => handleStateClick(code)}
                            data-testid={`state-${code}`}
                          >
                            <path
                              d={state.path}
                              fill={getStateColor(code)}
                              stroke="hsl(var(--border))"
                              strokeWidth="1"
                            />
                            <text
                              x={state.cx}
                              y={state.cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="text-[8px] font-medium fill-foreground pointer-events-none"
                            >
                              {code}
                            </text>
                          </g>
                        ))}
                      </svg>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card data-testid="card-municipality-chart">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <MapPin className="h-5 w-5" />
                          {BRAZIL_STATES[context.state]?.name || context.state}
                        </CardTitle>
                        <CardDescription>Municípios mais votados</CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setContext(prev => ({ ...prev, level: "overview", state: undefined }))}
                        data-testid="button-back-to-map"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Voltar ao mapa
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {municipalityLoading ? (
                      <Skeleton className="h-[350px]" />
                    ) : (
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={votesByMunicipality?.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={formatNumber} />
                          <YAxis dataKey="municipality" type="category" width={120} tick={{ fontSize: 11 }} />
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Bar dataKey="votes" fill="#003366" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card data-testid="card-state-ranking">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {context.state ? "Ranking do Estado" : "Ranking Nacional"}
                  </CardTitle>
                  <CardDescription>
                    {context.state ? "Municípios com mais votos" : "Estados com mais votos"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px]">
                    {(context.state ? votesByMunicipality : votesByState)?.map((item: any, index: number) => (
                      <div
                        key={item.state || item.municipality}
                        className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/50 px-2 rounded"
                        onClick={() => !context.state && handleStateClick(item.state)}
                        data-testid={`ranking-item-${index}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          <div>
                            <p className="font-medium text-sm">
                              {context.state ? item.municipality : (BRAZIL_STATES[item.state]?.name || item.state)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatNumber(item.candidateCount)} candidatos
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatNumber(item.votes)}</p>
                          <p className="text-xs text-muted-foreground">votos</p>
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="party" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {!context.party ? (
                <>
                  <Card data-testid="card-party-pie">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChartIcon className="h-5 w-5" />
                        Distribuição de Votos por Partido
                      </CardTitle>
                      <CardDescription>Clique em um partido para ver candidatos</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {partyLoading ? (
                        <Skeleton className="h-[350px]" />
                      ) : (
                        <ResponsiveContainer width="100%" height={350}>
                          <PieChart>
                            <Pie
                              data={votesByParty?.slice(0, 10)}
                              dataKey="votes"
                              nameKey="party"
                              cx="50%"
                              cy="50%"
                              outerRadius={120}
                              onClick={(data) => handlePartyClick(data.party)}
                              className="cursor-pointer"
                            >
                              {votesByParty?.slice(0, 10).map((entry, index) => (
                                <Cell key={entry.party} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card data-testid="card-party-bar">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Top 15 Partidos
                      </CardTitle>
                      <CardDescription>Ordenado por total de votos</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {partyLoading ? (
                        <Skeleton className="h-[350px]" />
                      ) : (
                        <ResponsiveContainer width="100%" height={350}>
                          <BarChart data={votesByParty?.slice(0, 15)} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tickFormatter={formatNumber} />
                            <YAxis dataKey="party" type="category" width={60} tick={{ fontSize: 10 }} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Bar 
                              dataKey="votes" 
                              radius={[0, 4, 4, 0]}
                              onClick={(data) => handlePartyClick(data.party)}
                              className="cursor-pointer"
                            >
                              {votesByParty?.slice(0, 15).map((entry, index) => (
                                <Cell key={entry.party} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </>
              ) : (
                <>
                <Card className="lg:col-span-2" data-testid="card-party-candidates">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Candidatos do {context.party}
                        </CardTitle>
                        <CardDescription>
                          {candidatesByParty?.length || 0} candidatos encontrados
                          {context.state && ` em ${BRAZIL_STATES[context.state]?.name || context.state}`}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setContext(prev => ({ ...prev, level: "state", party: undefined }))}
                        data-testid="button-back-to-parties"
                      >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Voltar aos partidos
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {candidatesLoading ? (
                      <div className="space-y-2">
                        {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12" />)}
                      </div>
                    ) : (
                      <ScrollArea className="h-[500px]">
                        <div className="space-y-2">
                          {candidatesByParty?.map((candidate, index) => (
                            <div
                              key={`${candidate.name}-${index}`}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                              data-testid={`candidate-row-${index}`}
                            >
                              <div className="flex items-center gap-4">
                                <span className="text-lg font-bold text-muted-foreground w-8">
                                  {index + 1}
                                </span>
                                <div>
                                  <p className="font-medium">{candidate.nickname || candidate.name}</p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {candidate.number && <Badge variant="outline">{candidate.number}</Badge>}
                                    {candidate.position && <span>{candidate.position}</span>}
                                    {candidate.municipality && <span>• {candidate.municipality}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold">{formatNumber(candidate.votes)}</p>
                                {candidate.result && (
                                  <Badge 
                                    variant={candidate.result.includes("ELEIT") ? "default" : "secondary"}
                                    className="text-xs"
                                  >
                                    {candidate.result}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                <Card data-testid="card-party-by-state">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Map className="h-5 w-5" />
                      Desempenho do {context.party} por Estado
                    </CardTitle>
                    <CardDescription>Votos e percentual em cada estado</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {partyByStateLoading ? (
                      <Skeleton className="h-[300px]" />
                    ) : partyByState && partyByState.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={partyByState.slice(0, 15)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={formatNumber} />
                          <YAxis dataKey="state" type="category" width={40} tick={{ fontSize: 10 }} />
                          <RechartsTooltip content={<CustomTooltip />} />
                          <Bar dataKey="votes" fill="#003366" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                        <Map className="h-8 w-8 mb-2 opacity-50" />
                        <p className="text-sm">Nenhum dado por estado disponível</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="position" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card data-testid="card-position-chart">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Votos por Cargo
                  </CardTitle>
                  <CardDescription>Distribuição de votos entre diferentes cargos</CardDescription>
                </CardHeader>
                <CardContent>
                  {positionLoading ? (
                    <Skeleton className="h-[350px]" />
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={votesByPosition} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={formatNumber} />
                        <YAxis dataKey="position" type="category" width={140} tick={{ fontSize: 10 }} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Bar dataKey="votes" radius={[0, 4, 4, 0]}>
                          {votesByPosition?.map((entry, index) => (
                            <Cell key={entry.position} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card data-testid="card-position-details">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Detalhes por Cargo
                  </CardTitle>
                  <CardDescription>Candidatos e partidos por cargo</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[350px]">
                    {votesByPosition?.map((pos, index) => (
                      <div
                        key={pos.position}
                        className="flex items-center justify-between py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 px-2 rounded"
                        onClick={() => setContext(prev => ({ ...prev, position: pos.position }))}
                        data-testid={`position-row-${index}`}
                      >
                        <div>
                          <p className="font-medium">{pos.position}</p>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{formatNumber(pos.candidateCount)} candidatos</span>
                            <span>{pos.partyCount} partidos</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatNumber(pos.votes)}</p>
                          <p className="text-xs text-muted-foreground">votos</p>
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
    </div>
  );
}
