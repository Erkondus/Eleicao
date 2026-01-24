import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, RefreshCw, TrendingUp, TrendingDown, Minus, Globe, Newspaper, MessageSquare, Users } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, Legend, AreaChart, Area } from "recharts";
import { useToast } from "@/hooks/use-toast";

interface WordCloudWord {
  text: string;
  value: number;
  sentiment: number;
}

interface SentimentTimelinePoint {
  date: string;
  sentiment: number;
  volume: number;
}

interface EntitySentiment {
  entityType: string;
  entityId: string;
  entityName: string;
  sentimentScore: number;
  sentimentLabel: string;
  confidence: number;
  mentionCount: number;
  keywords: { word: string; count: number; sentiment: number }[];
  sampleMentions: string[];
}

interface SentimentAnalysisResult {
  overallSentiment: string;
  overallScore: number;
  confidence: number;
  entities: EntitySentiment[];
  keywords: WordCloudWord[];
  sourceBreakdown: Record<string, { count: number; avgSentiment: number }>;
  timeline: { date: string; sentiment: number; volume: number }[];
  summary: string;
  generatedAt: string;
}

interface SentimentSource {
  type: string;
  name: string;
  country: string;
  articles: { title: string; content: string; date: string }[];
}

function WordCloud({ words, width = 500, height = 300 }: { words: WordCloudWord[]; width?: number; height?: number }) {
  const sortedWords = useMemo(() => {
    return [...words].sort((a, b) => b.value - a.value).slice(0, 50);
  }, [words]);

  const maxValue = Math.max(...sortedWords.map(w => w.value), 1);
  const minValue = Math.min(...sortedWords.map(w => w.value), 0);

  const getColor = (sentiment: number) => {
    if (sentiment > 0.3) return "hsl(142, 76%, 36%)";
    if (sentiment < -0.3) return "hsl(0, 72%, 51%)";
    return "hsl(45, 93%, 47%)";
  };

  const getFontSize = (value: number) => {
    const normalized = (value - minValue) / (maxValue - minValue || 1);
    return Math.max(12, Math.min(48, 12 + normalized * 36));
  };

  const rows: JSX.Element[][] = [];
  let currentRow: JSX.Element[] = [];
  let currentRowWidth = 0;
  const rowHeight = 60;
  const maxRowWidth = width - 40;

  sortedWords.forEach((word, index) => {
    const fontSize = getFontSize(word.value);
    const estimatedWidth = word.text.length * fontSize * 0.6 + 16;

    if (currentRowWidth + estimatedWidth > maxRowWidth && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }

    currentRow.push(
      <span
        key={`${word.text}-${index}`}
        className="inline-block px-2 py-1 transition-transform hover:scale-110 cursor-default"
        style={{
          fontSize: `${fontSize}px`,
          color: getColor(word.sentiment),
          fontWeight: word.value > maxValue * 0.7 ? 600 : 400,
        }}
        title={`${word.text}: ${word.value} menções (sentimento: ${(word.sentiment * 100).toFixed(0)}%)`}
      >
        {word.text}
      </span>
    );
    currentRowWidth += estimatedWidth;
  });

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-4" style={{ minHeight: height }}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex flex-wrap justify-center gap-1">
          {row}
        </div>
      ))}
      {sortedWords.length === 0 && (
        <p className="text-muted-foreground">Nenhuma palavra-chave disponível</p>
      )}
    </div>
  );
}

function SentimentBadge({ score, label }: { score: number; label: string }) {
  const getVariant = () => {
    if (score > 0.3) return "default";
    if (score < -0.3) return "destructive";
    return "secondary";
  };

  const getIcon = () => {
    if (score > 0.3) return <TrendingUp className="w-3 h-3 mr-1" />;
    if (score < -0.3) return <TrendingDown className="w-3 h-3 mr-1" />;
    return <Minus className="w-3 h-3 mr-1" />;
  };

  const labelMap: Record<string, string> = {
    positive: "Positivo",
    negative: "Negativo",
    neutral: "Neutro",
    mixed: "Misto",
  };

  return (
    <Badge variant={getVariant()} className="flex items-center">
      {getIcon()}
      {labelMap[label] || label} ({(score * 100).toFixed(0)}%)
    </Badge>
  );
}

function SourceIcon({ type }: { type: string }) {
  switch (type) {
    case "news":
      return <Newspaper className="w-4 h-4" />;
    case "forum":
      return <MessageSquare className="w-4 h-4" />;
    case "social":
      return <Users className="w-4 h-4" />;
    default:
      return <Globe className="w-4 h-4" />;
  }
}

