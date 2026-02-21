import { z } from "zod";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, and, gt, lt } from "drizzle-orm";
import { tseCandidateVotes } from "@shared/schema";

export interface ValidationIssue {
  type: string;
  severity: "error" | "warning" | "info";
  category: "data_quality" | "consistency" | "statistical" | "format";
  rowReference?: string;
  field?: string;
  currentValue?: string;
  message: string;
  suggestedFix?: {
    action: "correct" | "remove" | "review" | "ignore";
    newValue?: string | number;
    confidence: number;
    reasoning: string;
  };
}

export interface ValidationSummary {
  totalRecordsChecked: number;
  issuesFound: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  sampleIssues: ValidationIssue[];
}

export interface ValidationResult {
  issues: ValidationIssue[];
  summary: ValidationSummary;
}

const aiValidationResponseSchema = z.object({
  analysis: z.string(),
  recommendations: z.array(z.object({
    issue: z.string(),
    severity: z.enum(["error", "warning", "info"]),
    suggestedAction: z.string(),
    confidence: z.number().min(0).max(1),
    affectedRecords: z.string().optional(),
  })).optional().default([]),
  overallDataQuality: z.object({
    score: z.number().min(0).max(100),
    assessment: z.string(),
    keyFindings: z.array(z.string()),
    risksIdentified: z.array(z.string()),
  }).optional(),
});

export async function runValidation(jobId: number): Promise<{
  runId: number;
  summary: ValidationSummary;
  aiAnalysis?: unknown;
}> {
  const run = await storage.createValidationRun({
    jobId,
    status: "running",
    startedAt: new Date(),
  });

  try {
    const issues: ValidationIssue[] = [];
    
    const job = await storage.getTseImportJob(jobId);
    if (!job) {
      throw new Error("Import job not found");
    }

    const totalRecords = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tseCandidateVotes)
      .where(eq(tseCandidateVotes.importJobId, jobId));
    
    const recordCount = totalRecords[0]?.count || 0;

    const negativeVotes = await checkNegativeVotes(jobId);
    issues.push(...negativeVotes);

    const missingFields = await checkMissingRequiredFields(jobId);
    issues.push(...missingFields);

    const duplicates = await checkDuplicateEntries(jobId);
    issues.push(...duplicates);

    const unrealisticVotes = await checkUnrealisticVoteCounts(jobId);
    issues.push(...unrealisticVotes);

    const invalidCandidateNumbers = await checkInvalidCandidateNumbers(jobId);
    issues.push(...invalidCandidateNumbers);

    const statisticalOutliers = await checkStatisticalOutliers(jobId);
    issues.push(...statisticalOutliers);

    const inconsistentPartyNumbers = await checkPartyNumberConsistency(jobId);
    issues.push(...inconsistentPartyNumbers);

    const summary = buildSummary(issues, recordCount);

    const issueRecords = issues.map(issue => ({
      runId: run.id,
      type: issue.type,
      severity: issue.severity,
      category: issue.category,
      rowReference: issue.rowReference,
      field: issue.field,
      currentValue: issue.currentValue,
      message: issue.message,
      suggestedFix: issue.suggestedFix,
      status: "open" as const,
    }));

    if (issueRecords.length > 0) {
      await storage.createValidationIssues(issueRecords);
    }

    let aiAnalysis = null;
    if (issues.length > 0) {
      aiAnalysis = await generateAiAnalysis(summary, job);
    }

    await storage.updateValidationRun(run.id, {
      status: "completed",
      completedAt: new Date(),
      totalRecordsChecked: recordCount,
      issuesFound: issues.length,
      summary: summary as unknown as Record<string, unknown>,
      aiAnalysis: aiAnalysis as unknown as Record<string, unknown>,
    });

    return {
      runId: run.id,
      summary,
      aiAnalysis,
    };
  } catch (error) {
    await storage.updateValidationRun(run.id, {
      status: "failed",
      completedAt: new Date(),
    });
    throw error;
  }
}

