import { Router } from "express";
import { requireAuth, requireRole, logAudit, calculateNextRun } from "./shared";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { sql, eq, and, desc, gte, lte } from "drizzle-orm";
import { processSemanticSearch, generateEmbeddingsForImportJob, getEmbeddingStats, getRecentQueries } from "../semantic-search";
import { fetchExternalData, fetchAndAnalyzeExternalData, getExternalDataSummaryForReport } from "../external-data-service";
import { executeReportRun } from "../report-executor";
import {
  runSentimentAnalysis,
  getSentimentTimeline,
  getWordCloudData,
  getEntitiesSentimentOverview,
  fetchSentimentSources,
} from "../sentiment-analysis";
import { cachedAiCall, SYSTEM_PROMPTS } from "../ai-cache";
import {
  candidateComparisons,
  eventImpactPredictions,
  scenarioSimulations,
  sentimentAnalysisResults,
  sentimentCrisisAlerts,
  sentimentMonitoringSessions,
  sentimentComparisonSnapshots,
  sentimentArticles,
} from "@shared/schema";

const router = Router();

router.post("/api/ai/predict", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { scenarioId, partyVotes, candidateVotes } = req.body;
    const scenario = await storage.getScenario(scenarioId);
    if (!scenario) {
      return res.status(404).json({ error: "Scenario not found" });
    }

    const parties = await storage.getParties();
    const allCandidates = await storage.getCandidates();
    const scenarioAlliances = await storage.getAlliances(scenarioId);
    const federations = scenarioAlliances.filter(a => a.type === "federation");

    const validVotes = scenario.validVotes;
    const availableSeats = scenario.availableSeats;
    const QE = Math.floor(validVotes / availableSeats);
    const barrier80 = Math.floor(QE * 0.80);
    const candidateMin20 = Math.floor(QE * 0.20);

    let federationInfo = "";
    if (federations.length > 0) {
      const fedDetails: string[] = [];
      for (const fed of federations) {
        const members = await storage.getAllianceParties(fed.id);
        const memberNames = members.map(m => {
          const p = parties.find(pp => pp.id === m.partyId);
          return p ? p.abbreviation : `ID:${m.partyId}`;
        });
        fedDetails.push(`  - ${fed.name}: ${memberNames.join(" + ")}`);
      }
      federationInfo = `\nFederações partidárias (contam como entidade única para QE/QP/barreira):\n${fedDetails.join("\n")}`;
    }

    let voteDataInfo = "";
    if (partyVotes && Object.keys(partyVotes).length > 0) {
      const voteLines = parties
        .map(p => {
          const v = partyVotes[p.id] || 0;
          return v > 0 ? `  - ${p.abbreviation}: ${v.toLocaleString("pt-BR")} votos` : null;
        })
        .filter(Boolean);
      if (voteLines.length > 0) {
        voteDataInfo = `\nVotação por partido (dados reais do cenário):\n${voteLines.join("\n")}`;
      }
    }

    const userPrompt = `Analise o cenário e forneça previsões baseadas nas regras do TSE.

REGRAS TSE: QE=floor(${validVotes}/${availableSeats})=${QE} | QP=floor(votos_entidade/QE) | Barreira 80% QE=${barrier80} | Mín. individual 20% QE=${candidateMin20} | D'Hondt para sobras | Federações=entidade única | Sem coligações proporcionais | Sem QE atingido → D'Hondt geral

CENÁRIO: ${scenario.name} | ${scenario.position} | ${validVotes.toLocaleString("pt-BR")} votos válidos | ${availableSeats} vagas
Partidos: ${parties.map((p) => `${p.abbreviation}(${p.number})`).join(", ")}
${federationInfo}${voteDataInfo}

${voteDataInfo ? "Calcule distribuição exata de vagas pelo sistema proporcional." : "Projete com base no perfil dos partidos."}

JSON: {"analysis":"análise 3-4 parágrafos com artigos CE","predictions":[{"partyId":id,"partyName":"sigla","predictedVotes":{"min":n,"max":n},"predictedSeats":{"min":n,"max":n},"meetsBarrier":bool,"confidence":0-1,"trend":"up|down|stable","reasoning":"texto"}],"seatDistribution":{"byQuotient":n,"byRemainder":n,"total":${availableSeats}},"recommendations":["r1","r2","r3"],"warnings":["w1"]}`;

    const { data: prediction } = await cachedAiCall({
      cachePrefix: "scenario_predict",
      cacheParams: { scenarioId, partyVotes: partyVotes || {}, validVotes, availableSeats },
      cacheTtlHours: 1,
      model: "standard",
      systemPrompt: SYSTEM_PROMPTS.electoralLawExpert,
      userPrompt,
      maxTokens: 3000,
    });

    (prediction as any).generatedAt = new Date().toISOString();
    (prediction as any).tseContext = {
      electoralQuotient: QE,
      barrierThreshold: barrier80,
      candidateMinVotes: candidateMin20,
      validVotes,
      availableSeats,
      federationsCount: federations.length,
    };

    await logAudit(req, "prediction", "scenario", String(scenarioId));

    res.json(prediction);
  } catch (error: any) {
    console.error("AI Prediction error:", error);
    res.status(500).json({ error: error.message || "Failed to generate prediction" });
  }
});

router.post("/api/ai/assistant", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { question, filters } = req.body;
    
    if (!question || typeof question !== "string" || question.length < 5) {
      return res.status(400).json({ error: "Please provide a valid question (at least 5 characters)" });
    }

    if (question.length > 500) {
      return res.status(400).json({ error: "Question is too long (max 500 characters)" });
    }

    const summary = await storage.getAnalyticsSummary(filters || {});
    const votesByParty = await storage.getVotesByParty({ ...(filters || {}), limit: 15 });
    const topCandidates = await storage.getTopCandidates({ ...(filters || {}), limit: 10 });
    const votesByState = await storage.getVotesByState(filters || {});

    const dataContext = `Resumo: ${summary.totalVotes.toLocaleString("pt-BR")} votos | ${summary.totalCandidates} candidatos | ${summary.totalParties} partidos | ${summary.totalMunicipalities} municípios
Partidos: ${votesByParty.map((p) => `${p.party}:${p.votes.toLocaleString("pt-BR")}`).join(" | ")}
Top candidatos: ${topCandidates.map((c) => `${c.nickname || c.name}(${c.party}/${c.state}):${c.votes.toLocaleString("pt-BR")}`).join(" | ")}
Estados: ${votesByState.map((s) => `${s.state}:${s.votes.toLocaleString("pt-BR")}`).join(" | ")}
Filtros: ${JSON.stringify(filters || {})}`;

    const { data: result } = await cachedAiCall<{ answer: string }>({
      cachePrefix: "assistant",
      cacheParams: { question, filters: filters || {} },
      cacheTtlHours: 6,
      model: "fast",
      systemPrompt: `${SYSTEM_PROMPTS.electoralAnalyst} Use APENAS os dados fornecidos. Não invente dados.`,
      userPrompt: `${dataContext}\n\nPERGUNTA: ${question}\n\nResponda em JSON: {"answer":"sua resposta detalhada"}`,
      maxTokens: 800,
    });

    const answer = result.answer || JSON.stringify(result);
    if (!answer) {
      throw new Error("No response from AI");
    }

    await logAudit(req, "ai_query", "assistant", undefined, { question, filters });

    res.json({
      question,
      answer,
      filters,
      dataContext: {
        totalVotes: summary.totalVotes,
        totalParties: summary.totalParties,
        totalCandidates: summary.totalCandidates,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("AI Assistant error:", error);
    res.status(500).json({ error: "Failed to process question" });
  }
});

router.post("/api/ai/predict-historical", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { filters, targetYear } = req.body;

    const availableYears = await storage.getAvailableElectionYears();
    if (availableYears.length < 1) {
      return res.status(400).json({ error: "Insufficient historical data for predictions" });
    }

    const historicalData: any[] = [];
    for (const year of availableYears.slice(0, 4)) {
      const data = await storage.getVotesByParty({ 
        year, 
        uf: filters?.uf, 
        electionType: filters?.electionType,
        limit: 20 
      });
      historicalData.push({ year, parties: data });
    }

    const userPrompt = `Analise tendências eleitorais históricas e projete futuro.

DADOS: ${historicalData.map((h) => `${h.year}: ${h.parties.slice(0, 10).map((p: any) => `${p.party}:${p.votes}`).join(",")}`).join(" | ")}
Anos: ${availableYears.join(",")} | Filtros: ${JSON.stringify(filters || {})}

JSON: {"analysis":"2-3 parágrafos","trends":[{"party":"sigla","trend":"crescimento|declínio|estável","changePercent":n,"observation":"texto"}],"predictions":[{"party":"sigla","expectedPerformance":"forte|moderado|fraco","confidence":0-1,"reasoning":"texto"}],"insights":["texto1","texto2"]}`;

    const { data: prediction } = await cachedAiCall({
      cachePrefix: "historical_predict",
      cacheParams: { filters: filters || {}, targetYear, years: availableYears },
      cacheTtlHours: 24,
      model: "standard",
      systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
      userPrompt,
      maxTokens: 2000,
    });

    (prediction as any).historicalYears = availableYears;
    (prediction as any).filters = filters;
    (prediction as any).generatedAt = new Date().toISOString();

    await logAudit(req, "ai_prediction", "historical", undefined, { filters, years: availableYears });

    res.json(prediction);
  } catch (error: any) {
    console.error("AI Historical Prediction error:", error);
    res.status(500).json({ error: "Failed to generate historical prediction" });
  }
});

