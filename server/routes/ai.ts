import { Router } from "express";
import { requireAuth, requireRole, logAudit, calculateNextRun } from "./shared";
import { storage } from "../storage";
import { z } from "zod";
import { processSemanticSearch, generateEmbeddingsForImportJob, getEmbeddingStats, getRecentQueries } from "../semantic-search";
import { fetchExternalData, fetchAndAnalyzeExternalData, getExternalDataSummaryForReport } from "../external-data-service";
import {
  predictScenario,
  assistantQuery,
  predictHistorical,
  detectAnomalies,
  predictTurnout,
  predictCandidateSuccessService,
  predictPartyPerformanceService,
  generateElectoralInsightsService,
  analyzeSentimentService,
} from "../services/prediction-service";
import {
  listCandidateComparisons,
  createCandidateComparison,
  runCandidateComparison,
  deleteCandidateComparison,
  listEventImpacts,
  createEventImpact,
  runEventImpact,
  deleteEventImpact,
  listScenarioSimulations,
  createScenarioSimulation,
  runScenarioSimulation,
  deleteScenarioSimulation,
} from "../services/comparison-service";
import {
  getProjectionReports,
  getProjectionReportById,
  createProjectionReport,
  updateProjectionReport,
  deleteProjectionReport,
  exportProjectionReportCsv,
  getReportTemplates,
  getReportTemplate,
  createReportTemplate,
  updateReportTemplate,
  deleteReportTemplate,
  getReportSchedules,
  getReportSchedule,
  createReportSchedule,
  updateReportSchedule,
  deleteReportSchedule,
  getReportRuns,
  triggerReportRun,
  getReportRecipients,
  createReportRecipient,
  updateReportRecipient,
  deleteReportRecipient,
  getSavedReports,
  getSavedReportById,
  createSavedReport,
  updateSavedReport,
  deleteSavedReport,
} from "../services/report-service";
import {
  getCustomDashboards,
  getPublicDashboards,
  getCustomDashboard,
  createCustomDashboard,
  updateCustomDashboard,
  deleteCustomDashboard,
  getAiSuggestions,
  dismissAiSuggestion,
  applyAiSuggestion,
  generateAiSuggestions,
} from "../services/dashboard-service";
import {
  analyzeSentiment,
  getTimeline,
  getWordCloud,
  getOverview,
  getSummary,
  getAlertsCount,
  getSources,
  getSentimentResults,
  createMonitoringSession,
  getMonitoringSessions,
  getMonitoringSessionById,
  updateMonitoringSession,
  deleteMonitoringSession,
  compareSentiment,
  getCrisisAlerts,
  acknowledgeCrisisAlert,
  getCrisisAlertStats,
  getFilteredSentiment,
  getEntityTimeline,
  getFilteredArticles,
  classifyArticlesBatch,
  classifySingleArticle,
  generateNarrative,
  detectCrisis,
} from "../services/sentiment-service";

const router = Router();

function handleServiceError(res: any, error: any, defaultMsg: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
  }
  console.error(defaultMsg, error);
  res.status(500).json({ error: error?.message || defaultMsg });
}

