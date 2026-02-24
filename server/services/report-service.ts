import { z } from "zod";
import { storage } from "../storage";
import { executeReportRun } from "../report-executor";
import { calculateNextRun } from "../routes/shared";

export const projectionReportQuerySchema = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  scope: z.enum(["national", "state"]).optional(),
  targetYear: z.string().optional().transform((val) => val ? parseInt(val) : undefined).pipe(
    z.number().int().min(2000).max(2100).optional()
  )
});

export const createProjectionReportSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetYear: z.number().int().min(2000).max(2100),
  electionType: z.string().min(1, "Election type is required"),
  scope: z.enum(["national", "state"]),
  state: z.string().optional(),
  position: z.string().optional()
});

export const updateProjectionReportSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["draft", "published", "archived"]).optional()
});

export async function getProjectionReports(query: Record<string, any>) {
  const validationResult = projectionReportQuerySchema.safeParse(query);
  if (!validationResult.success) {
    throw { status: 400, message: "Invalid query parameters", details: validationResult.error.issues };
  }
  const { status, targetYear, scope } = validationResult.data;
  return storage.getProjectionReports({ status, targetYear, scope });
}

export async function getProjectionReportById(id: number) {
  return storage.getProjectionReportById(id);
}

export async function createProjectionReport(data: z.infer<typeof createProjectionReportSchema>, userId?: string) {
  const validationResult = createProjectionReportSchema.safeParse(data);
  if (!validationResult.success) {
    throw { status: 400, message: "Validation failed", details: validationResult.error.issues };
  }

  const { name, targetYear, electionType, scope, state, position } = validationResult.data;

  if (scope === "state" && !state) {
    throw { status: 400, message: "State is required when scope is 'state'" };
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

  return storage.createProjectionReport({
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
    createdBy: userId,
  });
}

export async function updateProjectionReport(id: number, body: Record<string, any>) {
  const validationResult = updateProjectionReportSchema.safeParse(body);
  if (!validationResult.success) {
    throw { status: 400, message: "Validation failed", details: validationResult.error.issues };
  }
  const { status, name } = validationResult.data;
  return storage.updateProjectionReport(id, { status, name });
}

export async function deleteProjectionReport(id: number) {
  return storage.deleteProjectionReport(id);
}

export async function exportProjectionReportCsv(id: number) {
  const report = await storage.getProjectionReportById(id);
  if (!report) {
    throw { status: 404, message: "Report not found" };
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

  return {
    csv: "\ufeff" + csv,
    filename: `projecao-${report.name.replace(/\s+/g, "-")}-${report.targetYear}.csv`,
  };
}

export async function getReportTemplates() {
  return storage.getReportTemplates();
}

export async function getReportTemplate(id: number) {
  return storage.getReportTemplate(id);
}

export async function createReportTemplate(data: any) {
  return storage.createReportTemplate(data);
}

export async function updateReportTemplate(id: number, data: any) {
  return storage.updateReportTemplate(id, data);
}

export async function deleteReportTemplate(id: number) {
  return storage.deleteReportTemplate(id);
}

export async function getReportSchedules() {
  return storage.getReportSchedules();
}

export async function getReportSchedule(id: number) {
  return storage.getReportSchedule(id);
}

export async function createReportSchedule(data: any) {
  const nextRunAt = calculateNextRun(data.frequency, data.dayOfWeek, data.dayOfMonth, data.timeOfDay, data.timezone);
  return storage.createReportSchedule({ ...data, nextRunAt });
}

export async function updateReportSchedule(id: number, data: any) {
  const updateData = { ...data };

  if (data.frequency || data.dayOfWeek !== undefined || data.dayOfMonth !== undefined || data.timeOfDay) {
    const existing = await storage.getReportSchedule(id);
    if (existing) {
      updateData.nextRunAt = calculateNextRun(
        data.frequency || existing.frequency,
        data.dayOfWeek ?? existing.dayOfWeek,
        data.dayOfMonth ?? existing.dayOfMonth,
        data.timeOfDay || existing.timeOfDay,
        data.timezone || existing.timezone
      );
    }
  }

  return storage.updateReportSchedule(id, updateData);
}

export async function deleteReportSchedule(id: number) {
  return storage.deleteReportSchedule(id);
}

export async function getReportRuns(query: Record<string, any>) {
  const filters = {
    scheduleId: query.scheduleId ? parseInt(query.scheduleId) : undefined,
    templateId: query.templateId ? parseInt(query.templateId) : undefined,
    status: query.status as string | undefined,
    limit: query.limit ? parseInt(query.limit) : 50,
  };
  return storage.getReportRuns(filters);
}

export async function triggerReportRun(templateId: number, userId: string, recipients?: any[]) {
  const template = await storage.getReportTemplate(templateId);
  if (!template) {
    throw { status: 404, message: "Template not found" };
  }

  const run = await storage.createReportRun({
    templateId,
    triggeredBy: "manual",
    status: "pending",
    createdBy: userId,
  });

  executeReportRun(run.id, template, recipients || [])
    .then(() => console.log(`Report run ${run.id} completed`))
    .catch(err => console.error(`Report run ${run.id} failed:`, err));

  return { runId: run.id, templateName: template.name };
}

export async function getReportRecipients() {
  return storage.getReportRecipients();
}

export async function createReportRecipient(data: any) {
  return storage.createReportRecipient(data);
}

export async function updateReportRecipient(id: number, data: any) {
  return storage.updateReportRecipient(id, data);
}

export async function deleteReportRecipient(id: number) {
  return storage.deleteReportRecipient(id);
}

export async function getSavedReports(userId?: string) {
  return storage.getSavedReports(userId);
}

export async function getSavedReportById(id: number) {
  return storage.getSavedReportById(id);
}

export async function createSavedReport(data: any) {
  return storage.createSavedReport(data);
}

export async function updateSavedReport(id: number, data: any) {
  return storage.updateSavedReport(id, data);
}

export async function deleteSavedReport(id: number) {
  return storage.deleteSavedReport(id);
}