router.post("/api/ai/anomalies", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { filters } = req.body;

    const votesByParty = await storage.getVotesByParty({ ...(filters || {}), limit: 30 });
    const topCandidates = await storage.getTopCandidates({ ...(filters || {}), limit: 50 });
    const votesByMunicipality = await storage.getVotesByMunicipality({ ...(filters || {}), limit: 100 });
    const summary = await storage.getAnalyticsSummary(filters || {});

    const partyVotes = votesByParty.map((p) => p.votes);
    const avgVotes = partyVotes.length > 0 ? partyVotes.reduce((a, b) => a + b, 0) / partyVotes.length : 0;
    const stdDev = partyVotes.length > 0 
      ? Math.sqrt(partyVotes.map((v) => Math.pow(v - avgVotes, 2)).reduce((a, b) => a + b, 0) / partyVotes.length)
      : 0;

    const municipalityVotes = votesByMunicipality.map((m) => m.votes);
    const avgMuniVotes = municipalityVotes.length > 0 ? municipalityVotes.reduce((a, b) => a + b, 0) / municipalityVotes.length : 0;
    const muniStdDev = municipalityVotes.length > 0
      ? Math.sqrt(municipalityVotes.map((v) => Math.pow(v - avgMuniVotes, 2)).reduce((a, b) => a + b, 0) / municipalityVotes.length)
      : 0;

    const statisticalFlags = {
      partyOutliers: votesByParty.filter((p) => Math.abs(p.votes - avgVotes) > 2 * stdDev).map((p) => ({
        party: p.party,
        votes: p.votes,
        zScore: stdDev > 0 ? (p.votes - avgVotes) / stdDev : 0,
      })),
      municipalityOutliers: votesByMunicipality.filter((m) => Math.abs(m.votes - avgMuniVotes) > 2.5 * muniStdDev).slice(0, 10).map((m) => ({
        municipality: m.municipality,
        state: m.state,
        votes: m.votes,
        zScore: muniStdDev > 0 ? (m.votes - avgMuniVotes) / muniStdDev : 0,
      })),
      candidateConcentration: topCandidates.slice(0, 5).map((c) => ({
        candidate: c.nickname || c.name,
        party: c.party,
        votes: c.votes,
        percentOfTotal: summary.totalVotes > 0 ? ((c.votes / summary.totalVotes) * 100).toFixed(2) : 0,
      })),
    };

    const userPrompt = `Identifique anomalias nos dados eleitorais. Aponte apenas padrões estatisticamente incomuns.

Total: ${summary.totalVotes.toLocaleString("pt-BR")} votos | Média partido: ${Math.round(avgVotes)} | σ=${Math.round(stdDev)}
Outliers partidos (>2σ): ${JSON.stringify(statisticalFlags.partyOutliers)}
Outliers municípios (>2.5σ): ${JSON.stringify(statisticalFlags.municipalityOutliers)}
Concentração top5: ${JSON.stringify(statisticalFlags.candidateConcentration)}

JSON: {"overallRisk":"baixo|médio|alto","summary":"1-2 parágrafos","anomalies":[{"type":"partido|município|candidato|distribuição","severity":"baixa|média|alta","description":"texto","recommendation":"texto"}],"observations":["obs1"]}`;

    const { data: aiAnalysis } = await cachedAiCall<Record<string, any>>({
      cachePrefix: "anomaly_detect",
      cacheParams: { filters: filters || {}, totalVotes: summary.totalVotes },
      cacheTtlHours: 12,
      model: "fast",
      systemPrompt: SYSTEM_PROMPTS.anomalyDetector,
      userPrompt,
      maxTokens: 1500,
    });

    const analysis = {
      ...aiAnalysis,
      statistics: {
        avgVotesPerParty: avgVotes,
        stdDevParty: stdDev,
        avgVotesPerMunicipality: avgMuniVotes,
        stdDevMunicipality: muniStdDev,
      },
      rawFlags: statisticalFlags,
      filters,
      generatedAt: new Date().toISOString(),
    };

    await logAudit(req, "ai_anomaly", "detection", undefined, { filters, riskLevel: analysis.overallRisk });

    res.json(analysis);
  } catch (error: any) {
    console.error("AI Anomaly Detection error:", error);
    res.status(500).json({ error: "Failed to detect anomalies" });
  }
});

router.post("/api/ai/turnout", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      year: z.number().optional(),
      uf: z.string().optional(),
      electionType: z.string().optional(),
      targetYear: z.number().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
    }
    
    const { predictVoterTurnout } = await import("../ai-insights");
    const { year, uf, electionType, targetYear } = parsed.data;
    
    const cacheKey = `turnout_${year || 'all'}_${uf || 'all'}_${electionType || 'all'}_${targetYear || 'next'}`;
    const cached = await storage.getAiPrediction(cacheKey);
    if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
      return res.json(cached.prediction);
    }
    
    const prediction = await predictVoterTurnout({ year, uf, electionType, targetYear });
    
    await storage.saveAiPrediction({
      cacheKey,
      predictionType: 'turnout',
      prediction,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    await logAudit(req, "ai_prediction", "turnout", undefined, { year, uf, electionType, targetYear });
    
    res.json(prediction);
  } catch (error: any) {
    console.error("AI Turnout Prediction error:", error);
    res.status(500).json({ error: error.message || "Failed to generate turnout prediction" });
  }
});

router.post("/api/ai/candidate-success", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      candidateNumber: z.number().optional(),
      candidateName: z.string().optional(),
      party: z.string().optional(),
      year: z.number().optional(),
      uf: z.string().optional(),
      electionType: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
    }
    
    const { candidateNumber, candidateName, party, year, uf, electionType } = parsed.data;
    console.log("[AI CandidateSuccess Route] Request body:", JSON.stringify(parsed.data));
    
    const cacheKey = `candidate_${candidateNumber || 'all'}_${party || 'all'}_${year || 'all'}_${uf || 'all'}`;
    const cached = await storage.getAiPrediction(cacheKey);
    if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
      return res.json(cached.prediction);
    }
    
    const { predictCandidateSuccess } = await import("../ai-insights");
    const predictions = await predictCandidateSuccess({ 
      candidateNumber, 
      candidateName, 
      party, 
      year, 
      uf, 
      electionType 
    });
    
    await storage.saveAiPrediction({
      cacheKey,
      predictionType: 'candidate_success',
      prediction: predictions,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    await logAudit(req, "ai_prediction", "candidate_success", undefined, { party, year, uf });
    
    res.json(predictions);
  } catch (error: any) {
    console.error("AI Candidate Success error:", error);
    const isDataError = error.message?.includes("Nenhum dado de candidato");
    res.status(isDataError ? 400 : 500).json({ error: error.message || "Falha ao gerar previsões de sucesso de candidatos" });
  }
});

router.post("/api/ai/party-performance", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      party: z.string().optional(),
      year: z.number().optional(),
      uf: z.string().optional(),
      electionType: z.string().optional(),
      targetYear: z.number().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
    }
    
    const { party, year, uf, electionType, targetYear } = parsed.data;
    
    const cacheKey = `party_${party || 'all'}_${year || 'all'}_${uf || 'all'}_${targetYear || 'next'}`;
    const cached = await storage.getAiPrediction(cacheKey);
    if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
      return res.json(cached.prediction);
    }
    
    const { predictPartyPerformance } = await import("../ai-insights");
    const predictions = await predictPartyPerformance({ party, year, uf, electionType, targetYear });
    
    await storage.saveAiPrediction({
      cacheKey,
      predictionType: 'party_performance',
      prediction: predictions,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    await logAudit(req, "ai_prediction", "party_performance", undefined, { party, year, uf });
    
    res.json(predictions);
  } catch (error: any) {
    console.error("AI Party Performance error:", error);
    res.status(500).json({ error: error.message || "Failed to generate party performance predictions" });
  }
});

router.post("/api/ai/electoral-insights", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      year: z.number().optional(),
      uf: z.string().optional(),
      electionType: z.string().optional(),
      party: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
    }
    
    const { year, uf, electionType, party } = parsed.data;
    
    const cacheKey = `insights_${year || 'all'}_${uf || 'all'}_${electionType || 'all'}_${party || 'all'}`;
    const cached = await storage.getAiPrediction(cacheKey);
    if (cached && cached.validUntil && new Date(cached.validUntil) > new Date()) {
      return res.json(cached.prediction);
    }
    
    const { generateElectoralInsights } = await import("../ai-insights");
    const insights = await generateElectoralInsights({ year, uf, electionType, party });
    
    await storage.saveAiPrediction({
      cacheKey,
      predictionType: 'electoral_insights',
      prediction: insights,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
    });
    
    await logAudit(req, "ai_prediction", "electoral_insights", undefined, { year, uf, electionType });
    
    res.json(insights);
  } catch (error: any) {
    console.error("AI Electoral Insights error:", error);
    res.status(500).json({ error: error.message || "Failed to generate electoral insights" });
  }
});

router.post("/api/ai/sentiment", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      newsArticles: z.array(z.object({
        title: z.string(),
        content: z.string(),
        source: z.string().optional(),
        publishedAt: z.string().optional()
      })).optional(),
      socialPosts: z.array(z.object({
        content: z.string(),
        platform: z.string().optional(),
        author: z.string().optional(),
        postedAt: z.string().optional()
      })).optional(),
      party: z.string().optional(),
      dateRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request parameters", details: parsed.error.errors });
    }
    
    const { newsArticles, socialPosts, party, dateRange } = parsed.data;
    
    const { analyzeElectoralSentiment } = await import("../ai-insights");
    const analysis = await analyzeElectoralSentiment({ 
      newsArticles: newsArticles?.map(a => ({ title: a.title, content: a.content, date: a.publishedAt || new Date().toISOString(), source: a.source || 'unknown' })),
      socialPosts: socialPosts?.map(p => ({ text: p.content, date: p.postedAt || new Date().toISOString(), platform: p.platform || 'unknown' })),
      party, 
      dateRange 
    });
    
    await logAudit(req, "ai_prediction", "sentiment", undefined, { party, articlesCount: newsArticles?.length || 0 });
    
    res.json(analysis);
  } catch (error: any) {
    console.error("AI Sentiment Analysis error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze sentiment" });
  }
});

const projectionReportQuerySchema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  scope: z.enum(["national", "state"]).optional(),
  targetYear: z.string().optional().transform((val) => val ? parseInt(val) : undefined).pipe(
    z.number().int().min(2000).max(2100).optional()
  )
});

router.get("/api/projection-reports", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const validationResult = projectionReportQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Invalid query parameters", 
        details: validationResult.error.issues 
      });
    }
    
    const { status, targetYear, scope } = validationResult.data;
    
    const reports = await storage.getProjectionReports({ status, targetYear, scope });
    res.json(reports);
  } catch (error) {
    console.error("Failed to fetch projection reports:", error);
    res.status(500).json({ error: "Failed to fetch projection reports" });
  }
});

router.get("/api/projection-reports/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const report = await storage.getProjectionReportById(parseInt(req.params.id));
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json(report);
  } catch (error) {
    console.error("Failed to fetch projection report:", error);
    res.status(500).json({ error: "Failed to fetch projection report" });
  }
});

const createProjectionReportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetYear: z.number().int().min(2000).max(2100),
  electionType: z.string().min(1, "Election type is required"),
  scope: z.enum(["national", "state"]),
  state: z.string().optional(),
  position: z.string().optional()
});

