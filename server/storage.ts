import { db } from "./db";
import { eq, desc, sql, and, or, ilike, asc } from "drizzle-orm";
import { SQL } from "drizzle-orm";
import {
  type User, type InsertUser, users,
  type Party, type InsertParty, parties,
  type Candidate, type InsertCandidate, candidates,
  type Scenario, type InsertScenario, scenarios,
  type ScenarioVote, type InsertScenarioVote, scenarioVotes,
  type Simulation, type InsertSimulation, simulations,
  type AuditLog, type InsertAuditLog, auditLogs,
  type Alliance, type InsertAlliance, alliances,
  type AllianceParty, type InsertAllianceParty, allianceParties,
  type TseImportJob, type InsertTseImportJob, tseImportJobs,
  type TseCandidateVote, type InsertTseCandidateVote, tseCandidateVotes,
  type TseImportError, type InsertTseImportError, tseImportErrors,
  type TseImportBatch, type InsertTseImportBatch, tseImportBatches,
  type TseImportBatchRow, type InsertTseImportBatchRow, tseImportBatchRows,
  type TseElectoralStatistics, type InsertTseElectoralStatistics, tseElectoralStatistics,
  type TsePartyVotes, type InsertTsePartyVotes, tsePartyVotes,
  type ScenarioCandidate, type InsertScenarioCandidate, scenarioCandidates,
  type SavedReport, type InsertSavedReport, savedReports,
  type AiPrediction, aiPredictions,
  type ProjectionReportRecord, type InsertProjectionReport, projectionReports,
  type ValidationRunRecord, type InsertValidationRun, importValidationRuns,
  type ValidationIssueRecord, type InsertValidationIssue, importValidationIssues,
  type ForecastRun, type InsertForecastRun, forecastRuns,
  type ForecastResult, type InsertForecastResult, forecastResults,
  type SwingRegion, type InsertSwingRegion, forecastSwingRegions,
  type ReportTemplate, type InsertReportTemplate, reportTemplates,
  type ReportSchedule, type InsertReportSchedule, reportSchedules,
  type ReportRun, type InsertReportRun, reportRuns,
  type ReportRecipient, type InsertReportRecipient, reportRecipients,
  type PredictionScenario, type InsertPredictionScenario, predictionScenarios,
  type CustomDashboard, type InsertCustomDashboard, customDashboards,
  type AiSuggestion, type InsertAiSuggestion, aiSuggestions,
  type SentimentDataSource, type InsertSentimentDataSource, sentimentDataSources,
  type SentimentArticle, type InsertSentimentArticle, sentimentArticles,
  type SentimentAnalysisResult, type InsertSentimentAnalysisResult, sentimentAnalysisResults,
  type SentimentKeyword, type InsertSentimentKeyword, sentimentKeywords,
  type Campaign, type InsertCampaign, campaigns,
  type CampaignBudget, type InsertCampaignBudget, campaignBudgets,
  type CampaignResource, type InsertCampaignResource, campaignResources,
  type CampaignMetric, type InsertCampaignMetric, campaignMetrics,
  type CampaignActivity, type InsertCampaignActivity, campaignActivities,
  type CampaignTeamMember, type InsertCampaignTeamMember, campaignTeamMembers,
  type ActivityAssignee, type InsertActivityAssignee, activityAssignees,
  type AiKpiGoal, type InsertAiKpiGoal, aiKpiGoals,
  type CampaignNotification, type InsertCampaignNotification, campaignNotifications,
  campaignInsightSessions,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

// Pagination types
export interface PaginationOptions {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PartyWithDetails extends Party {
  candidateCount: number;
  totalVotes: number;
  recentScenarios: { id: number; name: string; votes: number }[];
  historicalPerformance: { year: number; votes: number; seats: number }[];
}

export interface CandidateWithDetails extends Candidate {
  party?: Party;
  totalVotes: number;
  scenarioParticipations: { scenarioId: number; scenarioName: string; votes: number; elected: boolean }[];
  historicalPerformance: { year: number; votes: number; position: string; result: string }[];
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  getParties(): Promise<Party[]>;
  getParty(id: number): Promise<Party | undefined>;
  getPartyByNumber(number: number): Promise<Party | undefined>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined>;
  deleteParty(id: number): Promise<boolean>;
  syncPartiesFromTseImport(jobId: number): Promise<{ created: number; existing: number; updated: number }>;
  getPartiesPaginated(options: PaginationOptions & { active?: boolean; tags?: string[] }): Promise<PaginatedResult<Party>>;
  getPartyWithDetails(id: number): Promise<PartyWithDetails | undefined>;

  getCandidates(): Promise<Candidate[]>;
  getCandidate(id: number): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: number, data: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  deleteCandidate(id: number): Promise<boolean>;
  getCandidatesPaginated(options: PaginationOptions & { partyId?: number; position?: string; active?: boolean; tags?: string[] }): Promise<PaginatedResult<Candidate & { party?: Party }>>;
  getCandidateWithDetails(id: number): Promise<CandidateWithDetails | undefined>;

  getScenarios(): Promise<Scenario[]>;
  getScenario(id: number): Promise<Scenario | undefined>;
  createScenario(scenario: InsertScenario): Promise<Scenario>;
  updateScenario(id: number, data: Partial<InsertScenario>): Promise<Scenario | undefined>;
  deleteScenario(id: number): Promise<boolean>;
  duplicateScenario(id: number, newName: string): Promise<Scenario>;

  getSimulations(scenarioId?: number): Promise<Simulation[]>;
  getRecentSimulations(limit?: number): Promise<Simulation[]>;
  getSimulation(id: number): Promise<Simulation | undefined>;
  createSimulation(simulation: InsertSimulation): Promise<Simulation>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(): Promise<AuditLog[]>;

  getStats(): Promise<{ parties: number; candidates: number; scenarios: number; simulations: number }>;

  getScenarioVotes(scenarioId: number): Promise<ScenarioVote[]>;
  saveScenarioVotes(scenarioId: number, votes: InsertScenarioVote[]): Promise<ScenarioVote[]>;
  deleteScenarioVotes(scenarioId: number): Promise<boolean>;

  getAlliances(scenarioId: number): Promise<Alliance[]>;
  getAlliance(id: number): Promise<Alliance | undefined>;
  createAlliance(alliance: InsertAlliance): Promise<Alliance>;
  updateAlliance(id: number, data: Partial<InsertAlliance>): Promise<Alliance | undefined>;
  deleteAlliance(id: number): Promise<boolean>;
  
  getAllianceParties(allianceId: number): Promise<AllianceParty[]>;
  setAllianceParties(allianceId: number, partyIds: number[]): Promise<AllianceParty[]>;
  getPartyAlliance(scenarioId: number, partyId: number): Promise<Alliance | undefined>;

  getScenarioCandidates(scenarioId: number): Promise<(ScenarioCandidate & { candidate: Candidate; party: Party })[]>;
  getScenarioCandidate(id: number): Promise<ScenarioCandidate | undefined>;
  createScenarioCandidate(data: InsertScenarioCandidate): Promise<ScenarioCandidate>;
  updateScenarioCandidate(id: number, data: Partial<InsertScenarioCandidate>): Promise<ScenarioCandidate | undefined>;
  deleteScenarioCandidate(id: number): Promise<boolean>;
  addCandidateToScenario(scenarioId: number, candidateId: number, partyId: number, ballotNumber: number, nickname?: string, votes?: number): Promise<ScenarioCandidate>;

  // Drill-down analytics methods
  getCandidatesByParty(filters: {
    year?: number;
    uf?: string;
    party: string;
    position?: string;
    limit?: number;
  }): Promise<{
    name: string;
    nickname: string | null;
    number: number | null;
    votes: number;
    municipality: string | null;
    state: string | null;
    position: string | null;
    result: string | null;
  }[]>;

  getPartyPerformanceByState(filters: {
    year?: number;
    party?: string;
    position?: string;
  }): Promise<{
    state: string;
    party: string;
    votes: number;
    candidateCount: number;
    percentage: number;
  }[]>;

  getVotesByPosition(filters: {
    year?: number;
    uf?: string;
  }): Promise<{
    position: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]>;

  // AI Prediction caching methods
  getAiPrediction(cacheKey: string): Promise<AiPrediction | undefined>;
  saveAiPrediction(data: { cacheKey: string; predictionType: string; prediction: unknown; expiresAt: Date }): Promise<AiPrediction>;
  deleteExpiredAiPredictions(): Promise<number>;

  // Validation methods
  createValidationRun(data: InsertValidationRun): Promise<ValidationRunRecord>;
  getValidationRun(id: number): Promise<ValidationRunRecord | undefined>;
  getValidationRunByJobId(jobId: number): Promise<ValidationRunRecord | undefined>;
  getValidationRunsForJob(jobId: number): Promise<ValidationRunRecord[]>;
  updateValidationRun(id: number, data: Partial<InsertValidationRun>): Promise<ValidationRunRecord | undefined>;
  
  createValidationIssue(data: InsertValidationIssue): Promise<ValidationIssueRecord>;
  createValidationIssues(data: InsertValidationIssue[]): Promise<ValidationIssueRecord[]>;
  getValidationIssuesForRun(runId: number, filters?: { type?: string; severity?: string; status?: string }): Promise<ValidationIssueRecord[]>;
  getValidationIssue(id: number): Promise<ValidationIssueRecord | undefined>;
  updateValidationIssue(id: number, data: Partial<InsertValidationIssue>): Promise<ValidationIssueRecord | undefined>;
  getValidationIssueCounts(runId: number): Promise<{ type: string; severity: string; count: number }[]>;

  // Forecast methods
  createForecastRun(data: InsertForecastRun): Promise<ForecastRun>;
  getForecastRun(id: number): Promise<ForecastRun | undefined>;
  getForecastRuns(filters?: { targetYear?: number; status?: string }): Promise<ForecastRun[]>;
  updateForecastRun(id: number, data: Partial<InsertForecastRun>): Promise<ForecastRun | undefined>;
  deleteForecastRun(id: number): Promise<boolean>;
  
  createForecastResult(data: InsertForecastResult): Promise<ForecastResult>;
  createForecastResults(data: InsertForecastResult[]): Promise<ForecastResult[]>;
  getForecastResults(runId: number, filters?: { resultType?: string; region?: string }): Promise<ForecastResult[]>;
  
  createSwingRegion(data: InsertSwingRegion): Promise<SwingRegion>;
  createSwingRegions(data: InsertSwingRegion[]): Promise<SwingRegion[]>;
  getSwingRegions(runId: number): Promise<SwingRegion[]>;
  
  // Historical data for forecasting
  getHistoricalVotesByParty(filters: { years: number[]; position?: string; state?: string }): Promise<{
    year: number;
    party: string;
    state: string | null;
    position: string | null;
    totalVotes: number;
    candidateCount: number;
  }[]>;
  
  getHistoricalTrends(filters: { party?: string; position?: string; state?: string }): Promise<{
    year: number;
    party: string;
    voteShare: number;
    seats?: number;
  }[]>;

  // Prediction Scenario methods
  getPredictionScenarios(filters?: { status?: string; targetYear?: number }): Promise<PredictionScenario[]>;
  getPredictionScenario(id: number): Promise<PredictionScenario | undefined>;
  createPredictionScenario(data: InsertPredictionScenario): Promise<PredictionScenario>;
  updatePredictionScenario(id: number, data: Partial<InsertPredictionScenario>): Promise<PredictionScenario | undefined>;
  deletePredictionScenario(id: number): Promise<boolean>;

  // Report Template methods
  getReportTemplates(): Promise<ReportTemplate[]>;
  getReportTemplate(id: number): Promise<ReportTemplate | undefined>;
  createReportTemplate(data: InsertReportTemplate): Promise<ReportTemplate>;
  updateReportTemplate(id: number, data: Partial<InsertReportTemplate>): Promise<ReportTemplate | undefined>;
  deleteReportTemplate(id: number): Promise<boolean>;

  // Report Schedule methods
  getReportSchedules(): Promise<ReportSchedule[]>;
  getReportSchedule(id: number): Promise<ReportSchedule | undefined>;
  getDueSchedules(): Promise<ReportSchedule[]>;
  createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule>;
  updateReportSchedule(id: number, data: Partial<InsertReportSchedule>): Promise<ReportSchedule | undefined>;
  deleteReportSchedule(id: number): Promise<boolean>;

  // Report Run methods
  getReportRuns(filters?: { scheduleId?: number; templateId?: number; status?: string; limit?: number }): Promise<ReportRun[]>;
  getReportRun(id: number): Promise<ReportRun | undefined>;
  createReportRun(data: InsertReportRun): Promise<ReportRun>;
  updateReportRun(id: number, data: Partial<InsertReportRun>): Promise<ReportRun | undefined>;

  // Report Recipients methods
  getReportRecipients(): Promise<ReportRecipient[]>;
  getReportRecipient(id: number): Promise<ReportRecipient | undefined>;
  createReportRecipient(data: InsertReportRecipient): Promise<ReportRecipient>;
  updateReportRecipient(id: number, data: Partial<InsertReportRecipient>): Promise<ReportRecipient | undefined>;
  deleteReportRecipient(id: number): Promise<boolean>;

  // Custom Dashboard methods
  getCustomDashboards(userId?: string): Promise<CustomDashboard[]>;
  getCustomDashboard(id: number): Promise<CustomDashboard | undefined>;
  createCustomDashboard(data: InsertCustomDashboard): Promise<CustomDashboard>;
  updateCustomDashboard(id: number, data: Partial<InsertCustomDashboard>): Promise<CustomDashboard | undefined>;
  deleteCustomDashboard(id: number): Promise<boolean>;
  getPublicDashboards(): Promise<CustomDashboard[]>;

  // AI Suggestions methods
  getAiSuggestions(userId?: string, filters?: { type?: string; dismissed?: boolean }): Promise<AiSuggestion[]>;
  getAiSuggestion(id: number): Promise<AiSuggestion | undefined>;
  createAiSuggestion(data: InsertAiSuggestion): Promise<AiSuggestion>;
  updateAiSuggestion(id: number, data: Partial<InsertAiSuggestion>): Promise<AiSuggestion | undefined>;
  deleteAiSuggestion(id: number): Promise<boolean>;
  dismissAiSuggestion(id: number): Promise<boolean>;
  applyAiSuggestion(id: number): Promise<boolean>;

  // Advanced segmentation methods
  getMunicipalities(filters?: { uf?: string; year?: number }): Promise<{ code: number; name: string; uf: string }[]>;
  getVotesByMunicipality(filters: { year?: number; uf?: string; position?: string; party?: string; municipality?: string }): Promise<{
    municipality: string;
    municipalityCode: number;
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]>;
  getPositions(filters?: { year?: number; uf?: string }): Promise<{ code: number; name: string; votes: number }[]>;

  // Campaign Management methods
  getCampaigns(filters?: { status?: string; partyId?: number }): Promise<Campaign[]>;
  getCampaign(id: number): Promise<Campaign | undefined>;
  getCampaignWithDetails(id: number): Promise<{
    campaign: Campaign;
    party?: Party;
    candidate?: Candidate;
    aiSession?: any;
    budgets: CampaignBudget[];
    resources: CampaignResource[];
    metrics: CampaignMetric[];
    activities: CampaignActivity[];
  } | undefined>;
  createCampaign(data: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, data: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: number): Promise<boolean>;
  
  // Campaign Budget methods
  getCampaignBudgets(campaignId: number): Promise<CampaignBudget[]>;
  getCampaignBudget(id: number): Promise<CampaignBudget | undefined>;
  createCampaignBudget(data: InsertCampaignBudget): Promise<CampaignBudget>;
  updateCampaignBudget(id: number, data: Partial<InsertCampaignBudget>): Promise<CampaignBudget | undefined>;
  deleteCampaignBudget(id: number): Promise<boolean>;
  
  // Campaign Resource methods
  getCampaignResources(campaignId: number): Promise<CampaignResource[]>;
  getCampaignResource(id: number): Promise<CampaignResource | undefined>;
  createCampaignResource(data: InsertCampaignResource): Promise<CampaignResource>;
  updateCampaignResource(id: number, data: Partial<InsertCampaignResource>): Promise<CampaignResource | undefined>;
  deleteCampaignResource(id: number): Promise<boolean>;
  
  // Campaign Metric methods
  getCampaignMetrics(campaignId: number, filters?: { kpiName?: string; startDate?: Date; endDate?: Date }): Promise<CampaignMetric[]>;
  getCampaignMetric(id: number): Promise<CampaignMetric | undefined>;
  createCampaignMetric(data: InsertCampaignMetric): Promise<CampaignMetric>;
  updateCampaignMetric(id: number, data: Partial<InsertCampaignMetric>): Promise<CampaignMetric | undefined>;
  deleteCampaignMetric(id: number): Promise<boolean>;
  
  // Campaign Activity methods
  getCampaignActivities(campaignId: number, filters?: { status?: string; type?: string }): Promise<CampaignActivity[]>;
  getCampaignActivity(id: number): Promise<CampaignActivity | undefined>;
  createCampaignActivity(data: InsertCampaignActivity): Promise<CampaignActivity>;
  updateCampaignActivity(id: number, data: Partial<InsertCampaignActivity>): Promise<CampaignActivity | undefined>;
  deleteCampaignActivity(id: number): Promise<boolean>;
  
  // Campaign performance summary
  getCampaignPerformanceSummary(campaignId: number): Promise<{
    budgetUtilization: number;
    activitiesCompleted: number;
    activitiesTotal: number;
    resourcesAllocated: number;
    latestMetrics: { name: string; value: number; target: number | null }[];
    daysRemaining: number;
    progressPercentage: number;
  }>;
  
  // Campaign Team Member methods
  getCampaignTeamMembers(campaignId: number): Promise<CampaignTeamMember[]>;
  getCampaignTeamMember(id: number): Promise<CampaignTeamMember | undefined>;
  getCampaignTeamMemberByUser(campaignId: number, userId: string): Promise<CampaignTeamMember | undefined>;
  createCampaignTeamMember(data: InsertCampaignTeamMember): Promise<CampaignTeamMember>;
  updateCampaignTeamMember(id: number, data: Partial<InsertCampaignTeamMember>): Promise<CampaignTeamMember | undefined>;
  deleteCampaignTeamMember(id: number): Promise<boolean>;
  
  // Activity Assignee methods
  getActivityAssignees(activityId: number): Promise<ActivityAssignee[]>;
  createActivityAssignee(data: InsertActivityAssignee): Promise<ActivityAssignee>;
  deleteActivityAssignee(id: number): Promise<boolean>;
  
  // AI KPI Goals methods
  getAiKpiGoals(campaignId: number): Promise<AiKpiGoal[]>;
  getAiKpiGoal(id: number): Promise<AiKpiGoal | undefined>;
  createAiKpiGoal(data: InsertAiKpiGoal): Promise<AiKpiGoal>;
  updateAiKpiGoal(id: number, data: Partial<InsertAiKpiGoal>): Promise<AiKpiGoal | undefined>;
  deleteAiKpiGoal(id: number): Promise<boolean>;
  
  // Campaign Notification methods
  getCampaignNotifications(campaignId: number): Promise<CampaignNotification[]>;
  getUserCampaignNotifications(userId: string): Promise<CampaignNotification[]>;
  createCampaignNotification(data: InsertCampaignNotification): Promise<CampaignNotification>;
  markCampaignNotificationSent(id: number, inAppNotificationId?: number): Promise<CampaignNotification | undefined>;
  
  // Calendar activities for date range
  getCalendarActivities(campaignId: number, startDate: Date, endDate: Date): Promise<CampaignActivity[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const [user] = await db.insert(users).values({
      ...insertUser,
      password: hashedPassword,
    }).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.name);
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return true;
  }

  async getParties(): Promise<Party[]> {
    return db.select().from(parties).orderBy(parties.number);
  }

  async getParty(id: number): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.id, id));
    return party;
  }

  async getPartyByNumber(number: number): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.number, number));
    return party;
  }

  async createParty(party: InsertParty): Promise<Party> {
    const [created] = await db.insert(parties).values(party).returning();
    return created;
  }

  async syncPartiesFromTseImport(jobId: number): Promise<{ created: number; existing: number; updated: number }> {
    // Get unique parties from candidate votes (if any)
    const candidateParties = await db.selectDistinct({
      nrPartido: tseCandidateVotes.nrPartido,
      sgPartido: tseCandidateVotes.sgPartido,
      nmPartido: tseCandidateVotes.nmPartido,
    })
    .from(tseCandidateVotes)
    .where(eq(tseCandidateVotes.importJobId, jobId));

    // Get unique parties from party votes (if any)
    const partyVotesParties = await db.selectDistinct({
      nrPartido: tsePartyVotes.nrPartido,
      sgPartido: tsePartyVotes.sgPartido,
      nmPartido: tsePartyVotes.nmPartido,
    })
    .from(tsePartyVotes)
    .where(eq(tsePartyVotes.importJobId, jobId));

    // Combine both sources, using Map to deduplicate by party number
    const partyMap = new Map<number, { nrPartido: number; sgPartido: string; nmPartido: string | null }>();
    
    for (const p of candidateParties) {
      if (p.nrPartido && p.sgPartido) {
        partyMap.set(p.nrPartido, { nrPartido: p.nrPartido, sgPartido: p.sgPartido, nmPartido: p.nmPartido });
      }
    }
    
    for (const p of partyVotesParties) {
      if (p.nrPartido && p.sgPartido && !partyMap.has(p.nrPartido)) {
        partyMap.set(p.nrPartido, { nrPartido: p.nrPartido, sgPartido: p.sgPartido, nmPartido: p.nmPartido });
      }
    }

    let created = 0;
    let existing = 0;
    let updated = 0;

    // Get all existing parties for comparison
    const existingParties = await db.select().from(parties);
    const existingByNumber = new Map(existingParties.map(p => [p.number, p]));

    for (const partyData of Array.from(partyMap.values())) {
      try {
        const existingParty = existingByNumber.get(partyData.nrPartido);
        
        if (existingParty) {
          // Check if update is needed (abbreviation or name mismatch)
          if (existingParty.abbreviation !== partyData.sgPartido || 
              (partyData.nmPartido && existingParty.name !== partyData.nmPartido)) {
            await db.update(parties)
              .set({
                abbreviation: partyData.sgPartido,
                name: partyData.nmPartido || partyData.sgPartido,
              })
              .where(eq(parties.number, partyData.nrPartido));
            updated++;
            console.log(`Updated party: ${partyData.sgPartido} (${partyData.nrPartido})`);
          } else {
            existing++;
          }
        } else {
          // Insert new party
          const result = await db.insert(parties).values({
            name: partyData.nmPartido || partyData.sgPartido,
            abbreviation: partyData.sgPartido,
            number: partyData.nrPartido,
            color: this.generatePartyColor(partyData.nrPartido),
            active: true,
          }).onConflictDoNothing({ target: parties.number }).returning();

          if (result.length > 0) {
            created++;
            console.log(`Created party: ${partyData.sgPartido} (${partyData.nrPartido})`);
          } else {
            existing++;
          }
        }
      } catch (error: any) {
        // Handle abbreviation uniqueness conflict (different party with same abbreviation)
        if (error.code === '23505') {
          existing++;
        } else {
          console.error(`Failed to sync party ${partyData.sgPartido}:`, error.message);
        }
      }
    }

    return { created, existing, updated };
  }

  private generatePartyColor(partyNumber: number): string {
    const colors: { [key: number]: string } = {
      10: "#FF0000", // PRB/Republicanos - vermelho
      11: "#0000FF", // PP - azul
      12: "#00AA00", // PDT - verde
      13: "#FF0000", // PT - vermelho
      14: "#00AA00", // PTB - verde
      15: "#0000FF", // MDB/PMDB - azul
      16: "#800080", // PSTU - roxo
      17: "#FF8C00", // PSL - laranja
      18: "#FFCC00", // REDE - amarelo
      19: "#008000", // PODE - verde
      20: "#00CED1", // PSC - turquesa
      21: "#FFA500", // PCB - laranja
      22: "#0000FF", // PL - azul
      23: "#00FF00", // PPS/Cidadania - verde
      25: "#008000", // DEM/União - verde
      27: "#FF0000", // PSDC - vermelho
      28: "#FF69B4", // PRTB - rosa
      29: "#FFD700", // PCO - dourado
      30: "#228B22", // NOVO - verde
      31: "#FF4500", // PHS - laranja
      33: "#0000CD", // PMN - azul
      35: "#32CD32", // PMB - verde
      36: "#800000", // PTC - marrom
      40: "#FF6347", // PSB - vermelho
      43: "#006400", // PV - verde escuro
      44: "#0000FF", // UNIÃO - azul
      45: "#0000FF", // PSDB - azul
      50: "#FF0000", // PSOL - vermelho
      51: "#FF4500", // PEN/Patriota - laranja
      54: "#FF69B4", // PPL - rosa
      55: "#FF0000", // PSD - vermelho
      65: "#FF0000", // PC do B - vermelho
      70: "#00BFFF", // AVANTE - azul claro
      77: "#90EE90", // SOLIDARIEDADE - verde claro
      80: "#4682B4", // UP - azul
      90: "#006400", // PROS - verde
    };
    return colors[partyNumber] || `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
  }

  async updateParty(id: number, data: Partial<InsertParty>): Promise<Party | undefined> {
    const [party] = await db.update(parties).set(data).where(eq(parties.id, id)).returning();
    return party;
  }

  async deleteParty(id: number): Promise<boolean> {
    await db.delete(parties).where(eq(parties.id, id));
    return true;
  }

  async getPartiesPaginated(options: PaginationOptions & { active?: boolean; tags?: string[] }): Promise<PaginatedResult<Party>> {
    const { page, limit, search, sortBy = "name", sortOrder = "asc", active, tags } = options;
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions: SQL[] = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(parties.name, `%${search}%`),
          ilike(parties.abbreviation, `%${search}%`)
        )!
      );
    }
    
    if (active !== undefined) {
      conditions.push(eq(parties.active, active));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(parties)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

    // Get paginated data
    const orderColumn = sortBy === "abbreviation" ? parties.abbreviation : 
                       sortBy === "number" ? parties.number :
                       sortBy === "createdAt" ? parties.createdAt : parties.name;
    const orderDir = sortOrder === "desc" ? desc(orderColumn) : asc(orderColumn);

    const data = await db.select()
      .from(parties)
      .where(whereClause)
      .orderBy(orderDir)
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPartyWithDetails(id: number): Promise<PartyWithDetails | undefined> {
    const party = await this.getParty(id);
    if (!party) return undefined;

    // Get candidate count
    const candidateCountResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(eq(candidates.partyId, id));
    const candidateCount = candidateCountResult[0]?.count || 0;

    // Get total votes from TSE data
    const votesResult = await db.select({ total: sql<number>`coalesce(sum(qt_votos_nominais), 0)::int` })
      .from(tseCandidateVotes)
      .where(eq(tseCandidateVotes.nrPartido, party.number));
    const totalVotes = votesResult[0]?.total || 0;

    // Get recent scenarios
    const recentScenariosResult = await db.select({
      id: scenarios.id,
      name: scenarios.name,
      votes: sql<number>`coalesce(sum(${scenarioVotes.votes}), 0)::int`,
    })
    .from(scenarios)
    .leftJoin(scenarioVotes, and(
      eq(scenarioVotes.scenarioId, scenarios.id),
      eq(scenarioVotes.partyId, id)
    ))
    .groupBy(scenarios.id, scenarios.name)
    .orderBy(desc(scenarios.createdAt))
    .limit(5);

    // Get historical performance from TSE
    const historicalResult = await db.select({
      year: tseCandidateVotes.anoEleicao,
      votes: sql<number>`coalesce(sum(qt_votos_nominais), 0)::int`,
      seats: sql<number>`count(case when ${tseCandidateVotes.dsSitTotTurno} = 'ELEITO' then 1 end)::int`,
    })
    .from(tseCandidateVotes)
    .where(eq(tseCandidateVotes.nrPartido, party.number))
    .groupBy(tseCandidateVotes.anoEleicao)
    .orderBy(desc(tseCandidateVotes.anoEleicao))
    .limit(5);

    return {
      ...party,
      candidateCount,
      totalVotes,
      recentScenarios: recentScenariosResult.map(s => ({ id: s.id, name: s.name, votes: s.votes })),
      historicalPerformance: historicalResult.map(h => ({ 
        year: h.year || 0, 
        votes: h.votes, 
        seats: h.seats 
      })),
    };
  }

  async getCandidates(): Promise<Candidate[]> {
    return db.select().from(candidates).orderBy(candidates.number);
  }

  async getCandidate(id: number): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const [created] = await db.insert(candidates).values(candidate).returning();
    return created;
  }

  async updateCandidate(id: number, data: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const [candidate] = await db.update(candidates).set(data).where(eq(candidates.id, id)).returning();
    return candidate;
  }

  async deleteCandidate(id: number): Promise<boolean> {
    await db.delete(candidates).where(eq(candidates.id, id));
    return true;
  }

  async getCandidatesPaginated(options: PaginationOptions & { partyId?: number; position?: string; active?: boolean; tags?: string[] }): Promise<PaginatedResult<Candidate & { party?: Party }>> {
    const { page, limit, search, sortBy = "name", sortOrder = "asc", partyId, position, active, tags } = options;
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions: SQL[] = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(candidates.name, `%${search}%`),
          ilike(candidates.nickname, `%${search}%`)
        )!
      );
    }
    
    if (partyId !== undefined) {
      conditions.push(eq(candidates.partyId, partyId));
    }
    
    if (position) {
      conditions.push(eq(candidates.position, position));
    }
    
    if (active !== undefined) {
      conditions.push(eq(candidates.active, active));
    }

    // Get total count
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(candidates)
      .where(whereClause);
    const total = countResult[0]?.count || 0;

    // Get paginated data with party join
    const orderColumn = sortBy === "number" ? candidates.number :
                       sortBy === "position" ? candidates.position :
                       sortBy === "createdAt" ? candidates.createdAt : candidates.name;
    const orderDir = sortOrder === "desc" ? desc(orderColumn) : asc(orderColumn);

    const data = await db.select({
      id: candidates.id,
      name: candidates.name,
      nickname: candidates.nickname,
      number: candidates.number,
      partyId: candidates.partyId,
      position: candidates.position,
      biography: candidates.biography,
      notes: candidates.notes,
      tags: candidates.tags,
      active: candidates.active,
      createdAt: candidates.createdAt,
      updatedAt: candidates.updatedAt,
      createdBy: candidates.createdBy,
      party: parties,
    })
    .from(candidates)
    .leftJoin(parties, eq(candidates.partyId, parties.id))
    .where(whereClause)
    .orderBy(orderDir)
    .limit(limit)
    .offset(offset);

    return {
      data: data.map(d => ({
        ...d,
        party: d.party || undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCandidateWithDetails(id: number): Promise<CandidateWithDetails | undefined> {
    const candidate = await this.getCandidate(id);
    if (!candidate) return undefined;

    // Get party
    const party = await this.getParty(candidate.partyId);

    // Get total votes from TSE data
    const votesResult = await db.select({ total: sql<number>`coalesce(sum(qt_votos_nominais), 0)::int` })
      .from(tseCandidateVotes)
      .where(eq(tseCandidateVotes.nrCandidato, candidate.number));
    const totalVotes = votesResult[0]?.total || 0;

    // Get scenario participations
    const scenarioParticipations = await db.select({
      scenarioId: scenarios.id,
      scenarioName: scenarios.name,
      votes: scenarioCandidates.votes,
      elected: sql<boolean>`${scenarioCandidates.status} = 'elected'`,
    })
    .from(scenarioCandidates)
    .innerJoin(scenarios, eq(scenarioCandidates.scenarioId, scenarios.id))
    .where(eq(scenarioCandidates.candidateId, id))
    .orderBy(desc(scenarios.createdAt))
    .limit(10);

    // Get historical performance from TSE
    const historicalResult = await db.select({
      year: tseCandidateVotes.anoEleicao,
      votes: sql<number>`qt_votos_nominais`,
      position: tseCandidateVotes.dsCargo,
      result: tseCandidateVotes.dsSitTotTurno,
    })
    .from(tseCandidateVotes)
    .where(eq(tseCandidateVotes.nrCandidato, candidate.number))
    .orderBy(desc(tseCandidateVotes.anoEleicao))
    .limit(10);

    return {
      ...candidate,
      party,
      totalVotes,
      scenarioParticipations: scenarioParticipations.map(s => ({
        scenarioId: s.scenarioId,
        scenarioName: s.scenarioName,
        votes: s.votes,
        elected: s.elected,
      })),
      historicalPerformance: historicalResult.map(h => ({
        year: h.year || 0,
        votes: h.votes || 0,
        position: h.position || "",
        result: h.result || "",
      })),
    };
  }

  async getScenarios(): Promise<Scenario[]> {
    return db.select().from(scenarios).orderBy(desc(scenarios.createdAt));
  }

  async getScenario(id: number): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return scenario;
  }

  async createScenario(scenario: InsertScenario): Promise<Scenario> {
    const [created] = await db.insert(scenarios).values(scenario).returning();
    return created;
  }

  async updateScenario(id: number, data: Partial<InsertScenario>): Promise<Scenario | undefined> {
    const [scenario] = await db.update(scenarios).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(scenarios.id, id)).returning();
    return scenario;
  }

  async deleteScenario(id: number): Promise<boolean> {
    await db.delete(scenarios).where(eq(scenarios.id, id));
    return true;
  }

  async duplicateScenario(id: number, newName: string): Promise<Scenario> {
    const original = await this.getScenario(id);
    if (!original) throw new Error("Scenario not found");

    const [newScenario] = await db.insert(scenarios).values({
      name: newName,
      description: original.description,
      totalVoters: original.totalVoters,
      validVotes: original.validVotes,
      availableSeats: original.availableSeats,
      position: original.position,
      status: "draft",
      historicalYear: original.historicalYear,
      historicalUf: original.historicalUf,
      historicalMunicipio: original.historicalMunicipio,
    }).returning();

    const originalCandidates = await db.select().from(scenarioCandidates).where(eq(scenarioCandidates.scenarioId, id));
    if (originalCandidates.length > 0) {
      await db.insert(scenarioCandidates).values(
        originalCandidates.map(c => ({
          scenarioId: newScenario.id,
          candidateId: c.candidateId,
          partyId: c.partyId,
          ballotNumber: c.ballotNumber,
          nickname: c.nickname,
          votes: c.votes,
          status: c.status,
        }))
      );
    }

    const originalAlliances = await db.select().from(alliances).where(eq(alliances.scenarioId, id));
    for (const alliance of originalAlliances) {
      const [newAlliance] = await db.insert(alliances).values({
        scenarioId: newScenario.id,
        name: alliance.name,
        type: alliance.type,
      }).returning();

      const parties = await db.select().from(allianceParties).where(eq(allianceParties.allianceId, alliance.id));
      if (parties.length > 0) {
        await db.insert(allianceParties).values(
          parties.map(p => ({ allianceId: newAlliance.id, partyId: p.partyId }))
        );
      }
    }

    const originalVotes = await db.select().from(scenarioVotes).where(eq(scenarioVotes.scenarioId, id));
    if (originalVotes.length > 0) {
      await db.insert(scenarioVotes).values(
        originalVotes.map(v => ({
          scenarioId: newScenario.id,
          partyId: v.partyId,
          candidateId: v.candidateId,
          votes: v.votes,
        }))
      );
    }

    return newScenario;
  }

  async getSimulations(scenarioId?: number): Promise<Simulation[]> {
    if (scenarioId) {
      return db.select().from(simulations).where(eq(simulations.scenarioId, scenarioId)).orderBy(desc(simulations.createdAt));
    }
    return db.select().from(simulations).orderBy(desc(simulations.createdAt));
  }

  async getRecentSimulations(limit = 5): Promise<Simulation[]> {
    return db.select().from(simulations).orderBy(desc(simulations.createdAt)).limit(limit);
  }

  async getSimulation(id: number): Promise<Simulation | undefined> {
    const [simulation] = await db.select().from(simulations).where(eq(simulations.id, id));
    return simulation;
  }

  async createSimulation(simulation: InsertSimulation): Promise<Simulation> {
    const [created] = await db.insert(simulations).values(simulation).returning();
    return created;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
  }

  async getStats(): Promise<{ parties: number; candidates: number; scenarios: number; simulations: number }> {
    const [partiesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(parties);
    const [candidatesCount] = await db.select({ count: sql<number>`count(*)::int` }).from(candidates);
    const [scenariosCount] = await db.select({ count: sql<number>`count(*)::int` }).from(scenarios);
    const [simulationsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(simulations);

    return {
      parties: partiesCount?.count || 0,
      candidates: candidatesCount?.count || 0,
      scenarios: scenariosCount?.count || 0,
      simulations: simulationsCount?.count || 0,
    };
  }

  async getActivityTrend(days: number = 7): Promise<{ day: string; simulacoes: number; cenarios: number }[]> {
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const result: { day: string; simulacoes: number; cenarios: number }[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Count scenarios created on this day
      const [scenariosOnDay] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scenarios)
        .where(and(
          sql`${scenarios.createdAt} >= ${date.toISOString()}`,
          sql`${scenarios.createdAt} < ${nextDate.toISOString()}`
        ));
      
      // Count simulations created on this day
      const [simulationsOnDay] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(simulations)
        .where(and(
          sql`${simulations.createdAt} >= ${date.toISOString()}`,
          sql`${simulations.createdAt} < ${nextDate.toISOString()}`
        ));
      
      result.push({
        day: dayNames[date.getDay()],
        simulacoes: simulationsOnDay?.count || 0,
        cenarios: scenariosOnDay?.count || 0,
      });
    }
    
    return result;
  }

  async getScenarioVotes(scenarioId: number): Promise<ScenarioVote[]> {
    return db.select().from(scenarioVotes).where(eq(scenarioVotes.scenarioId, scenarioId));
  }

  async saveScenarioVotes(scenarioId: number, votes: InsertScenarioVote[]): Promise<ScenarioVote[]> {
    return db.transaction(async (tx) => {
      if (votes.length === 0) {
        await tx.delete(scenarioVotes).where(eq(scenarioVotes.scenarioId, scenarioId));
        return [];
      }

      const results: ScenarioVote[] = [];
      for (const vote of votes) {
        const existing = await tx.select().from(scenarioVotes).where(
          and(
            eq(scenarioVotes.scenarioId, scenarioId),
            eq(scenarioVotes.partyId, vote.partyId),
            vote.candidateId
              ? eq(scenarioVotes.candidateId, vote.candidateId)
              : sql`${scenarioVotes.candidateId} IS NULL`
          )
        );

        if (existing.length > 0) {
          const [updated] = await tx.update(scenarioVotes)
            .set({ votes: vote.votes })
            .where(eq(scenarioVotes.id, existing[0].id))
            .returning();
          results.push(updated);
        } else {
          const [created] = await tx.insert(scenarioVotes)
            .values({ ...vote, scenarioId })
            .returning();
          results.push(created);
        }
      }

      const incomingKeys = new Set(votes.map(v =>
        `${v.partyId}-${v.candidateId ?? 'null'}`
      ));
      const allExisting = await tx.select().from(scenarioVotes)
        .where(eq(scenarioVotes.scenarioId, scenarioId));
      for (const row of allExisting) {
        const key = `${row.partyId}-${row.candidateId ?? 'null'}`;
        if (!incomingKeys.has(key)) {
          await tx.delete(scenarioVotes).where(eq(scenarioVotes.id, row.id));
        }
      }

      return results;
    });
  }

  async deleteScenarioVotes(scenarioId: number): Promise<boolean> {
    await db.delete(scenarioVotes).where(eq(scenarioVotes.scenarioId, scenarioId));
    return true;
  }

  async getAlliances(scenarioId: number): Promise<Alliance[]> {
    return db.select().from(alliances).where(eq(alliances.scenarioId, scenarioId)).orderBy(alliances.name);
  }

  async getAlliance(id: number): Promise<Alliance | undefined> {
    const [alliance] = await db.select().from(alliances).where(eq(alliances.id, id));
    return alliance;
  }

  async createAlliance(alliance: InsertAlliance): Promise<Alliance> {
    const [created] = await db.insert(alliances).values(alliance).returning();
    return created;
  }

  async updateAlliance(id: number, data: Partial<InsertAlliance>): Promise<Alliance | undefined> {
    const [updated] = await db.update(alliances).set(data).where(eq(alliances.id, id)).returning();
    return updated;
  }

  async deleteAlliance(id: number): Promise<boolean> {
    await db.delete(alliances).where(eq(alliances.id, id));
    return true;
  }

  async getAllianceParties(allianceId: number): Promise<AllianceParty[]> {
    return db.select().from(allianceParties).where(eq(allianceParties.allianceId, allianceId));
  }

  async setAllianceParties(allianceId: number, partyIds: number[]): Promise<AllianceParty[]> {
    return db.transaction(async (tx) => {
      const existing = await tx.select().from(allianceParties).where(eq(allianceParties.allianceId, allianceId));
      const existingPartyIds = new Set(existing.map(e => e.partyId));
      const desiredPartyIds = new Set(partyIds);

      const toRemove = existing.filter(e => !desiredPartyIds.has(e.partyId));
      for (const item of toRemove) {
        await tx.delete(allianceParties).where(eq(allianceParties.id, item.id));
      }

      const toAdd = partyIds.filter(pid => !existingPartyIds.has(pid));
      if (toAdd.length > 0) {
        await tx.insert(allianceParties).values(toAdd.map(partyId => ({ allianceId, partyId }))).returning();
      }

      return tx.select().from(allianceParties).where(eq(allianceParties.allianceId, allianceId));
    });
  }

  async getPartyAlliance(scenarioId: number, partyId: number): Promise<Alliance | undefined> {
    const result = await db
      .select({ alliance: alliances })
      .from(allianceParties)
      .innerJoin(alliances, eq(allianceParties.allianceId, alliances.id))
      .where(and(eq(allianceParties.partyId, partyId), eq(alliances.scenarioId, scenarioId)));
    return result[0]?.alliance;
  }

  async seedDefaultAdmin(): Promise<void> {
    const existingAdmin = await this.getUserByUsername("admin");
    if (!existingAdmin) {
      await this.createUser({
        username: "admin",
        password: "admin123",
        name: "Administrador",
        email: "admin@simulavoto.gov.br",
        role: "admin",
        active: true,
      });
    }
  }

  async getTseImportJobs(): Promise<TseImportJob[]> {
    return db.select().from(tseImportJobs).orderBy(desc(tseImportJobs.createdAt));
  }

  async getTseImportJob(id: number): Promise<TseImportJob | undefined> {
    const [job] = await db.select().from(tseImportJobs).where(eq(tseImportJobs.id, id));
    return job;
  }

  async findExistingImport(
    filename: string, 
    electionYear?: number | null, 
    uf?: string | null,
    electionType?: string | null
  ): Promise<{ job: TseImportJob; isInProgress: boolean } | undefined> {
    const filenameCondition = eq(tseImportJobs.filename, filename);
    
    const baseConditions = [filenameCondition];
    
    if (electionYear) {
      baseConditions.push(eq(tseImportJobs.electionYear, electionYear));
    }
    
    if (uf) {
      baseConditions.push(eq(tseImportJobs.uf, uf));
    }

    if (electionType) {
      baseConditions.push(eq(tseImportJobs.electionType, electionType));
    }
    
    const inProgressStatuses = ["pending", "downloading", "extracting", "running"];
    
    const [inProgressJob] = await db.select()
      .from(tseImportJobs)
      .where(and(
        ...baseConditions,
        sql`${tseImportJobs.status} IN ('pending', 'downloading', 'extracting', 'running')`
      ))
      .orderBy(desc(tseImportJobs.createdAt))
      .limit(1);
    
    if (inProgressJob) {
      return { job: inProgressJob, isInProgress: true };
    }
    
    const [completedJob] = await db.select()
      .from(tseImportJobs)
      .where(and(
        ...baseConditions,
        eq(tseImportJobs.status, "completed")
      ))
      .orderBy(desc(tseImportJobs.completedAt))
      .limit(1);
    
    if (completedJob) {
      return { job: completedJob, isInProgress: false };
    }
    
    return undefined;
  }

  async createTseImportJob(job: InsertTseImportJob): Promise<TseImportJob> {
    const [created] = await db.insert(tseImportJobs).values(job).returning();
    return created;
  }

  async updateTseImportJob(id: number, data: Partial<InsertTseImportJob>): Promise<TseImportJob | undefined> {
    const [updated] = await db.update(tseImportJobs).set(data).where(eq(tseImportJobs.id, id)).returning();
    return updated;
  }

  async getTseImportErrors(jobId: number): Promise<TseImportError[]> {
    return db.select().from(tseImportErrors).where(eq(tseImportErrors.importJobId, jobId)).orderBy(tseImportErrors.rowNumber);
  }

  async createTseImportError(error: InsertTseImportError): Promise<TseImportError> {
    const [created] = await db.insert(tseImportErrors).values(error).returning();
    return created;
  }

  async bulkInsertTseCandidateVotes(votes: InsertTseCandidateVote[]): Promise<number> {
    if (votes.length === 0) return 0;
    
    const NUM_COLUMNS = 54;
    const BATCH_SIZE = Math.floor(65000 / NUM_COLUMNS * 0.9);
    let totalInserted = 0;
    
    for (let i = 0; i < votes.length; i += BATCH_SIZE) {
      const batch = votes.slice(i, i + BATCH_SIZE);
      totalInserted += await this._insertBatchWithSplit("tseCandidateVotes", tseCandidateVotes, batch);
    }
    
    return totalInserted;
  }

  private async _insertBatchWithSplit(tableName: string, table: any, records: any[]): Promise<number> {
    if (records.length === 0) return 0;
    try {
      await db.insert(table)
        .values(records)
        .onConflictDoNothing();
      return records.length;
    } catch (err: any) {
      const isParamError = err.message?.includes("bind") || err.message?.includes("parameters") || err.message?.includes("stack") || err.message?.includes("65535");
      if (records.length <= 1) {
        console.warn(`[${tableName}] Single record insert failed:`, err.message);
        return 0;
      }
      if (isParamError || records.length > 50) {
        const mid = Math.ceil(records.length / 2);
        const left = await this._insertBatchWithSplit(tableName, table, records.slice(0, mid));
        const right = await this._insertBatchWithSplit(tableName, table, records.slice(mid));
        return left + right;
      }
      console.warn(`[${tableName}] Batch of ${records.length} failed (non-param error):`, err.message);
      return 0;
    }
  }

  async insertTseElectoralStatisticsBatch(records: InsertTseElectoralStatistics[]): Promise<number> {
    if (records.length === 0) return 0;
    
    const NUM_COLUMNS = 47;
    const BATCH_SIZE = Math.floor(65000 / NUM_COLUMNS * 0.9);
    let totalInserted = 0;
    
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      totalInserted += await this._insertBatchWithSplit("tseElectoralStatistics", tseElectoralStatistics, batch);
    }
    
    return totalInserted;
  }

  async insertTsePartyVotesBatch(records: InsertTsePartyVotes[]): Promise<number> {
    if (records.length === 0) return 0;
    
    const NUM_COLUMNS = 41;
    const BATCH_SIZE = Math.floor(65000 / NUM_COLUMNS * 0.9);
    let totalInserted = 0;
    
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      totalInserted += await this._insertBatchWithSplit("tsePartyVotes", tsePartyVotes, batch);
    }
    
    return totalInserted;
  }

  async getElectoralStatisticsSummary(filters: {
    anoEleicao?: number;
    sgUf?: string;
    cdCargo?: number;
    cdMunicipio?: number;
    nrTurno?: number;
  }): Promise<any> {
    const conditions: SQL[] = [];
    if (filters.anoEleicao) conditions.push(eq(tseElectoralStatistics.anoEleicao, filters.anoEleicao));
    if (filters.sgUf) conditions.push(eq(tseElectoralStatistics.sgUf, filters.sgUf));
    if (filters.cdCargo) conditions.push(eq(tseElectoralStatistics.cdCargo, filters.cdCargo));
    if (filters.cdMunicipio) conditions.push(eq(tseElectoralStatistics.cdMunicipio, filters.cdMunicipio));
    // Default to turno 1 if not specified to avoid double-counting voters
    const turno = filters.nrTurno ?? 1;
    conditions.push(eq(tseElectoralStatistics.nrTurno, turno));

    const result = await db.select({
      anoEleicao: tseElectoralStatistics.anoEleicao,
      sgUf: tseElectoralStatistics.sgUf,
      cdCargo: tseElectoralStatistics.cdCargo,
      dsCargo: tseElectoralStatistics.dsCargo,
      nrTurno: tseElectoralStatistics.nrTurno,
      totalAptos: sql<number>`SUM(${tseElectoralStatistics.qtAptos})::int`,
      totalComparecimento: sql<number>`SUM(${tseElectoralStatistics.qtComparecimento})::int`,
      totalAbstencoes: sql<number>`SUM(${tseElectoralStatistics.qtAbstencoes})::int`,
      totalVotosValidos: sql<number>`SUM(${tseElectoralStatistics.qtTotalVotosValidos})::int`,
      totalVotosBrancos: sql<number>`SUM(${tseElectoralStatistics.qtVotosBrancos})::int`,
      totalVotosNulos: sql<number>`SUM(${tseElectoralStatistics.qtTotalVotosNulos})::int`,
      totalVotosLegenda: sql<number>`SUM(${tseElectoralStatistics.qtTotalVotosLegValidos})::int`,
      totalVotosNominais: sql<number>`SUM(${tseElectoralStatistics.qtVotosNominaisValidos})::int`,
    })
    .from(tseElectoralStatistics)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(
      tseElectoralStatistics.anoEleicao, 
      tseElectoralStatistics.sgUf, 
      tseElectoralStatistics.cdCargo, 
      tseElectoralStatistics.dsCargo,
      tseElectoralStatistics.nrTurno
    );

    return result;
  }

  async getAvailableHistoricalElections(): Promise<Array<{
    year: number;
    states: string[];
    cargos: Array<{ code: number; name: string }>;
  }>> {
    const yearsResult = await db.selectDistinct({
      year: tseElectoralStatistics.anoEleicao,
    }).from(tseElectoralStatistics).where(sql`${tseElectoralStatistics.anoEleicao} IS NOT NULL`);

    const elections: Array<{
      year: number;
      states: string[];
      cargos: Array<{ code: number; name: string }>;
    }> = [];

    for (const { year } of yearsResult) {
      if (!year) continue;

      const statesResult = await db.selectDistinct({
        uf: tseElectoralStatistics.sgUf,
      }).from(tseElectoralStatistics).where(eq(tseElectoralStatistics.anoEleicao, year));

      const cargosResult = await db.selectDistinct({
        code: tseElectoralStatistics.cdCargo,
        name: tseElectoralStatistics.dsCargo,
      }).from(tseElectoralStatistics).where(eq(tseElectoralStatistics.anoEleicao, year));

      elections.push({
        year,
        states: statesResult.map(s => s.uf!).filter(Boolean).sort(),
        cargos: cargosResult.filter(c => c.code).map(c => ({ code: c.code!, name: c.name || "Unknown" })),
      });
    }

    return elections.sort((a, b) => b.year - a.year);
  }

  async getHistoricalPartyVotes(filters: {
    anoEleicao: number;
    sgUf?: string;
    cdCargo: number;
    cdMunicipio?: number;
  }): Promise<Array<{
    nrPartido: number;
    sgPartido: string;
    nmPartido: string | null;
    votosNominais: number;
    votosLegenda: number;
    totalVotos: number;
    federacao: string | null;
    coligacao: string | null;
  }>> {
    const conditions: SQL[] = [
      eq(tsePartyVotes.anoEleicao, filters.anoEleicao),
      eq(tsePartyVotes.cdCargo, filters.cdCargo),
    ];
    if (filters.sgUf) conditions.push(eq(tsePartyVotes.sgUf, filters.sgUf));
    if (filters.cdMunicipio) conditions.push(eq(tsePartyVotes.cdMunicipio, filters.cdMunicipio));

    const result = await db.select({
      nrPartido: tsePartyVotes.nrPartido,
      sgPartido: tsePartyVotes.sgPartido,
      nmPartido: tsePartyVotes.nmPartido,
      votosNominais: sql<number>`SUM(COALESCE(${tsePartyVotes.qtVotosNominaisValidos}, 0))::int`,
      votosLegenda: sql<number>`SUM(COALESCE(${tsePartyVotes.qtTotalVotosLegValidos}, 0))::int`,
      federacao: sql<string>`MAX(${tsePartyVotes.dsComposicaoFederacao})`,
      coligacao: sql<string>`MAX(${tsePartyVotes.dsComposicaoColigacao})`,
    })
    .from(tsePartyVotes)
    .where(and(...conditions))
    .groupBy(tsePartyVotes.nrPartido, tsePartyVotes.sgPartido, tsePartyVotes.nmPartido);

    return result.map(r => ({
      nrPartido: r.nrPartido,
      sgPartido: r.sgPartido,
      nmPartido: r.nmPartido,
      votosNominais: r.votosNominais || 0,
      votosLegenda: r.votosLegenda || 0,
      totalVotos: (r.votosNominais || 0) + (r.votosLegenda || 0),
      federacao: r.federacao,
      coligacao: r.coligacao,
    }));
  }

  async countTseCandidateVotesByJob(jobId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tseCandidateVotes)
      .where(eq(tseCandidateVotes.importJobId, jobId));
    return result[0]?.count || 0;
  }

  async countTseElectoralStatisticsByJob(jobId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tseElectoralStatistics)
      .where(eq(tseElectoralStatistics.importJobId, jobId));
    return result[0]?.count || 0;
  }

  async countTsePartyVotesByJob(jobId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tsePartyVotes)
      .where(eq(tsePartyVotes.importJobId, jobId));
    return result[0]?.count || 0;
  }

  async deleteTseCandidateVotesByJob(jobId: number): Promise<void> {
    await db.delete(tseCandidateVotes).where(eq(tseCandidateVotes.importJobId, jobId));
  }

  async deleteTsePartyVotesByJob(jobId: number): Promise<void> {
    await db.delete(tsePartyVotes).where(eq(tsePartyVotes.importJobId, jobId));
  }

  async deleteTseElectoralStatisticsByJob(jobId: number): Promise<void> {
    await db.delete(tseElectoralStatistics).where(eq(tseElectoralStatistics.importJobId, jobId));
  }

  async deleteTseImportErrorsByJob(jobId: number): Promise<void> {
    await db.delete(tseImportErrors).where(eq(tseImportErrors.importJobId, jobId));
  }

  async deleteValidationRunsByJob(jobId: number): Promise<void> {
    // First delete validation issues for all runs of this job
    const runs = await db.select({ id: importValidationRuns.id })
      .from(importValidationRuns)
      .where(eq(importValidationRuns.jobId, jobId));
    
    for (const run of runs) {
      await db.delete(importValidationIssues).where(eq(importValidationIssues.runId, run.id));
    }
    
    // Then delete the validation runs themselves
    await db.delete(importValidationRuns).where(eq(importValidationRuns.jobId, jobId));
  }

  async deleteTseImportJob(jobId: number): Promise<void> {
    await db.delete(tseImportJobs).where(eq(tseImportJobs.id, jobId));
  }

  async getTseCandidateVotes(filters: {
    year?: number;
    uf?: string;
    cargo?: number;
    limit: number;
    offset: number;
  }): Promise<TseCandidateVote[]> {
    let query = db.select().from(tseCandidateVotes);
    const conditions = [];
    if (filters.year) {
      conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    }
    if (filters.uf) {
      conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    }
    if (filters.cargo) {
      conditions.push(eq(tseCandidateVotes.cdCargo, filters.cargo));
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }
    return query.limit(filters.limit).offset(filters.offset);
  }

  async getTseStats(): Promise<{
    totalRecords: number;
    years: number[];
    ufs: string[];
    cargos: { code: number; name: string }[];
  }> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(tseCandidateVotes);
    const yearsResult = await db.selectDistinct({ year: tseCandidateVotes.anoEleicao }).from(tseCandidateVotes).where(sql`${tseCandidateVotes.anoEleicao} is not null`);
    const ufsResult = await db.selectDistinct({ uf: tseCandidateVotes.sgUf }).from(tseCandidateVotes).where(sql`${tseCandidateVotes.sgUf} is not null`);
    const cargosResult = await db.selectDistinct({ code: tseCandidateVotes.cdCargo, name: tseCandidateVotes.dsCargo }).from(tseCandidateVotes).where(sql`${tseCandidateVotes.cdCargo} is not null`);

    // Filter out "ZZ" (exterior/abroad votes) from UF count - Brazil has 27 UFs
    const validUfs = ufsResult.map(r => r.uf!).filter(uf => uf && uf !== 'ZZ').sort();

    return {
      totalRecords: Number(countResult[0]?.count || 0),
      years: yearsResult.map(r => r.year!).filter(Boolean).sort((a, b) => b - a),
      ufs: validUfs,
      cargos: cargosResult.filter(r => r.code && r.name).map(r => ({ code: r.code!, name: r.name! })),
    };
  }

  async searchTseCandidates(query: string, filters?: {
    year?: number;
    uf?: string;
    cargo?: number;
  }): Promise<{
    nmCandidato: string | null;
    nmUrnaCandidato: string | null;
    nrCandidato: number | null;
    sgPartido: string | null;
    nmPartido: string | null;
    nrPartido: number | null;
    anoEleicao: number | null;
    sgUf: string | null;
    dsCargo: string | null;
    qtVotosNominais: number | null;
  }[]> {
    const conditions = [
      sql`(LOWER(${tseCandidateVotes.nmCandidato}) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(${tseCandidateVotes.nmUrnaCandidato}) LIKE ${'%' + query.toLowerCase() + '%'})`
    ];
    
    if (filters?.year) {
      conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    }
    if (filters?.uf) {
      conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    }
    if (filters?.cargo) {
      conditions.push(eq(tseCandidateVotes.cdCargo, filters.cargo));
    }

    // Agrupa por candidato e soma votos
    const results = await db
      .select({
        nmCandidato: tseCandidateVotes.nmCandidato,
        nmUrnaCandidato: tseCandidateVotes.nmUrnaCandidato,
        nrCandidato: tseCandidateVotes.nrCandidato,
        sgPartido: tseCandidateVotes.sgPartido,
        nmPartido: tseCandidateVotes.nmPartido,
        nrPartido: tseCandidateVotes.nrPartido,
        anoEleicao: tseCandidateVotes.anoEleicao,
        sgUf: tseCandidateVotes.sgUf,
        dsCargo: tseCandidateVotes.dsCargo,
        qtVotosNominais: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .groupBy(
        tseCandidateVotes.nmCandidato,
        tseCandidateVotes.nmUrnaCandidato,
        tseCandidateVotes.nrCandidato,
        tseCandidateVotes.sgPartido,
        tseCandidateVotes.nmPartido,
        tseCandidateVotes.nrPartido,
        tseCandidateVotes.anoEleicao,
        tseCandidateVotes.sgUf,
        tseCandidateVotes.dsCargo
      )
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(20);

    return results;
  }

  async getScenarioCandidates(scenarioId: number): Promise<(ScenarioCandidate & { candidate: Candidate; party: Party })[]> {
    const results = await db
      .select({
        scenarioCandidate: scenarioCandidates,
        candidate: candidates,
        party: parties,
      })
      .from(scenarioCandidates)
      .innerJoin(candidates, eq(scenarioCandidates.candidateId, candidates.id))
      .innerJoin(parties, eq(scenarioCandidates.partyId, parties.id))
      .where(eq(scenarioCandidates.scenarioId, scenarioId))
      .orderBy(scenarioCandidates.ballotNumber);

    return results.map((r) => ({
      ...r.scenarioCandidate,
      candidate: r.candidate,
      party: r.party,
    }));
  }

  async getScenarioCandidate(id: number): Promise<ScenarioCandidate | undefined> {
    const [result] = await db.select().from(scenarioCandidates).where(eq(scenarioCandidates.id, id));
    return result;
  }

  async createScenarioCandidate(data: InsertScenarioCandidate): Promise<ScenarioCandidate> {
    const [created] = await db.insert(scenarioCandidates).values(data).returning();
    return created;
  }

  async updateScenarioCandidate(id: number, data: Partial<InsertScenarioCandidate>): Promise<ScenarioCandidate | undefined> {
    const [updated] = await db.update(scenarioCandidates).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(scenarioCandidates.id, id)).returning();
    return updated;
  }

  async deleteScenarioCandidate(id: number): Promise<boolean> {
    const result = await db.delete(scenarioCandidates).where(eq(scenarioCandidates.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async addCandidateToScenario(scenarioId: number, candidateId: number, partyId: number, ballotNumber: number, nickname?: string, votes?: number): Promise<ScenarioCandidate> {
    return this.createScenarioCandidate({
      scenarioId,
      candidateId,
      partyId,
      ballotNumber,
      nickname,
      status: "active",
      votes: votes ?? 0,
    });
  }

  // Analytics methods
  async getAnalyticsSummary(filters: { year?: number; uf?: string; electionType?: string }): Promise<{
    totalVotes: number;
    totalCandidates: number;
    totalParties: number;
    totalMunicipalities: number;
  }> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [result] = await db
      .select({
        totalVotes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        totalCandidates: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
        totalParties: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sgPartido})`,
        totalMunicipalities: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.cdMunicipio})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause);

    return {
      totalVotes: Number(result?.totalVotes ?? 0),
      totalCandidates: Number(result?.totalCandidates ?? 0),
      totalParties: Number(result?.totalParties ?? 0),
      totalMunicipalities: Number(result?.totalMunicipalities ?? 0),
    };
  }

  async getVotesByParty(filters: { year?: number; uf?: string; electionType?: string; limit?: number }): Promise<{
    party: string;
    partyNumber: number | null;
    votes: number;
    candidateCount: number;
  }[]> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        party: tseCandidateVotes.sgPartido,
        partyNumber: tseCandidateVotes.nrPartido,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(tseCandidateVotes.sgPartido, tseCandidateVotes.nrPartido)
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 20);

    return results.map((r) => ({
      party: r.party || "N/A",
      partyNumber: r.partyNumber,
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
    }));
  }

  async getTopCandidates(filters: { year?: number; uf?: string; electionType?: string; limit?: number }): Promise<{
    name: string;
    nickname: string | null;
    party: string | null;
    number: number | null;
    state: string | null;
    position: string | null;
    votes: number;
  }[]> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        name: tseCandidateVotes.nmCandidato,
        nickname: tseCandidateVotes.nmUrnaCandidato,
        party: tseCandidateVotes.sgPartido,
        number: tseCandidateVotes.nrCandidato,
        state: tseCandidateVotes.sgUf,
        position: tseCandidateVotes.dsCargo,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(
        tseCandidateVotes.nmCandidato,
        tseCandidateVotes.nmUrnaCandidato,
        tseCandidateVotes.sgPartido,
        tseCandidateVotes.nrCandidato,
        tseCandidateVotes.sgUf,
        tseCandidateVotes.dsCargo
      )
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 20);

    return results.map((r) => ({
      name: r.name || "N/A",
      nickname: r.nickname,
      party: r.party,
      number: r.number,
      state: r.state,
      position: r.position,
      votes: Number(r.votes),
    }));
  }

  async getVotesByState(filters: { year?: number; electionType?: string }): Promise<{
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]> {
    const conditions: any[] = [
      sql`${tseCandidateVotes.sgUf} IS NOT NULL`,
      sql`${tseCandidateVotes.sgUf} != 'ZZ'` // Exclude exterior votes
    ];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));

    const whereClause = and(...conditions);

    const results = await db
      .select({
        state: tseCandidateVotes.sgUf,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
        partyCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sgPartido})`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(tseCandidateVotes.sgUf)
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`);

    return results.map((r) => ({
      state: r.state || "N/A",
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
      partyCount: Number(r.partyCount),
    }));
  }

  async getVotesByMunicipality(filters: { year?: number; uf?: string; electionType?: string; position?: string; party?: string; municipality?: string; limit?: number }): Promise<{
    municipality: string;
    municipalityCode: number;
    state: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]> {
    const conditions: SQL[] = [
      sql`${tseCandidateVotes.sgUf} != 'ZZ'` // Exclude exterior votes
    ];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));
    if (filters.position) conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));
    if (filters.party) conditions.push(eq(tseCandidateVotes.sgPartido, filters.party));
    if (filters.municipality) conditions.push(eq(tseCandidateVotes.nmMunicipio, filters.municipality));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select({
        municipality: tseCandidateVotes.nmMunicipio,
        municipalityCode: tseCandidateVotes.cdMunicipio,
        state: tseCandidateVotes.sgUf,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)::int`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})::int`,
        partyCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sgPartido})::int`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(tseCandidateVotes.nmMunicipio, tseCandidateVotes.cdMunicipio, tseCandidateVotes.sgUf)
      .orderBy(sql`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0) DESC`)
      .limit(filters.limit ?? 50);

    return results.map((r) => ({
      municipality: r.municipality || "N/A",
      municipalityCode: r.municipalityCode || 0,
      state: r.state || "N/A",
      votes: r.votes,
      candidateCount: r.candidateCount,
      partyCount: r.partyCount,
    }));
  }

  async getAvailableElectionYears(): Promise<number[]> {
    const results = await db
      .selectDistinct({ year: tseCandidateVotes.anoEleicao })
      .from(tseCandidateVotes)
      .where(sql`${tseCandidateVotes.anoEleicao} IS NOT NULL`)
      .orderBy(sql`${tseCandidateVotes.anoEleicao} DESC`);

    return results.map((r) => r.year!).filter(Boolean);
  }

  async getAvailableStates(year?: number): Promise<string[]> {
    const conditions: any[] = [
      sql`${tseCandidateVotes.sgUf} IS NOT NULL`,
      sql`${tseCandidateVotes.sgUf} != 'ZZ'` // Exclude exterior votes
    ];
    if (year) conditions.push(eq(tseCandidateVotes.anoEleicao, year));

    const results = await db
      .selectDistinct({ state: tseCandidateVotes.sgUf })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.sgUf);

    return results.map((r) => r.state!).filter(Boolean);
  }

  async getAvailableElectionTypes(year?: number): Promise<string[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.nmTipoEleicao} IS NOT NULL`];
    if (year) conditions.push(eq(tseCandidateVotes.anoEleicao, year));

    const results = await db
      .selectDistinct({ type: tseCandidateVotes.nmTipoEleicao })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.nmTipoEleicao);

    return results.map((r) => r.type!).filter(Boolean);
  }

  async getAvailablePositions(filters: { year?: number; uf?: string }): Promise<string[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.dsCargo} IS NOT NULL`];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));

    const results = await db
      .selectDistinct({ position: tseCandidateVotes.dsCargo })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.dsCargo);

    return results.map((r) => r.position!).filter(Boolean);
  }

  async getAvailableParties(filters: { year?: number; uf?: string }): Promise<{ party: string; number: number }[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.sgPartido} IS NOT NULL`];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));

    const results = await db
      .selectDistinct({ 
        party: tseCandidateVotes.sgPartido,
        number: tseCandidateVotes.nrPartido
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(tseCandidateVotes.sgPartido);

    return results.filter(r => r.party).map(r => ({ party: r.party!, number: r.number || 0 }));
  }

  // Drill-down analytics methods
  async getCandidatesByParty(filters: {
    year?: number;
    uf?: string;
    party: string;
    position?: string;
    limit?: number;
  }): Promise<{
    name: string;
    nickname: string | null;
    number: number | null;
    votes: number;
    municipality: string | null;
    state: string | null;
    position: string | null;
    result: string | null;
  }[]> {
    const conditions: any[] = [eq(tseCandidateVotes.sgPartido, filters.party)];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.position) conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));

    const results = await db
      .select({
        name: tseCandidateVotes.nmCandidato,
        nickname: tseCandidateVotes.nmUrnaCandidato,
        number: tseCandidateVotes.nrCandidato,
        votes: sql<number>`COALESCE(${tseCandidateVotes.qtVotosNominais}, 0)`,
        municipality: tseCandidateVotes.nmMunicipio,
        state: tseCandidateVotes.sgUf,
        position: tseCandidateVotes.dsCargo,
        result: tseCandidateVotes.dsSitTotTurno,
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .orderBy(sql`COALESCE(${tseCandidateVotes.qtVotosNominais}, 0) DESC`)
      .limit(filters.limit ?? 100);

    return results.map(r => ({
      name: r.name || "N/A",
      nickname: r.nickname,
      number: r.number,
      votes: Number(r.votes),
      municipality: r.municipality,
      state: r.state,
      position: r.position,
      result: r.result,
    }));
  }

  async getPartyPerformanceByState(filters: {
    year?: number;
    party?: string;
    position?: string;
  }): Promise<{
    state: string;
    party: string;
    votes: number;
    candidateCount: number;
    percentage: number;
  }[]> {
    const conditions: any[] = [
      sql`${tseCandidateVotes.sgUf} IS NOT NULL`,
      sql`${tseCandidateVotes.sgPartido} IS NOT NULL`,
    ];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.party) conditions.push(eq(tseCandidateVotes.sgPartido, filters.party));
    if (filters.position) conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));

    const results = await db
      .select({
        state: tseCandidateVotes.sgUf,
        party: tseCandidateVotes.sgPartido,
        votes: sql<number>`SUM(COALESCE(${tseCandidateVotes.qtVotosNominais}, 0))`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .groupBy(tseCandidateVotes.sgUf, tseCandidateVotes.sgPartido)
      .orderBy(sql`SUM(COALESCE(${tseCandidateVotes.qtVotosNominais}, 0)) DESC`);

    const totalByState: Record<string, number> = {};
    results.forEach(r => {
      if (r.state) {
        totalByState[r.state] = (totalByState[r.state] || 0) + Number(r.votes);
      }
    });

    return results.filter(r => r.state && r.party).map(r => ({
      state: r.state!,
      party: r.party!,
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
      percentage: totalByState[r.state!] > 0 
        ? (Number(r.votes) / totalByState[r.state!]) * 100 
        : 0,
    }));
  }

  async getVotesByPosition(filters: {
    year?: number;
    uf?: string;
  }): Promise<{
    position: string;
    votes: number;
    candidateCount: number;
    partyCount: number;
  }[]> {
    const conditions: any[] = [sql`${tseCandidateVotes.dsCargo} IS NOT NULL`];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));

    const results = await db
      .select({
        position: tseCandidateVotes.dsCargo,
        votes: sql<number>`SUM(COALESCE(${tseCandidateVotes.qtVotosNominais}, 0))`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
        partyCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sgPartido})`,
      })
      .from(tseCandidateVotes)
      .where(and(...conditions))
      .groupBy(tseCandidateVotes.dsCargo)
      .orderBy(sql`SUM(COALESCE(${tseCandidateVotes.qtVotosNominais}, 0)) DESC`);

    return results.filter(r => r.position).map(r => ({
      position: r.position!,
      votes: Number(r.votes),
      candidateCount: Number(r.candidateCount),
      partyCount: Number(r.partyCount),
    }));
  }

  async getAdvancedAnalytics(filters: {
    year?: number;
    uf?: string;
    electionType?: string;
    position?: string;
    party?: string;
    minVotes?: number;
    maxVotes?: number;
    limit?: number;
  }): Promise<{
    candidates: {
      name: string;
      nickname: string | null;
      party: string | null;
      number: number | null;
      state: string | null;
      position: string | null;
      municipality: string | null;
      votes: number;
    }[];
    summary: {
      totalVotes: number;
      candidateCount: number;
      avgVotes: number;
    };
  }> {
    const conditions: any[] = [];
    if (filters.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters.electionType) conditions.push(eq(tseCandidateVotes.nmTipoEleicao, filters.electionType));
    if (filters.position) conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));
    if (filters.party) conditions.push(eq(tseCandidateVotes.sgPartido, filters.party));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const candidateResults = await db
      .select({
        name: tseCandidateVotes.nmCandidato,
        nickname: tseCandidateVotes.nmUrnaCandidato,
        party: tseCandidateVotes.sgPartido,
        number: tseCandidateVotes.nrCandidato,
        state: tseCandidateVotes.sgUf,
        position: tseCandidateVotes.dsCargo,
        municipality: tseCandidateVotes.nmMunicipio,
        votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
      })
      .from(tseCandidateVotes)
      .where(whereClause)
      .groupBy(
        tseCandidateVotes.nmCandidato,
        tseCandidateVotes.nmUrnaCandidato,
        tseCandidateVotes.sgPartido,
        tseCandidateVotes.nrCandidato,
        tseCandidateVotes.sgUf,
        tseCandidateVotes.dsCargo,
        tseCandidateVotes.nmMunicipio
      )
      .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
      .limit(filters.limit ?? 100);

    let candidates = candidateResults.map((r) => ({
      name: r.name || "N/A",
      nickname: r.nickname,
      party: r.party,
      number: r.number,
      state: r.state,
      position: r.position,
      municipality: r.municipality,
      votes: Number(r.votes),
    }));

    if (filters.minVotes !== undefined) {
      candidates = candidates.filter(c => c.votes >= filters.minVotes!);
    }
    if (filters.maxVotes !== undefined) {
      candidates = candidates.filter(c => c.votes <= filters.maxVotes!);
    }

    const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
    const candidateCount = candidates.length;
    const avgVotes = candidateCount > 0 ? Math.round(totalVotes / candidateCount) : 0;

    return {
      candidates,
      summary: { totalVotes, candidateCount, avgVotes },
    };
  }

  async getComparisonData(params: {
    years?: number[];
    states?: string[];
    groupBy: "party" | "state" | "position";
  }): Promise<{
    label: string;
    data: { key: string; votes: number; candidateCount: number }[];
  }[]> {
    const results: { label: string; data: { key: string; votes: number; candidateCount: number }[] }[] = [];

    if (params.years && params.years.length > 0) {
      for (const year of params.years) {
        let groupByField;
        if (params.groupBy === "party") groupByField = tseCandidateVotes.sgPartido;
        else if (params.groupBy === "state") groupByField = tseCandidateVotes.sgUf;
        else groupByField = tseCandidateVotes.dsCargo;

        const yearData = await db
          .select({
            key: groupByField,
            votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
            candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
          })
          .from(tseCandidateVotes)
          .where(eq(tseCandidateVotes.anoEleicao, year))
          .groupBy(groupByField)
          .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
          .limit(10);

        results.push({
          label: String(year),
          data: yearData.map(d => ({
            key: d.key || "N/A",
            votes: Number(d.votes),
            candidateCount: Number(d.candidateCount),
          })),
        });
      }
    }

    if (params.states && params.states.length > 0) {
      for (const state of params.states) {
        let groupByField;
        if (params.groupBy === "party") groupByField = tseCandidateVotes.sgPartido;
        else if (params.groupBy === "position") groupByField = tseCandidateVotes.dsCargo;
        else groupByField = tseCandidateVotes.anoEleicao;

        const stateData = await db
          .select({
            key: groupByField,
            votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)`,
            candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.sqCandidato})`,
          })
          .from(tseCandidateVotes)
          .where(eq(tseCandidateVotes.sgUf, state))
          .groupBy(groupByField)
          .orderBy(sql`SUM(${tseCandidateVotes.qtVotosNominais}) DESC`)
          .limit(10);

        results.push({
          label: state,
          data: stateData.map(d => ({
            key: String(d.key) || "N/A",
            votes: Number(d.votes),
            candidateCount: Number(d.candidateCount),
          })),
        });
      }
    }

    return results;
  }

  // Saved Reports CRUD
  async getSavedReports(userId?: string): Promise<SavedReport[]> {
    if (userId) {
      return db.select().from(savedReports).where(eq(savedReports.createdBy, userId)).orderBy(sql`${savedReports.updatedAt} DESC`);
    }
    return db.select().from(savedReports).orderBy(sql`${savedReports.updatedAt} DESC`);
  }

  async getSavedReportById(id: number): Promise<SavedReport | undefined> {
    const [report] = await db.select().from(savedReports).where(eq(savedReports.id, id));
    return report;
  }

  async createSavedReport(data: InsertSavedReport): Promise<SavedReport> {
    const [created] = await db.insert(savedReports).values(data).returning();
    return created;
  }

  async updateSavedReport(id: number, data: Partial<InsertSavedReport>): Promise<SavedReport | undefined> {
    const [updated] = await db
      .update(savedReports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(savedReports.id, id))
      .returning();
    return updated;
  }

  async deleteSavedReport(id: number): Promise<boolean> {
    const result = await db.delete(savedReports).where(eq(savedReports.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // AI Prediction caching methods
  async getAiPrediction(cacheKey: string): Promise<AiPrediction | undefined> {
    const [prediction] = await db
      .select()
      .from(aiPredictions)
      .where(eq(aiPredictions.cacheKey, cacheKey));
    return prediction;
  }

  async saveAiPrediction(data: { cacheKey: string; predictionType: string; prediction: unknown; expiresAt: Date }): Promise<AiPrediction> {
    // Delete existing prediction with same cache key
    await db.delete(aiPredictions).where(eq(aiPredictions.cacheKey, data.cacheKey));
    
    const [created] = await db
      .insert(aiPredictions)
      .values({
        cacheKey: data.cacheKey,
        predictionType: data.predictionType,
        prediction: data.prediction,
        validUntil: data.expiresAt,
      })
      .returning();
    return created;
  }

  async deleteExpiredAiPredictions(): Promise<number> {
    const result = await db
      .delete(aiPredictions)
      .where(sql`${aiPredictions.validUntil} < NOW()`);
    return result.rowCount ?? 0;
  }

  // Projection Reports CRUD
  async getProjectionReports(filters?: { status?: string; targetYear?: number; scope?: string }): Promise<ProjectionReportRecord[]> {
    let query = db.select().from(projectionReports);
    
    const conditions: SQL[] = [];
    if (filters?.status) {
      conditions.push(eq(projectionReports.status, filters.status));
    }
    if (filters?.targetYear) {
      conditions.push(eq(projectionReports.targetYear, filters.targetYear));
    }
    if (filters?.scope) {
      conditions.push(eq(projectionReports.scope, filters.scope));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query.orderBy(desc(projectionReports.createdAt));
  }

  async getProjectionReportById(id: number): Promise<ProjectionReportRecord | undefined> {
    const [report] = await db
      .select()
      .from(projectionReports)
      .where(eq(projectionReports.id, id));
    return report;
  }

  async createProjectionReport(data: InsertProjectionReport): Promise<ProjectionReportRecord> {
    const [report] = await db
      .insert(projectionReports)
      .values(data)
      .returning();
    return report;
  }

  async updateProjectionReport(id: number, data: Partial<InsertProjectionReport>): Promise<ProjectionReportRecord | undefined> {
    const [updated] = await db
      .update(projectionReports)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectionReports.id, id))
      .returning();
    return updated;
  }

  async deleteProjectionReport(id: number): Promise<boolean> {
    const result = await db
      .delete(projectionReports)
      .where(eq(projectionReports.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Validation Run methods
  async createValidationRun(data: InsertValidationRun): Promise<ValidationRunRecord> {
    const [run] = await db.insert(importValidationRuns).values(data).returning();
    return run;
  }

  async getValidationRun(id: number): Promise<ValidationRunRecord | undefined> {
    const [run] = await db
      .select()
      .from(importValidationRuns)
      .where(eq(importValidationRuns.id, id));
    return run;
  }

  async getValidationRunByJobId(jobId: number): Promise<ValidationRunRecord | undefined> {
    const [run] = await db
      .select()
      .from(importValidationRuns)
      .where(eq(importValidationRuns.jobId, jobId))
      .orderBy(desc(importValidationRuns.createdAt))
      .limit(1);
    return run;
  }

  async getValidationRunsForJob(jobId: number): Promise<ValidationRunRecord[]> {
    return db
      .select()
      .from(importValidationRuns)
      .where(eq(importValidationRuns.jobId, jobId))
      .orderBy(desc(importValidationRuns.createdAt));
  }

  async updateValidationRun(id: number, data: Partial<InsertValidationRun>): Promise<ValidationRunRecord | undefined> {
    const [updated] = await db
      .update(importValidationRuns)
      .set(data)
      .where(eq(importValidationRuns.id, id))
      .returning();
    return updated;
  }

  // Validation Issue methods
  async createValidationIssue(data: InsertValidationIssue): Promise<ValidationIssueRecord> {
    const [issue] = await db.insert(importValidationIssues).values(data).returning();
    return issue;
  }

  async createValidationIssues(data: InsertValidationIssue[]): Promise<ValidationIssueRecord[]> {
    if (data.length === 0) return [];
    return db.insert(importValidationIssues).values(data).returning();
  }

  async getValidationIssuesForRun(
    runId: number, 
    filters?: { type?: string; severity?: string; status?: string }
  ): Promise<ValidationIssueRecord[]> {
    const conditions: SQL[] = [eq(importValidationIssues.runId, runId)];
    
    if (filters?.type) {
      conditions.push(eq(importValidationIssues.type, filters.type));
    }
    if (filters?.severity) {
      conditions.push(eq(importValidationIssues.severity, filters.severity));
    }
    if (filters?.status) {
      conditions.push(eq(importValidationIssues.status, filters.status));
    }
    
    return db
      .select()
      .from(importValidationIssues)
      .where(and(...conditions))
      .orderBy(desc(importValidationIssues.createdAt));
  }

  async getValidationIssue(id: number): Promise<ValidationIssueRecord | undefined> {
    const [issue] = await db
      .select()
      .from(importValidationIssues)
      .where(eq(importValidationIssues.id, id));
    return issue;
  }

  async updateValidationIssue(id: number, data: Partial<InsertValidationIssue>): Promise<ValidationIssueRecord | undefined> {
    const [updated] = await db
      .update(importValidationIssues)
      .set(data)
      .where(eq(importValidationIssues.id, id))
      .returning();
    return updated;
  }

  async getValidationIssueCounts(runId: number): Promise<{ type: string; severity: string; count: number }[]> {
    const result = await db
      .select({
        type: importValidationIssues.type,
        severity: importValidationIssues.severity,
        count: sql<number>`count(*)::int`,
      })
      .from(importValidationIssues)
      .where(eq(importValidationIssues.runId, runId))
      .groupBy(importValidationIssues.type, importValidationIssues.severity);
    return result;
  }

  // Forecast methods
  async createForecastRun(data: InsertForecastRun): Promise<ForecastRun> {
    const [run] = await db.insert(forecastRuns).values(data).returning();
    return run;
  }

  async getForecastRun(id: number): Promise<ForecastRun | undefined> {
    const [run] = await db.select().from(forecastRuns).where(eq(forecastRuns.id, id));
    return run;
  }

  async getForecastRuns(filters?: { targetYear?: number; status?: string }): Promise<ForecastRun[]> {
    const conditions: SQL[] = [];
    
    if (filters?.targetYear) {
      conditions.push(eq(forecastRuns.targetYear, filters.targetYear));
    }
    if (filters?.status) {
      conditions.push(eq(forecastRuns.status, filters.status));
    }
    
    const query = conditions.length > 0
      ? db.select().from(forecastRuns).where(and(...conditions))
      : db.select().from(forecastRuns);
    
    return query.orderBy(desc(forecastRuns.createdAt));
  }

  async updateForecastRun(id: number, data: Partial<InsertForecastRun>): Promise<ForecastRun | undefined> {
    const [updated] = await db
      .update(forecastRuns)
      .set(data)
      .where(eq(forecastRuns.id, id))
      .returning();
    return updated;
  }

  async deleteForecastRun(id: number): Promise<boolean> {
    const result = await db.delete(forecastRuns).where(eq(forecastRuns.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async createForecastResult(data: InsertForecastResult): Promise<ForecastResult> {
    const [result] = await db.insert(forecastResults).values(data).returning();
    return result;
  }

  async createForecastResults(data: InsertForecastResult[]): Promise<ForecastResult[]> {
    if (data.length === 0) return [];
    return db.insert(forecastResults).values(data).returning();
  }

  async getForecastResults(runId: number, filters?: { resultType?: string; region?: string }): Promise<ForecastResult[]> {
    const conditions: SQL[] = [eq(forecastResults.runId, runId)];
    
    if (filters?.resultType) {
      conditions.push(eq(forecastResults.resultType, filters.resultType));
    }
    if (filters?.region) {
      conditions.push(eq(forecastResults.region, filters.region));
    }
    
    return db
      .select()
      .from(forecastResults)
      .where(and(...conditions))
      .orderBy(desc(forecastResults.predictedVoteShare));
  }

  async createSwingRegion(data: InsertSwingRegion): Promise<SwingRegion> {
    const [region] = await db.insert(forecastSwingRegions).values(data).returning();
    return region;
  }

  async createSwingRegions(data: InsertSwingRegion[]): Promise<SwingRegion[]> {
    if (data.length === 0) return [];
    return db.insert(forecastSwingRegions).values(data).returning();
  }

  async getSwingRegions(runId: number): Promise<SwingRegion[]> {
    return db
      .select()
      .from(forecastSwingRegions)
      .where(eq(forecastSwingRegions.runId, runId))
      .orderBy(desc(forecastSwingRegions.volatilityScore));
  }

  async getHistoricalVotesByParty(filters: { years: number[]; position?: string; state?: string }): Promise<{
    year: number;
    party: string;
    state: string | null;
    position: string | null;
    totalVotes: number;
    candidateCount: number;
  }[]> {
    const conditions: SQL[] = [];
    
    if (filters.years.length > 0) {
      conditions.push(sql`${tseCandidateVotes.anoEleicao} = ANY(${filters.years})`);
    }
    if (filters.position) {
      conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));
    }
    if (filters.state) {
      conditions.push(eq(tseCandidateVotes.sgUf, filters.state));
    }
    
    const result = await db
      .select({
        year: tseCandidateVotes.anoEleicao,
        party: tseCandidateVotes.sgPartido,
        state: tseCandidateVotes.sgUf,
        position: tseCandidateVotes.dsCargo,
        totalVotes: sql<number>`SUM(${tseCandidateVotes.qtVotosNominais})::int`,
        candidateCount: sql<number>`COUNT(DISTINCT ${tseCandidateVotes.nrCandidato})::int`,
      })
      .from(tseCandidateVotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(
        tseCandidateVotes.anoEleicao, 
        tseCandidateVotes.sgPartido, 
        tseCandidateVotes.sgUf, 
        tseCandidateVotes.dsCargo
      )
      .orderBy(tseCandidateVotes.anoEleicao, desc(sql`SUM(${tseCandidateVotes.qtVotosNominais})`));
    
    return result.map(r => ({
      year: r.year || 0,
      party: r.party || "",
      state: r.state,
      position: r.position,
      totalVotes: r.totalVotes,
      candidateCount: r.candidateCount,
    }));
  }

  async getHistoricalTrends(filters: { party?: string; position?: string; state?: string }): Promise<{
    year: number;
    party: string;
    voteShare: number;
    seats?: number;
  }[]> {
    const conditions: SQL[] = [];
    
    if (filters.party) {
      conditions.push(eq(tseCandidateVotes.sgPartido, filters.party));
    }
    if (filters.position) {
      conditions.push(eq(tseCandidateVotes.dsCargo, filters.position));
    }
    if (filters.state) {
      conditions.push(eq(tseCandidateVotes.sgUf, filters.state));
    }
    
    const voteTotals = await db
      .select({
        year: tseCandidateVotes.anoEleicao,
        party: tseCandidateVotes.sgPartido,
        votes: sql<number>`SUM(${tseCandidateVotes.qtVotosNominais})::int`,
        totalVotesInYear: sql<number>`SUM(SUM(${tseCandidateVotes.qtVotosNominais})) OVER (PARTITION BY ${tseCandidateVotes.anoEleicao})::int`,
      })
      .from(tseCandidateVotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(tseCandidateVotes.anoEleicao, tseCandidateVotes.sgPartido)
      .orderBy(tseCandidateVotes.anoEleicao);
    
    return voteTotals.map(r => ({
      year: r.year || 0,
      party: r.party || "",
      voteShare: r.totalVotesInYear > 0 ? (r.votes / r.totalVotesInYear) * 100 : 0,
    }));
  }

  // Prediction Scenario methods
  async getPredictionScenarios(filters?: { status?: string; targetYear?: number }): Promise<PredictionScenario[]> {
    const conditions: SQL[] = [];
    if (filters?.status) {
      conditions.push(eq(predictionScenarios.status, filters.status));
    }
    if (filters?.targetYear) {
      conditions.push(eq(predictionScenarios.targetYear, filters.targetYear));
    }
    return db.select()
      .from(predictionScenarios)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(predictionScenarios.createdAt));
  }

  async getPredictionScenario(id: number): Promise<PredictionScenario | undefined> {
    const [scenario] = await db.select().from(predictionScenarios).where(eq(predictionScenarios.id, id));
    return scenario;
  }

  async createPredictionScenario(data: InsertPredictionScenario): Promise<PredictionScenario> {
    const [created] = await db.insert(predictionScenarios).values(data).returning();
    return created;
  }

  async updatePredictionScenario(id: number, data: Partial<InsertPredictionScenario>): Promise<PredictionScenario | undefined> {
    const [updated] = await db.update(predictionScenarios)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(predictionScenarios.id, id))
      .returning();
    return updated;
  }

  async deletePredictionScenario(id: number): Promise<boolean> {
    await db.delete(predictionScenarios).where(eq(predictionScenarios.id, id));
    return true;
  }

  // Report Template methods
  async getReportTemplates(): Promise<ReportTemplate[]> {
    return db.select().from(reportTemplates).orderBy(desc(reportTemplates.createdAt));
  }

  async getReportTemplate(id: number): Promise<ReportTemplate | undefined> {
    const [template] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id));
    return template;
  }

  async createReportTemplate(data: InsertReportTemplate): Promise<ReportTemplate> {
    const [created] = await db.insert(reportTemplates).values(data).returning();
    return created;
  }

  async updateReportTemplate(id: number, data: Partial<InsertReportTemplate>): Promise<ReportTemplate | undefined> {
    const [updated] = await db.update(reportTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reportTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteReportTemplate(id: number): Promise<boolean> {
    await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
    return true;
  }

  // Report Schedule methods
  async getReportSchedules(): Promise<ReportSchedule[]> {
    return db.select().from(reportSchedules).orderBy(desc(reportSchedules.createdAt));
  }

  async getReportSchedule(id: number): Promise<ReportSchedule | undefined> {
    const [schedule] = await db.select().from(reportSchedules).where(eq(reportSchedules.id, id));
    return schedule;
  }

  async getDueSchedules(): Promise<ReportSchedule[]> {
    const now = new Date();
    return db.select().from(reportSchedules)
      .where(and(
        eq(reportSchedules.isActive, true),
        sql`${reportSchedules.nextRunAt} <= ${now}`
      ));
  }

  async createReportSchedule(data: InsertReportSchedule): Promise<ReportSchedule> {
    const [created] = await db.insert(reportSchedules).values(data).returning();
    return created;
  }

  async updateReportSchedule(id: number, data: Partial<InsertReportSchedule>): Promise<ReportSchedule | undefined> {
    const [updated] = await db.update(reportSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reportSchedules.id, id))
      .returning();
    return updated;
  }

  async deleteReportSchedule(id: number): Promise<boolean> {
    await db.delete(reportSchedules).where(eq(reportSchedules.id, id));
    return true;
  }

  // Report Run methods
  async getReportRuns(filters?: { scheduleId?: number; templateId?: number; status?: string; limit?: number }): Promise<ReportRun[]> {
    const conditions: SQL[] = [];
    if (filters?.scheduleId) {
      conditions.push(eq(reportRuns.scheduleId, filters.scheduleId));
    }
    if (filters?.templateId) {
      conditions.push(eq(reportRuns.templateId, filters.templateId));
    }
    if (filters?.status) {
      conditions.push(eq(reportRuns.status, filters.status));
    }
    
    let query = db.select().from(reportRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(reportRuns.createdAt));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return query;
  }

  async getReportRun(id: number): Promise<ReportRun | undefined> {
    const [run] = await db.select().from(reportRuns).where(eq(reportRuns.id, id));
    return run;
  }

  async createReportRun(data: InsertReportRun): Promise<ReportRun> {
    const [created] = await db.insert(reportRuns).values(data).returning();
    return created;
  }

  async updateReportRun(id: number, data: Partial<InsertReportRun>): Promise<ReportRun | undefined> {
    const [updated] = await db.update(reportRuns)
      .set(data)
      .where(eq(reportRuns.id, id))
      .returning();
    return updated;
  }

  // Report Recipients methods
  async getReportRecipients(): Promise<ReportRecipient[]> {
    return db.select().from(reportRecipients).orderBy(reportRecipients.name);
  }

  async getReportRecipient(id: number): Promise<ReportRecipient | undefined> {
    const [recipient] = await db.select().from(reportRecipients).where(eq(reportRecipients.id, id));
    return recipient;
  }

  async createReportRecipient(data: InsertReportRecipient): Promise<ReportRecipient> {
    const [created] = await db.insert(reportRecipients).values(data).returning();
    return created;
  }

  async updateReportRecipient(id: number, data: Partial<InsertReportRecipient>): Promise<ReportRecipient | undefined> {
    const [updated] = await db.update(reportRecipients)
      .set(data)
      .where(eq(reportRecipients.id, id))
      .returning();
    return updated;
  }

  async deleteReportRecipient(id: number): Promise<boolean> {
    await db.delete(reportRecipients).where(eq(reportRecipients.id, id));
    return true;
  }

  // Import Batch methods
  async createImportBatch(data: InsertTseImportBatch): Promise<TseImportBatch> {
    const [batch] = await db.insert(tseImportBatches).values(data).returning();
    return batch;
  }

  async getImportBatches(jobId: number): Promise<TseImportBatch[]> {
    return db.select().from(tseImportBatches)
      .where(eq(tseImportBatches.importJobId, jobId))
      .orderBy(tseImportBatches.batchIndex);
  }

  async getImportBatch(batchId: number): Promise<TseImportBatch | undefined> {
    const [batch] = await db.select().from(tseImportBatches)
      .where(eq(tseImportBatches.id, batchId));
    return batch;
  }

  async updateImportBatch(batchId: number, data: Partial<InsertTseImportBatch>): Promise<TseImportBatch | undefined> {
    const [updated] = await db.update(tseImportBatches)
      .set(data)
      .where(eq(tseImportBatches.id, batchId))
      .returning();
    return updated;
  }

  async getFailedBatches(jobId: number): Promise<TseImportBatch[]> {
    return db.select().from(tseImportBatches)
      .where(and(
        eq(tseImportBatches.importJobId, jobId),
        eq(tseImportBatches.status, "failed")
      ))
      .orderBy(tseImportBatches.batchIndex);
  }

  async getBatchStats(jobId: number): Promise<{
    total: number;
    completed: number;
    failed: number;
    pending: number;
    processing: number;
    totalRows: number;
    processedRows: number;
    errorCount: number;
  }> {
    const batches = await this.getImportBatches(jobId);
    return {
      total: batches.length,
      completed: batches.filter(b => b.status === "completed").length,
      failed: batches.filter(b => b.status === "failed").length,
      pending: batches.filter(b => b.status === "pending").length,
      processing: batches.filter(b => b.status === "processing").length,
      totalRows: batches.reduce((sum, b) => sum + (b.totalRows || 0), 0),
      processedRows: batches.reduce((sum, b) => sum + (b.processedRows || 0), 0),
      errorCount: batches.reduce((sum, b) => sum + (b.errorCount || 0), 0),
    };
  }

  // Import Batch Row methods
  async createBatchRows(rows: InsertTseImportBatchRow[]): Promise<TseImportBatchRow[]> {
    if (rows.length === 0) return [];
    return db.insert(tseImportBatchRows).values(rows).returning();
  }

  async getBatchRows(batchId: number, status?: string): Promise<TseImportBatchRow[]> {
    const conditions = [eq(tseImportBatchRows.batchId, batchId)];
    if (status) {
      conditions.push(eq(tseImportBatchRows.status, status));
    }
    return db.select().from(tseImportBatchRows)
      .where(and(...conditions))
      .orderBy(tseImportBatchRows.rowNumber);
  }

  async getFailedBatchRows(batchId: number): Promise<TseImportBatchRow[]> {
    return this.getBatchRows(batchId, "failed");
  }

  async updateBatchRow(rowId: number, data: Partial<InsertTseImportBatchRow>): Promise<TseImportBatchRow | undefined> {
    const [updated] = await db.update(tseImportBatchRows)
      .set({ ...data, processedAt: new Date() })
      .where(eq(tseImportBatchRows.id, rowId))
      .returning();
    return updated;
  }

  async resetBatchRowsForReprocess(batchId: number): Promise<number> {
    const result = await db.update(tseImportBatchRows)
      .set({ status: "pending", errorType: null, errorMessage: null, processedAt: null })
      .where(and(
        eq(tseImportBatchRows.batchId, batchId),
        eq(tseImportBatchRows.status, "failed")
      ));
    return (result as any).rowCount || 0;
  }

  async deleteBatchesByJob(jobId: number): Promise<void> {
    await db.delete(tseImportBatches).where(eq(tseImportBatches.importJobId, jobId));
  }

  // Custom Dashboard methods
  async getCustomDashboards(userId?: string): Promise<CustomDashboard[]> {
    if (userId) {
      return db.select().from(customDashboards)
        .where(eq(customDashboards.userId, userId))
        .orderBy(desc(customDashboards.updatedAt));
    }
    return db.select().from(customDashboards).orderBy(desc(customDashboards.updatedAt));
  }

  async getCustomDashboard(id: number): Promise<CustomDashboard | undefined> {
    const [dashboard] = await db.select().from(customDashboards).where(eq(customDashboards.id, id));
    return dashboard;
  }

  async createCustomDashboard(data: InsertCustomDashboard): Promise<CustomDashboard> {
    const [dashboard] = await db.insert(customDashboards).values(data).returning();
    return dashboard;
  }

  async updateCustomDashboard(id: number, data: Partial<InsertCustomDashboard>): Promise<CustomDashboard | undefined> {
    const [updated] = await db.update(customDashboards)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customDashboards.id, id))
      .returning();
    return updated;
  }

  async deleteCustomDashboard(id: number): Promise<boolean> {
    const result = await db.delete(customDashboards).where(eq(customDashboards.id, id));
    return (result as any).rowCount > 0;
  }

  async getPublicDashboards(): Promise<CustomDashboard[]> {
    return db.select().from(customDashboards)
      .where(eq(customDashboards.isPublic, true))
      .orderBy(desc(customDashboards.updatedAt));
  }

  // AI Suggestions methods
  async getAiSuggestions(userId?: string, filters?: { type?: string; dismissed?: boolean }): Promise<AiSuggestion[]> {
    const conditions: SQL[] = [];
    if (userId) conditions.push(eq(aiSuggestions.userId, userId));
    if (filters?.type) conditions.push(eq(aiSuggestions.suggestionType, filters.type));
    if (filters?.dismissed !== undefined) conditions.push(eq(aiSuggestions.dismissed, filters.dismissed));
    
    return db.select().from(aiSuggestions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(aiSuggestions.createdAt));
  }

  async getAiSuggestion(id: number): Promise<AiSuggestion | undefined> {
    const [suggestion] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id));
    return suggestion;
  }

  async createAiSuggestion(data: InsertAiSuggestion): Promise<AiSuggestion> {
    const [suggestion] = await db.insert(aiSuggestions).values(data).returning();
    return suggestion;
  }

  async updateAiSuggestion(id: number, data: Partial<InsertAiSuggestion>): Promise<AiSuggestion | undefined> {
    const [updated] = await db.update(aiSuggestions)
      .set(data)
      .where(eq(aiSuggestions.id, id))
      .returning();
    return updated;
  }

  async deleteAiSuggestion(id: number): Promise<boolean> {
    const result = await db.delete(aiSuggestions).where(eq(aiSuggestions.id, id));
    return (result as any).rowCount > 0;
  }

  async dismissAiSuggestion(id: number): Promise<boolean> {
    const [updated] = await db.update(aiSuggestions)
      .set({ dismissed: true })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return !!updated;
  }

  async applyAiSuggestion(id: number): Promise<boolean> {
    const [updated] = await db.update(aiSuggestions)
      .set({ applied: true })
      .where(eq(aiSuggestions.id, id))
      .returning();
    return !!updated;
  }

  // Advanced segmentation methods
  async getMunicipalities(filters?: { uf?: string; year?: number }): Promise<{ code: number; name: string; uf: string }[]> {
    const conditions: SQL[] = [];
    if (filters?.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));
    if (filters?.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));

    const result = await db.selectDistinct({
      code: tseCandidateVotes.cdMunicipio,
      name: tseCandidateVotes.nmMunicipio,
      uf: tseCandidateVotes.sgUf,
    }).from(tseCandidateVotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(tseCandidateVotes.nmMunicipio);

    return result.map(r => ({
      code: r.code || 0,
      name: r.name || "N/A",
      uf: r.uf || "N/A",
    }));
  }


  async getPositions(filters?: { year?: number; uf?: string }): Promise<{ code: number; name: string; votes: number }[]> {
    const conditions: SQL[] = [];
    if (filters?.year) conditions.push(eq(tseCandidateVotes.anoEleicao, filters.year));
    if (filters?.uf) conditions.push(eq(tseCandidateVotes.sgUf, filters.uf));

    const result = await db.select({
      code: tseCandidateVotes.cdCargo,
      name: tseCandidateVotes.dsCargo,
      votes: sql<number>`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0)::int`,
    }).from(tseCandidateVotes)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(tseCandidateVotes.cdCargo, tseCandidateVotes.dsCargo)
      .orderBy(sql`COALESCE(SUM(${tseCandidateVotes.qtVotosNominais}), 0) DESC`);

    return result.map(r => ({
      code: r.code || 0,
      name: r.name || "N/A",
      votes: r.votes,
    }));
  }

  // Sentiment Data Sources methods
  async getSentimentDataSources(filters?: { sourceType?: string; isActive?: boolean }): Promise<SentimentDataSource[]> {
    const conditions: SQL[] = [];
    if (filters?.sourceType) conditions.push(eq(sentimentDataSources.sourceType, filters.sourceType));
    if (filters?.isActive !== undefined) conditions.push(eq(sentimentDataSources.isActive, filters.isActive));
    
    return db.select().from(sentimentDataSources)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sentimentDataSources.createdAt));
  }

  async createSentimentDataSource(data: InsertSentimentDataSource): Promise<SentimentDataSource> {
    const [source] = await db.insert(sentimentDataSources).values(data).returning();
    return source;
  }

  async updateSentimentDataSource(id: number, data: Partial<InsertSentimentDataSource>): Promise<SentimentDataSource | undefined> {
    const [updated] = await db.update(sentimentDataSources)
      .set(data)
      .where(eq(sentimentDataSources.id, id))
      .returning();
    return updated;
  }

  // Sentiment Articles methods
  async getSentimentArticles(filters?: { sourceId?: number; startDate?: Date; endDate?: Date; limit?: number }): Promise<SentimentArticle[]> {
    const conditions: SQL[] = [];
    if (filters?.sourceId) conditions.push(eq(sentimentArticles.sourceId, filters.sourceId));
    if (filters?.startDate) conditions.push(sql`${sentimentArticles.publishedAt} >= ${filters.startDate}`);
    if (filters?.endDate) conditions.push(sql`${sentimentArticles.publishedAt} <= ${filters.endDate}`);
    
    let query = db.select().from(sentimentArticles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sentimentArticles.publishedAt));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return query;
  }

  async createSentimentArticle(data: InsertSentimentArticle): Promise<SentimentArticle> {
    const [article] = await db.insert(sentimentArticles).values(data).returning();
    return article;
  }

  async createSentimentArticles(data: InsertSentimentArticle[]): Promise<SentimentArticle[]> {
    if (data.length === 0) return [];
    const articles = await db.insert(sentimentArticles).values(data).returning();
    return articles;
  }

  // Sentiment Analysis Results methods
  async getSentimentResults(filters: { 
    entityType?: string; 
    entityId?: string; 
    startDate?: Date; 
    endDate?: Date;
    limit?: number;
  }): Promise<SentimentAnalysisResult[]> {
    const conditions: SQL[] = [];
    if (filters.entityType) conditions.push(eq(sentimentAnalysisResults.entityType, filters.entityType));
    if (filters.entityId) conditions.push(eq(sentimentAnalysisResults.entityId, filters.entityId));
    if (filters.startDate) conditions.push(sql`${sentimentAnalysisResults.analysisDate} >= ${filters.startDate}`);
    if (filters.endDate) conditions.push(sql`${sentimentAnalysisResults.analysisDate} <= ${filters.endDate}`);
    
    let query = db.select().from(sentimentAnalysisResults)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sentimentAnalysisResults.analysisDate));
    
    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return query;
  }

  async getLatestSentimentByEntity(entityType: string): Promise<SentimentAnalysisResult[]> {
    const subquery = db.select({
      entityId: sentimentAnalysisResults.entityId,
      maxDate: sql<Date>`MAX(${sentimentAnalysisResults.analysisDate})`.as("max_date"),
    }).from(sentimentAnalysisResults)
      .where(eq(sentimentAnalysisResults.entityType, entityType))
      .groupBy(sentimentAnalysisResults.entityId)
      .as("latest");

    return db.select()
      .from(sentimentAnalysisResults)
      .innerJoin(subquery, and(
        eq(sentimentAnalysisResults.entityId, subquery.entityId),
        eq(sentimentAnalysisResults.analysisDate, subquery.maxDate)
      ))
      .orderBy(desc(sentimentAnalysisResults.mentionCount));
  }

  async createSentimentResult(data: InsertSentimentAnalysisResult): Promise<SentimentAnalysisResult> {
    const [result] = await db.insert(sentimentAnalysisResults).values(data).returning();
    return result;
  }

  async getSentimentTimeline(entityType: string, entityId: string, days: number = 30): Promise<{
    date: Date;
    sentimentScore: number;
    mentionCount: number;
    label: string;
  }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db.select({
      date: sentimentAnalysisResults.analysisDate,
      sentimentScore: sentimentAnalysisResults.sentimentScore,
      mentionCount: sentimentAnalysisResults.mentionCount,
      label: sentimentAnalysisResults.sentimentLabel,
    }).from(sentimentAnalysisResults)
      .where(and(
        eq(sentimentAnalysisResults.entityType, entityType),
        eq(sentimentAnalysisResults.entityId, entityId),
        sql`${sentimentAnalysisResults.analysisDate} >= ${startDate}`
      ))
      .orderBy(sentimentAnalysisResults.analysisDate);

    return results.map(r => ({
      date: r.date,
      sentimentScore: parseFloat(String(r.sentimentScore)),
      mentionCount: r.mentionCount || 0,
      label: r.label,
    }));
  }

  // Sentiment Keywords methods
  async getKeywords(filters?: { entityType?: string; entityId?: string; limit?: number }): Promise<SentimentKeyword[]> {
    const conditions: SQL[] = [];
    if (filters?.entityType) conditions.push(eq(sentimentKeywords.entityType, filters.entityType));
    if (filters?.entityId) conditions.push(eq(sentimentKeywords.entityId, filters.entityId));
    
    let query = db.select().from(sentimentKeywords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sentimentKeywords.frequency));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    
    return query;
  }

  async upsertKeyword(data: InsertSentimentKeyword): Promise<SentimentKeyword> {
    const existing = await db.select().from(sentimentKeywords)
      .where(and(
        eq(sentimentKeywords.keyword, data.keyword),
        data.entityType ? eq(sentimentKeywords.entityType, data.entityType) : sql`${sentimentKeywords.entityType} IS NULL`,
        data.entityId ? eq(sentimentKeywords.entityId, data.entityId) : sql`${sentimentKeywords.entityId} IS NULL`
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(sentimentKeywords)
        .set({
          frequency: sql`${sentimentKeywords.frequency} + ${data.frequency}`,
          lastSeen: new Date(),
          averageSentiment: data.averageSentiment,
          trendDirection: data.trendDirection,
        })
        .where(eq(sentimentKeywords.id, existing[0].id))
        .returning();
      return updated;
    }

    const [keyword] = await db.insert(sentimentKeywords).values(data).returning();
    return keyword;
  }

  async getWordCloudData(entityType?: string, entityId?: string, limit: number = 100): Promise<{
    word: string;
    value: number;
    sentiment: number;
  }[]> {
    const conditions: SQL[] = [];
    if (entityType) conditions.push(eq(sentimentKeywords.entityType, entityType));
    if (entityId) conditions.push(eq(sentimentKeywords.entityId, entityId));

    const keywords = await db.select().from(sentimentKeywords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(sentimentKeywords.frequency))
      .limit(limit);

    return keywords.map(k => ({
      word: k.keyword,
      value: k.frequency,
      sentiment: parseFloat(String(k.averageSentiment || 0)),
    }));
  }

  // Campaign Management methods
  async getCampaigns(filters?: { status?: string; partyId?: number }): Promise<Campaign[]> {
    const conditions: SQL[] = [];
    if (filters?.status) conditions.push(eq(campaigns.status, filters.status));
    if (filters?.partyId) conditions.push(eq(campaigns.targetPartyId, filters.partyId));
    
    return db.select().from(campaigns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(campaigns.createdAt));
  }

  async getCampaign(id: number): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign;
  }

  async getCampaignWithDetails(id: number): Promise<{
    campaign: Campaign;
    party?: Party;
    candidate?: Candidate;
    aiSession?: any;
    budgets: CampaignBudget[];
    resources: CampaignResource[];
    metrics: CampaignMetric[];
    activities: CampaignActivity[];
  } | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    if (!campaign) return undefined;

    const party = campaign.targetPartyId 
      ? (await db.select().from(parties).where(eq(parties.id, campaign.targetPartyId)))[0]
      : undefined;
    
    const candidate = campaign.targetCandidateId
      ? (await db.select().from(candidates).where(eq(candidates.id, campaign.targetCandidateId)))[0]
      : undefined;

    const aiSession = campaign.aiSessionId
      ? (await db.select().from(campaignInsightSessions).where(eq(campaignInsightSessions.id, campaign.aiSessionId)))[0]
      : undefined;

    const budgetsList = await db.select().from(campaignBudgets)
      .where(eq(campaignBudgets.campaignId, id))
      .orderBy(campaignBudgets.category);

    const resourcesList = await db.select().from(campaignResources)
      .where(eq(campaignResources.campaignId, id))
      .orderBy(campaignResources.type);

    const metricsList = await db.select().from(campaignMetrics)
      .where(eq(campaignMetrics.campaignId, id))
      .orderBy(desc(campaignMetrics.metricDate));

    const activitiesList = await db.select().from(campaignActivities)
      .where(eq(campaignActivities.campaignId, id))
      .orderBy(desc(campaignActivities.scheduledDate));

    return {
      campaign,
      party,
      candidate,
      aiSession,
      budgets: budgetsList,
      resources: resourcesList,
      metrics: metricsList,
      activities: activitiesList,
    };
  }

  async createCampaign(data: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(campaigns).values(data).returning();
    return campaign;
  }

  async updateCampaign(id: number, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [updated] = await db.update(campaigns)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(campaigns.id, id))
      .returning();
    return updated;
  }

  async deleteCampaign(id: number): Promise<boolean> {
    const result = await db.delete(campaigns).where(eq(campaigns.id, id)).returning();
    return result.length > 0;
  }

  // Campaign Budget methods
  async getCampaignBudgets(campaignId: number): Promise<CampaignBudget[]> {
    return db.select().from(campaignBudgets)
      .where(eq(campaignBudgets.campaignId, campaignId))
      .orderBy(campaignBudgets.category);
  }

  async getCampaignBudget(id: number): Promise<CampaignBudget | undefined> {
    const [budget] = await db.select().from(campaignBudgets).where(eq(campaignBudgets.id, id));
    return budget;
  }

  async createCampaignBudget(data: InsertCampaignBudget): Promise<CampaignBudget> {
    const [budget] = await db.insert(campaignBudgets).values(data).returning();
    return budget;
  }

  async updateCampaignBudget(id: number, data: Partial<InsertCampaignBudget>): Promise<CampaignBudget | undefined> {
    const [updated] = await db.update(campaignBudgets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(campaignBudgets.id, id))
      .returning();
    return updated;
  }

  async deleteCampaignBudget(id: number): Promise<boolean> {
    const result = await db.delete(campaignBudgets).where(eq(campaignBudgets.id, id)).returning();
    return result.length > 0;
  }

  // Campaign Resource methods
  async getCampaignResources(campaignId: number): Promise<CampaignResource[]> {
    return db.select().from(campaignResources)
      .where(eq(campaignResources.campaignId, campaignId))
      .orderBy(campaignResources.type);
  }

  async getCampaignResource(id: number): Promise<CampaignResource | undefined> {
    const [resource] = await db.select().from(campaignResources).where(eq(campaignResources.id, id));
    return resource;
  }

  async createCampaignResource(data: InsertCampaignResource): Promise<CampaignResource> {
    const [resource] = await db.insert(campaignResources).values(data).returning();
    return resource;
  }

  async updateCampaignResource(id: number, data: Partial<InsertCampaignResource>): Promise<CampaignResource | undefined> {
    const [updated] = await db.update(campaignResources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(campaignResources.id, id))
      .returning();
    return updated;
  }

  async deleteCampaignResource(id: number): Promise<boolean> {
    const result = await db.delete(campaignResources).where(eq(campaignResources.id, id)).returning();
    return result.length > 0;
  }

  // Campaign Metric methods
  async getCampaignMetrics(campaignId: number, filters?: { kpiName?: string; startDate?: Date; endDate?: Date }): Promise<CampaignMetric[]> {
    const conditions: SQL[] = [eq(campaignMetrics.campaignId, campaignId)];
    if (filters?.kpiName) conditions.push(eq(campaignMetrics.kpiName, filters.kpiName));
    if (filters?.startDate) conditions.push(sql`${campaignMetrics.metricDate} >= ${filters.startDate}`);
    if (filters?.endDate) conditions.push(sql`${campaignMetrics.metricDate} <= ${filters.endDate}`);
    
    return db.select().from(campaignMetrics)
      .where(and(...conditions))
      .orderBy(desc(campaignMetrics.metricDate));
  }

  async getCampaignMetric(id: number): Promise<CampaignMetric | undefined> {
    const [metric] = await db.select().from(campaignMetrics).where(eq(campaignMetrics.id, id));
    return metric;
  }

  async createCampaignMetric(data: InsertCampaignMetric): Promise<CampaignMetric> {
    const [metric] = await db.insert(campaignMetrics).values(data).returning();
    return metric;
  }

  async updateCampaignMetric(id: number, data: Partial<InsertCampaignMetric>): Promise<CampaignMetric | undefined> {
    const [updated] = await db.update(campaignMetrics)
      .set(data)
      .where(eq(campaignMetrics.id, id))
      .returning();
    return updated;
  }

  async deleteCampaignMetric(id: number): Promise<boolean> {
    const result = await db.delete(campaignMetrics).where(eq(campaignMetrics.id, id)).returning();
    return result.length > 0;
  }

  // Campaign Activity methods
  async getCampaignActivities(campaignId: number, filters?: { status?: string; type?: string }): Promise<CampaignActivity[]> {
    const conditions: SQL[] = [eq(campaignActivities.campaignId, campaignId)];
    if (filters?.status) conditions.push(eq(campaignActivities.status, filters.status));
    if (filters?.type) conditions.push(eq(campaignActivities.type, filters.type));
    
    return db.select().from(campaignActivities)
      .where(and(...conditions))
      .orderBy(desc(campaignActivities.scheduledDate));
  }

  async getCampaignActivity(id: number): Promise<CampaignActivity | undefined> {
    const [activity] = await db.select().from(campaignActivities).where(eq(campaignActivities.id, id));
    return activity;
  }

  async createCampaignActivity(data: InsertCampaignActivity): Promise<CampaignActivity> {
    const [activity] = await db.insert(campaignActivities).values(data).returning();
    return activity;
  }

  async updateCampaignActivity(id: number, data: Partial<InsertCampaignActivity>): Promise<CampaignActivity | undefined> {
    const [updated] = await db.update(campaignActivities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(campaignActivities.id, id))
      .returning();
    return updated;
  }

  async deleteCampaignActivity(id: number): Promise<boolean> {
    const result = await db.delete(campaignActivities).where(eq(campaignActivities.id, id)).returning();
    return result.length > 0;
  }

  // Campaign performance summary
  async getCampaignPerformanceSummary(campaignId: number): Promise<{
    budgetUtilization: number;
    activitiesCompleted: number;
    activitiesTotal: number;
    resourcesAllocated: number;
    latestMetrics: { name: string; value: number; target: number | null }[];
    daysRemaining: number;
    progressPercentage: number;
  }> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      return {
        budgetUtilization: 0,
        activitiesCompleted: 0,
        activitiesTotal: 0,
        resourcesAllocated: 0,
        latestMetrics: [],
        daysRemaining: 0,
        progressPercentage: 0,
      };
    }

    // Budget utilization
    const budgets = await this.getCampaignBudgets(campaignId);
    const totalAllocated = budgets.reduce((sum, b) => sum + parseFloat(String(b.allocatedAmount || 0)), 0);
    const totalSpent = budgets.reduce((sum, b) => sum + parseFloat(String(b.spentAmount || 0)), 0);
    const budgetUtilization = totalAllocated > 0 ? (totalSpent / totalAllocated) * 100 : 0;

    // Activities
    const activities = await this.getCampaignActivities(campaignId);
    const activitiesCompleted = activities.filter(a => a.status === 'completed').length;
    const activitiesTotal = activities.length;

    // Resources
    const resources = await this.getCampaignResources(campaignId);
    const resourcesAllocated = resources.filter(r => r.status === 'allocated').length;

    // Latest metrics - get unique KPIs with latest values
    const allMetrics = await this.getCampaignMetrics(campaignId);
    const latestByKpi = new Map<string, CampaignMetric>();
    for (const metric of allMetrics) {
      if (!latestByKpi.has(metric.kpiName) || 
          new Date(metric.metricDate) > new Date(latestByKpi.get(metric.kpiName)!.metricDate)) {
        latestByKpi.set(metric.kpiName, metric);
      }
    }
    const latestMetrics = Array.from(latestByKpi.values()).slice(0, 5).map(m => ({
      name: m.kpiName,
      value: parseFloat(String(m.kpiValue)),
      target: m.targetValue ? parseFloat(String(m.targetValue)) : null,
    }));

    // Days remaining
    const now = new Date();
    const endDate = new Date(campaign.endDate);
    const startDate = new Date(campaign.startDate);
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Progress percentage (time-based)
    const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const daysPassed = Math.max(0, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const progressPercentage = Math.min(100, (daysPassed / totalDays) * 100);

    return {
      budgetUtilization,
      activitiesCompleted,
      activitiesTotal,
      resourcesAllocated,
      latestMetrics,
      daysRemaining,
      progressPercentage,
    };
  }

  // ============ CAMPAIGN TEAM MEMBERS ============
  
  async getCampaignTeamMembers(campaignId: number): Promise<CampaignTeamMember[]> {
    return db.select().from(campaignTeamMembers)
      .where(and(
        eq(campaignTeamMembers.campaignId, campaignId),
        eq(campaignTeamMembers.isActive, true)
      ))
      .orderBy(desc(campaignTeamMembers.joinedAt));
  }

  async getCampaignTeamMember(id: number): Promise<CampaignTeamMember | undefined> {
    const [member] = await db.select().from(campaignTeamMembers)
      .where(eq(campaignTeamMembers.id, id));
    return member;
  }

  async getCampaignTeamMemberByUser(campaignId: number, userId: string): Promise<CampaignTeamMember | undefined> {
    const [member] = await db.select().from(campaignTeamMembers)
      .where(and(
        eq(campaignTeamMembers.campaignId, campaignId),
        eq(campaignTeamMembers.userId, userId),
        eq(campaignTeamMembers.isActive, true)
      ));
    return member;
  }

  async createCampaignTeamMember(data: InsertCampaignTeamMember): Promise<CampaignTeamMember> {
    const [member] = await db.insert(campaignTeamMembers).values(data).returning();
    return member;
  }

  async updateCampaignTeamMember(id: number, data: Partial<InsertCampaignTeamMember>): Promise<CampaignTeamMember | undefined> {
    const [member] = await db.update(campaignTeamMembers)
      .set(data)
      .where(eq(campaignTeamMembers.id, id))
      .returning();
    return member;
  }

  async deleteCampaignTeamMember(id: number): Promise<boolean> {
    // Soft delete by setting isActive to false
    const [member] = await db.update(campaignTeamMembers)
      .set({ isActive: false, leftAt: new Date() })
      .where(eq(campaignTeamMembers.id, id))
      .returning();
    return !!member;
  }

  // ============ ACTIVITY ASSIGNEES ============
  
  async getActivityAssignees(activityId: number): Promise<ActivityAssignee[]> {
    return db.select().from(activityAssignees)
      .where(eq(activityAssignees.activityId, activityId))
      .orderBy(desc(activityAssignees.assignedAt));
  }

  async createActivityAssignee(data: InsertActivityAssignee): Promise<ActivityAssignee> {
    const [assignee] = await db.insert(activityAssignees).values(data).returning();
    return assignee;
  }

  async deleteActivityAssignee(id: number): Promise<boolean> {
    await db.delete(activityAssignees).where(eq(activityAssignees.id, id));
    return true;
  }

  // ============ AI KPI GOALS ============
  
  async getAiKpiGoals(campaignId: number): Promise<AiKpiGoal[]> {
    return db.select().from(aiKpiGoals)
      .where(eq(aiKpiGoals.campaignId, campaignId))
      .orderBy(desc(aiKpiGoals.createdAt));
  }

  async getAiKpiGoal(id: number): Promise<AiKpiGoal | undefined> {
    const [goal] = await db.select().from(aiKpiGoals)
      .where(eq(aiKpiGoals.id, id));
    return goal;
  }

  async createAiKpiGoal(data: InsertAiKpiGoal): Promise<AiKpiGoal> {
    const [goal] = await db.insert(aiKpiGoals).values(data).returning();
    return goal;
  }

  async updateAiKpiGoal(id: number, data: Partial<InsertAiKpiGoal>): Promise<AiKpiGoal | undefined> {
    const [goal] = await db.update(aiKpiGoals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(aiKpiGoals.id, id))
      .returning();
    return goal;
  }

  async deleteAiKpiGoal(id: number): Promise<boolean> {
    await db.delete(aiKpiGoals).where(eq(aiKpiGoals.id, id));
    return true;
  }

  // ============ CAMPAIGN NOTIFICATIONS ============
  
  async getCampaignNotifications(campaignId: number): Promise<CampaignNotification[]> {
    return db.select().from(campaignNotifications)
      .where(eq(campaignNotifications.campaignId, campaignId))
      .orderBy(desc(campaignNotifications.createdAt));
  }

  async getUserCampaignNotifications(userId: string): Promise<CampaignNotification[]> {
    return db.select().from(campaignNotifications)
      .where(eq(campaignNotifications.recipientUserId, userId))
      .orderBy(desc(campaignNotifications.createdAt));
  }

  async createCampaignNotification(data: InsertCampaignNotification): Promise<CampaignNotification> {
    const [notification] = await db.insert(campaignNotifications).values(data).returning();
    return notification;
  }

  async markCampaignNotificationSent(id: number, inAppNotificationId?: number): Promise<CampaignNotification | undefined> {
    const [notification] = await db.update(campaignNotifications)
      .set({ 
        sentAt: new Date(),
        inAppNotificationId: inAppNotificationId || null 
      })
      .where(eq(campaignNotifications.id, id))
      .returning();
    return notification;
  }

  // ============ CALENDAR ACTIVITIES ============
  
  async getCalendarActivities(campaignId: number, startDate: Date, endDate: Date): Promise<CampaignActivity[]> {
    return db.select().from(campaignActivities)
      .where(and(
        eq(campaignActivities.campaignId, campaignId),
        sql`${campaignActivities.scheduledDate} >= ${startDate}`,
        sql`${campaignActivities.scheduledDate} <= ${endDate}`
      ))
      .orderBy(asc(campaignActivities.scheduledDate));
  }
}

export const storage = new DatabaseStorage();