async function checkNegativeVotes(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  
  const negativeVotes = await db
    .select({
      id: tseCandidateVotes.id,
      nmCandidato: tseCandidateVotes.nmCandidato,
      qtVotosNominais: tseCandidateVotes.qtVotosNominais,
      nrCandidato: tseCandidateVotes.nrCandidato,
    })
    .from(tseCandidateVotes)
    .where(and(
      eq(tseCandidateVotes.importJobId, jobId),
      lt(tseCandidateVotes.qtVotosNominais, 0)
    ))
    .limit(100);

  for (const record of negativeVotes) {
    issues.push({
      type: "negative_vote_count",
      severity: "error",
      category: "data_quality",
      rowReference: `ID: ${record.id}`,
      field: "qtVotosNominais",
      currentValue: String(record.qtVotosNominais),
      message: `Candidato "${record.nmCandidato}" (${record.nrCandidato}) possui contagem de votos negativa: ${record.qtVotosNominais}`,
      suggestedFix: {
        action: "review",
        newValue: 0,
        confidence: 0.5,
        reasoning: "Votos negativos são impossíveis. Pode ser erro de importação ou corrupção de dados.",
      },
    });
  }

  return issues;
}

async function checkMissingRequiredFields(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const missingCandidateName = await db
    .select({
      id: tseCandidateVotes.id,
      nrCandidato: tseCandidateVotes.nrCandidato,
    })
    .from(tseCandidateVotes)
    .where(and(
      eq(tseCandidateVotes.importJobId, jobId),
      sql`(${tseCandidateVotes.nmCandidato} IS NULL OR ${tseCandidateVotes.nmCandidato} = '')`
    ))
    .limit(50);

  for (const record of missingCandidateName) {
    issues.push({
      type: "missing_field",
      severity: "warning",
      category: "data_quality",
      rowReference: `ID: ${record.id}`,
      field: "nmCandidato",
      message: `Registro com número ${record.nrCandidato} não possui nome do candidato`,
      suggestedFix: {
        action: "review",
        confidence: 0.3,
        reasoning: "Nome do candidato é obrigatório para identificação correta.",
      },
    });
  }

  const missingParty = await db
    .select({
      id: tseCandidateVotes.id,
      nmCandidato: tseCandidateVotes.nmCandidato,
    })
    .from(tseCandidateVotes)
    .where(and(
      eq(tseCandidateVotes.importJobId, jobId),
      sql`(${tseCandidateVotes.sgPartido} IS NULL OR ${tseCandidateVotes.sgPartido} = '')`
    ))
    .limit(50);

  for (const record of missingParty) {
    issues.push({
      type: "missing_field",
      severity: "warning",
      category: "data_quality",
      rowReference: `ID: ${record.id}`,
      field: "sgPartido",
      message: `Candidato "${record.nmCandidato}" não possui sigla do partido`,
      suggestedFix: {
        action: "review",
        confidence: 0.3,
        reasoning: "Sigla do partido é necessária para cálculos proporcionais.",
      },
    });
  }

  return issues;
}

async function checkDuplicateEntries(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const duplicates = await db.execute(sql`
    SELECT 
      ${tseCandidateVotes.nrCandidato} as nr_candidato,
      ${tseCandidateVotes.sgUe} as sg_ue,
      ${tseCandidateVotes.cdCargo} as cd_cargo,
      COUNT(*) as count,
      array_agg(${tseCandidateVotes.id}) as ids
    FROM ${tseCandidateVotes}
    WHERE ${tseCandidateVotes.importJobId} = ${jobId}
    GROUP BY ${tseCandidateVotes.nrCandidato}, ${tseCandidateVotes.sgUe}, ${tseCandidateVotes.cdCargo}
    HAVING COUNT(*) > 1
    LIMIT 50
  `);

  for (const row of duplicates.rows as any[]) {
    issues.push({
      type: "duplicate_entry",
      severity: "warning",
      category: "consistency",
      rowReference: `IDs: ${row.ids?.slice(0, 5).join(", ")}${row.ids?.length > 5 ? "..." : ""}`,
      field: "nrCandidato,sgUe,cdCargo",
      message: `${row.count} registros duplicados para candidato ${row.nr_candidato} em ${row.sg_ue} para cargo ${row.cd_cargo}`,
      suggestedFix: {
        action: "review",
        confidence: 0.6,
        reasoning: "Duplicatas podem inflar contagens de votos. Manter apenas um registro ou consolidar votos.",
      },
    });
  }

  return issues;
}