router.post("/api/projection-reports", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const validationResult = createProjectionReportSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validationResult.error.issues 
      });
    }
    
    const { name, targetYear, electionType, scope, state, position } = validationResult.data;
    
    if (scope === "state" && !state) {
      return res.status(400).json({ error: "State is required when scope is 'state'" });
    }
    
    const { generateProjectionReport } = await import("../ai-insights");
    const aiReport = await generateProjectionReport({
      name,
      targetYear,
      electionType,
      scope,
      state: scope === "state" ? state : undefined,
      position
    });
    
    const savedReport = await storage.createProjectionReport({
      name,
      targetYear,
      electionType,
      scope,
      state: scope === "state" ? state : null,
      executiveSummary: aiReport.executiveSummary,
      methodology: aiReport.methodology,
      dataQuality: aiReport.dataQuality,
      turnoutProjection: aiReport.turnoutProjection,
      partyProjections: aiReport.partyProjections,
      candidateProjections: aiReport.candidateProjections,
      scenarios: aiReport.scenarios,
      riskAssessment: aiReport.riskAssessment,
      confidenceIntervals: aiReport.confidenceIntervals,
      recommendations: aiReport.recommendations,
      validUntil: new Date(aiReport.validUntil),
      status: "draft",
      createdBy: req.user?.id,
    });
    
    await logAudit(req, "create", "projection_report", String(savedReport.id), { name, targetYear, scope });
    
    res.json(savedReport);
  } catch (error: any) {
    console.error("Failed to create projection report:", error);
    res.status(500).json({ error: error.message || "Failed to create projection report" });
  }
});

const updateProjectionReportSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["draft", "published", "archived"]).optional()
});

router.put("/api/projection-reports/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }
    
    const validationResult = updateProjectionReportSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: validationResult.error.issues 
      });
    }
    
    const { status, name } = validationResult.data;
    
    const updated = await storage.updateProjectionReport(id, { status, name });
    if (!updated) {
      return res.status(404).json({ error: "Report not found" });
    }
    
    await logAudit(req, "update", "projection_report", String(id), { status, name });
    
    res.json(updated);
  } catch (error) {
    console.error("Failed to update projection report:", error);
    res.status(500).json({ error: "Failed to update projection report" });
  }
});

router.delete("/api/projection-reports/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteProjectionReport(id);
    if (!deleted) {
      return res.status(404).json({ error: "Report not found" });
    }
    
    await logAudit(req, "delete", "projection_report", String(id));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete projection report:", error);
    res.status(500).json({ error: "Failed to delete projection report" });
  }
});

