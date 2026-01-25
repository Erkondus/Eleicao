import OpenAI from "openai";
import { db } from "./db";
import { 
  campaignInsightSessions, highImpactSegments, messageStrategies, 
  campaignImpactPredictions, campaignInsightReports,
  parties, candidates, ibgeMunicipios, ibgePopulacao, ibgeIndicadores,
  sentimentAnalysisResults, sentimentArticles
} from "@shared/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
}

interface SegmentAnalysisInput {
  sessionId: number;
  electionYear: number;
  targetRegion?: string;
  targetPartyId?: number;
}

interface MessageAnalysisInput {
  sessionId: number;
  segmentId?: number;
}

interface ImpactPredictionInput {
  sessionId: number;
  investmentType: string;
  investmentAmount: number;
  targetSegmentIds: number[];
  duration: number;
}

class CampaignInsightsService {
  private static instance: CampaignInsightsService;

  static getInstance(): CampaignInsightsService {
    if (!CampaignInsightsService.instance) {
      CampaignInsightsService.instance = new CampaignInsightsService();
    }
    return CampaignInsightsService.instance;
  }

  async createSession(data: {
    name: string;
    description?: string;
    targetPartyId?: number;
    targetCandidateId?: number;
    electionYear: number;
    position?: string;
    targetRegion?: string;
    createdBy?: string;
  }): Promise<number> {
    const [session] = await db.insert(campaignInsightSessions)
      .values(data)
      .returning({ id: campaignInsightSessions.id });
    return session.id;
  }

  async getSessions(userId?: string): Promise<any[]> {
    return db.select({
      id: campaignInsightSessions.id,
      name: campaignInsightSessions.name,
      description: campaignInsightSessions.description,
      electionYear: campaignInsightSessions.electionYear,
      targetRegion: campaignInsightSessions.targetRegion,
      position: campaignInsightSessions.position,
      status: campaignInsightSessions.status,
      createdAt: campaignInsightSessions.createdAt,
      partyName: parties.name,
      partyAbbreviation: parties.abbreviation,
    })
    .from(campaignInsightSessions)
    .leftJoin(parties, eq(campaignInsightSessions.targetPartyId, parties.id))
    .orderBy(desc(campaignInsightSessions.createdAt));
  }

  async getSessionById(id: number): Promise<any> {
    const [session] = await db.select()
      .from(campaignInsightSessions)
      .leftJoin(parties, eq(campaignInsightSessions.targetPartyId, parties.id))
      .where(eq(campaignInsightSessions.id, id));
    
    if (!session) return null;

    const segments = await db.select()
      .from(highImpactSegments)
      .where(eq(highImpactSegments.sessionId, id))
      .orderBy(highImpactSegments.priorityRank);

    const strategies = await db.select()
      .from(messageStrategies)
      .where(eq(messageStrategies.sessionId, id));

    const predictions = await db.select()
      .from(campaignImpactPredictions)
      .where(eq(campaignImpactPredictions.sessionId, id));

    return {
      ...session.campaign_insight_sessions,
      party: session.parties,
      segments,
      strategies,
      predictions,
    };
  }