async function checkUnrealisticVoteCounts(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const extremelyHighVotes = await db
    .select({
      id: tseCandidateVotes.id,
      nmCandidato: tseCandidateVotes.nmCandidato,
      qtVotosNominais: tseCandidateVotes.qtVotosNominais,
      sgUe: tseCandidateVotes.sgUe,
      dsCargo: tseCandidateVotes.dsCargo,
    })
    .from(tseCandidateVotes)
    .where(and(
      eq(tseCandidateVotes.importJobId, jobId),
      gt(tseCandidateVotes.qtVotosNominais, 10000000)
    ))
    .limit(20);

  for (const record of extremelyHighVotes) {
    issues.push({
      type: "unrealistic_vote_count",
      severity: "warning",
      category: "statistical",
      rowReference: `ID: ${record.id}`,
      field: "qtVotosNominais",
      currentValue: String(record.qtVotosNominais),
      message: `"${record.nmCandidato}" em ${record.sgUe} (${record.dsCargo}) possui ${record.qtVotosNominais?.toLocaleString()} votos - valor extremamente alto`,
      suggestedFix: {
        action: "review",
        confidence: 0.4,
        reasoning: "Contagem de votos muito alta pode indicar agregação incorreta ou erro de dados.",
      },
    });
  }

  return issues;
}

async function checkInvalidCandidateNumbers(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const invalidNumbers = await db
    .select({
      id: tseCandidateVotes.id,
      nmCandidato: tseCandidateVotes.nmCandidato,
      nrCandidato: tseCandidateVotes.nrCandidato,
    })
    .from(tseCandidateVotes)
    .where(and(
      eq(tseCandidateVotes.importJobId, jobId),
      sql`(${tseCandidateVotes.nrCandidato} < 10 OR ${tseCandidateVotes.nrCandidato} > 999999)`
    ))
    .limit(50);

  for (const record of invalidNumbers) {
    issues.push({
      type: "invalid_candidate_number",
      severity: "warning",
      category: "format",
      rowReference: `ID: ${record.id}`,
      field: "nrCandidato",
      currentValue: String(record.nrCandidato),
      message: `Candidato "${record.nmCandidato}" possui número inválido: ${record.nrCandidato}`,
      suggestedFix: {
        action: "review",
        confidence: 0.5,
        reasoning: "Números de candidatos no Brasil seguem padrões específicos por cargo.",
      },
    });
  }

  return issues;
}

async function checkStatisticalOutliers(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const stats = await db.execute(sql`
    SELECT 
      AVG(${tseCandidateVotes.qtVotosNominais})::numeric as avg_votes,
      STDDEV(${tseCandidateVotes.qtVotosNominais})::numeric as stddev_votes,
      ${tseCandidateVotes.cdCargo} as cd_cargo
    FROM ${tseCandidateVotes}
    WHERE ${tseCandidateVotes.importJobId} = ${jobId}
      AND ${tseCandidateVotes.qtVotosNominais} > 0
    GROUP BY ${tseCandidateVotes.cdCargo}
  `);

  for (const stat of stats.rows as any[]) {
    const avgVotes = parseFloat(stat.avg_votes) || 0;
    const stddev = parseFloat(stat.stddev_votes) || 0;
    const threshold = avgVotes + (3 * stddev);
    
    if (stddev > 0 && threshold > 0) {
      const outliers = await db
        .select({
          id: tseCandidateVotes.id,
          nmCandidato: tseCandidateVotes.nmCandidato,
          qtVotosNominais: tseCandidateVotes.qtVotosNominais,
          dsCargo: tseCandidateVotes.dsCargo,
        })
        .from(tseCandidateVotes)
        .where(and(
          eq(tseCandidateVotes.importJobId, jobId),
          eq(tseCandidateVotes.cdCargo, stat.cd_cargo),
          gt(tseCandidateVotes.qtVotosNominais, Math.round(threshold))
        ))
        .limit(10);

      for (const outlier of outliers) {
        const zScore = (outlier.qtVotosNominais! - avgVotes) / stddev;
        issues.push({
          type: "statistical_outlier",
          severity: "info",
          category: "statistical",
          rowReference: `ID: ${outlier.id}`,
          field: "qtVotosNominais",
          currentValue: String(outlier.qtVotosNominais),
          message: `"${outlier.nmCandidato}" (${outlier.dsCargo}) é um outlier estatístico com ${outlier.qtVotosNominais?.toLocaleString()} votos (z-score: ${zScore.toFixed(2)})`,
          suggestedFix: {
            action: "review",
            confidence: 0.3,
            reasoning: `Valor está ${zScore.toFixed(1)} desvios padrão acima da média. Pode ser legítimo (candidato popular) ou erro.`,
          },
        });
      }
    }
  }

  return issues;
}