router.get("/api/projection-reports/:id/export/csv", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const report = await storage.getProjectionReportById(parseInt(req.params.id));
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    
    let csv = "Relatório de Projeção Eleitoral\n";
    csv += `Nome,${report.name}\n`;
    csv += `Ano Alvo,${report.targetYear}\n`;
    csv += `Tipo,${report.electionType}\n`;
    csv += `Escopo,${report.scope === "national" ? "Nacional" : report.state}\n`;
    csv += `Gerado em,${report.createdAt}\n\n`;
    
    const turnout = report.turnoutProjection as any;
    if (turnout) {
      csv += "PROJEÇÃO DE COMPARECIMENTO\n";
      csv += `Esperado,${turnout.expected}%\n`;
      csv += `Confiança,${(turnout.confidence * 100).toFixed(1)}%\n`;
      csv += `Margem de Erro,${turnout.marginOfError?.lower}% - ${turnout.marginOfError?.upper}%\n\n`;
    }
    
    const parties = report.partyProjections as any[];
    if (parties && parties.length > 0) {
      csv += "PROJEÇÕES POR PARTIDO\n";
      csv += "Partido,Sigla,Votos Esperados (%),Votos Min (%),Votos Max (%),Cadeiras Esperadas,Cadeiras Min,Cadeiras Max,Tendência,Confiança,Margem de Erro\n";
      for (const p of parties) {
        csv += `${p.party},${p.abbreviation},${p.voteShare?.expected},${p.voteShare?.min},${p.voteShare?.max},${p.seats?.expected},${p.seats?.min},${p.seats?.max},${p.trend},${(p.confidence * 100).toFixed(1)}%,${p.marginOfError}%\n`;
      }
      csv += "\n";
    }
    
    const candidates = report.candidateProjections as any[];
    if (candidates && candidates.length > 0) {
      csv += "PROJEÇÕES DE CANDIDATOS\n";
      csv += "Ranking,Nome,Partido,Cargo,Probabilidade de Eleição,Votos Esperados,Votos Min,Votos Max,Confiança\n";
      for (const c of candidates) {
        csv += `${c.ranking},${c.name},${c.party},${c.position},${(c.electionProbability * 100).toFixed(1)}%,${c.projectedVotes?.expected},${c.projectedVotes?.min},${c.projectedVotes?.max},${(c.confidence * 100).toFixed(1)}%\n`;
      }
      csv += "\n";
    }
    
    const confidence = report.confidenceIntervals as any;
    if (confidence) {
      csv += "INTERVALOS DE CONFIANÇA\n";
      csv += `Geral,${(confidence.overall * 100).toFixed(1)}%\n`;
      csv += `Comparecimento,${(confidence.turnout * 100).toFixed(1)}%\n`;
      csv += `Resultados Partidários,${(confidence.partyResults * 100).toFixed(1)}%\n`;
      csv += `Distribuição de Cadeiras,${(confidence.seatDistribution * 100).toFixed(1)}%\n\n`;
    }
    
    const recommendations = report.recommendations as string[];
    if (recommendations && recommendations.length > 0) {
      csv += "RECOMENDAÇÕES\n";
      recommendations.forEach((r, i) => {
        csv += `${i + 1},${r}\n`;
      });
    }
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="projecao-${report.name.replace(/\s+/g, "-")}-${report.targetYear}.csv"`);
    res.send("\ufeff" + csv);
  } catch (error) {
    console.error("Failed to export projection report:", error);
    res.status(500).json({ error: "Failed to export report" });
  }
});

// ===== Forecasting endpoints =====

router.get("/api/forecasts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const targetYear = req.query.targetYear ? parseInt(req.query.targetYear as string) : undefined;
    const status = req.query.status as string | undefined;
    const forecasts = await storage.getForecastRuns({ targetYear, status });
    res.json(forecasts);
  } catch (error) {
    console.error("Failed to fetch forecasts:", error);
    res.status(500).json({ error: "Failed to fetch forecasts" });
  }
});

router.get("/api/forecasts/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid forecast ID" });
    }
    
    const { getForecastSummary } = await import("../forecasting");
    const summary = await getForecastSummary(id);
    if (!summary) {
      return res.status(404).json({ error: "Forecast not found" });
    }
    
    res.json(summary);
  } catch (error) {
    console.error("Failed to fetch forecast:", error);
    res.status(500).json({ error: "Failed to fetch forecast" });
  }
});

router.get("/api/forecasts/:id/results", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid forecast ID" });
    }
    
    const resultType = req.query.resultType as string | undefined;
    const region = req.query.region as string | undefined;
    
    const results = await storage.getForecastResults(id, { resultType, region });
    res.json(results);
  } catch (error) {
    console.error("Failed to fetch forecast results:", error);
    res.status(500).json({ error: "Failed to fetch forecast results" });
  }
});

router.get("/api/forecasts/:id/swing-regions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid forecast ID" });
    }
    
    const swingRegions = await storage.getSwingRegions(id);
    res.json(swingRegions);
  } catch (error) {
    console.error("Failed to fetch swing regions:", error);
    res.status(500).json({ error: "Failed to fetch swing regions" });
  }
});

router.post("/api/forecasts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const user = req.user as any;
    const { name, description, targetYear, targetPosition, targetState, targetElectionType, historicalYears, modelParameters } = req.body;
    
    if (!name || !targetYear) {
      return res.status(400).json({ error: "Name and target year are required" });
    }
    
    const { createAndRunForecast } = await import("../forecasting");
    const forecastRun = await createAndRunForecast(user.id, {
      name,
      description,
      targetYear,
      targetPosition,
      targetState,
      targetElectionType,
      historicalYears,
      modelParameters,
    });
    
    await logAudit(req, "create", "forecast", String(forecastRun.id), { name, targetYear });
    
    res.status(201).json(forecastRun);
  } catch (error) {
    console.error("Failed to create forecast:", error);
    res.status(500).json({ error: "Failed to create forecast" });
  }
});

router.delete("/api/forecasts/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid forecast ID" });
    }
    
    const deleted = await storage.deleteForecastRun(id);
    if (!deleted) {
      return res.status(404).json({ error: "Forecast not found" });
    }
    
    await logAudit(req, "delete", "forecast", String(id));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete forecast:", error);
    res.status(500).json({ error: "Failed to delete forecast" });
  }
});

// ===== Prediction Scenario endpoints =====

router.get("/api/prediction-scenarios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const targetYear = req.query.targetYear ? parseInt(req.query.targetYear as string) : undefined;
    const scenarios = await storage.getPredictionScenarios({ status, targetYear });
    res.json(scenarios);
  } catch (error) {
    console.error("Failed to fetch prediction scenarios:", error);
    res.status(500).json({ error: "Failed to fetch prediction scenarios" });
  }
});

router.get("/api/prediction-scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid scenario ID" });
    }
    const scenario = await storage.getPredictionScenario(id);
    if (!scenario) {
      return res.status(404).json({ error: "Prediction scenario not found" });
    }
    res.json(scenario);
  } catch (error) {
    console.error("Failed to fetch prediction scenario:", error);
    res.status(500).json({ error: "Failed to fetch prediction scenario" });
  }
});

router.post("/api/prediction-scenarios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { name, description, targetYear, baseYear, pollingData, partyAdjustments, externalFactors, parameters } = req.body;
    
    if (!name || !targetYear || !baseYear) {
      return res.status(400).json({ error: "Name, target year, and base year are required" });
    }

    const scenario = await storage.createPredictionScenario({
      name,
      description,
      targetYear,
      baseYear,
      pollingData: pollingData || null,
      partyAdjustments: partyAdjustments || null,
      externalFactors: externalFactors || null,
      parameters: parameters || { pollingWeight: 0.30, historicalWeight: 0.50, adjustmentWeight: 0.20, monteCarloIterations: 10000, confidenceLevel: 0.95 },
      status: "draft",
      createdBy: (req.user as any)?.id || null,
    });

    await logAudit(req, "create", "prediction_scenario", String(scenario.id));
    res.status(201).json(scenario);
  } catch (error) {
    console.error("Failed to create prediction scenario:", error);
    res.status(500).json({ error: "Failed to create prediction scenario" });
  }
});

router.patch("/api/prediction-scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid scenario ID" });
    }

    const existing = await storage.getPredictionScenario(id);
    if (!existing) {
      return res.status(404).json({ error: "Prediction scenario not found" });
    }

    const updated = await storage.updatePredictionScenario(id, req.body);
    await logAudit(req, "update", "prediction_scenario", String(id));
    res.json(updated);
  } catch (error) {
    console.error("Failed to update prediction scenario:", error);
    res.status(500).json({ error: "Failed to update prediction scenario" });
  }
});

router.delete("/api/prediction-scenarios/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid scenario ID" });
    }

    const deleted = await storage.deletePredictionScenario(id);
    if (!deleted) {
      return res.status(404).json({ error: "Prediction scenario not found" });
    }

    await logAudit(req, "delete", "prediction_scenario", String(id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete prediction scenario:", error);
    res.status(500).json({ error: "Failed to delete prediction scenario" });
  }
});

router.post("/api/prediction-scenarios/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid scenario ID" });
    }

    const scenario = await storage.getPredictionScenario(id);
    if (!scenario) {
      return res.status(404).json({ error: "Prediction scenario not found" });
    }

    await storage.updatePredictionScenario(id, { status: "running" });

    const forecast = await storage.createForecastRun({
      name: `Previsão: ${scenario.name}`,
      targetYear: scenario.targetYear,
      status: "running",
      createdBy: (req.user as any)?.id || null,
    });

    import("../forecasting").then(async ({ runForecast }) => {
      try {
        await runForecast(forecast.id, { targetYear: scenario.targetYear });
        await storage.updatePredictionScenario(id, { 
          status: "completed", 
          lastRunAt: new Date(),
          forecastRunId: forecast.id 
        });
      } catch (error) {
        console.error("Forecast with scenario failed:", error);
        await storage.updatePredictionScenario(id, { status: "failed" });
        await storage.updateForecastRun(forecast.id, { status: "failed" });
      }
    });

    await logAudit(req, "run", "prediction_scenario", String(id));
    res.json({ success: true, forecastId: forecast.id, message: "Prediction scenario execution started" });
  } catch (error) {
    console.error("Failed to run prediction scenario:", error);
    res.status(500).json({ error: "Failed to run prediction scenario" });
  }
});

// ===== Candidate Comparison Predictions =====

router.get("/api/candidate-comparisons", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const comparisons = await db.select().from(candidateComparisons).orderBy(sql`created_at DESC`);
    res.json(comparisons);
  } catch (error) {
    console.error("Failed to fetch candidate comparisons:", error);
    res.status(500).json({ error: "Failed to fetch candidate comparisons" });
  }
});

router.post("/api/candidate-comparisons", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { name, description, candidateIds, state, position, targetYear, baseYear, compareMetrics, includeHistorical } = req.body;
    
    if (!name || !candidateIds || candidateIds.length < 2) {
      return res.status(400).json({ error: "Name and at least 2 candidates are required" });
    }

    const [comparison] = await db.insert(candidateComparisons).values({
      name,
      description,
      candidateIds,
      state: state || null,
      position: position || null,
      targetYear: targetYear || new Date().getFullYear() + 2,
      baseYear: baseYear || null,
      compareMetrics: compareMetrics || { voteShare: true, electionProbability: true, trend: true },
      includeHistorical: includeHistorical ?? true,
      status: "draft",
      createdBy: (req.user as any)?.id || null,
    }).returning();

    await logAudit(req, "create", "candidate_comparison", String(comparison.id));
    res.status(201).json(comparison);
  } catch (error) {
    console.error("Failed to create candidate comparison:", error);
    res.status(500).json({ error: "Failed to create candidate comparison" });
  }
});

router.post("/api/candidate-comparisons/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [comparison] = await db.select().from(candidateComparisons).where(eq(candidateComparisons.id, id));
    
    if (!comparison) {
      return res.status(404).json({ error: "Comparison not found" });
    }

    await db.update(candidateComparisons).set({ status: "running" }).where(eq(candidateComparisons.id, id));

    const candidateIds = comparison.candidateIds as string[];
    const candidates = await storage.getCandidates();
    const matchedCandidates = candidates.filter(c => 
      candidateIds.some(id => 
        c.id.toString() === id || 
        c.name.toLowerCase().includes(id.toLowerCase()) ||
        c.nickname?.toLowerCase().includes(id.toLowerCase())
      )
    );

    const unmatchedIds = candidateIds.filter((cId: string) => !matchedCandidates.some(c => c.id.toString() === cId || c.name.toLowerCase().includes(cId.toLowerCase())));
    const userPrompt = `Compare candidatos eleitorais:
${matchedCandidates.map(c => `- ${c.name} (${c.nickname || ''}) Partido:${c.partyId} Cargo:${c.position}`).join('\n')}
${unmatchedIds.length > 0 ? `Não encontrados (usar conhecimento geral): ${unmatchedIds.join(', ')}` : ''}
${comparison.state || 'Nacional'} | ${comparison.position || 'Geral'} | Ano: ${comparison.targetYear}

JSON: {"candidates":[{"name":"","party":"","projectedVoteShare":n,"electionProbability":0-1,"strengths":[""],"weaknesses":[""],"trend":"growing|declining|stable","historicalPerformance":""}],"headToHead":[{"candidate1":"","candidate2":"","advantage":"","margin":n}],"overallWinner":"","keyDifferentiators":[""],"narrative":"2-3 parágrafos","confidence":0-1}`;

    const { data: results } = await cachedAiCall<Record<string, any>>({
      model: "standard",
      systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
      userPrompt,
      maxTokens: 2000,
    });

    await db.update(candidateComparisons).set({
      status: "completed",
      results,
      narrative: results.narrative,
      aiInsights: { headToHead: results.headToHead, keyDifferentiators: results.keyDifferentiators },
      completedAt: new Date(),
    }).where(eq(candidateComparisons.id, id));

    const [updated] = await db.select().from(candidateComparisons).where(eq(candidateComparisons.id, id));
    await logAudit(req, "run", "candidate_comparison", String(id));
    res.json(updated);
  } catch (error) {
    console.error("Failed to run candidate comparison:", error);
    res.status(500).json({ error: "Failed to run candidate comparison" });
  }
});

router.delete("/api/candidate-comparisons/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(candidateComparisons).where(eq(candidateComparisons.id, id));
    await logAudit(req, "delete", "candidate_comparison", String(id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete candidate comparison:", error);
    res.status(500).json({ error: "Failed to delete candidate comparison" });
  }
});

// ===== Event Impact Predictions =====

router.get("/api/event-impacts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const predictions = await db.select().from(eventImpactPredictions).orderBy(sql`created_at DESC`);
    res.json(predictions);
  } catch (error) {
    console.error("Failed to fetch event impacts:", error);
    res.status(500).json({ error: "Failed to fetch event impact predictions" });
  }
});

router.post("/api/event-impacts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { 
      name, eventDescription, eventType, eventDate, affectedEntities, 
      state, position, targetYear, estimatedImpactMagnitude, impactDuration, impactDistribution 
    } = req.body;

    if (!name || !eventDescription || !eventType || !affectedEntities) {
      return res.status(400).json({ error: "Name, event description, type, and affected entities are required" });
    }

    const [prediction] = await db.insert(eventImpactPredictions).values({
      name,
      eventDescription,
      eventType,
      eventDate: eventDate ? new Date(eventDate) : null,
      affectedEntities,
      state: state || null,
      position: position || null,
      targetYear: targetYear || new Date().getFullYear() + 2,
      estimatedImpactMagnitude: estimatedImpactMagnitude?.toString() || null,
      impactDuration: impactDuration || "medium-term",
      impactDistribution: impactDistribution || { direct: 0.7, indirect: 0.3 },
      status: "draft",
      createdBy: (req.user as any)?.id || null,
    }).returning();

    await logAudit(req, "create", "event_impact_prediction", String(prediction.id));
    res.status(201).json(prediction);
  } catch (error) {
    console.error("Failed to create event impact prediction:", error);
    res.status(500).json({ error: "Failed to create event impact prediction" });
  }
});

router.post("/api/event-impacts/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [prediction] = await db.select().from(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
    
    if (!prediction) {
      return res.status(404).json({ error: "Event impact prediction not found" });
    }

    await db.update(eventImpactPredictions).set({ status: "running" }).where(eq(eventImpactPredictions.id, id));

    const affected = prediction.affectedEntities as { parties?: string[]; candidates?: string[]; regions?: string[] };
    
    const parties = await storage.getParties();
    const affectedParties = parties.filter(p => affected.parties?.includes(p.abbreviation));

    const userPrompt = `Analise impacto eleitoral do evento:
EVENTO: ${prediction.eventDescription} | Tipo: ${prediction.eventType} | Magnitude: ${prediction.estimatedImpactMagnitude || 'A determinar'} | Duração: ${prediction.impactDuration}
Afetados: Partidos=${affected.parties?.join(',') || 'N/D'} Candidatos=${affected.candidates?.join(',') || 'N/D'} Regiões=${affected.regions?.join(',') || 'Nacional'}
Escopo: ${prediction.state || 'Nacional'} ${prediction.position || 'Geral'} | Ano: ${prediction.targetYear}
Partidos: ${affectedParties.map(p => p.abbreviation).join(',') || 'N/D'}

JSON: {"beforeProjection":{"parties":[{"party":"","voteShare":n,"seats":n,"trend":"growing|stable|declining"}],"overall":{"favoriteParty":"","competitiveness":"alta|média|baixa","uncertainty":0-1}},"afterProjection":{...mesmo formato},"impactDelta":{"biggestGainer":{"party":"","voteShareChange":n,"seatChange":n},"biggestLoser":{...},"totalVolatility":n},"confidenceIntervals":{"overall":0-1,"beforeAccuracy":0-1,"afterAccuracy":0-1},"narrative":"3-4 parágrafos","keyInsights":["i1","i2"]}`;

    const { data: results } = await cachedAiCall<Record<string, any>>({
      model: "standard",
      systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
      userPrompt,
      maxTokens: 2500,
    });

    await db.update(eventImpactPredictions).set({
      status: "completed",
      beforeProjection: results.beforeProjection,
      afterProjection: results.afterProjection,
      impactDelta: results.impactDelta,
      confidenceIntervals: results.confidenceIntervals,
      narrative: results.narrative,
      aiAnalysis: { keyInsights: results.keyInsights },
      completedAt: new Date(),
    }).where(eq(eventImpactPredictions.id, id));

    const [updated] = await db.select().from(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
    await logAudit(req, "run", "event_impact_prediction", String(id));
    res.json(updated);
  } catch (error) {
    console.error("Failed to run event impact prediction:", error);
    res.status(500).json({ error: "Failed to run event impact prediction" });
  }
});

router.delete("/api/event-impacts/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
    await logAudit(req, "delete", "event_impact_prediction", String(id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete event impact prediction:", error);
    res.status(500).json({ error: "Failed to delete event impact prediction" });
  }
});

// ===== Scenario Simulations (What-If) =====

router.get("/api/scenario-simulations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const simulations = await db.select().from(scenarioSimulations).orderBy(sql`created_at DESC`);
    res.json(simulations);
  } catch (error) {
    console.error("Failed to fetch scenario simulations:", error);
    res.status(500).json({ error: "Failed to fetch scenario simulations" });
  }
});

router.post("/api/scenario-simulations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { name, description, simulationType, baseScenario, modifiedScenario, parameters, scope, reportId } = req.body;

    if (!name || !simulationType || !baseScenario || !modifiedScenario) {
      return res.status(400).json({ error: "Name, simulation type, base and modified scenarios are required" });
    }

    const [simulation] = await db.insert(scenarioSimulations).values({
      name,
      description,
      simulationType,
      baseScenario,
      modifiedScenario,
      parameters: parameters || {},
      scope: scope || {},
      status: "draft",
      reportId: reportId || null,
      createdBy: (req.user as any)?.id || null,
    }).returning();

    await logAudit(req, "create", "scenario_simulation", String(simulation.id));
    res.status(201).json(simulation);
  } catch (error) {
    console.error("Failed to create scenario simulation:", error);
    res.status(500).json({ error: "Failed to create scenario simulation" });
  }
});

router.post("/api/scenario-simulations/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [simulation] = await db.select().from(scenarioSimulations).where(eq(scenarioSimulations.id, id));
    
    if (!simulation) {
      return res.status(404).json({ error: "Scenario simulation not found" });
    }

    await db.update(scenarioSimulations).set({ status: "running" }).where(eq(scenarioSimulations.id, id));

    const baseScenario = simulation.baseScenario as any;
    const modifiedScenario = simulation.modifiedScenario as any;
    const params = simulation.parameters as any;
    const scope = simulation.scope as any;

    const userPrompt = `Simule cenário "E se..." eleitoral:
Tipo: ${simulation.simulationType}${simulation.description ? ` | ${simulation.description}` : ''}
Base: ${JSON.stringify(baseScenario)}
Modificação: ${JSON.stringify(modifiedScenario)}
Params: ${JSON.stringify(params)} | Escopo: ${JSON.stringify(scope)}

JSON: {"baselineResults":{"parties":[{"party":"","seats":n,"voteShare":n}],"dominantParty":"","competitiveness":"alta|média|baixa"},"simulatedResults":{"parties":[{"party":"","seats":n,"voteShare":n,"changeFromBaseline":n}],"dominantParty":"","competitiveness":""},"impactAnalysis":{"seatChanges":[{"party":"","before":n,"after":n,"change":n}],"voteShareChanges":[...],"winners":[""],"losers":[""],"overallImpact":"significativo|moderado|mínimo","confidence":0-1},"narrative":"3-4 parágrafos","recommendations":["r1"]}`;

    const { data: results } = await cachedAiCall<Record<string, any>>({
      model: "standard",
      systemPrompt: SYSTEM_PROMPTS.politicalForecaster,
      userPrompt,
      maxTokens: 2500,
    });

    await db.update(scenarioSimulations).set({
      status: "completed",
      baselineResults: results.baselineResults,
      simulatedResults: results.simulatedResults,
      impactAnalysis: results.impactAnalysis,
      narrative: results.narrative,
      completedAt: new Date(),
    }).where(eq(scenarioSimulations.id, id));

    const [updated] = await db.select().from(scenarioSimulations).where(eq(scenarioSimulations.id, id));
    await logAudit(req, "run", "scenario_simulation", String(id));
    res.json(updated);
  } catch (error) {
    console.error("Failed to run scenario simulation:", error);
    res.status(500).json({ error: "Failed to run scenario simulation" });
  }
});

router.delete("/api/scenario-simulations/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(scenarioSimulations).where(eq(scenarioSimulations.id, id));
    await logAudit(req, "delete", "scenario_simulation", String(id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete scenario simulation:", error);
    res.status(500).json({ error: "Failed to delete scenario simulation" });
  }
});

// ===== Dashboards =====

router.get("/api/dashboards", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const dashboards = await storage.getCustomDashboards(userId);
    res.json(dashboards);
  } catch (error) {
    console.error("Dashboards error:", error);
    res.status(500).json({ error: "Failed to fetch dashboards" });
  }
});

router.get("/api/dashboards/public", requireAuth, async (req, res) => {
  try {
    const dashboards = await storage.getPublicDashboards();
    res.json(dashboards);
  } catch (error) {
    console.error("Public dashboards error:", error);
    res.status(500).json({ error: "Failed to fetch public dashboards" });
  }
});

router.get("/api/dashboards/:id", requireAuth, async (req, res) => {
  try {
    const dashboard = await storage.getCustomDashboard(parseInt(req.params.id));
    if (!dashboard) {
      return res.status(404).json({ error: "Dashboard not found" });
    }
    res.json(dashboard);
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

router.post("/api/dashboards", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const dashboard = await storage.createCustomDashboard({
      ...req.body,
      userId,
    });
    await logAudit(req, "create", "custom_dashboard", String(dashboard.id));
    res.status(201).json(dashboard);
  } catch (error) {
    console.error("Create dashboard error:", error);
    res.status(500).json({ error: "Failed to create dashboard" });
  }
});

router.patch("/api/dashboards/:id", requireAuth, async (req, res) => {
  try {
    const dashboard = await storage.updateCustomDashboard(parseInt(req.params.id), req.body);
    if (!dashboard) {
      return res.status(404).json({ error: "Dashboard not found" });
    }
    await logAudit(req, "update", "custom_dashboard", req.params.id);
    res.json(dashboard);
  } catch (error) {
    console.error("Update dashboard error:", error);
    res.status(500).json({ error: "Failed to update dashboard" });
  }
});

router.delete("/api/dashboards/:id", requireAuth, async (req, res) => {
  try {
    const success = await storage.deleteCustomDashboard(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ error: "Dashboard not found" });
    }
    await logAudit(req, "delete", "custom_dashboard", req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete dashboard error:", error);
    res.status(500).json({ error: "Failed to delete dashboard" });
  }
});

// ===== AI Suggestions =====

router.get("/api/ai/suggestions", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { type, dismissed } = req.query;
    const suggestions = await storage.getAiSuggestions(userId, {
      type: type as string | undefined,
      dismissed: dismissed === "true" ? true : dismissed === "false" ? false : undefined,
    });
    res.json(suggestions);
  } catch (error) {
    console.error("AI suggestions error:", error);
    res.status(500).json({ error: "Failed to fetch AI suggestions" });
  }
});

router.post("/api/ai/suggestions/:id/dismiss", requireAuth, async (req, res) => {
  try {
    const success = await storage.dismissAiSuggestion(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ error: "Suggestion not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Dismiss suggestion error:", error);
    res.status(500).json({ error: "Failed to dismiss suggestion" });
  }
});

router.post("/api/ai/suggestions/:id/apply", requireAuth, async (req, res) => {
  try {
    const success = await storage.applyAiSuggestion(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ error: "Suggestion not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Apply suggestion error:", error);
    res.status(500).json({ error: "Failed to apply suggestion" });
  }
});

router.post("/api/ai/generate-suggestions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { filters } = req.body;

    const summary = await storage.getAnalyticsSummary(filters);
    const partyData = await storage.getVotesByParty({ ...filters, limit: 10 });
    const stateData = await storage.getAvailableStates(filters?.year);

    const { data: parsed } = await cachedAiCall<{ suggestions: any[] }>({
      cachePrefix: "ai_suggestions",
      cacheParams: { filters: filters || {}, totalVotes: summary.totalVotes, totalParties: summary.totalParties },
      cacheTtlHours: 12,
      model: "fast",
      systemPrompt: `${SYSTEM_PROMPTS.dataAnalyst} Sugira gráficos e relatórios úteis.`,
      userPrompt: `Dados: ${summary.totalVotes} votos, ${summary.totalCandidates} candidatos, ${summary.totalParties} partidos, ${summary.totalMunicipalities} municípios, ${stateData.length} estados
Top partidos: ${partyData.slice(0, 5).map(p => `${p.party}:${p.votes}`).join(",")}
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

    await logAudit(req, "generate", "ai_suggestions", String(createdSuggestions.length));
    res.json({ suggestions: createdSuggestions });
  } catch (error) {
    console.error("Generate AI suggestions error:", error);
    res.status(500).json({ error: "Failed to generate AI suggestions" });
  }
});

