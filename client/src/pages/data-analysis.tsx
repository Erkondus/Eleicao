import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import {
  BarChart3,
  PieChartIcon,
  Users,
  Building2,
  MapPin,
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Vote,
  Loader2,
  Filter,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const CHART_COLORS = [
  "#003366", "#1a5490", "#3475b4", "#4e96d8", "#68b7fc",
  "#FFD700", "#e6c200", "#ccad00", "#b39800", "#998300",
  "#2ecc71", "#27ae60", "#1e8449", "#145a32", "#0d3d22",
  "#9b59b6", "#8e44ad", "#7d3c98", "#6c3483", "#5b2c6f",
];

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString("pt-BR");
}

export default function DataAnalysis() {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedState, setSelectedState] = useState<string>("all");
  const [selectedElectionType, setSelectedElectionType] = useState<string>("all");
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (selectedYear !== "all") f.year = selectedYear;
    if (selectedState !== "all") f.uf = selectedState;
    if (selectedElectionType !== "all") f.electionType = selectedElectionType;
    return f;
  }, [selectedYear, selectedState, selectedElectionType]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(filters);
    return params.toString() ? `?${params.toString()}` : "";
  }, [filters]);

  const statesQuery = useMemo(() => {
    return selectedYear !== "all" ? `?year=${selectedYear}` : "";
  }, [selectedYear]);

  const { data: years, isLoading: yearsLoading } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });

  const { data: states, isLoading: statesLoading } = useQuery<string[]>({
    queryKey: [`/api/analytics/states${statesQuery}`],
  });

  const { data: electionTypes, isLoading: typesLoading } = useQuery<string[]>({
    queryKey: [`/api/analytics/election-types${statesQuery}`],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<{
    totalVotes: number;
    totalCandidates: number;
    totalParties: number;
    totalMunicipalities: number;
  }>({
    queryKey: [`/api/analytics/summary${queryString}`],
  });

  const { data: votesByParty, isLoading: partyLoading } = useQuery<{
    party: string;
    partyNumber: number | null;
    votes: number;
    candidateCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-party${queryString}`],
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
    queryKey: [`/api/analytics/top-candidates${queryString}`],
  });

  const { data: votesByState, isLoading: stateVotesLoading } = useQuery<{
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-state${queryString}`],
  });

  const { data: votesByMunicipality, isLoading: municipalityLoading } = useQuery<{
    municipality: string;
    state: string | null;
    votes: number;
    candidateCount: number;
  }[]>({
    queryKey: [`/api/analytics/votes-by-municipality${queryString}`],
  });

  const handleExportCSV = async (reportType: string) => {
    setExportLoading(reportType);
    try {
      const params = new URLSearchParams({ ...filters, reportType });
      const response = await fetch(`/api/analytics/export/csv?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to export");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio_${reportType}_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({ title: "Exportação concluída", description: "Arquivo CSV baixado com sucesso." });
    } catch (error) {
      toast({ title: "Erro na exportação", description: "Falha ao exportar dados.", variant: "destructive" });
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportPDF = async (reportType: string, title: string, data: any[]) => {
    setExportLoading(`pdf-${reportType}`);
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.setTextColor(0, 51, 102);
      doc.text("SimulaVoto - Relatório de Análise", 14, 22);
      
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(title, 14, 32);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const filterText = [];
      if (selectedYear !== "all") filterText.push(`Ano: ${selectedYear}`);
      if (selectedState !== "all") filterText.push(`Estado: ${selectedState}`);
      if (selectedElectionType !== "all") filterText.push(`Tipo: ${selectedElectionType}`);
      doc.text(filterText.length > 0 ? filterText.join(" | ") : "Todos os dados", 14, 40);
      doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 46);

      if (data.length > 0) {
        const headers = Object.keys(data[0]);
        const rows = data.map((row) => headers.map((h) => String(row[h] ?? "")));
        
        autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 55,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [0, 51, 102] },
        });
      }

      doc.save(`relatorio_${reportType}_${Date.now()}.pdf`);
      toast({ title: "PDF gerado", description: "Relatório PDF baixado com sucesso." });
    } catch (error) {
      toast({ title: "Erro ao gerar PDF", description: "Falha ao criar relatório.", variant: "destructive" });
    } finally {
      setExportLoading(null);
    }
  };

  const hasData = summary && summary.totalVotes > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
            Análise de Dados
          </h1>
          <p className="text-muted-foreground">
            Explore dados eleitorais importados do TSE com filtros e visualizações
          </p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1 w-fit">
          <BarChart3 className="h-3 w-3" />
          Relatórios Personalizados
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Ano da Eleição</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger data-testid="select-year">
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os anos</SelectItem>
                  {(years ?? []).map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado (UF)</label>
              <Select value={selectedState} onValueChange={setSelectedState}>
                <SelectTrigger data-testid="select-state">
                  <SelectValue placeholder="Selecione o estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {(states ?? []).map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Eleição</label>
              <Select value={selectedElectionType} onValueChange={setSelectedElectionType}>
                <SelectTrigger data-testid="select-election-type">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {(electionTypes ?? []).map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Votos</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-votes">
                    {formatNumber(summary?.totalVotes ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-primary/10">
                <Vote className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Candidatos</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-candidates">
                    {formatNumber(summary?.totalCandidates ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-green-500/10">
                <Users className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Partidos</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-parties">
                    {formatNumber(summary?.totalParties ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-orange-500/10">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Municípios</p>
                {summaryLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold" data-testid="text-total-municipalities">
                    {formatNumber(summary?.totalMunicipalities ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-3 rounded-full bg-purple-500/10">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {!hasData && !summaryLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              Nenhum dado disponível
            </h3>
            <p className="text-sm text-muted-foreground">
              Importe dados do TSE na seção "Importação TSE" para visualizar análises.
            </p>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <Tabs defaultValue="parties" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="parties" data-testid="tab-parties">
              <Building2 className="h-4 w-4 mr-2" />
              Partidos
            </TabsTrigger>
            <TabsTrigger value="candidates" data-testid="tab-candidates">
              <Users className="h-4 w-4 mr-2" />
              Candidatos
            </TabsTrigger>
            <TabsTrigger value="states" data-testid="tab-states">
              <MapPin className="h-4 w-4 mr-2" />
              Estados
            </TabsTrigger>
            <TabsTrigger value="municipalities" data-testid="tab-municipalities">
              <TrendingUp className="h-4 w-4 mr-2" />
              Municípios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="parties" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("parties")}
                disabled={exportLoading === "parties"}
                data-testid="button-export-parties-csv"
              >
                {exportLoading === "parties" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("parties", "Votos por Partido", votesByParty ?? [])}
                disabled={exportLoading === "pdf-parties"}
                data-testid="button-export-parties-pdf"
              >
                {exportLoading === "pdf-parties" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Distribuição de Votos por Partido</CardTitle>
                  <CardDescription>Top 10 partidos mais votados</CardDescription>
                </CardHeader>
                <CardContent>
                  {partyLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={(votesByParty ?? []).slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={formatNumber} />
                        <YAxis type="category" dataKey="party" width={60} />
                        <Tooltip formatter={(value: number) => formatNumber(value)} />
                        <Bar dataKey="votes" fill="#003366" name="Votos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Proporção de Votos</CardTitle>
                  <CardDescription>Participação percentual dos partidos</CardDescription>
                </CardHeader>
                <CardContent>
                  {partyLoading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={(votesByParty ?? []).slice(0, 8)}
                          dataKey="votes"
                          nameKey="party"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ party, percent }) => `${party} (${(percent * 100).toFixed(1)}%)`}
                        >
                          {(votesByParty ?? []).slice(0, 8).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatNumber(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="candidates" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("candidates")}
                disabled={exportLoading === "candidates"}
                data-testid="button-export-candidates-csv"
              >
                {exportLoading === "candidates" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("candidates", "Candidatos Mais Votados", topCandidates ?? [])}
                disabled={exportLoading === "pdf-candidates"}
                data-testid="button-export-candidates-pdf"
              >
                {exportLoading === "pdf-candidates" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Candidatos Mais Votados</CardTitle>
                <CardDescription>Top 20 candidatos por número de votos</CardDescription>
              </CardHeader>
              <CardContent>
                {candidatesLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(topCandidates ?? []).slice(0, 15)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="nickname" angle={-45} textAnchor="end" height={80} interval={0} fontSize={10} />
                      <YAxis tickFormatter={formatNumber} />
                      <Tooltip
                        formatter={(value: number) => formatNumber(value)}
                        labelFormatter={(label) => {
                          const candidate = (topCandidates ?? []).find((c) => c.nickname === label);
                          return candidate ? `${candidate.name} (${candidate.party})` : label;
                        }}
                      />
                      <Bar dataKey="votes" fill="#FFD700" name="Votos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="states" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("states")}
                disabled={exportLoading === "states"}
                data-testid="button-export-states-csv"
              >
                {exportLoading === "states" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("states", "Votos por Estado", votesByState ?? [])}
                disabled={exportLoading === "pdf-states"}
                data-testid="button-export-states-pdf"
              >
                {exportLoading === "pdf-states" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Votos por Estado</CardTitle>
                  <CardDescription>Distribuição geográfica de votos</CardDescription>
                </CardHeader>
                <CardContent>
                  {stateVotesLoading ? (
                    <div className="h-[350px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={votesByState ?? []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="state" />
                        <YAxis tickFormatter={formatNumber} />
                        <Tooltip formatter={(value: number) => formatNumber(value)} />
                        <Area type="monotone" dataKey="votes" stroke="#003366" fill="#003366" fillOpacity={0.3} name="Votos" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Candidatos por Estado</CardTitle>
                  <CardDescription>Número de candidatos em cada UF</CardDescription>
                </CardHeader>
                <CardContent>
                  {stateVotesLoading ? (
                    <div className="h-[350px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={votesByState ?? []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="state" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="candidateCount" fill="#2ecc71" name="Candidatos" />
                        <Bar dataKey="partyCount" fill="#9b59b6" name="Partidos" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="municipalities" className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportCSV("municipalities")}
                disabled={exportLoading === "municipalities"}
                data-testid="button-export-municipalities-csv"
              >
                {exportLoading === "municipalities" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportPDF("municipalities", "Votos por Município", votesByMunicipality ?? [])}
                disabled={exportLoading === "pdf-municipalities"}
                data-testid="button-export-municipalities-pdf"
              >
                {exportLoading === "pdf-municipalities" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                PDF
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top 20 Municípios</CardTitle>
                <CardDescription>Municípios com maior número de votos</CardDescription>
              </CardHeader>
              <CardContent>
                {municipalityLoading ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={(votesByMunicipality ?? []).slice(0, 20)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={formatNumber} />
                      <YAxis type="category" dataKey="municipality" width={120} fontSize={10} />
                      <Tooltip
                        formatter={(value: number) => formatNumber(value)}
                        labelFormatter={(label) => {
                          const muni = (votesByMunicipality ?? []).find((m) => m.municipality === label);
                          return muni ? `${muni.municipality} - ${muni.state}` : label;
                        }}
                      />
                      <Bar dataKey="votes" fill="#e74c3c" name="Votos" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