export default function SentimentAnalysisPage() {
  const { toast } = useToast();
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: sources, isLoading: sourcesLoading, isError: sourcesError } = useQuery<SentimentSource[]>({
    queryKey: ["/api/sentiment/sources"],
  });

  const { data: wordCloudData, isLoading: wordCloudLoading, isError: wordCloudError } = useQuery<WordCloudWord[]>({
    queryKey: ["/api/sentiment/wordcloud", selectedEntity],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedEntity) {
        params.set("entityType", "party");
        params.set("entityId", selectedEntity);
      }
      const response = await fetch(`/api/sentiment/wordcloud?${params}`);
      if (!response.ok) throw new Error("Failed to fetch word cloud");
      return response.json();
    },
  });

  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useQuery<{
    parties: EntitySentiment[];
    candidates: EntitySentiment[];
  }>({
    queryKey: ["/api/sentiment/overview"],
  });

  const { data: timeline, isLoading: timelineLoading, isError: timelineError } = useQuery<SentimentTimelinePoint[]>({
    queryKey: ["/api/sentiment/timeline", selectedEntity],
    queryFn: async () => {
      if (!selectedEntity) return [];
      const params = new URLSearchParams({
        entityType: "party",
        entityId: selectedEntity,
        days: "30",
      });
      const response = await fetch(`/api/sentiment/timeline?${params}`);
      if (!response.ok) throw new Error("Failed to fetch timeline");
      return response.json();
    },
    enabled: !!selectedEntity,
  });

  const { data: externalData, isLoading: externalLoading, isError: externalError, refetch: refetchExternal } = useQuery<{
    articles: { title: string; content: string; source: string; sourceType: string; country: string; publishedAt: string; url?: string }[];
    trends: { topic: string; volume: number; sentiment: string; relatedEntities: string[] }[];
    sources: { name: string; type: string; country: string; articleCount: number }[];
  }>({
    queryKey: ["/api/external-data/fetch"],
    queryFn: async () => {
      const response = await fetch("/api/external-data/fetch", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch external data");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const externalAnalyzeMutation = useMutation({
    mutationFn: async (params: { keywords?: string[]; enableGoogleNews?: boolean; enableTwitterTrends?: boolean }) => {
      const response = await fetch("/api/external-data/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to analyze external data");
      return response.json() as Promise<{
        articlesCount: number;
        trendsCount: number;
        persistedCount: number;
        analysis: {
          topTopics: { topic: string; count: number }[];
          sentimentBreakdown: { positive: number; negative: number; neutral: number; mixed: number };
          partiesMentioned: { party: string; count: number }[];
        };
      }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Dados externos analisados",
        description: `${data.articlesCount} artigos coletados, ${data.persistedCount} persistidos.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/external-data/fetch"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment/wordcloud"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment/overview"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível analisar os dados externos.",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (params: { entityType?: string; entityId?: string }) => {
      const response = await fetch("/api/sentiment/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to analyze sentiment");
      return response.json() as Promise<SentimentAnalysisResult>;
    },
    onSuccess: (data) => {
      toast({
        title: "Análise concluída",
        description: `Análise de sentimento processada com ${data.entities.length} entidades identificadas.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment/wordcloud"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment/overview"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sentiment/timeline"], exact: false });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erro na análise",
        description: "Não foi possível processar a análise de sentimento.",
      });
    },
  });

  const totalArticles = sources?.reduce((acc, s) => acc + s.articles.length, 0) || 0;
  const uniqueCountries = Array.from(new Set(sources?.map(s => s.country) || []));

  const partyColors: Record<string, string> = {
    PT: "hsl(0, 72%, 51%)",
    PL: "hsl(213, 94%, 40%)",
    MDB: "hsl(45, 93%, 47%)",
    PSDB: "hsl(213, 94%, 55%)",
    PP: "hsl(271, 76%, 53%)",
    UNIÃO: "hsl(174, 84%, 32%)",
    PSD: "hsl(24, 95%, 53%)",
    REPUBLICANOS: "hsl(142, 76%, 36%)",
    PDT: "hsl(0, 0%, 45%)",
    PSOL: "hsl(322, 81%, 43%)",
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Análise de Sentimento</h1>
          <p className="text-muted-foreground">
            Monitore a percepção pública sobre partidos e candidatos através de análise de fontes internacionais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => analyzeMutation.mutate({})}
            disabled={analyzeMutation.isPending}
            data-testid="button-run-analysis"
          >
            {analyzeMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Nova Análise
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fontes de Dados</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-sources-count">{sources?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {uniqueCountries.length} países ({uniqueCountries.join(", ")})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Artigos Analisados</CardTitle>
            <Newspaper className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-articles-count">{totalArticles}</div>
            <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Partidos Monitorados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-parties-count">{overview?.parties.length || 0}</div>
            <p className="text-xs text-muted-foreground">Com análise de sentimento</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Palavras-chave</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-keywords-count">{wordCloudData?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Na nuvem de palavras</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="external" data-testid="tab-external">Dados Externos</TabsTrigger>
          <TabsTrigger value="wordcloud" data-testid="tab-wordcloud">Nuvem de Palavras</TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">Evolução Temporal</TabsTrigger>
          <TabsTrigger value="sources" data-testid="tab-sources">Fontes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Sentimento por Partido</CardTitle>
                <CardDescription>Análise de sentimento das menções a partidos políticos</CardDescription>
              </CardHeader>
              <CardContent>
                {overviewLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : overview?.parties && overview.parties.length > 0 ? (
                  <div className="space-y-4">
                    {overview.parties.map((party) => (
                      <div
                        key={party.entityId}
                        className="flex items-center justify-between p-3 rounded-lg border hover-elevate cursor-pointer"
                        onClick={() => setSelectedEntity(party.entityId)}
                        data-testid={`card-party-${party.entityId}`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-8 rounded"
                            style={{ backgroundColor: partyColors[party.entityId] || "hsl(var(--muted))" }}
                          />
                          <div>
                            <p className="font-medium">{party.entityName}</p>
                            <p className="text-sm text-muted-foreground">{party.mentionCount} menções</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-24">
                            <Progress
                              value={(party.sentimentScore + 1) * 50}
                              className="h-2"
                            />
                          </div>
                          <SentimentBadge score={party.sentimentScore} label={party.sentimentLabel} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                    <p>Nenhum dado de sentimento disponível.</p>
                    <p className="text-sm">Execute uma nova análise para gerar dados.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comparativo de Sentimento</CardTitle>
                <CardDescription>Score de sentimento por partido</CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                {overviewLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : overview?.parties && overview.parties.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.parties} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[-1, 1]} />
                      <YAxis type="category" dataKey="entityId" width={60} />
                      <Tooltip
                        formatter={(value: number) => [`${(value * 100).toFixed(1)}%`, "Sentimento"]}
                      />
                      <Bar dataKey="sentimentScore" radius={[0, 4, 4, 0]}>
                        {overview.parties.map((entry) => (
                          <Cell
                            key={entry.entityId}
                            fill={entry.sentimentScore > 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 72%, 51%)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Sem dados para exibir
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="external" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle>Notícias Recentes</CardTitle>
                    <CardDescription>Artigos coletados de fontes externas sobre política brasileira</CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => externalAnalyzeMutation.mutate({})}
                    disabled={externalAnalyzeMutation.isPending}
                    data-testid="button-fetch-external"
                  >
                    {externalAnalyzeMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[400px] overflow-y-auto">
                {externalLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                ) : externalError ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                    <p>Erro ao carregar notícias externas</p>
                  </div>
                ) : externalData?.articles && externalData.articles.length > 0 ? (
                  <div className="space-y-3">
                    {externalData.articles.slice(0, 10).map((article, idx) => (
                      <div key={idx} className="p-3 rounded-lg border" data-testid={`card-article-${idx}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                          <p className="font-medium text-sm line-clamp-2" data-testid={`text-article-title-${idx}`}>{article.title}</p>
                          <Badge variant="outline" className="shrink-0" data-testid={`badge-article-country-${idx}`}>{article.country}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2" data-testid={`text-article-content-${idx}`}>{article.content}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span data-testid={`text-article-source-${idx}`}>{article.source}</span>
                          <span data-testid={`text-article-date-${idx}`}>{new Date(article.publishedAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Newspaper className="w-8 h-8 mx-auto mb-2" />
                    <p>Nenhuma notícia disponível</p>
                    <p className="text-sm">Clique em atualizar para buscar notícias</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tendências de Redes Sociais</CardTitle>
                <CardDescription>Tópicos em alta relacionados a eleições e política</CardDescription>
              </CardHeader>
              <CardContent className="max-h-[400px] overflow-y-auto">
                {externalLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : externalData?.trends && externalData.trends.length > 0 ? (
                  <div className="space-y-3">
                    {externalData.trends.map((trend, idx) => (
                      <div key={idx} className="p-3 rounded-lg border" data-testid={`card-trend-${idx}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <span className="font-medium">{trend.topic}</span>
                          <SentimentBadge score={trend.sentiment === "positive" ? 0.5 : trend.sentiment === "negative" ? -0.5 : 0} label={trend.sentiment} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground" data-testid={`text-trend-volume-${idx}`}>{trend.volume.toLocaleString("pt-BR")} menções</span>
                          <div className="flex gap-1 flex-wrap">
                            {trend.relatedEntities.slice(0, 3).map((entity, i) => (
                              <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-entity-${idx}-${i}`}>{entity}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2" />
                    <p>Nenhuma tendência disponível</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Fontes de Dados Externos</CardTitle>
              <CardDescription>Fontes ativas para coleta de notícias e tendências</CardDescription>
            </CardHeader>
            <CardContent>
              {externalData?.sources && externalData.sources.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {externalData.sources.map((source, idx) => (
                    <div key={idx} className="p-3 rounded-lg border text-center" data-testid={`card-source-${idx}`}>
                      <p className="font-medium text-sm truncate" data-testid={`text-source-name-${idx}`}>{source.name}</p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-source-count-${idx}`}>{source.articleCount} artigos</p>
                      <Badge variant="outline" className="text-xs mt-1" data-testid={`badge-source-country-${idx}`}>{source.country}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4" data-testid="text-no-sources">Nenhuma fonte ativa no momento</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wordcloud" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Nuvem de Palavras</CardTitle>
                  <CardDescription>
                    Palavras-chave mais frequentes nas análises de sentimento
                  </CardDescription>
                </div>
                <Select
                  value={selectedEntity || "all"}
                  onValueChange={(v) => setSelectedEntity(v === "all" ? null : v)}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-entity-filter">
                    <SelectValue placeholder="Filtrar por entidade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as entidades</SelectItem>
                    {overview?.parties.map((p) => (
                      <SelectItem key={p.entityId} value={p.entityId}>
                        {p.entityId} - {p.entityName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {wordCloudLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : wordCloudData && wordCloudData.length > 0 ? (
                <>
                  <WordCloud words={wordCloudData} width={800} height={300} />
                  <div className="flex justify-center gap-6 mt-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: "hsl(142, 76%, 36%)" }} />
                      <span>Positivo</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: "hsl(45, 93%, 47%)" }} />
                      <span>Neutro</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: "hsl(0, 72%, 51%)" }} />
                      <span>Negativo</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-2" />
                  <p>Nenhuma palavra-chave disponível</p>
                  <p className="text-sm">Execute uma análise para gerar palavras-chave</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Evolução Temporal do Sentimento</CardTitle>
                  <CardDescription>
                    Acompanhe a variação do sentimento ao longo do tempo
                  </CardDescription>
                </div>
                <Select
                  value={selectedEntity || ""}
                  onValueChange={(v) => setSelectedEntity(v || null)}
                >
                  <SelectTrigger className="w-[180px]" data-testid="select-timeline-entity">
                    <SelectValue placeholder="Selecione um partido" />
                  </SelectTrigger>
                  <SelectContent>
                    {overview?.parties.map((p) => (
                      <SelectItem key={p.entityId} value={p.entityId}>
                        {p.entityId} - {p.entityName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="h-[400px]">
              {!selectedEntity ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <TrendingUp className="w-8 h-8 mb-2" />
                  <p>Selecione um partido para visualizar a evolução temporal</p>
                </div>
              ) : timelineLoading ? (
                <Skeleton className="h-full w-full" />
              ) : timeline && timeline.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeline}>
                    <defs>
                      <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(213, 94%, 55%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(213, 94%, 55%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getDate()}/${date.getMonth() + 1}`;
                      }}
                    />
                    <YAxis domain={[-1, 1]} tickFormatter={(value) => `${(value * 100).toFixed(0)}%`} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === "sentiment") return [`${(value * 100).toFixed(1)}%`, "Sentimento"];
                        return [value, "Menções"];
                      }}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="sentiment"
                      stroke="hsl(213, 94%, 55%)"
                      fill="url(#sentimentGradient)"
                      name="Sentimento"
                    />
                    <Line
                      type="monotone"
                      dataKey="volume"
                      stroke="hsl(142, 76%, 36%)"
                      strokeDasharray="5 5"
                      name="Volume de Menções"
                      yAxisId={1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-2" />
                  <p>Nenhum dado temporal disponível para {selectedEntity}</p>
                  <p className="text-sm">Execute análises ao longo do tempo para gerar histórico</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fontes de Dados</CardTitle>
              <CardDescription>
                Fontes utilizadas para análise de sentimento
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sourcesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : sources && sources.length > 0 ? (
                <div className="space-y-4">
                  {sources.map((source, index) => (
                    <div
                      key={`${source.name}-${index}`}
                      className="p-4 rounded-lg border"
                      data-testid={`card-source-${index}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-muted">
                            <SourceIcon type={source.type} />
                          </div>
                          <div>
                            <p className="font-medium">{source.name}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Badge variant="outline">{source.type}</Badge>
                              <span>{source.country}</span>
                            </div>
                          </div>
                        </div>
                        <Badge>{source.articles.length} artigos</Badge>
                      </div>
                      <div className="space-y-2">
                        {source.articles.slice(0, 2).map((article, artIndex) => (
                          <div key={artIndex} className="text-sm p-2 rounded bg-muted/50">
                            <p className="font-medium line-clamp-1">{article.title}</p>
                            <p className="text-muted-foreground line-clamp-2">{article.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="w-8 h-8 mx-auto mb-2" />
                  <p>Nenhuma fonte de dados configurada</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