// ===== Sentiment Analysis Routes =====

router.post("/api/sentiment/analyze", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { entityType, entityId, customKeywords } = req.body;
    const result = await runSentimentAnalysis({ entityType, entityId, customKeywords });
    await logAudit(req, "sentiment_analysis", "sentiment", undefined, { 
      entityType, entityId, 
      articlesAnalyzed: result.articlesAnalyzed,
      entitiesFound: result.entities.length,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Sentiment analysis error:", error);
    res.status(500).json({ error: error.message || "Falha na análise de sentimento" });
  }
});

router.get("/api/sentiment/timeline", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, days } = req.query;
    if (!entityType || !entityId) {
      return res.status(400).json({ error: "entityType and entityId required" });
    }
    const timeline = await getSentimentTimeline(
      entityType as string,
      entityId as string,
      days ? parseInt(days as string) : 30
    );
    res.json(timeline);
  } catch (error) {
    console.error("Sentiment timeline error:", error);
    res.status(500).json({ error: "Failed to get sentiment timeline" });
  }
});

router.get("/api/sentiment/wordcloud", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, limit } = req.query;
    const data = await getWordCloudData(
      entityType as string | undefined,
      entityId as string | undefined,
      limit ? parseInt(limit as string) : 100
    );
    res.json(data);
  } catch (error) {
    console.error("Word cloud error:", error);
    res.status(500).json({ error: "Failed to get word cloud data" });
  }
});

router.get("/api/sentiment/overview", requireAuth, async (req, res) => {
  try {
    const overview = await getEntitiesSentimentOverview();
    res.json(overview);
  } catch (error) {
    console.error("Sentiment overview error:", error);
    res.status(500).json({ error: "Failed to get sentiment overview" });
  }
});

router.get("/api/sentiment/summary", requireAuth, async (req, res) => {
  try {
    const results = await storage.getSentimentResults({ limit: 100 });
    const entityMap = new Map<string, { name: string; type: string; totalScore: number; totalMentions: number; count: number }>();
    for (const r of results) {
      const key = `${r.entityType}:${r.entityId}`;
      const score = parseFloat(r.sentimentScore) || 0;
      const mentions = r.mentionCount || 1;
      if (!entityMap.has(key)) {
        entityMap.set(key, { name: r.entityName || `${r.entityType} ${r.entityId}`, type: r.entityType, totalScore: 0, totalMentions: 0, count: 0 });
      }
      const entry = entityMap.get(key)!;
      entry.totalScore += score * mentions;
      entry.totalMentions += mentions;
      entry.count++;
    }
    const entities = Array.from(entityMap.values())
      .map(e => ({ name: e.name, sentiment: e.totalMentions > 0 ? Math.round((e.totalScore / e.totalMentions) * 1000) / 1000 : 0, type: e.type }))
      .sort((a, b) => Math.abs(b.sentiment) - Math.abs(a.sentiment))
      .slice(0, 10);
    res.json({ entities });
  } catch (error) {
    console.error("Sentiment summary error:", error);
    res.json({ entities: [] });
  }
});