router.post("/api/ai/predict", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { scenarioId, partyLegendVotes, candidateVotes } = req.body;
    if (!scenarioId || typeof scenarioId !== "number") {
      return res.status(400).json({ error: "scenarioId é obrigatório" });
    }
    const sanitizedLegend: Record<number, number> = {};
    if (partyLegendVotes && typeof partyLegendVotes === "object") {
      for (const [k, v] of Object.entries(partyLegendVotes)) {
        const num = Math.max(0, Math.floor(Number(v) || 0));
        if (num > 0) sanitizedLegend[Number(k)] = num;
      }
    }
    const sanitizedCandidates: Record<number, Record<number, number>> = {};
    if (candidateVotes && typeof candidateVotes === "object") {
      for (const [partyId, cands] of Object.entries(candidateVotes)) {
        if (cands && typeof cands === "object") {
          sanitizedCandidates[Number(partyId)] = {};
          for (const [candId, v] of Object.entries(cands as Record<string, unknown>)) {
            const num = Math.max(0, Math.floor(Number(v) || 0));
            if (num > 0) sanitizedCandidates[Number(partyId)][Number(candId)] = num;
          }
        }
      }
    }
    const prediction = await predictScenario(scenarioId, sanitizedLegend, sanitizedCandidates);
    await logAudit(req, "prediction", "scenario", String(scenarioId));

    const scenario = await storage.getScenario(scenarioId);
    const userId = (req.user as any)?.id;
    try {
      await storage.createSavedPrediction({
        predictionType: "quick_prediction",
        title: `Previsão: ${scenario?.name || `Cenário #${scenarioId}`}`,
        description: `Previsão rápida para ${scenario?.position || "cargo"} com ${scenario?.availableSeats || 0} vagas`,
        scenarioId,
        scenarioName: scenario?.name || null,
        fullResult: prediction as any,
        confidence: (prediction as any)?.predictions?.[0]?.confidence?.toString() || null,
        status: "completed",
        createdBy: userId || null,
      });
    } catch (saveErr) {
      console.warn("[SavedPrediction] Auto-save failed (non-fatal):", (saveErr as Error).message);
    }

    res.json(prediction);
  } catch (error: any) {
    handleServiceError(res, error, "AI Prediction error:");
  }
});

router.post("/api/ai/assistant", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { question, filters } = req.body;
    const result = await assistantQuery(question, filters);
    await logAudit(req, "ai_query", "assistant", undefined, { question, filters });
    res.json(result);
  } catch (error: any) {
    handleServiceError(res, error, "AI Assistant error:");
  }
});

router.post("/api/ai/predict-historical", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { filters, targetYear } = req.body;
    const prediction = await predictHistorical(filters, targetYear);
    await logAudit(req, "ai_prediction", "historical", undefined, { filters, years: (prediction as any).historicalYears });
    res.json(prediction);
  } catch (error: any) {
    handleServiceError(res, error, "AI Historical Prediction error:");
  }
});

router.post("/api/ai/anomalies", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { filters } = req.body;
    const analysis = await detectAnomalies(filters);
    await logAudit(req, "ai_anomaly", "detection", undefined, { filters, riskLevel: (analysis as any).overallRisk });
    res.json(analysis);
  } catch (error: any) {
    handleServiceError(res, error, "AI Anomaly Detection error:");
  }
});

router.post("/api/ai/turnout", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const prediction = await predictTurnout(req.body);
    await logAudit(req, "ai_prediction", "turnout", undefined, req.body);
    res.json(prediction);
  } catch (error: any) {
    handleServiceError(res, error, "AI Turnout Prediction error:");
  }
});

router.post("/api/ai/candidate-success", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const predictions = await predictCandidateSuccessService(req.body);
    await logAudit(req, "ai_prediction", "candidate_success", undefined, { party: req.body.party, year: req.body.year, uf: req.body.uf });
    res.json(predictions);
  } catch (error: any) {
    const isDataError = error.message?.includes("Nenhum dado de candidato");
    if (isDataError) {
      return res.status(400).json({ error: error.message });
    }
    handleServiceError(res, error, "AI Candidate Success error:");
  }
});

router.post("/api/ai/party-performance", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const predictions = await predictPartyPerformanceService(req.body);
    await logAudit(req, "ai_prediction", "party_performance", undefined, { party: req.body.party, year: req.body.year, uf: req.body.uf });
    res.json(predictions);
  } catch (error: any) {
    handleServiceError(res, error, "AI Party Performance error:");
  }
});

router.post("/api/ai/electoral-insights", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const insights = await generateElectoralInsightsService(req.body);
    await logAudit(req, "ai_prediction", "electoral_insights", undefined, { year: req.body.year, uf: req.body.uf, electionType: req.body.electionType });
    res.json(insights);
  } catch (error: any) {
    handleServiceError(res, error, "AI Electoral Insights error:");
  }
});

router.post("/api/ai/sentiment", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const analysis = await analyzeSentimentService(req.body);
    await logAudit(req, "ai_prediction", "sentiment", undefined, { party: req.body.party, articlesCount: req.body.newsArticles?.length || 0 });
    res.json(analysis);
  } catch (error: any) {
    handleServiceError(res, error, "AI Sentiment Analysis error:");
  }
});