  async analyzeHighImpactSegments(input: SegmentAnalysisInput): Promise<any[]> {
    const { sessionId, electionYear, targetRegion, targetPartyId } = input;

    // Gather demographic data from IBGE
    const demographicData = await this.getDemographicContext(targetRegion);
    
    // Gather sentiment data
    const sentimentData = await this.getSentimentContext(targetPartyId);

    // Build prompt for GPT-4o analysis
    const prompt = `Você é um cientista de dados especialista em marketing político brasileiro.

Analise os dados demográficos e de sentimento para identificar os 5-7 segmentos de eleitores de MAIOR IMPACTO para uma campanha eleitoral em ${electionYear}.

DADOS DEMOGRÁFICOS DA REGIÃO ${targetRegion || 'NACIONAL'}:
${JSON.stringify(demographicData, null, 2)}

DADOS DE SENTIMENTO RECENTES:
${JSON.stringify(sentimentData, null, 2)}

Para cada segmento identificado, forneça:
1. Tipo de segmento (geographic, demographic, ou behavioral)
2. Nome descritivo do segmento
3. Descrição detalhada
4. UF ou região geográfica (se aplicável)
5. Faixa etária predominante
6. Nível de renda (baixa, media, alta)
7. Número estimado de eleitores no segmento
8. Score de impacto (0-100): quanto este segmento pode influenciar a eleição
9. Potencial de conversão (0-100): probabilidade de mudar voto com campanha efetiva
10. Sentimento atual (-100 a 100): percepção atual sobre o candidato/partido
11. Volatilidade (0-100): quão volátil é o voto deste segmento
12. Ranking de prioridade (1 = mais importante)
13. Racional da IA: explicação detalhada
14. Fatores-chave: lista de fatores que justificam o score

Responda em JSON com o seguinte formato:
{
  "segments": [
    {
      "segmentType": "demographic",
      "segmentName": "Nome do Segmento",
      "description": "Descrição detalhada...",
      "uf": "SP",
      "region": "sudeste",
      "ageGroup": "25-34",
      "incomeLevel": "media",
      "estimatedVoters": 500000,
      "impactScore": 85,
      "conversionPotential": 70,
      "currentSentiment": 15,
      "volatility": 65,
      "priorityRank": 1,
      "aiRationale": "Explicação detalhada do por quê...",
      "keyFactors": ["fator1", "fator2", "fator3"]
    }
  ],
  "methodology": "Descrição da metodologia utilizada",
  "dataQuality": "Avaliação da qualidade dos dados disponíveis"
}`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const segments = result.segments || [];

      // Save segments to database
      const savedSegments = [];
      for (const segment of segments) {
        const [saved] = await db.insert(highImpactSegments)
          .values({
            sessionId,
            segmentType: segment.segmentType,
            segmentName: segment.segmentName,
            description: segment.description,
            uf: segment.uf,
            region: segment.region,
            ageGroup: segment.ageGroup,
            incomeLevel: segment.incomeLevel,
            estimatedVoters: segment.estimatedVoters,
            impactScore: segment.impactScore?.toString(),
            conversionPotential: segment.conversionPotential?.toString(),
            currentSentiment: segment.currentSentiment?.toString(),
            volatility: segment.volatility?.toString(),
            priorityRank: segment.priorityRank,
            aiRationale: segment.aiRationale,
            keyFactors: segment.keyFactors,
          })
          .returning();
        savedSegments.push(saved);
      }

      return savedSegments;
    } catch (error) {
      console.error("Error analyzing segments:", error);
      throw error;
    }
  }

  async generateMessageStrategies(input: MessageAnalysisInput): Promise<any[]> {
    const { sessionId, segmentId } = input;

    // Get session and segments
    const session = await this.getSessionById(sessionId);
    if (!session) throw new Error("Session not found");

    const segments = segmentId 
      ? session.segments.filter((s: any) => s.id === segmentId)
      : session.segments;

    if (segments.length === 0) {
      throw new Error("No segments found. Run segment analysis first.");
    }

    // Get recent sentiment data
    const sentimentData = await this.getSentimentContext(session.targetPartyId);

    const prompt = `Você é um especialista em comunicação política e marketing de campanhas eleitorais no Brasil.

Com base nos segmentos de eleitores identificados e nos dados de sentimento, desenvolva estratégias de mensagem personalizadas.

CONTEXTO DA CAMPANHA:
- Ano eleitoral: ${session.electionYear}
- Região alvo: ${session.targetRegion || 'Nacional'}
- Cargo disputado: ${session.position || 'Não especificado'}

SEGMENTOS DE ELEITORES:
${JSON.stringify(segments, null, 2)}

DADOS DE SENTIMENTO:
${JSON.stringify(sentimentData, null, 2)}

Para cada segmento, desenvolva uma estratégia de comunicação completa com:
1. Público-alvo específico
2. Perfil de sentimento atual (positive, neutral, negative, mixed)
3. Tema principal da mensagem
4. 3-5 mensagens-chave sugeridas
5. Tom recomendado (formal, informal, emocional, técnico)
6. Canais recomendados (tv, radio, redes_sociais, presencial, whatsapp)
7. Tópicos para enfatizar
8. Tópicos a evitar
9. Fraquezas dos competidores a explorar
10. Tendência atual do sentimento (rising, falling, stable)
11. Análise completa da IA
12. Score de confiança (0-100)
13. Efetividade esperada (0-100)

Responda em JSON:
{
  "strategies": [
    {
      "targetAudience": "Descrição do público",
      "segmentId": 1,
      "sentimentProfile": "neutral",
      "mainTheme": "Tema central",
      "keyMessages": ["Mensagem 1", "Mensagem 2", "Mensagem 3"],
      "toneRecommendation": "informal",
      "channelRecommendations": ["redes_sociais", "whatsapp"],
      "topicsToEmphasize": ["emprego", "saúde", "educação"],
      "topicsToAvoid": ["aumento de impostos"],
      "competitorWeaknesses": ["ponto fraco 1"],
      "currentSentimentTrend": "stable",
      "sentimentDrivers": ["driver1", "driver2"],
      "aiAnalysis": "Análise detalhada...",
      "confidenceScore": 75,
      "expectedEffectiveness": 68
    }
  ]
}`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const strategies = result.strategies || [];

      const savedStrategies = [];
      for (const strategy of strategies) {
        const matchingSegment = segments.find((s: any) => 
          s.segmentName === strategy.targetAudience || s.id === strategy.segmentId
        );

        const [saved] = await db.insert(messageStrategies)
          .values({
            sessionId,
            segmentId: matchingSegment?.id || null,
            targetAudience: strategy.targetAudience,
            sentimentProfile: strategy.sentimentProfile,
            mainTheme: strategy.mainTheme,
            keyMessages: strategy.keyMessages,
            toneRecommendation: strategy.toneRecommendation,
            channelRecommendations: strategy.channelRecommendations,
            topicsToEmphasize: strategy.topicsToEmphasize,
            topicsToAvoid: strategy.topicsToAvoid,
            competitorWeaknesses: strategy.competitorWeaknesses,
            currentSentimentTrend: strategy.currentSentimentTrend,
            sentimentDrivers: strategy.sentimentDrivers,
            aiAnalysis: strategy.aiAnalysis,
            confidenceScore: strategy.confidenceScore?.toString(),
            expectedEffectiveness: strategy.expectedEffectiveness?.toString(),
          })
          .returning();
        savedStrategies.push(saved);
      }

      return savedStrategies;
    } catch (error) {
      console.error("Error generating message strategies:", error);
      throw error;
    }
  }

  async predictCampaignImpact(input: ImpactPredictionInput): Promise<any> {
    const { sessionId, investmentType, investmentAmount, targetSegmentIds, duration } = input;

    const session = await this.getSessionById(sessionId);
    if (!session) throw new Error("Session not found");

    const targetSegments = session.segments.filter((s: any) => 
      targetSegmentIds.includes(s.id)
    );

    const demographicData = await this.getDemographicContext(session.targetRegion);

    const prompt = `Você é um cientista de dados especializado em modelagem preditiva para campanhas políticas.

Preveja o impacto de um investimento de campanha com base nos dados fornecidos.

INVESTIMENTO PROPOSTO:
- Tipo: ${investmentType}
- Valor: R$ ${investmentAmount.toLocaleString('pt-BR')}
- Duração: ${duration} dias
- Segmentos alvo: ${targetSegments.map((s: any) => s.segmentName).join(', ')}

DADOS DOS SEGMENTOS:
${JSON.stringify(targetSegments, null, 2)}

DADOS DEMOGRÁFICOS:
${JSON.stringify(demographicData, null, 2)}

Forneça uma análise preditiva completa incluindo:
1. Mudança prevista no sentimento (-100 a +100)
2. Intenção de voto prevista (% do eleitorado)
3. Mudança na intenção de voto (delta %)
4. Intervalo de confiança (lower e upper bounds)
5. Probabilidade de sucesso (0-100)
6. Alcance estimado (número de eleitores)
7. Custo por eleitor alcançado
8. ROI esperado (%)
9. Cenários alternativos (otimista, pessimista)
10. Narrativa explicativa da IA
11. Fatores de risco
12. Recomendações
13. Metodologia utilizada

Use modelos baseados em:
- Regressão logística para probabilidade de voto
- Monte Carlo para intervalos de confiança
- Análise de elasticidade para ROI

Responda em JSON:
{
  "prediction": {
    "predictedSentimentChange": 12.5,
    "predictedVoteIntention": 28.5,
    "predictedVoteChange": 3.2,
    "confidenceInterval": { "lower": 1.8, "upper": 4.6 },
    "probabilityOfSuccess": 72,
    "estimatedReach": 450000,
    "costPerVoterReached": 2.44,
    "expectedROI": 185,
    "alternativeScenarios": {
      "optimistic": { "voteChange": 5.1, "probability": 30 },
      "pessimistic": { "voteChange": 1.2, "probability": 25 }
    },
    "comparisonBaseline": {
      "currentVoteIntention": 25.3,
      "industryAverageROI": 120
    },
    "aiNarrative": "Análise detalhada...",
    "riskFactors": ["risco1", "risco2"],
    "recommendations": ["recomendação1", "recomendação2"],
    "methodology": "Descrição da metodologia..."
  }
}`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.5,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const prediction = result.prediction || {};

      const [saved] = await db.insert(campaignImpactPredictions)
        .values({
          sessionId,
          predictionType: "investment",
          investmentType,
          investmentAmount: investmentAmount.toString(),
          targetSegments: targetSegmentIds,
          duration,
          predictedSentimentChange: prediction.predictedSentimentChange?.toString(),
          predictedVoteIntention: prediction.predictedVoteIntention?.toString(),
          predictedVoteChange: prediction.predictedVoteChange?.toString(),
          confidenceInterval: prediction.confidenceInterval,
          probabilityOfSuccess: prediction.probabilityOfSuccess?.toString(),
          estimatedReach: prediction.estimatedReach,
          costPerVoterReached: prediction.costPerVoterReached?.toString(),
          expectedROI: prediction.expectedROI?.toString(),
          comparisonBaseline: prediction.comparisonBaseline,
          alternativeScenarios: prediction.alternativeScenarios,
          aiNarrative: prediction.aiNarrative,
          riskFactors: prediction.riskFactors,
          recommendations: prediction.recommendations,
          methodology: prediction.methodology,
        })
        .returning();

      return saved;
    } catch (error) {
      console.error("Error predicting campaign impact:", error);
      throw error;
    }
  }

  async generateExecutiveReport(sessionId: number, userId?: string): Promise<any> {
    const session = await this.getSessionById(sessionId);
    if (!session) throw new Error("Session not found");

    const prompt = `Você é um consultor estratégico de marketing político.

Gere um relatório executivo completo com base na análise de campanha.

DADOS DA SESSÃO:
${JSON.stringify(session, null, 2)}

Crie um relatório executivo que inclua:
1. Sumário Executivo (2-3 parágrafos)
2. Principais Insights (lista de 5-7 descobertas críticas)
3. Itens de Ação prioritários
4. Visualizações recomendadas (especificações de gráficos)
5. Conteúdo completo do relatório em Markdown

Responda em JSON:
{
  "title": "Título do Relatório",
  "executiveSummary": "Resumo executivo...",
  "keyInsights": [
    { "insight": "Insight 1", "importance": "high", "actionable": true }
  ],
  "actionItems": [
    { "action": "Ação 1", "priority": "high", "deadline": "imediato" }
  ],
  "visualizations": [
    { "type": "bar", "title": "Título", "data": "segments_by_impact" }
  ],
  "fullContent": "# Relatório Completo em Markdown..."
}`;

    try {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.6,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");

      const [report] = await db.insert(campaignInsightReports)
        .values({
          sessionId,
          reportType: "executive",
          title: result.title || `Relatório - ${session.name}`,
          executiveSummary: result.executiveSummary,
          fullContent: result.fullContent,
          visualizations: result.visualizations,
          keyInsights: result.keyInsights,
          actionItems: result.actionItems,
          dataSnapshot: { session, generatedAt: new Date().toISOString() },
          createdBy: userId,
        })
        .returning();

      return report;
    } catch (error) {
      console.error("Error generating report:", error);
      throw error;
    }
  }

  private async getDemographicContext(region?: string): Promise<any> {
    let query = db.select({
      totalMunicipios: sql<number>`count(DISTINCT ${ibgeMunicipios.id})::int`,
      totalPopulacao: sql<number>`COALESCE(SUM(${ibgePopulacao.populacao}), 0)::bigint`,
      avgIdhm: sql<number>`AVG(${ibgeIndicadores.idhm})`,
      avgRenda: sql<number>`AVG(${ibgeIndicadores.rendaMediaDomiciliar})`,
      avgAlfabetizacao: sql<number>`AVG(${ibgeIndicadores.taxaAlfabetizacao})`,
    })
    .from(ibgeMunicipios)
    .leftJoin(ibgePopulacao, eq(ibgeMunicipios.codigoIbge, ibgePopulacao.codigoIbge))
    .leftJoin(ibgeIndicadores, eq(ibgeMunicipios.codigoIbge, ibgeIndicadores.codigoIbge));

    if (region && region !== 'NACIONAL') {
      query = query.where(eq(ibgeMunicipios.uf, region)) as any;
    }

    const [result] = await query;

    // Get regional breakdown
    const byRegion = await db.select({
      uf: ibgeMunicipios.uf,
      count: sql<number>`count(*)::int`,
      populacao: sql<number>`COALESCE(SUM(${ibgePopulacao.populacao}), 0)::bigint`,
    })
    .from(ibgeMunicipios)
    .leftJoin(ibgePopulacao, eq(ibgeMunicipios.codigoIbge, ibgePopulacao.codigoIbge))
    .groupBy(ibgeMunicipios.uf)
    .orderBy(desc(sql`COALESCE(SUM(${ibgePopulacao.populacao}), 0)`))
    .limit(10);

    return {
      summary: {
        totalMunicipios: result.totalMunicipios,
        totalPopulacao: Number(result.totalPopulacao),
        avgIdhm: result.avgIdhm ? Number(result.avgIdhm).toFixed(3) : null,
        avgRenda: result.avgRenda ? Number(result.avgRenda).toFixed(2) : null,
        avgAlfabetizacao: result.avgAlfabetizacao ? Number(result.avgAlfabetizacao).toFixed(2) : null,
      },
      byRegion: byRegion.map(r => ({
        uf: r.uf,
        municipios: r.count,
        populacao: Number(r.populacao),
      })),
    };
  }

  private async getSentimentContext(partyId?: number): Promise<any> {
    // Get recent sentiment analysis results
    const recentSentiment = await db.select()
      .from(sentimentAnalysisResults)
      .orderBy(desc(sentimentAnalysisResults.analysisDate))
      .limit(20);

    // Get recent article sentiment
    const recentArticles = await db.select({
      sentimentLabel: sentimentArticles.sentimentLabel,
      count: sql<number>`count(*)::int`,
    })
    .from(sentimentArticles)
    .where(gte(sentimentArticles.publishedAt, sql`NOW() - INTERVAL '30 days'`))
    .groupBy(sentimentArticles.sentimentLabel);

    return {
      recentAnalysis: recentSentiment.slice(0, 10),
      articleSentimentDistribution: recentArticles,
      dataRange: "últimos 30 dias",
    };
  }
}

export const campaignInsightsService = CampaignInsightsService.getInstance();