router.get("/api/sentiment/alerts/count", requireAuth, async (req, res) => {
  try {
    const alerts = await db.select()
      .from(sentimentCrisisAlerts)
      .where(eq(sentimentCrisisAlerts.isAcknowledged, false));
    res.json({ unacknowledged: alerts.length });
  } catch (error) {
    console.error("Alerts count error:", error);
    res.json({ unacknowledged: 0 });
  }
});

router.get("/api/sentiment/sources", requireAuth, async (req, res) => {
  try {
    const sources = await fetchSentimentSources();
    res.json(sources);
  } catch (error) {
    console.error("Sentiment sources error:", error);
    res.status(500).json({ error: "Failed to get sentiment sources" });
  }
});

router.get("/api/sentiment/results", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, startDate, endDate, limit } = req.query;
    const results = await storage.getSentimentResults({
      entityType: entityType as string | undefined,
      entityId: entityId as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json(results);
  } catch (error) {
    console.error("Sentiment results error:", error);
    res.status(500).json({ error: "Failed to get sentiment results" });
  }
});

// ===== External Data Integration Routes =====

router.get("/api/external-data/fetch", requireAuth, async (req, res) => {
  try {
    const { keywords, maxArticles } = req.query;
    const config: any = {};
    
    if (keywords) {
      config.keywords = (keywords as string).split(",");
    }
    if (maxArticles) {
      config.maxArticlesPerSource = parseInt(maxArticles as string);
    }

    const data = await fetchExternalData(config);
    res.json(data);
  } catch (error) {
    console.error("External data fetch error:", error);
    res.status(500).json({ error: "Failed to fetch external data" });
  }
});

router.post("/api/external-data/analyze", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { keywords, enableGoogleNews, enableTwitterTrends, maxArticlesPerSource } = req.body;
    
    const config: any = {};
    if (keywords) config.keywords = keywords;
    if (enableGoogleNews !== undefined) config.enableGoogleNews = enableGoogleNews;
    if (enableTwitterTrends !== undefined) config.enableTwitterTrends = enableTwitterTrends;
    if (maxArticlesPerSource) config.maxArticlesPerSource = maxArticlesPerSource;

    const result = await fetchAndAnalyzeExternalData(config);
    res.json(result);
  } catch (error) {
    console.error("External data analysis error:", error);
    res.status(500).json({ error: "Failed to analyze external data" });
  }
});

router.get("/api/external-data/summary", requireAuth, async (req, res) => {
  try {
    const summary = await getExternalDataSummaryForReport();
    res.json(summary);
  } catch (error) {
    console.error("External data summary error:", error);
    res.status(500).json({ error: "Failed to get external data summary" });
  }
});

router.get("/api/external-data/config", requireAuth, async (req, res) => {
  try {
    const hasNewsApiKey = !!process.env.NEWS_API_KEY;
    
    res.json({
      newsApiConfigured: hasNewsApiKey,
      googleNewsEnabled: true,
      twitterTrendsEnabled: true,
      defaultKeywords: [
        "eleições brasil",
        "política brasileira", 
        "candidatos eleições",
        "PT partido",
        "PL partido",
        "MDB eleições",
        "TSE eleições",
      ],
      supportedCountries: ["BR", "ES", "UK", "US"],
      supportedLanguages: ["pt", "es", "en"],
    });
  } catch (error) {
    console.error("External data config error:", error);
    res.status(500).json({ error: "Failed to get external data config" });
  }
});

// ===== Saved Reports CRUD =====

router.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const reports = await storage.getSavedReports(req.user?.id);
    res.json(reports);
  } catch (error) {
    console.error("Get reports error:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

router.get("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const report = await storage.getSavedReportById(parseInt(req.params.id));
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json(report);
  } catch (error) {
    console.error("Get report error:", error);
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

router.post("/api/reports", requireAuth, async (req, res) => {
  try {
    const { name, description, filters, columns, chartType, sortBy, sortOrder } = req.body;
    if (!name || !filters || !columns) {
      return res.status(400).json({ error: "Name, filters and columns are required" });
    }
    const report = await storage.createSavedReport({
      name,
      description,
      filters,
      columns,
      chartType: chartType || "bar",
      sortBy,
      sortOrder: sortOrder || "desc",
      createdBy: req.user?.id,
    });
    await logAudit(req, "create", "saved_report", String(report.id), { name });
    res.status(201).json(report);
  } catch (error) {
    console.error("Create report error:", error);
    res.status(500).json({ error: "Failed to create report" });
  }
});

router.put("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getSavedReportById(id);
    if (!existing) {
      return res.status(404).json({ error: "Report not found" });
    }
    const { name, description, filters, columns, chartType, sortBy, sortOrder } = req.body;
    const report = await storage.updateSavedReport(id, {
      name,
      description,
      filters,
      columns,
      chartType,
      sortBy,
      sortOrder,
    });
    await logAudit(req, "update", "saved_report", String(id), { name });
    res.json(report);
  } catch (error) {
    console.error("Update report error:", error);
    res.status(500).json({ error: "Failed to update report" });
  }
});

router.delete("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = await storage.getSavedReportById(id);
    if (!existing) {
      return res.status(404).json({ error: "Report not found" });
    }
    await storage.deleteSavedReport(id);
    await logAudit(req, "delete", "saved_report", String(id), { name: existing.name });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report error:", error);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// ===== Semantic Search Routes =====

router.post("/api/semantic-search", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { query, filters = {}, topK = 10 } = req.body;
    
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return res.status(400).json({ error: "Query must be at least 3 characters" });
    }
    
    const result = await processSemanticSearch(
      query.trim(),
      {
        year: filters.year ? parseInt(filters.year) : undefined,
        state: filters.state || undefined,
        party: filters.party || undefined,
        position: filters.position || undefined,
      },
      req.user?.id
    );
    
    await logAudit(req, "semantic_search", "semantic_search", undefined, {
      query: query.slice(0, 100),
      filters,
      resultCount: result.totalResults,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error("Semantic search error:", error);
    if (error.message?.includes("OPENAI_API_KEY")) {
      return res.status(503).json({ 
        error: "Semantic search requires an OpenAI API key. Please configure OPENAI_API_KEY in secrets." 
      });
    }
    res.status(500).json({ error: "Failed to perform semantic search" });
  }
});

router.get("/api/semantic-search/stats", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const stats = await getEmbeddingStats();
    res.json(stats);
  } catch (error) {
    console.error("Get embedding stats error:", error);
    res.status(500).json({ error: "Failed to get embedding stats" });
  }
});

router.get("/api/semantic-search/history", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const queries = await getRecentQueries(limit);
    res.json(queries);
  } catch (error) {
    console.error("Get search history error:", error);
    res.status(500).json({ error: "Failed to get search history" });
  }
});

router.post("/api/semantic-search/generate-embeddings/:importJobId", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const importJobId = parseInt(req.params.importJobId);
    const job = await storage.getTseImportJob(importJobId);
    
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }
    
    if (job.status !== "completed") {
      return res.status(400).json({ error: "Can only generate embeddings for completed import jobs" });
    }
    
    res.json({ message: "Embedding generation started", jobId: importJobId });
    
    generateEmbeddingsForImportJob(importJobId)
      .then(result => {
        console.log(`Embeddings generated for job ${importJobId}:`, result);
      })
      .catch(error => {
        console.error(`Error generating embeddings for job ${importJobId}:`, error);
      });
    
  } catch (error) {
    console.error("Generate embeddings error:", error);
    res.status(500).json({ error: "Failed to start embedding generation" });
  }
});

router.get("/api/semantic-search/check-api-key", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const hasKey = !!process.env.OPENAI_API_KEY;
    res.json({ configured: hasKey });
  } catch (error) {
    res.status(500).json({ error: "Failed to check API key" });
  }
});

// ===== Report Templates =====

router.get("/api/report-templates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const templates = await storage.getReportTemplates();
    res.json(templates);
  } catch (error) {
    console.error("Get report templates error:", error);
    res.status(500).json({ error: "Failed to fetch report templates" });
  }
});

router.get("/api/report-templates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const template = await storage.getReportTemplate(parseInt(req.params.id));
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
  } catch (error) {
    console.error("Get report template error:", error);
    res.status(500).json({ error: "Failed to fetch report template" });
  }
});

router.post("/api/report-templates", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const template = await storage.createReportTemplate({
      ...req.body,
      createdBy: req.user!.id,
    });
    await logAudit(req, "create", "report_template", String(template.id), { name: template.name });
    res.json(template);
  } catch (error) {
    console.error("Create report template error:", error);
    res.status(500).json({ error: "Failed to create report template" });
  }
});

router.patch("/api/report-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updated = await storage.updateReportTemplate(parseInt(req.params.id), req.body);
    if (!updated) {
      return res.status(404).json({ error: "Template not found" });
    }
    await logAudit(req, "update", "report_template", req.params.id);
    res.json(updated);
  } catch (error) {
    console.error("Update report template error:", error);
    res.status(500).json({ error: "Failed to update report template" });
  }
});

router.delete("/api/report-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await storage.deleteReportTemplate(parseInt(req.params.id));
    await logAudit(req, "delete", "report_template", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report template error:", error);
    res.status(500).json({ error: "Failed to delete report template" });
  }
});

// ===== Report Schedules =====

router.get("/api/report-schedules", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schedules = await storage.getReportSchedules();
    res.json(schedules);
  } catch (error) {
    console.error("Get report schedules error:", error);
    res.status(500).json({ error: "Failed to fetch report schedules" });
  }
});

router.get("/api/report-schedules/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schedule = await storage.getReportSchedule(parseInt(req.params.id));
    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    res.json(schedule);
  } catch (error) {
    console.error("Get report schedule error:", error);
    res.status(500).json({ error: "Failed to fetch report schedule" });
  }
});

router.post("/api/report-schedules", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const nextRunAt = calculateNextRun(req.body.frequency, req.body.dayOfWeek, req.body.dayOfMonth, req.body.timeOfDay, req.body.timezone);
    
    const schedule = await storage.createReportSchedule({
      ...req.body,
      nextRunAt,
      createdBy: req.user!.id,
    });
    await logAudit(req, "create", "report_schedule", String(schedule.id), { name: schedule.name, frequency: schedule.frequency });
    res.json(schedule);
  } catch (error) {
    console.error("Create report schedule error:", error);
    res.status(500).json({ error: "Failed to create report schedule" });
  }
});