router.get("/api/projection-reports", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const reports = await getProjectionReports(req.query);
    res.json(reports);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to fetch projection reports:");
  }
});

router.get("/api/projection-reports/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const report = await getProjectionReportById(parseInt(req.params.id));
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json(report);
  } catch (error) {
    console.error("Failed to fetch projection report:", error);
    res.status(500).json({ error: "Failed to fetch projection report" });
  }
});

router.post("/api/projection-reports", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const savedReport = await createProjectionReport(req.body, req.user?.id);
    await logAudit(req, "create", "projection_report", String(savedReport.id), { name: req.body.name, targetYear: req.body.targetYear, scope: req.body.scope });
    res.json(savedReport);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to create projection report:");
  }
});

router.put("/api/projection-reports/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid report ID" });
    }
    const updated = await updateProjectionReport(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Report not found" });
    }
    await logAudit(req, "update", "projection_report", String(id), req.body);
    res.json(updated);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to update projection report:");
  }
});

router.delete("/api/projection-reports/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await deleteProjectionReport(id);
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
    const { csv, filename } = await exportProjectionReportCsv(parseInt(req.params.id));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to export projection report:");
  }
});

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
      name, description, targetYear, targetPosition, targetState, targetElectionType, historicalYears, modelParameters,
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
      name, description, targetYear, baseYear,
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
        await storage.updateForecastRun(forecast.id, {
          status: "completed",
          completedAt: new Date(),
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

router.get("/api/candidate-comparisons", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const comparisons = await listCandidateComparisons();
    res.json(comparisons);
  } catch (error) {
    console.error("Failed to fetch candidate comparisons:", error);
    res.status(500).json({ error: "Failed to fetch candidate comparisons" });
  }
});

router.post("/api/candidate-comparisons", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const comparison = await createCandidateComparison({
      ...req.body,
      createdBy: (req.user as any)?.id || null,
    });
    await logAudit(req, "create", "candidate_comparison", String(comparison.id));
    res.status(201).json(comparison);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to create candidate comparison:");
  }
});

router.post("/api/candidate-comparisons/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const updated = await runCandidateComparison(parseInt(req.params.id));
    await logAudit(req, "run", "candidate_comparison", req.params.id);
    res.json(updated);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to run candidate comparison:");
  }
});

router.delete("/api/candidate-comparisons/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await deleteCandidateComparison(parseInt(req.params.id));
    await logAudit(req, "delete", "candidate_comparison", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete candidate comparison:", error);
    res.status(500).json({ error: "Failed to delete candidate comparison" });
  }
});

router.get("/api/event-impacts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const predictions = await listEventImpacts();
    res.json(predictions);
  } catch (error) {
    console.error("Failed to fetch event impacts:", error);
    res.status(500).json({ error: "Failed to fetch event impact predictions" });
  }
});

router.post("/api/event-impacts", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const prediction = await createEventImpact({
      ...req.body,
      createdBy: (req.user as any)?.id || null,
    });
    await logAudit(req, "create", "event_impact_prediction", String(prediction.id));
    res.status(201).json(prediction);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to create event impact prediction:");
  }
});

router.post("/api/event-impacts/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const updated = await runEventImpact(parseInt(req.params.id));
    await logAudit(req, "run", "event_impact_prediction", req.params.id);
    res.json(updated);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to run event impact prediction:");
  }
});

router.delete("/api/event-impacts/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await deleteEventImpact(parseInt(req.params.id));
    await logAudit(req, "delete", "event_impact_prediction", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete event impact prediction:", error);
    res.status(500).json({ error: "Failed to delete event impact prediction" });
  }
});

router.get("/api/scenario-simulations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const simulations = await listScenarioSimulations();
    res.json(simulations);
  } catch (error) {
    console.error("Failed to fetch scenario simulations:", error);
    res.status(500).json({ error: "Failed to fetch scenario simulations" });
  }
});

router.post("/api/scenario-simulations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const simulation = await createScenarioSimulation({
      ...req.body,
      createdBy: (req.user as any)?.id || null,
    });
    await logAudit(req, "create", "scenario_simulation", String(simulation.id));
    res.status(201).json(simulation);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to create scenario simulation:");
  }
});

