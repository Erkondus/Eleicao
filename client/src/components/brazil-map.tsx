import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Building2, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface StateData {
  code: string;
  name: string;
  topCandidates: Array<{ name: string; party: string; votes: number }>;
  topParties: Array<{ name: string; abbreviation: string; votes: number; color: string }>;
  totalVotes: number;
  totalCandidates: number;
}

interface BrazilState {
  name: string;
  path: string;
  region: "norte" | "nordeste" | "centro-oeste" | "sudeste" | "sul";
  capital: string;
  labelX?: number;
  labelY?: number;
}

const BRAZIL_STATES: Record<string, BrazilState> = {
  AC: {
    name: "Acre",
    region: "norte",
    capital: "Rio Branco",
    path: "M45,165 L55,160 L70,162 L82,170 L85,180 L80,190 L65,195 L50,192 L40,185 L42,172 Z",
    labelX: 62, labelY: 178
  },
  AL: {
    name: "Alagoas",
    region: "nordeste",
    capital: "Maceió",
    path: "M418,158 L428,152 L438,154 L442,162 L435,168 L422,166 Z",
    labelX: 430, labelY: 160
  },
  AP: {
    name: "Amapá",
    region: "norte",
    capital: "Macapá",
    path: "M268,25 L280,18 L295,22 L298,35 L290,50 L275,55 L262,48 L260,35 Z",
    labelX: 278, labelY: 38
  },
  AM: {
    name: "Amazonas",
    region: "norte",
    capital: "Manaus",
    path: "M85,75 L120,70 L160,72 L195,78 L220,95 L218,125 L205,150 L175,165 L140,168 L100,165 L70,155 L55,135 L50,110 L60,85 Z",
    labelX: 138, labelY: 118
  },
  BA: {
    name: "Bahia",
    region: "nordeste",
    capital: "Salvador",
    path: "M340,140 L380,135 L405,145 L420,160 L418,185 L405,210 L380,225 L355,230 L330,225 L315,205 L320,175 L325,150 Z",
    labelX: 365, labelY: 182
  },
  CE: {
    name: "Ceará",
    region: "nordeste",
    capital: "Fortaleza",
    path: "M385,85 L410,78 L435,82 L445,95 L440,115 L420,125 L395,122 L380,110 L378,95 Z",
    labelX: 412, labelY: 102
  },
  DF: {
    name: "Distrito Federal",
    region: "centro-oeste",
    capital: "Brasília",
    path: "M325,218 L335,214 L342,220 L338,228 L328,228 L322,222 Z",
    labelX: 332, labelY: 222
  },
  ES: {
    name: "Espírito Santo",
    region: "sudeste",
    capital: "Vitória",
    path: "M395,238 L410,232 L418,242 L415,258 L402,265 L390,255 L388,245 Z",
    labelX: 403, labelY: 248
  },
  GO: {
    name: "Goiás",
    region: "centro-oeste",
    capital: "Goiânia",
    path: "M280,195 L315,185 L345,195 L355,215 L345,240 L320,250 L290,248 L270,230 L268,210 Z",
    labelX: 310, labelY: 218
  },
  MA: {
    name: "Maranhão",
    region: "nordeste",
    capital: "São Luís",
    path: "M305,75 L340,68 L370,75 L380,95 L375,120 L350,135 L320,138 L295,125 L290,100 L295,82 Z",
    labelX: 335, labelY: 105
  },
  MT: {
    name: "Mato Grosso",
    region: "centro-oeste",
    capital: "Cuiabá",
    path: "M175,165 L220,158 L265,165 L280,195 L268,230 L235,245 L195,242 L165,225 L155,195 L160,175 Z",
    labelX: 218, labelY: 202
  },
  MS: {
    name: "Mato Grosso do Sul",
    region: "centro-oeste",
    capital: "Campo Grande",
    path: "M235,245 L268,242 L285,260 L280,290 L255,310 L225,308 L200,290 L195,265 L210,250 Z",
    labelX: 240, labelY: 278
  },
  MG: {
    name: "Minas Gerais",
    region: "sudeste",
    capital: "Belo Horizonte",
    path: "M320,225 L360,218 L390,230 L405,255 L395,285 L360,300 L320,298 L290,280 L285,255 L295,235 Z",
    labelX: 345, labelY: 260
  },
  PA: {
    name: "Pará",
    region: "norte",
    capital: "Belém",
    path: "M195,55 L250,48 L290,55 L310,75 L305,110 L285,140 L250,155 L210,152 L175,140 L165,115 L170,85 L180,65 Z",
    labelX: 238, labelY: 102
  },
  PB: {
    name: "Paraíba",
    region: "nordeste",
    capital: "João Pessoa",
    path: "M420,125 L445,120 L460,128 L458,140 L440,145 L418,142 Z",
    labelX: 440, labelY: 133
  },
  PR: {
    name: "Paraná",
    region: "sul",
    capital: "Curitiba",
    path: "M280,310 L320,302 L355,310 L358,335 L340,355 L300,358 L270,345 L265,325 Z",
    labelX: 312, labelY: 332
  },
  PE: {
    name: "Pernambuco",
    region: "nordeste",
    capital: "Recife",
    path: "M378,135 L420,128 L445,135 L450,150 L430,158 L395,160 L375,152 Z",
    labelX: 412, labelY: 145
  },
  PI: {
    name: "Piauí",
    region: "nordeste",
    capital: "Teresina",
    path: "M350,95 L380,88 L395,105 L392,135 L375,150 L350,148 L335,130 L340,108 Z",
    labelX: 365, labelY: 120
  },
  RJ: {
    name: "Rio de Janeiro",
    region: "sudeste",
    capital: "Rio de Janeiro",
    path: "M365,290 L395,282 L415,295 L410,315 L385,322 L360,312 L358,298 Z",
    labelX: 385, labelY: 302
  },
  RN: {
    name: "Rio Grande do Norte",
    region: "nordeste",
    capital: "Natal",
    path: "M420,105 L448,98 L465,108 L462,122 L445,128 L422,125 L418,115 Z",
    labelX: 442, labelY: 113
  },
  RS: {
    name: "Rio Grande do Sul",
    region: "sul",
    capital: "Porto Alegre",
    path: "M270,365 L310,358 L345,368 L348,400 L325,425 L285,428 L255,410 L250,380 Z",
    labelX: 300, labelY: 395
  },
  RO: {
    name: "Rondônia",
    region: "norte",
    capital: "Porto Velho",
    path: "M130,168 L165,162 L185,178 L180,205 L155,218 L125,212 L115,190 L118,175 Z",
    labelX: 150, labelY: 190
  },
  RR: {
    name: "Roraima",
    region: "norte",
    capital: "Boa Vista",
    path: "M148,25 L175,18 L198,28 L205,55 L195,78 L168,85 L145,75 L138,50 Z",
    labelX: 172, labelY: 52
  },
  SC: {
    name: "Santa Catarina",
    region: "sul",
    capital: "Florianópolis",
    path: "M300,358 L340,352 L365,365 L362,388 L335,398 L300,392 L278,378 L280,362 Z",
    labelX: 322, labelY: 375
  },
  SP: {
    name: "São Paulo",
    region: "sudeste",
    capital: "São Paulo",
    path: "M285,275 L330,265 L365,278 L375,305 L358,332 L315,342 L280,330 L268,305 L272,285 Z",
    labelX: 322, labelY: 305
  },
  SE: {
    name: "Sergipe",
    region: "nordeste",
    capital: "Aracaju",
    path: "M418,168 L435,162 L445,172 L440,185 L425,188 L415,180 Z",
    labelX: 430, labelY: 175
  },
  TO: {
    name: "Tocantins",
    region: "norte",
    capital: "Palmas",
    path: "M295,125 L325,118 L345,132 L348,165 L335,195 L305,200 L280,185 L275,155 L282,135 Z",
    labelX: 312, labelY: 158
  }
};

