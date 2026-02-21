import { db } from "./db";
import { sql } from "drizzle-orm";

let refreshInProgress = false;

export function isSummaryRefreshInProgress(): boolean {
  return refreshInProgress;
}

export async function refreshAllSummaries(): Promise<{ duration: number; tables: string[] }> {
  if (refreshInProgress) {
    console.log("[Summary] Refresh already in progress, skipping");
    return { duration: 0, tables: [] };
  }

  refreshInProgress = true;
  const start = Date.now();
  const tables: string[] = [];

  try {
    await refreshPartyVotesSummary();
    tables.push("summary_party_votes");

    await refreshCandidateVotesSummary();
    tables.push("summary_candidate_votes");

    await refreshStateVotesSummary();
    tables.push("summary_state_votes");

    const duration = Date.now() - start;
    console.log(`[Summary] All summaries refreshed in ${duration}ms`);
    return { duration, tables };
  } catch (error) {
    console.error("[Summary] Error refreshing summaries:", error);
    throw error;
  } finally {
    refreshInProgress = false;
  }
}

export async function refreshPartyVotesSummary(): Promise<void> {
  console.log("[Summary] Refreshing summary_party_votes...");
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM summary_party_votes`);
    await tx.execute(sql`
      INSERT INTO summary_party_votes (ano_eleicao, sg_uf, cd_cargo, ds_cargo, nm_tipo_eleicao, sg_partido, nr_partido, nm_partido, total_votos_nominais, total_votos_legenda, total_votos_validos, total_candidatos, total_municipios)
      SELECT
        cv.ano_eleicao,
        cv.sg_uf,
        cv.cd_cargo,
        cv.ds_cargo,
        cv.nm_tipo_eleicao,
        cv.sg_partido,
        MAX(cv.nr_partido),
        MAX(cv.nm_partido),
        COALESCE(SUM(cv.qt_votos_nominais), 0),
        COALESCE(pv.total_legenda, 0),
        COALESCE(SUM(cv.qt_votos_nominais_validos), 0) + COALESCE(pv.total_legenda, 0),
        COUNT(DISTINCT cv.sq_candidato),
        COUNT(DISTINCT cv.cd_municipio)
      FROM tse_candidate_votes cv
      LEFT JOIN (
        SELECT ano_eleicao, sg_uf, cd_cargo, sg_partido,
          SUM(qt_votos_legenda_validos) as total_legenda
        FROM tse_party_votes
        GROUP BY ano_eleicao, sg_uf, cd_cargo, sg_partido
      ) pv ON pv.ano_eleicao = cv.ano_eleicao AND pv.sg_uf = cv.sg_uf AND pv.cd_cargo = cv.cd_cargo AND pv.sg_partido = cv.sg_partido
      WHERE cv.ano_eleicao IS NOT NULL AND cv.sg_partido IS NOT NULL
      GROUP BY cv.ano_eleicao, cv.sg_uf, cv.cd_cargo, cv.ds_cargo, cv.nm_tipo_eleicao, cv.sg_partido, pv.total_legenda
    `);
  });
  console.log("[Summary] summary_party_votes refreshed");
}

export async function refreshCandidateVotesSummary(): Promise<void> {
  console.log("[Summary] Refreshing summary_candidate_votes...");
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM summary_candidate_votes`);
    await tx.execute(sql`
      INSERT INTO summary_candidate_votes (ano_eleicao, sg_uf, cd_cargo, ds_cargo, nm_tipo_eleicao, sq_candidato, nr_candidato, nm_candidato, nm_urna_candidato, sg_partido, nr_partido, total_votos_nominais, total_municipios, ds_sit_tot_turno)
      SELECT
        ano_eleicao,
        sg_uf,
        cd_cargo,
        ds_cargo,
        nm_tipo_eleicao,
        sq_candidato,
        MAX(nr_candidato),
        MAX(nm_candidato),
        MAX(nm_urna_candidato),
        MAX(sg_partido),
        MAX(nr_partido),
        COALESCE(SUM(qt_votos_nominais), 0),
        COUNT(DISTINCT cd_municipio),
        MAX(ds_sit_tot_turno)
      FROM tse_candidate_votes
      WHERE ano_eleicao IS NOT NULL AND sq_candidato IS NOT NULL
      GROUP BY ano_eleicao, sg_uf, cd_cargo, ds_cargo, nm_tipo_eleicao, sq_candidato
    `);
  });
  console.log("[Summary] summary_candidate_votes refreshed");
}

export async function refreshStateVotesSummary(): Promise<void> {
  console.log("[Summary] Refreshing summary_state_votes...");
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM summary_state_votes`);
    await tx.execute(sql`
      INSERT INTO summary_state_votes (ano_eleicao, sg_uf, cd_cargo, ds_cargo, nm_tipo_eleicao, total_votos, total_candidatos, total_partidos, total_municipios)
      SELECT
        ano_eleicao,
        sg_uf,
        cd_cargo,
        ds_cargo,
        nm_tipo_eleicao,
        COALESCE(SUM(qt_votos_nominais), 0),
        COUNT(DISTINCT sq_candidato),
        COUNT(DISTINCT sg_partido),
        COUNT(DISTINCT cd_municipio)
      FROM tse_candidate_votes
      WHERE ano_eleicao IS NOT NULL AND sg_uf IS NOT NULL AND sg_uf != 'ZZ'
      GROUP BY ano_eleicao, sg_uf, cd_cargo, ds_cargo, nm_tipo_eleicao
    `);
  });
  console.log("[Summary] summary_state_votes refreshed");
}