router.post("/api/scenario-simulations/:id/run", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const updated = await runScenarioSimulation(parseInt(req.params.id));
    await logAudit(req, "run", "scenario_simulation", req.params.id);
    res.json(updated);
  } catch (error: any) {
    handleServiceError(res, error, "Failed to run scenario simulation:");
  }
});

router.delete("/api/scenario-simulations/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await deleteScenarioSimulation(parseInt(req.params.id));
    await logAudit(req, "delete", "scenario_simulation", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete scenario simulation:", error);
    res.status(500).json({ error: "Failed to delete scenario simulation" });
  }
});

router.get("/api/dashboards", requireAuth, async (req, res) => {
  try {
    const dashboards = await getCustomDashboards(req.user!.id);
    res.json(dashboards);
  } catch (error) {
    console.error("Dashboards error:", error);
    res.status(500).json({ error: "Failed to fetch dashboards" });
  }
});

router.get("/api/dashboards/public", requireAuth, async (req, res) => {
  try {
    const dashboards = await getPublicDashboards();
    res.json(dashboards);
  } catch (error) {
    console.error("Public dashboards error:", error);
    res.status(500).json({ error: "Failed to fetch public dashboards" });
  }
});

router.get("/api/dashboards/:id", requireAuth, async (req, res) => {
  try {
    const dashboard = await getCustomDashboard(parseInt(req.params.id));
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
    const dashboard = await createCustomDashboard({ ...req.body, userId: req.user!.id });
    await logAudit(req, "create", "custom_dashboard", String(dashboard.id));
    res.status(201).json(dashboard);
  } catch (error) {
    console.error("Create dashboard error:", error);
    res.status(500).json({ error: "Failed to create dashboard" });
  }
});

router.patch("/api/dashboards/:id", requireAuth, async (req, res) => {
  try {
    const dashboard = await updateCustomDashboard(parseInt(req.params.id), req.body);
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
    const success = await deleteCustomDashboard(parseInt(req.params.id));
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

router.get("/api/ai/suggestions", requireAuth, async (req, res) => {
  try {
    const { type, dismissed } = req.query;
    const suggestions = await getAiSuggestions(req.user!.id, {
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
    const success = await dismissAiSuggestion(parseInt(req.params.id));
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
    const success = await applyAiSuggestion(parseInt(req.params.id));
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
    const createdSuggestions = await generateAiSuggestions(req.user!.id, req.body.filters);
    await logAudit(req, "generate", "ai_suggestions", String(createdSuggestions.length));
    res.json({ suggestions: createdSuggestions });
  } catch (error) {
    console.error("Generate AI suggestions error:", error);
    res.status(500).json({ error: "Failed to generate AI suggestions" });
  }
});

router.post("/api/sentiment/analyze", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { entityType, entityId, customKeywords } = req.body;
    const result = await analyzeSentiment({ entityType, entityId, customKeywords });
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
    const timeline = await getTimeline(entityType as string, entityId as string, days ? parseInt(days as string) : 30);
    res.json(timeline);
  } catch (error) {
    console.error("Sentiment timeline error:", error);
    res.status(500).json({ error: "Failed to get sentiment timeline" });
  }
});

router.get("/api/sentiment/wordcloud", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId, limit } = req.query;
    const data = await getWordCloud(entityType as string | undefined, entityId as string | undefined, limit ? parseInt(limit as string) : 100);
    res.json(data);
  } catch (error) {
    console.error("Word cloud error:", error);
    res.status(500).json({ error: "Failed to get word cloud data" });
  }
});

router.get("/api/sentiment/overview", requireAuth, async (req, res) => {
  try {
    const overview = await getOverview();
    res.json(overview);
  } catch (error) {
    console.error("Sentiment overview error:", error);
    res.status(500).json({ error: "Failed to get sentiment overview" });
  }
});

router.get("/api/sentiment/summary", requireAuth, async (req, res) => {
  try {
    const summary = await getSummary();
    res.json(summary);
  } catch (error) {
    console.error("Sentiment summary error:", error);
    res.json({ entities: [] });
  }
});