router.patch("/api/report-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    if (req.body.frequency || req.body.dayOfWeek !== undefined || req.body.dayOfMonth !== undefined || req.body.timeOfDay) {
      const existing = await storage.getReportSchedule(parseInt(req.params.id));
      if (existing) {
        updateData.nextRunAt = calculateNextRun(
          req.body.frequency || existing.frequency,
          req.body.dayOfWeek ?? existing.dayOfWeek,
          req.body.dayOfMonth ?? existing.dayOfMonth,
          req.body.timeOfDay || existing.timeOfDay,
          req.body.timezone || existing.timezone
        );
      }
    }
    
    const updated = await storage.updateReportSchedule(parseInt(req.params.id), updateData);
    if (!updated) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    await logAudit(req, "update", "report_schedule", req.params.id);
    res.json(updated);
  } catch (error) {
    console.error("Update report schedule error:", error);
    res.status(500).json({ error: "Failed to update report schedule" });
  }
});

router.delete("/api/report-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await storage.deleteReportSchedule(parseInt(req.params.id));
    await logAudit(req, "delete", "report_schedule", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report schedule error:", error);
    res.status(500).json({ error: "Failed to delete report schedule" });
  }
});

// ===== Report Runs =====

router.get("/api/report-runs", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const filters = {
      scheduleId: req.query.scheduleId ? parseInt(req.query.scheduleId as string) : undefined,
      templateId: req.query.templateId ? parseInt(req.query.templateId as string) : undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    };
    const runs = await storage.getReportRuns(filters);
    res.json(runs);
  } catch (error) {
    console.error("Get report runs error:", error);
    res.status(500).json({ error: "Failed to fetch report runs" });
  }
});

router.post("/api/report-runs/trigger/:templateId", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const templateId = parseInt(req.params.templateId);
    const template = await storage.getReportTemplate(templateId);
    
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const run = await storage.createReportRun({
      templateId,
      triggeredBy: "manual",
      status: "pending",
      createdBy: req.user!.id,
    });

    executeReportRun(run.id, template, req.body.recipients || [])
      .then(() => console.log(`Report run ${run.id} completed`))
      .catch(err => console.error(`Report run ${run.id} failed:`, err));

    await logAudit(req, "trigger", "report_run", String(run.id), { templateId, templateName: template.name });
    res.json({ success: true, runId: run.id, message: "Report generation started" });
  } catch (error) {
    console.error("Trigger report run error:", error);
    res.status(500).json({ error: "Failed to trigger report run" });
  }
});

// ===== Report Recipients =====

router.get("/api/report-recipients", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const recipients = await storage.getReportRecipients();
    res.json(recipients);
  } catch (error) {
    console.error("Get report recipients error:", error);
    res.status(500).json({ error: "Failed to fetch report recipients" });
  }
});

router.post("/api/report-recipients", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const recipient = await storage.createReportRecipient({
      ...req.body,
      createdBy: req.user!.id,
    });
    await logAudit(req, "create", "report_recipient", String(recipient.id), { email: recipient.email });
    res.json(recipient);
  } catch (error) {
    console.error("Create report recipient error:", error);
    res.status(500).json({ error: "Failed to create report recipient" });
  }
});

router.patch("/api/report-recipients/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updated = await storage.updateReportRecipient(parseInt(req.params.id), req.body);
    if (!updated) {
      return res.status(404).json({ error: "Recipient not found" });
    }
    await logAudit(req, "update", "report_recipient", req.params.id);
    res.json(updated);
  } catch (error) {
    console.error("Update report recipient error:", error);
    res.status(500).json({ error: "Failed to update report recipient" });
  }
});

router.delete("/api/report-recipients/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await storage.deleteReportRecipient(parseInt(req.params.id));
    await logAudit(req, "delete", "report_recipient", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report recipient error:", error);
    res.status(500).json({ error: "Failed to delete report recipient" });
  }
});

// ===== Email Configuration =====

router.get("/api/email/status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const hasResendKey = !!process.env.RESEND_API_KEY;
    res.json({
      configured: hasResendKey,
      provider: hasResendKey ? "resend" : null,
      message: hasResendKey ? "Email está configurado" : "Configure RESEND_API_KEY nos secrets para habilitar envio de email"
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to check email status" });
  }
});

// ===== Sentiment Monitoring & Crisis Alert Routes =====

router.post("/api/sentiment/monitoring-sessions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      entities: z.array(z.object({
        type: z.enum(["party", "candidate"]),
        id: z.string(),
        name: z.string()
      })).min(1),
      sourceFilters: z.object({
        types: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional()
      }).optional(),
      dateRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      alertThreshold: z.number().min(-1).max(0).optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    
    const userId = (req.user as any).id;
    const session = await db.insert(sentimentMonitoringSessions).values({
      userId,
      name: parsed.data.name,
      description: parsed.data.description,
      entities: parsed.data.entities,
      sourceFilters: parsed.data.sourceFilters || {},
      dateRange: parsed.data.dateRange,
      alertThreshold: parsed.data.alertThreshold?.toString() || "-0.3",
      isActive: true,
    }).returning();
    
    await logAudit(req, "create_monitoring_session", "sentiment_monitoring", session[0].id.toString(), 
      { name: parsed.data.name, entityCount: parsed.data.entities.length });
    
    res.json(session[0]);
  } catch (error) {
    console.error("Error creating monitoring session:", error);
    res.status(500).json({ error: "Erro ao criar sessão de monitoramento" });
  }
});

router.get("/api/sentiment/monitoring-sessions", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const sessions = await db.select()
      .from(sentimentMonitoringSessions)
      .where(eq(sentimentMonitoringSessions.userId, userId))
      .orderBy(desc(sentimentMonitoringSessions.createdAt));
    
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching monitoring sessions:", error);
    res.status(500).json({ error: "Erro ao buscar sessões de monitoramento" });
  }
});

router.get("/api/sentiment/monitoring-sessions/:id", requireAuth, async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = await db.select()
      .from(sentimentMonitoringSessions)
      .where(eq(sentimentMonitoringSessions.id, sessionId))
      .limit(1);
    
    if (session.length === 0) {
      return res.status(404).json({ error: "Sessão não encontrada" });
    }
    
    const snapshots = await db.select()
      .from(sentimentComparisonSnapshots)
      .where(eq(sentimentComparisonSnapshots.sessionId, sessionId))
      .orderBy(desc(sentimentComparisonSnapshots.snapshotDate))
      .limit(30);
    
    res.json({ ...session[0], snapshots });
  } catch (error) {
    console.error("Error fetching monitoring session:", error);
    res.status(500).json({ error: "Erro ao buscar sessão" });
  }
});

router.patch("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const schema = z.object({
      name: z.string().optional(),
      entities: z.array(z.object({
        type: z.enum(["party", "candidate"]),
        id: z.string(),
        name: z.string()
      })).optional(),
      sourceFilters: z.object({
        types: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional()
      }).optional(),
      isActive: z.boolean().optional(),
      alertThreshold: z.number().optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.entities) updateData.entities = parsed.data.entities;
    if (parsed.data.sourceFilters) updateData.sourceFilters = parsed.data.sourceFilters;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.alertThreshold !== undefined) updateData.alertThreshold = parsed.data.alertThreshold.toString();
    
    const updated = await db.update(sentimentMonitoringSessions)
      .set(updateData)
      .where(eq(sentimentMonitoringSessions.id, sessionId))
      .returning();
    
    res.json(updated[0]);
  } catch (error) {
    console.error("Error updating monitoring session:", error);
    res.status(500).json({ error: "Erro ao atualizar sessão" });
  }
});

router.delete("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    
    await db.delete(sentimentComparisonSnapshots)
      .where(eq(sentimentComparisonSnapshots.sessionId, sessionId));
    
    await db.delete(sentimentMonitoringSessions)
      .where(eq(sentimentMonitoringSessions.id, sessionId));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting monitoring session:", error);
    res.status(500).json({ error: "Erro ao excluir sessão" });
  }
});

router.post("/api/sentiment/compare", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      entities: z.array(z.object({
        type: z.enum(["party", "candidate"]),
        id: z.string(),
        name: z.string()
      })).min(2).max(10),
      sourceTypes: z.array(z.enum(["news", "social", "blog", "forum"])).optional(),
      dateRange: z.object({
        start: z.string(),
        end: z.string()
      }).optional(),
      sessionId: z.number().optional()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    
    const { entities, sourceTypes, dateRange, sessionId } = parsed.data;
    
    const entityResults = [];
    
    for (const entity of entities) {
      const results = await db.select()
        .from(sentimentAnalysisResults)
        .where(
          and(
            eq(sentimentAnalysisResults.entityType, entity.type),
            eq(sentimentAnalysisResults.entityId, entity.id)
          )
        )
        .orderBy(desc(sentimentAnalysisResults.analysisDate))
        .limit(30);
      
      const latestResult = results[0];
      const avgSentiment = results.length > 0 
        ? results.reduce((sum, r) => sum + parseFloat(r.sentimentScore), 0) / results.length 
        : 0;
      
      const totalMentions = results.reduce((sum, r) => sum + (r.mentionCount || 0), 0);
      
      entityResults.push({
        entityType: entity.type,
        entityId: entity.id,
        entityName: entity.name,
        latestSentiment: latestResult ? parseFloat(latestResult.sentimentScore) : null,
        avgSentiment,
        sentimentLabel: latestResult?.sentimentLabel || "neutral",
        totalMentions,
        trend: results.length >= 2 
          ? (parseFloat(results[0].sentimentScore) - parseFloat(results[results.length-1].sentimentScore)) > 0 
            ? "rising" : "falling"
          : "stable",
        timeline: results.map(r => ({
          date: r.analysisDate,
          score: parseFloat(r.sentimentScore),
          mentions: r.mentionCount
        }))
      });
    }
    
    entityResults.sort((a, b) => (b.latestSentiment || 0) - (a.latestSentiment || 0));
    
    let comparisonAnalysis = "";
    try {
      const { analyzeElectoralSentiment } = await import("../ai-insights");
      const aiAnalysis = await analyzeElectoralSentiment({
        party: entities.map(e => e.name).join(", "),
        dateRange
      });
      comparisonAnalysis = (aiAnalysis as any).narrativeAnalysis || (aiAnalysis as any).overallSentiment || "";
    } catch (e) {
      console.log("AI analysis not available for comparison");
    }
    
    if (sessionId) {
      await db.insert(sentimentComparisonSnapshots).values({
        sessionId,
        snapshotDate: new Date(),
        entityResults,
        comparisonAnalysis,
        overallSentiment: (entityResults.reduce((sum, e) => sum + (e.avgSentiment || 0), 0) / entityResults.length).toString(),
        sourceBreakdown: { types: sourceTypes || ["all"] }
      });
      
      await db.update(sentimentMonitoringSessions)
        .set({ lastAnalyzedAt: new Date() })
        .where(eq(sentimentMonitoringSessions.id, sessionId));
    }
    
    res.json({
      entities: entityResults,
      comparisonAnalysis,
      analyzedAt: new Date().toISOString(),
      filters: { sourceTypes, dateRange }
    });
  } catch (error) {
    console.error("Error running comparison:", error);
    res.status(500).json({ error: "Erro ao executar comparação" });
  }
});