async function checkPartyNumberConsistency(jobId: number): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];

  const inconsistencies = await db.execute(sql`
    SELECT 
      ${tseCandidateVotes.sgPartido} as sigla,
      array_agg(DISTINCT ${tseCandidateVotes.nrPartido}) as numeros,
      COUNT(DISTINCT ${tseCandidateVotes.nrPartido}) as count_numeros
    FROM ${tseCandidateVotes}
    WHERE ${tseCandidateVotes.importJobId} = ${jobId}
      AND ${tseCandidateVotes.sgPartido} IS NOT NULL
    GROUP BY ${tseCandidateVotes.sgPartido}
    HAVING COUNT(DISTINCT ${tseCandidateVotes.nrPartido}) > 1
    LIMIT 20
  `);

  for (const row of inconsistencies.rows as any[]) {
    issues.push({
      type: "party_number_mismatch",
      severity: "warning",
      category: "consistency",
      field: "nrPartido,sgPartido",
      currentValue: `${row.sigla}: ${row.numeros?.join(", ")}`,
      message: `Partido ${row.sigla} aparece com ${row.count_numeros} números diferentes: ${row.numeros?.join(", ")}`,
      suggestedFix: {
        action: "review",
        confidence: 0.7,
        reasoning: "Cada partido deve ter um único número. Pode indicar mudança de legenda ou erro de dados.",
      },
    });
  }

  return issues;
}

function buildSummary(issues: ValidationIssue[], totalRecords: number): ValidationSummary {
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
  }

  return {
    totalRecordsChecked: totalRecords,
    issuesFound: issues.length,
    byType,
    bySeverity,
    byCategory,
    sampleIssues: issues.slice(0, 10),
  };
}

async function generateAiAnalysis(summary: ValidationSummary, job: any): Promise<unknown> {
  try {
    const { cachedAiCall, SYSTEM_PROMPTS } = await import("./ai-cache");

    const userPrompt = `Validação de dados TSE importados:
Importação: Ano=${job.year||"N/A"}, Tipo=${job.electionType||"N/A"}, Estado=${job.state||"Nacional"}
Registros: ${summary.totalRecordsChecked.toLocaleString()}, Problemas: ${summary.issuesFound}
Por tipo: ${Object.entries(summary.byType).map(([t,c]) => `${t}:${c}`).join(", ")}
Por severidade: ${Object.entries(summary.bySeverity).map(([s,c]) => `${s}:${c}`).join(", ")}
Exemplos: ${summary.sampleIssues.slice(0,5).map(i => `[${i.severity}] ${i.message}`).join("; ")}

Retorne JSON: {"analysis":"texto","recommendations":[{"issue":"str","severity":"error|warning|info","suggestedAction":"str","confidence":0-1,"affectedRecords":"str"}],"overallDataQuality":{"score":0-100,"assessment":"str","keyFindings":["str"],"risksIdentified":["str"]}}`;

    const result = await cachedAiCall({
      model: "standard",
      systemPrompt: SYSTEM_PROMPTS.dataAnalyst,
      userPrompt,
    });

    const validated = aiValidationResponseSchema.safeParse(result.data);
    
    return validated.success ? validated.data : result.data;
  } catch (error) {
    console.error("Failed to generate AI analysis:", error);
    return null;
  }
}

export async function getValidationStatus(jobId: number) {
  const run = await storage.getValidationRunByJobId(jobId);
  if (!run) {
    return { hasValidation: false };
  }

  const counts = await storage.getValidationIssueCounts(run.id);
  
  return {
    hasValidation: true,
    runId: run.id,
    status: run.status,
    totalRecordsChecked: run.totalRecordsChecked,
    issuesFound: run.issuesFound,
    summary: run.summary,
    aiAnalysis: run.aiAnalysis,
    issueCounts: counts,
    completedAt: run.completedAt,
  };
}