router.get("/api/sentiment/alerts/count", requireAuth, async (req, res) => {
  try {
    const count = await getAlertsCount();
    res.json(count);
  } catch (error) {
    console.error("Alerts count error:", error);
    res.json({ unacknowledged: 0 });
  }
});

router.get("/api/sentiment/sources", requireAuth, async (req, res) => {
  try {
    const sources = await getSources();
    res.json(sources);
  } catch (error) {
    console.error("Sentiment sources error:", error);
    res.status(500).json({ error: "Failed to get sentiment sources" });
  }
});

router.get("/api/sentiment/results", requireAuth, async (req, res) => {
  try {
    const results = await getSentimentResults(req.query);
    res.json(results);
  } catch (error) {
    console.error("Sentiment results error:", error);
    res.status(500).json({ error: "Failed to get sentiment results" });
  }
});

router.get("/api/external-data/fetch", requireAuth, async (req, res) => {
  try {
    const { keywords, maxArticles } = req.query;
    const config: any = {};
    if (keywords) config.keywords = (keywords as string).split(",");
    if (maxArticles) config.maxArticlesPerSource = parseInt(maxArticles as string);
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

router.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const reports = await getSavedReports(req.user?.id);
    res.json(reports);
  } catch (error) {
    console.error("Get reports error:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

router.get("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const report = await getSavedReportById(parseInt(req.params.id));
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
    const report = await createSavedReport({
      name, description, filters, columns,
      chartType: chartType || "bar",
      sortBy, sortOrder: sortOrder || "desc",
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
    const existing = await getSavedReportById(id);
    if (!existing) {
      return res.status(404).json({ error: "Report not found" });
    }
    const { name, description, filters, columns, chartType, sortBy, sortOrder } = req.body;
    const report = await updateSavedReport(id, { name, description, filters, columns, chartType, sortBy, sortOrder });
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
    const existing = await getSavedReportById(id);
    if (!existing) {
      return res.status(404).json({ error: "Report not found" });
    }
    await deleteSavedReport(id);
    await logAudit(req, "delete", "saved_report", String(id), { name: existing.name });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report error:", error);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

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
      query: query.slice(0, 100), filters, resultCount: result.totalResults,
    });
    res.json(result);
  } catch (error: any) {
    console.error("Semantic search error:", error);
    if (error.message?.includes("OPENAI_API_KEY")) {
      return res.status(503).json({ error: "Semantic search requires an OpenAI API key. Please configure OPENAI_API_KEY in secrets." });
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
      .then(result => console.log(`Embeddings generated for job ${importJobId}:`, result))
      .catch(error => console.error(`Error generating embeddings for job ${importJobId}:`, error));
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

router.get("/api/report-templates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const templates = await getReportTemplates();
    res.json(templates);
  } catch (error) {
    console.error("Get report templates error:", error);
    res.status(500).json({ error: "Failed to fetch report templates" });
  }
});

router.get("/api/report-templates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const template = await getReportTemplate(parseInt(req.params.id));
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
    const template = await createReportTemplate({ ...req.body, createdBy: req.user!.id });
    await logAudit(req, "create", "report_template", String(template.id), { name: template.name });
    res.json(template);
  } catch (error) {
    console.error("Create report template error:", error);
    res.status(500).json({ error: "Failed to create report template" });
  }
});

router.patch("/api/report-templates/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updated = await updateReportTemplate(parseInt(req.params.id), req.body);
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
    await deleteReportTemplate(parseInt(req.params.id));
    await logAudit(req, "delete", "report_template", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report template error:", error);
    res.status(500).json({ error: "Failed to delete report template" });
  }
});

router.get("/api/report-schedules", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schedules = await getReportSchedules();
    res.json(schedules);
  } catch (error) {
    console.error("Get report schedules error:", error);
    res.status(500).json({ error: "Failed to fetch report schedules" });
  }
});

router.get("/api/report-schedules/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const schedule = await getReportSchedule(parseInt(req.params.id));
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
    const schedule = await createReportSchedule({ ...req.body, createdBy: req.user!.id });
    await logAudit(req, "create", "report_schedule", String(schedule.id), { name: schedule.name, frequency: schedule.frequency });
    res.json(schedule);
  } catch (error) {
    console.error("Create report schedule error:", error);
    res.status(500).json({ error: "Failed to create report schedule" });
  }
});

