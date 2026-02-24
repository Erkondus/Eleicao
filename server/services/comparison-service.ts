import { db } from "../db";
import { storage } from "../storage";
import { sql, eq } from "drizzle-orm";
import {
  candidateComparisons,
  eventImpactPredictions,
  scenarioSimulations,
} from "@shared/schema";
import { cachedAiCall, SYSTEM_PROMPTS } from "../ai-cache";

export async function listCandidateComparisons() {
  return db.select().from(candidateComparisons).orderBy(sql`created_at DESC`);
}

export async function createCandidateComparison(data: {
  name: string;
  description?: string;
  candidateIds: string[];
  state?: string;
  position?: string;
  targetYear?: number;
  baseYear?: number;
  compareMetrics?: any;
  includeHistorical?: boolean;
  createdBy?: string;
}) {
  if (!data.name || !data.candidateIds || data.candidateIds.length < 2) {
    throw { status: 400, message: "Name and at least 2 candidates are required" };
  }

  const [comparison] = await db.insert(candidateComparisons).values({
    name: data.name,
    description: data.description,
    candidateIds: data.candidateIds,
    state: data.state || null,
    position: data.position || null,
    targetYear: data.targetYear || new Date().getFullYear() + 2,
    baseYear: data.baseYear || null,
    compareMetrics: data.compareMetrics || { voteShare: true, electionProbability: true, trend: true },
    includeHistorical: data.includeHistorical ?? true,
    status: "draft",
    createdBy: data.createdBy || null,
  }).returning();

  return comparison;
}

export async function runCandidateComparison(id: number) {
  const [comparison] = await db.select().from(candidateComparisons).where(eq(candidateComparisons.id, id));
  
  if (!comparison) {
    throw { status: 404, message: "Comparison not found" };
  }

  await db.update(candidateComparisons).set({ status: "running" }).where(eq(candidateComparisons.id, id));

  const candidateIds = comparison.candidateIds as string[];
  const candidates = await storage.getCandidates();
  const matchedCandidates = candidates.filter(c => 
    candidateIds.some(cId => 
      c.id.toString() === cId || 
      c.name.toLowerCase().includes(cId.toLowerCase()) ||
      c.nickname?.toLowerCase().includes(cId.toLowerCase())
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
  return updated;
}

export async function deleteCandidateComparison(id: number) {
  await db.delete(candidateComparisons).where(eq(candidateComparisons.id, id));
}

export async function listEventImpacts() {
  return db.select().from(eventImpactPredictions).orderBy(sql`created_at DESC`);
}

export async function createEventImpact(data: {
  name: string;
  eventDescription: string;
  eventType: string;
  eventDate?: string;
  affectedEntities: any;
  state?: string;
  position?: string;
  targetYear?: number;
  estimatedImpactMagnitude?: number;
  impactDuration?: string;
  impactDistribution?: any;
  createdBy?: string;
}) {
  if (!data.name || !data.eventDescription || !data.eventType || !data.affectedEntities) {
    throw { status: 400, message: "Name, event description, type, and affected entities are required" };
  }

  const [prediction] = await db.insert(eventImpactPredictions).values({
    name: data.name,
    eventDescription: data.eventDescription,
    eventType: data.eventType,
    eventDate: data.eventDate ? new Date(data.eventDate) : null,
    affectedEntities: data.affectedEntities,
    state: data.state || null,
    position: data.position || null,
    targetYear: data.targetYear || new Date().getFullYear() + 2,
    estimatedImpactMagnitude: data.estimatedImpactMagnitude?.toString() || null,
    impactDuration: data.impactDuration || "medium-term",
    impactDistribution: data.impactDistribution || { direct: 0.7, indirect: 0.3 },
    status: "draft",
    createdBy: data.createdBy || null,
  }).returning();

  return prediction;
}

export async function runEventImpact(id: number) {
  const [prediction] = await db.select().from(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
  
  if (!prediction) {
    throw { status: 404, message: "Event impact prediction not found" };
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
  return updated;
}

export async function deleteEventImpact(id: number) {
  await db.delete(eventImpactPredictions).where(eq(eventImpactPredictions.id, id));
}

export async function listScenarioSimulations() {
  return db.select().from(scenarioSimulations).orderBy(sql`created_at DESC`);
}

export async function createScenarioSimulation(data: {
  name: string;
  description?: string;
  simulationType: string;
  baseScenario: any;
  modifiedScenario: any;
  parameters?: any;
  scope?: any;
  reportId?: number;
  createdBy?: string;
}) {
  if (!data.name || !data.simulationType || !data.baseScenario || !data.modifiedScenario) {
    throw { status: 400, message: "Name, simulation type, base and modified scenarios are required" };
  }

  const [simulation] = await db.insert(scenarioSimulations).values({
    name: data.name,
    description: data.description,
    simulationType: data.simulationType,
    baseScenario: data.baseScenario,
    modifiedScenario: data.modifiedScenario,
    parameters: data.parameters || {},
    scope: data.scope || {},
    status: "draft",
    reportId: data.reportId || null,
    createdBy: data.createdBy || null,
  }).returning();

  return simulation;
}

export async function runScenarioSimulation(id: number) {
  const [simulation] = await db.select().from(scenarioSimulations).where(eq(scenarioSimulations.id, id));
  
  if (!simulation) {
    throw { status: 404, message: "Scenario simulation not found" };
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
  return updated;
}

export async function deleteScenarioSimulation(id: number) {
  await db.delete(scenarioSimulations).where(eq(scenarioSimulations.id, id));
}