// ===== Crisis Alert Routes =====

router.get("/api/sentiment/crisis-alerts", requireAuth, async (req, res) => {
  try {
    const { severity, acknowledged, entityType, limit: queryLimit } = req.query;
    
    const conditions = [];
    if (severity) conditions.push(eq(sentimentCrisisAlerts.severity, severity as string));
    if (acknowledged === "false") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, false));
    if (acknowledged === "true") conditions.push(eq(sentimentCrisisAlerts.isAcknowledged, true));
    if (entityType) conditions.push(eq(sentimentCrisisAlerts.entityType, entityType as string));
    
    let query = db.select().from(sentimentCrisisAlerts);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const alerts = await query
      .orderBy(desc(sentimentCrisisAlerts.detectedAt))
      .limit(parseInt(queryLimit as string) || 50);
    
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching crisis alerts:", error);
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

router.patch("/api/sentiment/crisis-alerts/:id/acknowledge", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    const userId = (req.user as any).id;
    
    const updated = await db.update(sentimentCrisisAlerts)
      .set({
        isAcknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      })
      .where(eq(sentimentCrisisAlerts.id, alertId))
      .returning();
    
    await logAudit(req, "acknowledge_crisis_alert", "crisis_alert", alertId.toString(), 
      { alertTitle: updated[0]?.title });
    
    res.json(updated[0]);
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    res.status(500).json({ error: "Erro ao reconhecer alerta" });
  }
});

router.get("/api/sentiment/crisis-alerts/stats", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const allAlerts = await db.select().from(sentimentCrisisAlerts);
    
    const stats = {
      total: allAlerts.length,
      unacknowledged: allAlerts.filter(a => !a.isAcknowledged).length,
      last24h: allAlerts.filter(a => new Date(a.detectedAt) > dayAgo).length,
      lastWeek: allAlerts.filter(a => new Date(a.detectedAt) > weekAgo).length,
      bySeverity: {
        critical: allAlerts.filter(a => a.severity === "critical").length,
        high: allAlerts.filter(a => a.severity === "high").length,
        medium: allAlerts.filter(a => a.severity === "medium").length,
        low: allAlerts.filter(a => a.severity === "low").length
      },
      byType: {
        negative_spike: allAlerts.filter(a => a.alertType === "negative_spike").length,
        crisis: allAlerts.filter(a => a.alertType === "crisis").length,
        trending_negative: allAlerts.filter(a => a.alertType === "trending_negative").length,
        high_volume: allAlerts.filter(a => a.alertType === "high_volume").length
      }
    };
    
    res.json(stats);
  } catch (error) {
    console.error("Error fetching alert stats:", error);
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

// ===== Filtered Sentiment Analysis Routes =====

router.get("/api/sentiment/filtered", requireAuth, async (req, res) => {
  try {
    const { 
      entityType, 
      entityId, 
      sourceType, 
      startDate, 
      endDate, 
      limit: queryLimit 
    } = req.query;
    
    const conditions = [];
    
    if (entityType) conditions.push(eq(sentimentAnalysisResults.entityType, entityType as string));
    if (entityId) conditions.push(eq(sentimentAnalysisResults.entityId, entityId as string));
    if (startDate) conditions.push(gte(sentimentAnalysisResults.analysisDate, new Date(startDate as string)));
    if (endDate) conditions.push(lte(sentimentAnalysisResults.analysisDate, new Date(endDate as string)));
    
    let query = db.select().from(sentimentAnalysisResults);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const results = await query
      .orderBy(desc(sentimentAnalysisResults.analysisDate))
      .limit(parseInt(queryLimit as string) || 100);
    
    let filteredResults = results;
    if (sourceType) {
      filteredResults = results.filter(r => {
        const breakdown = r.sourceBreakdown as Record<string, number> || {};
        return breakdown[sourceType as string] && breakdown[sourceType as string] > 0;
      });
    }
    
    res.json(filteredResults);
  } catch (error) {
    console.error("Error fetching filtered sentiment:", error);
    res.status(500).json({ error: "Erro ao buscar dados filtrados" });
  }
});

router.get("/api/sentiment/timeline/:entityType/:entityId", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { days } = req.query;
    
    const daysBack = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const results = await db.select()
      .from(sentimentAnalysisResults)
      .where(
        and(
          eq(sentimentAnalysisResults.entityType, entityType),
          eq(sentimentAnalysisResults.entityId, entityId),
          gte(sentimentAnalysisResults.analysisDate, startDate)
        )
      )
      .orderBy(sentimentAnalysisResults.analysisDate);
    
    const timeline = results.map(r => ({
      date: r.analysisDate,
      score: parseFloat(r.sentimentScore),
      label: r.sentimentLabel,
      mentions: r.mentionCount,
      positive: r.positiveCount,
      negative: r.negativeCount,
      neutral: r.neutralCount,
      sourceBreakdown: r.sourceBreakdown
    }));
    
    const avgScore = timeline.length > 0 
      ? timeline.reduce((sum, t) => sum + t.score, 0) / timeline.length 
      : 0;
    
    const trend = timeline.length >= 2
      ? timeline[timeline.length - 1].score - timeline[0].score
      : 0;
    
    res.json({
      entityType,
      entityId,
      timeline,
      summary: {
        avgScore,
        trend: trend > 0.1 ? "improving" : trend < -0.1 ? "declining" : "stable",
        totalMentions: timeline.reduce((sum, t) => sum + (t.mentions || 0), 0),
        dataPoints: timeline.length
      }
    });
  } catch (error) {
    console.error("Error fetching timeline:", error);
    res.status(500).json({ error: "Erro ao buscar timeline" });
  }
});

router.get("/api/sentiment/articles/filtered", requireAuth, async (req, res) => {
  try {
    const { sourceType, sentiment, startDate, endDate, limit: queryLimit } = req.query;
    
    const conditions = [];
    
    if (sourceType) conditions.push(eq(sentimentArticles.sourceType, sourceType as string));
    if (sentiment) conditions.push(eq(sentimentArticles.sentimentLabel, sentiment as string));
    if (startDate) conditions.push(gte(sentimentArticles.publishedAt, new Date(startDate as string)));
    if (endDate) conditions.push(lte(sentimentArticles.publishedAt, new Date(endDate as string)));
    
    let query = db.select().from(sentimentArticles);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const articles = await query
      .orderBy(desc(sentimentArticles.publishedAt))
      .limit(parseInt(queryLimit as string) || 50);
    
    res.json(articles);
  } catch (error) {
    console.error("Error fetching filtered articles:", error);
    res.status(500).json({ error: "Erro ao buscar artigos" });
  }
});

router.post("/api/sentiment/classify-articles", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      articles: z.array(z.object({
        id: z.number().optional(),
        title: z.string(),
        content: z.string(),
        source: z.string()
      })).min(1).max(20)
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    }
    
    const { batchClassifySentiment } = await import("../ai-insights");
    const result = await batchClassifySentiment(parsed.data.articles);
    
    const userId = (req.user as any).id;
    await logAudit(req, "batch_sentiment_classification", "sentiment_analysis", "batch", 
      { articleCount: parsed.data.articles.length, summary: result.summary });
    
    res.json(result);
  } catch (error) {
    console.error("Error in batch sentiment classification:", error);
    res.status(500).json({ error: "Erro ao classificar artigos" });
  }
});

router.post("/api/sentiment/classify-article", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      title: z.string().min(1),
      content: z.string().min(10),
      source: z.string()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const { classifyArticleSentiment } = await import("../ai-insights");
    const result = await classifyArticleSentiment(parsed.data);
    
    res.json(result);
  } catch (error) {
    console.error("Error classifying article:", error);
    res.status(500).json({ error: "Erro ao classificar artigo" });
  }
});

router.post("/api/sentiment/comparison-narrative", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      entities: z.array(z.object({
        name: z.string(),
        type: z.string(),
        avgSentiment: z.number(),
        totalMentions: z.number(),
        trend: z.string()
      })).min(2)
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const { generateComparisonNarrative } = await import("../ai-insights");
    const narrative = await generateComparisonNarrative(parsed.data.entities);
    
    res.json({ narrative });
  } catch (error) {
    console.error("Error generating narrative:", error);
    res.status(500).json({ error: "Erro ao gerar narrativa" });
  }
});

router.post("/api/sentiment/detect-crisis", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schema = z.object({
      entityType: z.string(),
      entityId: z.string(),
      entityName: z.string(),
      currentSentiment: z.number(),
      previousSentiment: z.number(),
      mentionCount: z.number(),
      avgMentionCount: z.number()
    });
    
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
    
    const { detectCrisisFromSentiment } = await import("../ai-insights");
    const alert = await detectCrisisFromSentiment(parsed.data);
    
    if (alert && alert.shouldAlert) {
      const userId = (req.user as any).id;
      const sentimentChange = parsed.data.previousSentiment - parsed.data.currentSentiment;
      
      const stored = await db.insert(sentimentCrisisAlerts).values({
        entityType: parsed.data.entityType,
        entityId: parsed.data.entityId,
        entityName: parsed.data.entityName,
        alertType: alert.alertType!,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        sentimentBefore: parsed.data.previousSentiment.toFixed(4),
        sentimentAfter: parsed.data.currentSentiment.toFixed(4),
        sentimentChange: sentimentChange.toFixed(4),
        mentionCount: parsed.data.mentionCount
      }).returning();
      
      await logAudit(req, "create_crisis_alert", "crisis_alert", stored[0].id.toString(), 
        { severity: alert.severity, entityName: parsed.data.entityName });
      
      res.json({ alert: stored[0], detected: true });
    } else {
      res.json({ detected: false, message: "Nenhuma crise detectada" });
    }
  } catch (error) {
    console.error("Error detecting crisis:", error);
    res.status(500).json({ error: "Erro ao detectar crise" });
  }
});

export default router;