router.patch("/api/report-schedules/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updated = await updateReportSchedule(parseInt(req.params.id), req.body);
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
    await deleteReportSchedule(parseInt(req.params.id));
    await logAudit(req, "delete", "report_schedule", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report schedule error:", error);
    res.status(500).json({ error: "Failed to delete report schedule" });
  }
});

router.get("/api/report-runs", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const runs = await getReportRuns(req.query);
    res.json(runs);
  } catch (error) {
    console.error("Get report runs error:", error);
    res.status(500).json({ error: "Failed to fetch report runs" });
  }
});

router.post("/api/report-runs/trigger/:templateId", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const templateId = parseInt(req.params.templateId);
    const { runId, templateName } = await triggerReportRun(templateId, req.user!.id, req.body.recipients);
    await logAudit(req, "trigger", "report_run", String(runId), { templateId, templateName });
    res.json({ success: true, runId, message: "Report generation started" });
  } catch (error: any) {
    handleServiceError(res, error, "Trigger report run error:");
  }
});

router.get("/api/report-recipients", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const recipients = await getReportRecipients();
    res.json(recipients);
  } catch (error) {
    console.error("Get report recipients error:", error);
    res.status(500).json({ error: "Failed to fetch report recipients" });
  }
});

router.post("/api/report-recipients", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const recipient = await createReportRecipient({ ...req.body, createdBy: req.user!.id });
    await logAudit(req, "create", "report_recipient", String(recipient.id), { email: recipient.email });
    res.json(recipient);
  } catch (error) {
    console.error("Create report recipient error:", error);
    res.status(500).json({ error: "Failed to create report recipient" });
  }
});

router.patch("/api/report-recipients/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const updated = await updateReportRecipient(parseInt(req.params.id), req.body);
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
    await deleteReportRecipient(parseInt(req.params.id));
    await logAudit(req, "delete", "report_recipient", req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete report recipient error:", error);
    res.status(500).json({ error: "Failed to delete report recipient" });
  }
});

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
    const session = await createMonitoringSession(userId, parsed.data);
    await logAudit(req, "create_monitoring_session", "sentiment_monitoring", session.id.toString(), 
      { name: parsed.data.name, entityCount: parsed.data.entities.length });
    res.json(session);
  } catch (error) {
    console.error("Error creating monitoring session:", error);
    res.status(500).json({ error: "Erro ao criar sessão de monitoramento" });
  }
});

router.get("/api/sentiment/monitoring-sessions", requireAuth, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const sessions = await getMonitoringSessions(userId);
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching monitoring sessions:", error);
    res.status(500).json({ error: "Erro ao buscar sessões de monitoramento" });
  }
});

router.get("/api/sentiment/monitoring-sessions/:id", requireAuth, async (req, res) => {
  try {
    const result = await getMonitoringSessionById(parseInt(req.params.id));
    if (!result) {
      return res.status(404).json({ error: "Sessão não encontrada" });
    }
    res.json(result);
  } catch (error) {
    console.error("Error fetching monitoring session:", error);
    res.status(500).json({ error: "Erro ao buscar sessão" });
  }
});

router.patch("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
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
    const updated = await updateMonitoringSession(parseInt(req.params.id), parsed.data);
    res.json(updated);
  } catch (error) {
    console.error("Error updating monitoring session:", error);
    res.status(500).json({ error: "Erro ao atualizar sessão" });
  }
});

router.delete("/api/sentiment/monitoring-sessions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    await deleteMonitoringSession(parseInt(req.params.id));
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
    const result = await compareSentiment(parsed.data);
    res.json(result);
  } catch (error) {
    console.error("Error running comparison:", error);
    res.status(500).json({ error: "Erro ao executar comparação" });
  }
});

router.get("/api/sentiment/crisis-alerts", requireAuth, async (req, res) => {
  try {
    const alerts = await getCrisisAlerts(req.query);
    res.json(alerts);
  } catch (error) {
    console.error("Error fetching crisis alerts:", error);
    res.status(500).json({ error: "Erro ao buscar alertas" });
  }
});

