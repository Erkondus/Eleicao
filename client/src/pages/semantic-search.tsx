import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Brain, 
  MessageSquare, 
  Clock, 
  FileText, 
  AlertCircle,
  Loader2,
  History,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Database,
  Zap
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SemanticSearchResult {
  answer: string;
  citations: {
    id: number;
    snippet: string;
    similarity: number;
    metadata: any;
  }[];
  totalResults: number;
  responseTime: number;
}

interface SearchQuery {
  id: number;
  query: string;
  filters: any;
  resultCount: number;
  responseTime: number;
  createdAt: string;
}

const EXAMPLE_QUERIES = [
  "Qual foi o desempenho do PT nas últimas eleições?",
  "Quais candidatos receberam mais votos em São Paulo?",
  "Compare a votação de deputados federais entre os estados do sudeste",
  "Quantos votos o PSDB obteve na região nordeste?",
  "Quem foram os candidatos mais votados para senador?",
];

export default function SemanticSearchPage() {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<{
    year?: string;
    state?: string;
    party?: string;
    position?: string;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [result, setResult] = useState<SemanticSearchResult | null>(null);
  const [expandedCitation, setExpandedCitation] = useState<number | null>(null);

  const { data: apiKeyStatus, isLoading: checkingApiKey } = useQuery({
    queryKey: ["/api/semantic-search/check-api-key"],
  });

  const { data: searchHistory, isLoading: historyLoading } = useQuery<SearchQuery[]>({
    queryKey: ["/api/semantic-search/history"],
  });

  const { data: availableYears } = useQuery<number[]>({
    queryKey: ["/api/analytics/election-years"],
  });

  const { data: availableStates } = useQuery<string[]>({
    queryKey: ["/api/analytics/states"],
  });

  const { data: availableParties } = useQuery<{ abbreviation: string; name: string }[]>({
    queryKey: ["/api/analytics/parties-list"],
  });

  const { data: availablePositions } = useQuery<{ code: number; name: string; votes: number }[]>({
    queryKey: ["/api/analytics/positions"],
  });

  const searchMutation = useMutation({
    mutationFn: async (data: { query: string; filters: any }) => {
      const response = await apiRequest("POST", "/api/semantic-search", data);
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data);
      // Invalidate history cache to show new search
      queryClient.invalidateQueries({ queryKey: ["/api/semantic-search/history"] });
    },
    onError: (error: any) => {
      console.error("Search error:", error);
    },
  });

  const handleSearch = () => {
    if (query.trim().length < 3) return;
    searchMutation.mutate({ query, filters });
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
  };

  const handleHistoryClick = (historyItem: SearchQuery) => {
    setQuery(historyItem.query);
    if (historyItem.filters) {
      setFilters(historyItem.filters);
    }
  };

  if (checkingApiKey) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!(apiKeyStatus as any)?.configured) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold">Busca Semântica</h1>
            <p className="text-muted-foreground">Pergunte sobre dados eleitorais em linguagem natural</p>
          </div>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Configuração necessária</AlertTitle>
          <AlertDescription>
            A busca semântica requer uma chave de API do OpenAI para gerar embeddings e respostas.
            Por favor, configure a variável de ambiente <code className="font-mono bg-muted px-1 rounded">OPENAI_API_KEY</code> nas configurações do projeto.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Brain className="h-8 w-8" style={{ color: "#003366" }} />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Busca Semântica</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Pergunte sobre dados eleitorais em linguagem natural usando IA
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card data-testid="card-search-input">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Faça sua pergunta
              </CardTitle>
              <CardDescription>
                Use linguagem natural para perguntar sobre candidatos, partidos, votos e tendências eleitorais
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Ex: Quais foram os candidatos mais votados para deputado federal em 2022?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="min-h-[100px] resize-none"
                data-testid="input-query"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
              
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  data-testid="button-toggle-filters"
                >
                  {showFilters ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                  Filtros
                </Button>
                
                <Button 
                  onClick={handleSearch}
                  disabled={query.trim().length < 3 || searchMutation.isPending}
                  data-testid="button-search"
                >
                  {searchMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Buscar
                </Button>
              </div>

              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t" data-testid="filters-panel">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Ano</label>
                    <Select 
                      value={filters.year || ""} 
                      onValueChange={(v) => setFilters({ ...filters, year: v || undefined })}
                    >
                      <SelectTrigger data-testid="select-filter-year">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" data-testid="option-year-all">Todos</SelectItem>
                        {availableYears?.map((year) => (
                          <SelectItem key={year} value={String(year)} data-testid={`option-year-${year}`}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado</label>
                    <Select 
                      value={filters.state || ""} 
                      onValueChange={(v) => setFilters({ ...filters, state: v || undefined })}
                    >
                      <SelectTrigger data-testid="select-filter-state">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" data-testid="option-state-all">Todos</SelectItem>
                        {availableStates?.map((state) => (
                          <SelectItem key={state} value={state} data-testid={`option-state-${state}`}>
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Partido</label>
                    <Select 
                      value={filters.party || ""} 
                      onValueChange={(v) => setFilters({ ...filters, party: v || undefined })}
                    >
                      <SelectTrigger data-testid="select-filter-party">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" data-testid="option-party-all">Todos</SelectItem>
                        {availableParties?.map((party) => (
                          <SelectItem key={party.abbreviation} value={party.abbreviation} data-testid={`option-party-${party.abbreviation}`}>
                            {party.abbreviation}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Cargo</label>
                    <Select 
                      value={filters.position || ""} 
                      onValueChange={(v) => setFilters({ ...filters, position: v || undefined })}
                    >
                      <SelectTrigger data-testid="select-filter-position">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" data-testid="option-position-all">Todos</SelectItem>
                        {availablePositions?.map((position) => (
                          <SelectItem key={position.name} value={position.name} data-testid={`option-position-${position.name}`}>
                            {position.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {searchMutation.isPending && (
            <Card data-testid="card-loading">
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">Analisando dados eleitorais...</p>
                    <p className="text-sm text-muted-foreground">A IA está processando sua pergunta</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {searchMutation.isError && (
            <Alert variant="destructive" data-testid="alert-error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Erro na busca</AlertTitle>
              <AlertDescription>
                Não foi possível processar sua pergunta. Verifique se a chave da API está configurada corretamente.
              </AlertDescription>
            </Alert>
          )}

          {result && !searchMutation.isPending && (
            <div className="space-y-4">
              <Card data-testid="card-answer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" style={{ color: "#FFD700" }} />
                      Resposta
                    </CardTitle>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span data-testid="text-response-time">{result.responseTime}ms</span>
                      <Badge variant="secondary" data-testid="badge-result-count">
                        {result.totalResults} documentos
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none" data-testid="text-answer">
                    {result.answer.split("\n").map((paragraph, i) => (
                      <p key={i} className="mb-2 last:mb-0">{paragraph}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {result.citations.length > 0 && (
                <Card data-testid="card-citations">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4" />
                      Fontes ({result.citations.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.citations.map((citation, index) => (
                      <div 
                        key={citation.id}
                        className="border rounded-lg p-3 cursor-pointer"
                        onClick={() => setExpandedCitation(expandedCitation === index ? null : index)}
                        data-testid={`citation-${index}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                [{index + 1}]
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                Similaridade: {(citation.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                            <p className={`text-sm ${expandedCitation === index ? "" : "line-clamp-2"}`}>
                              {citation.snippet}
                            </p>
                          </div>
                          {expandedCitation === index ? (
                            <ChevronUp className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        {expandedCitation === index && citation.metadata && (
                          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground grid grid-cols-2 gap-2">
                            {citation.metadata.candidateName && (
                              <div><strong>Candidato:</strong> {citation.metadata.candidateName}</div>
                            )}
                            {citation.metadata.partyName && (
                              <div><strong>Partido:</strong> {citation.metadata.partyName}</div>
                            )}
                            {citation.metadata.votes !== undefined && (
                              <div><strong>Votos:</strong> {Number(citation.metadata.votes).toLocaleString("pt-BR")}</div>
                            )}
                            {citation.metadata.municipality && (
                              <div><strong>Município:</strong> {citation.metadata.municipality}</div>
                            )}
                            {citation.metadata.result && (
                              <div><strong>Resultado:</strong> {citation.metadata.result}</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card data-testid="card-examples">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <HelpCircle className="h-4 w-4" />
                Exemplos de perguntas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {EXAMPLE_QUERIES.map((example, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-left h-auto py-2 px-3"
                  onClick={() => handleExampleClick(example)}
                  data-testid={`button-example-${index}`}
                >
                  <span className="line-clamp-2 text-xs">{example}</span>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card data-testid="card-history">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                Buscas recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : searchHistory && searchHistory.length > 0 ? (
                <div className="space-y-2">
                  {searchHistory.slice(0, 5).map((item) => (
                    <Button
                      key={item.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2 px-3"
                      onClick={() => handleHistoryClick(item)}
                      data-testid={`button-history-${item.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="line-clamp-1 text-xs">{item.query}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span>{item.resultCount} resultados</span>
                          <span>{item.responseTime}ms</span>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-history">
                  Nenhuma busca recente
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-info">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Como funciona
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#FFD700" }} />
                <p>A busca semântica usa inteligência artificial para entender o significado da sua pergunta</p>
              </div>
              <div className="flex items-start gap-2">
                <Database className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>Os dados eleitorais são transformados em vetores para busca por similaridade</p>
              </div>
              <div className="flex items-start gap-2">
                <Brain className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <p>O GPT-4 analisa os resultados e gera uma resposta concisa com citações</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
