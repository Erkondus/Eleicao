import { storage } from "../storage";
import { cachedAiCall, SYSTEM_PROMPTS } from "../ai-cache";

export async function getCustomDashboards(userId: string) {
  return storage.getCustomDashboards(userId);
}

export async function getPublicDashboards() {
  return storage.getPublicDashboards();
}

export async function getCustomDashboard(id: number) {
  return storage.getCustomDashboard(id);
}

export async function createCustomDashboard(data: any) {
  return storage.createCustomDashboard(data);
}

export async function updateCustomDashboard(id: number, data: any) {
  return storage.updateCustomDashboard(id, data);
}

export async function deleteCustomDashboard(id: number) {
  return storage.deleteCustomDashboard(id);
}

export async function getAiSuggestions(userId: string, options: { type?: string; dismissed?: boolean }) {
  return storage.getAiSuggestions(userId, options);
}

export async function dismissAiSuggestion(id: number) {
  return storage.dismissAiSuggestion(id);
}

export async function applyAiSuggestion(id: number) {
  return storage.applyAiSuggestion(id);
}

export async function generateAiSuggestions(userId: string, filters?: Record<string, any>) {
  const summary = await storage.getAnalyticsSummary(filters || {});
  const partyData = await storage.getVotesByParty({ ...(filters || {}) });
  const stateData = await storage.getAvailableStates(filters?.year);

  const { data: parsed } = await cachedAiCall<{ suggestions: any[] }>({
    cachePrefix: "ai_suggestions",
    cacheParams: { filters: filters || {}, totalVotes: summary.totalVotes, totalParties: summary.totalParties },
    cacheTtlHours: 12,
    model: "fast",
    systemPrompt: `${SYSTEM_PROMPTS.dataAnalyst} Sugira gráficos e relatórios úteis.`,
    userPrompt: `Dados: ${summary.totalVotes} votos, ${summary.totalCandidates} candidatos, ${summary.totalParties} partidos, ${summary.totalMunicipalities} municípios, ${stateData.length} estados
Partidos: ${partyData.map(p => `${p.party}:${p.votes}`).join(",")}
Filtros: ${JSON.stringify(filters || {})}

Sugira 3-5 visualizações. JSON: {"suggestions":[{"type":"chart|report|insight","title":"texto","description":"texto","relevanceScore":0-100,"configuration":{"chartType":"bar|line|pie|area","metrics":["m"],"dimensions":["d"],"filters":{}}}]}`,
    maxTokens: 1200,
  });

  const createdSuggestions = [];
  for (const suggestion of parsed.suggestions || []) {
    const created = await storage.createAiSuggestion({
      userId,
      suggestionType: suggestion.type,
      title: suggestion.title,
      description: suggestion.description,
      configuration: suggestion.configuration,
      relevanceScore: String(suggestion.relevanceScore || 50),
      dataContext: filters || {},
    });
    createdSuggestions.push(created);
  }

  return createdSuggestions;
}