router.patch("/api/sentiment/crisis-alerts/:id/acknowledge", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const updated = await acknowledgeCrisisAlert(parseInt(req.params.id), userId);
    await logAudit(req, "acknowledge_crisis_alert", "crisis_alert", req.params.id, { alertTitle: updated?.title });
    res.json(updated);
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    res.status(500).json({ error: "Erro ao reconhecer alerta" });
  }
});

router.get("/api/sentiment/crisis-alerts/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getCrisisAlertStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching alert stats:", error);
    res.status(500).json({ error: "Erro ao buscar estatísticas" });
  }
});

router.get("/api/sentiment/filtered", requireAuth, async (req, res) => {
  try {
    const results = await getFilteredSentiment(req.query);
    res.json(results);
  } catch (error) {
    console.error("Error fetching filtered sentiment:", error);
    res.status(500).json({ error: "Erro ao buscar dados filtrados" });
  }
});

router.get("/api/sentiment/timeline/:entityType/:entityId", requireAuth, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const { days } = req.query;
    const result = await getEntityTimeline(entityType, entityId, parseInt(days as string) || 30);
    res.json(result);
  } catch (error) {
    console.error("Error fetching timeline:", error);
    res.status(500).json({ error: "Erro ao buscar timeline" });
  }
});

router.get("/api/sentiment/articles/filtered", requireAuth, async (req, res) => {
  try {
    const articles = await getFilteredArticles(req.query);
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
    const result = await classifyArticlesBatch(parsed.data.articles);
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
    const result = await classifySingleArticle(parsed.data);
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
    const narrative = await generateNarrative(parsed.data.entities);
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
    const result = await detectCrisis(parsed.data);
    if (result.detected && result.alert) {
      await logAudit(req, "create_crisis_alert", "crisis_alert", result.alert.id.toString(), 
        { severity: result.alert.severity, entityName: parsed.data.entityName });
    }
    res.json(result);
  } catch (error) {
    console.error("Error detecting crisis:", error);
    res.status(500).json({ error: "Erro ao detectar crise" });
  }
});

// Saved Predictions History
router.get("/api/saved-predictions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const type = req.query.type as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const predictions = await storage.listSavedPredictions({ type, limit });
    res.json(predictions);
  } catch (error) {
    console.error("Failed to fetch saved predictions:", error);
    res.status(500).json({ error: "Falha ao buscar histórico de previsões" });
  }
});

router.get("/api/saved-predictions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const prediction = await storage.getSavedPrediction(id);
    if (!prediction) {
      return res.status(404).json({ error: "Previsão não encontrada" });
    }
    res.json(prediction);
  } catch (error) {
    console.error("Failed to fetch saved prediction:", error);
    res.status(500).json({ error: "Falha ao buscar previsão" });
  }
});

router.post("/api/saved-predictions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { predictionType, title, description, scenarioId, scenarioName, sourceEntityId, filters, parameters, fullResult, confidence, status } = req.body;
    if (!predictionType || !title || !fullResult) {
      return res.status(400).json({ error: "predictionType, title e fullResult são obrigatórios" });
    }
    const userId = (req.user as any)?.id;
    const prediction = await storage.createSavedPrediction({
      predictionType,
      title,
      description: description || null,
      scenarioId: scenarioId || null,
      scenarioName: scenarioName || null,
      sourceEntityId: sourceEntityId || null,
      filters: filters || null,
      parameters: parameters || null,
      fullResult,
      confidence: confidence?.toString() || null,
      status: status || "completed",
      createdBy: userId || null,
    });
    await logAudit(req, "create", "saved_prediction", String(prediction.id));
    res.status(201).json(prediction);
  } catch (error) {
    console.error("Failed to save prediction:", error);
    res.status(500).json({ error: "Falha ao salvar previsão" });
  }
});

router.delete("/api/saved-predictions/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteSavedPrediction(id);
    if (!deleted) {
      return res.status(404).json({ error: "Previsão não encontrada" });
    }
    await logAudit(req, "delete", "saved_prediction", String(id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete saved prediction:", error);
    res.status(500).json({ error: "Falha ao excluir previsão" });
  }
});

export default router;