const REGION_COLORS = {
  norte: { 
    default: "#4CAF50", 
    hover: "#66BB6A", 
    selected: "#388E3C",
    label: "Verde"
  },
  nordeste: { 
    default: "#FF9800", 
    hover: "#FFB74D", 
    selected: "#F57C00",
    label: "Laranja"
  },
  "centro-oeste": { 
    default: "#FFEB3B", 
    hover: "#FFF176", 
    selected: "#FBC02D",
    label: "Amarelo"
  },
  sudeste: { 
    default: "#2196F3", 
    hover: "#64B5F6", 
    selected: "#1976D2",
    label: "Azul"
  },
  sul: { 
    default: "#9C27B0", 
    hover: "#BA68C8", 
    selected: "#7B1FA2",
    label: "Roxo"
  }
};

const REGION_NAMES: Record<string, string> = {
  norte: "Norte",
  nordeste: "Nordeste",
  "centro-oeste": "Centro-Oeste",
  sudeste: "Sudeste",
  sul: "Sul"
};

export function BrazilMap() {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const { data: stateData, isLoading: stateLoading } = useQuery<StateData>({
    queryKey: ["/api/electoral-data/state", selectedState],
    enabled: !!selectedState && showDialog,
  });

  const handleStateClick = (stateCode: string) => {
    setSelectedState(stateCode);
    setShowDialog(true);
  };

  const getStateColor = (code: string) => {
    const state = BRAZIL_STATES[code];
    if (!state) return "#666";
    
    const colors = REGION_COLORS[state.region];
    if (selectedState === code) return colors.selected;
    if (hoveredState === code) return colors.hover;
    return colors.default;
  };

  const getStateBorderColor = (code: string) => {
    if (hoveredState === code || selectedState === code) {
      return "#1a1a1a";
    }
    return "#ffffff";
  };

  return (
    <Card className="overflow-hidden" data-testid="brazil-map-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Mapa Eleitoral do Brasil
        </CardTitle>
        <CardDescription>
          Clique em um estado para ver os dados eleitorais
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="relative">
          <svg
            viewBox="0 0 480 450"
            className="w-full h-auto max-h-[400px]"
            data-testid="brazil-map-svg"
            style={{ background: "linear-gradient(180deg, #87CEEB 0%, #4A90A4 50%, #2E6B7E 100%)" }}
          >
            <defs>
              <filter id="stateShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.3" />
              </filter>
              <linearGradient id="oceanGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#5DADE2" />
                <stop offset="50%" stopColor="#3498DB" />
                <stop offset="100%" stopColor="#2874A6" />
              </linearGradient>
            </defs>
            
            <rect x="0" y="0" width="480" height="450" fill="url(#oceanGradient)" />
            
            <g filter="url(#stateShadow)">
              {Object.entries(BRAZIL_STATES).map(([code, state]) => (
                <path
                  key={code}
                  d={state.path}
                  fill={getStateColor(code)}
                  stroke={getStateBorderColor(code)}
                  strokeWidth={hoveredState === code || selectedState === code ? "2" : "1.2"}
                  strokeLinejoin="round"
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredState(code)}
                  onMouseLeave={() => setHoveredState(null)}
                  onClick={() => handleStateClick(code)}
                  data-testid={`state-${code}`}
                />
              ))}
            </g>
            
            {Object.entries(BRAZIL_STATES).map(([code, state]) => {
              if (!state.labelX || !state.labelY) return null;
              const isLargeState = ["AM", "PA", "MT", "BA", "MG", "GO", "MS", "MA", "PI", "TO", "RO", "SP", "PR", "RS", "SC"].includes(code);
              if (!isLargeState) return null;
              
              return (
                <text
                  key={`label-${code}`}
                  x={state.labelX}
                  y={state.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none"
                  style={{
                    fontSize: "10px",
                    fontWeight: "600",
                    fill: ["MT", "GO", "MS"].includes(code) ? "#333" : "#fff",
                    textShadow: ["MT", "GO", "MS"].includes(code) 
                      ? "0 0 2px rgba(255,255,255,0.8)" 
                      : "0 0 3px rgba(0,0,0,0.5)"
                  }}
                >
                  {code}
                </text>
              );
            })}
          </svg>
          
          {hoveredState && (
            <div 
              className="absolute top-3 left-3 bg-card/95 backdrop-blur-sm border rounded-lg px-4 py-3 shadow-lg z-10"
              data-testid="state-tooltip"
            >
              <div className="flex items-center gap-2 mb-1">
                <div 
                  className="w-3 h-3 rounded-full border border-white/50"
                  style={{ backgroundColor: getStateColor(hoveredState) }}
                />
                <span className="font-semibold text-foreground">
                  {BRAZIL_STATES[hoveredState]?.name}
                </span>
                <span className="text-muted-foreground">({hoveredState})</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Região {REGION_NAMES[BRAZIL_STATES[hoveredState]?.region]} - Capital: {BRAZIL_STATES[hoveredState]?.capital}
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-4 flex flex-wrap justify-center gap-4" data-testid="map-legend">
          {Object.entries(REGION_COLORS).map(([key, colors]) => (
            <div key={key} className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded border border-white/30"
                style={{ backgroundColor: colors.default }}
              />
              <span className="text-sm text-muted-foreground">{REGION_NAMES[key]}</span>
            </div>
          ))}
        </div>
      </CardContent>

      <Dialog open={showDialog} onOpenChange={setShowDialog} data-testid="dialog-state-summary">
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3" data-testid="text-state-name">
              <Building2 className="h-5 w-5" />
              {selectedState && BRAZIL_STATES[selectedState]?.name} ({selectedState})
              {selectedState && (
                <Badge 
                  variant="secondary"
                  style={{ 
                    backgroundColor: REGION_COLORS[BRAZIL_STATES[selectedState]?.region]?.default,
                    color: ["centro-oeste"].includes(BRAZIL_STATES[selectedState]?.region) ? "#333" : "#fff"
                  }}
                >
                  {REGION_NAMES[BRAZIL_STATES[selectedState]?.region]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Resumo dos dados eleitorais do estado - Capital: {selectedState && BRAZIL_STATES[selectedState]?.capital}
            </DialogDescription>
          </DialogHeader>

          {stateLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : stateData ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">Total de Candidatos</span>
                    </div>
                    <p className="text-2xl font-bold">{stateData.totalCandidates?.toLocaleString("pt-BR") || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-sm">Total de Votos</span>
                    </div>
                    <p className="text-2xl font-bold">{stateData.totalVotes?.toLocaleString("pt-BR") || 0}</p>
                  </CardContent>
                </Card>
              </div>

              {stateData.topCandidates && stateData.topCandidates.length > 0 && (
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4" />
                    Candidatos Mais Votados
                  </h4>
                  <div className="space-y-2">
                    {stateData.topCandidates.slice(0, 5).map((candidate, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div>
                          <span className="font-medium">{candidate.name}</span>
                          <Badge variant="outline" className="ml-2">{candidate.party}</Badge>
                        </div>
                        <span className="text-muted-foreground">
                          {candidate.votes?.toLocaleString("pt-BR")} votos
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stateData.topParties && stateData.topParties.length > 0 && (
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Building2 className="h-4 w-4" />
                    Partidos Mais Votados
                  </h4>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stateData.topParties.slice(0, 6)} layout="vertical">
                        <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="abbreviation" width={60} />
                        <Tooltip 
                          formatter={(value: number) => [value.toLocaleString("pt-BR") + " votos", "Votos"]}
                          labelFormatter={(label) => `Partido: ${label}`}
                        />
                        <Bar dataKey="votes" radius={[0, 4, 4, 0]}>
                          {stateData.topParties.slice(0, 6).map((party, index) => (
                            <Cell key={index} fill={party.color || `hsl(${index * 60}, 70%, 50%)`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {(!stateData.topCandidates || stateData.topCandidates.length === 0) && 
               (!stateData.topParties || stateData.topParties.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum dado eleitoral disponível para este estado.</p>
                  <p className="text-sm mt-1">Importe dados do TSE para visualizar as estatísticas.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum dado disponível para este estado.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
