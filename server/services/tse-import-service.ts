import { createReadStream, createWriteStream } from "fs";
import { unlink, mkdir, rm } from "fs/promises";
import { parse } from "csv-parse";
import iconv from "iconv-lite";
import unzipper from "unzipper";
import { pipeline } from "stream/promises";
import path from "path";
import { db } from "../db";
import { storage } from "../storage";
import { generateEmbeddingsForImportJob } from "../semantic-search";
import { refreshAllSummaries } from "../summary-refresh";
import {
  emitBatchStatus,
  emitBatchError,
} from "../websocket";
import { activeImportJobs, isJobCancelled, addToTseQueue } from "./tse-queue-service";
import type { InsertTseCandidateVote, TseImportBatch } from "@shared/schema";
import { tseCandidateVotes } from "@shared/schema";
import { sql } from "drizzle-orm";


export function postImportMaintenance(importType: string, jobId: number): void {
  setTimeout(async () => {
    try {
      console.log(`TSE Import ${jobId}: Running post-import maintenance for ${importType}...`);
      const tableMap: Record<string, string> = {
        CANDIDATO: "tse_candidate_votes",
        PARTIDO: "tse_party_votes",
        DETALHE: "tse_electoral_statistics",
      };
      const tableName = tableMap[importType];
      if (tableName) {
        try {
          await db.execute(sql.raw(`ANALYZE ${tableName}`));
          console.log(`TSE Import ${jobId}: ANALYZE ${tableName} completed`);
        } catch (analyzeErr) {
          console.warn(`TSE Import ${jobId}: ANALYZE ${tableName} skipped (non-fatal):`, analyzeErr);
        }
      }
      await refreshAllSummaries();
      console.log(`TSE Import ${jobId}: Summary tables refreshed`);
    } catch (error) {
      console.error(`TSE Import ${jobId}: Post-import maintenance error (non-fatal):`, error);
    }
  }, 2000);
}

export function mapParsedRowToVote(row: Record<string, unknown>): Record<string, unknown> {
  return {
    dtGeracao: row.DT_GERACAO as string,
    hhGeracao: row.HH_GERACAO as string,
    anoEleicao: parseInt(row.ANO_ELEICAO as string) || null,
    cdTipoEleicao: parseInt(row.CD_TIPO_ELEICAO as string) || null,
    nmTipoEleicao: row.NM_TIPO_ELEICAO as string,
    nrTurno: parseInt(row.NR_TURNO as string) || null,
    cdEleicao: parseInt(row.CD_ELEICAO as string) || null,
    dsEleicao: row.DS_ELEICAO as string,
    dtEleicao: row.DT_ELEICAO as string,
    tpAbrangencia: row.TP_ABRANGENCIA as string,
    sgUf: row.SG_UF as string,
    sgUe: row.SG_UE as string,
    nmUe: row.NM_UE as string,
    cdMunicipio: parseInt(row.CD_MUNICIPIO as string) || null,
    nmMunicipio: row.NM_MUNICIPIO as string,
    nrZona: parseInt(row.NR_ZONA as string) || null,
    cdCargo: parseInt(row.CD_CARGO as string) || null,
    dsCargo: row.DS_CARGO as string,
    sqCandidato: row.SQ_CANDIDATO as string,
    nrCandidato: parseInt(row.NR_CANDIDATO as string) || null,
    nmCandidato: row.NM_CANDIDATO as string,
    nmUrnaCandidato: row.NM_URNA_CANDIDATO as string,
    nmSocialCandidato: row.NM_SOCIAL_CANDIDATO as string,
    cdSituacaoCandidatura: parseInt(row.CD_SITUACAO_CANDIDATURA as string) || null,
    dsSituacaoCandidatura: row.DS_SITUACAO_CANDIDATURA as string,
    cdDetalheSituacaoCand: parseInt(row.CD_DETALHE_SITUACAO_CAND as string) || null,
    dsDetalheSituacaoCand: row.DS_DETALHE_SITUACAO_CAND as string,
    cdSituacaoJulgamento: parseInt(row.CD_SITUACAO_JULGAMENTO as string) || null,
    dsSituacaoJulgamento: row.DS_SITUACAO_JULGAMENTO as string,
    cdSituacaoCassacao: parseInt(row.CD_SITUACAO_CASSACAO as string) || null,
    dsSituacaoCassacao: row.DS_SITUACAO_CASSACAO as string,
    cdSituacaoDconstDiploma: parseInt(row.CD_SITUACAO_DCONST_DIPLOMA as string) || null,
    dsSituacaoDconstDiploma: row.DS_SITUACAO_DCONST_DIPLOMA as string,
    tpAgremiacao: row.TP_AGREMIACAO as string,
    nrPartido: parseInt(row.NR_PARTIDO as string) || null,
    sgPartido: row.SG_PARTIDO as string,
    nmPartido: row.NM_PARTIDO as string,
    nrFederacao: parseInt(row.NR_FEDERACAO as string) || null,
    nmFederacao: row.NM_FEDERACAO as string,
    sgFederacao: row.SG_FEDERACAO as string,
    dsComposicaoFederacao: row.DS_COMPOSICAO_FEDERACAO as string,
    sqColigacao: row.SQ_COLIGACAO as string,
    nmColigacao: row.NM_COLIGACAO as string,
    dsComposicaoColigacao: row.DS_COMPOSICAO_COLIGACAO as string,
    stVotoEmTransito: row.ST_VOTO_EM_TRANSITO as string,
    qtVotosNominais: parseInt(row.QT_VOTOS_NOMINAIS as string) || null,
    nmTipoDestinacaoVotos: row.NM_TIPO_DESTINACAO_VOTOS as string,
    qtVotosNominaisValidos: parseInt(row.QT_VOTOS_NOMINAIS_VALIDOS as string) || null,
    cdSitTotTurno: parseInt(row.CD_SIT_TOT_TURNO as string) || null,
    dsSitTotTurno: row.DS_SIT_TOT_TURNO as string,
  };
}

export const processCSVImport = async (jobId: number, filePath: string) => {
  try {
    await storage.updateTseImportJob(jobId, { 
      status: "processing", 
      stage: "processing",
      startedAt: new Date(),
      updatedAt: new Date()
    });
    await processCSVImportInternal(jobId, filePath);
  } catch (error: any) {
    console.error(`TSE Import ${jobId} failed:`, error);
    await storage.updateTseImportJob(jobId, {
      status: "failed",
      stage: "failed",
      errorCount: 1,
      completedAt: new Date(),
      updatedAt: new Date(),
    });
    await storage.createTseImportError({
      importJobId: jobId,
      rowNumber: 0,
      errorType: "fatal_error",
      errorMessage: error.message,
      rawData: null,
    });
  }
};

export const processURLImport = (jobId: number, url: string, selectedFile?: string) => {
  addToTseQueue({ 
    jobId, 
    type: "url", 
    url,
    processor: () => processURLImportInternal(jobId, url, selectedFile)
  });
};

const processURLImportInternal = async (jobId: number, url: string, selectedFile?: string) => {
  const tmpDir = `/tmp/tse-import-${jobId}`;
  let csvPath: string | null = null;

  activeImportJobs.set(jobId, { cancelled: false });

  try {
    if (isJobCancelled(jobId)) {
      throw new Error("Importação cancelada");
    }

    await storage.updateTseImportJob(jobId, { 
      status: "downloading", 
      stage: "downloading",
      startedAt: new Date(),
      updatedAt: new Date()
    });
    await mkdir(tmpDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength) : 0;
    if (totalBytes > 0) {
      await storage.updateTseImportJob(jobId, { fileSize: totalBytes });
    }

    const zipPath = path.join(tmpDir, "data.zip");
    const fileStream = createWriteStream(zipPath);
    
    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    let downloadedBytes = 0;
    let lastProgressUpdate = Date.now();
    const PROGRESS_UPDATE_INTERVAL = 2000;
    
    while (true) {
      if (isJobCancelled(jobId)) {
        reader.cancel();
        fileStream.end();
        throw new Error("Importação cancelada");
      }

      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloadedBytes += value.length;
      
      const now = Date.now();
      if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
        await storage.updateTseImportJob(jobId, { 
          downloadedBytes,
          updatedAt: new Date()
        });
        lastProgressUpdate = now;
      }
    }
    
    await storage.updateTseImportJob(jobId, { 
      downloadedBytes,
      updatedAt: new Date()
    });
    
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    await storage.updateTseImportJob(jobId, { 
      status: "extracting",
      stage: "extracting",
      updatedAt: new Date()
    });

    const directory = await unzipper.Open.file(zipPath);
    
    const csvFiles = directory.files.filter(f => 
      (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
    );
    
    if (csvFiles.length === 0) {
      throw new Error("No CSV/TXT file found in ZIP");
    }
    
    csvPath = path.join(tmpDir, "data.csv");

    if (selectedFile) {
      const csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
      if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
      console.log(`[CANDIDATO] Using user-selected file: ${csvFile.path}`);
      await pipeline(csvFile.stream(), createWriteStream(csvPath));
    } else {
      const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
      if (brasilFile) {
        console.log(`[CANDIDATO] Found ${csvFiles.length} CSV files, using: ${brasilFile.path} (arquivo BRASIL consolidado)`);
        await pipeline(brasilFile.stream(), createWriteStream(csvPath));
      } else if (csvFiles.length === 1) {
        console.log(`[CANDIDATO] Found 1 CSV file, using: ${csvFiles[0].path}`);
        await pipeline(csvFiles[0].stream(), createWriteStream(csvPath));
      } else {
        console.log(`[CANDIDATO] No _BRASIL file found and no file selected. Using first file: ${csvFiles[0].path}`);
        await pipeline(csvFiles[0].stream(), createWriteStream(csvPath));
      }
    }

    if (isJobCancelled(jobId)) {
      throw new Error("Importação cancelada");
    }

    await storage.updateTseImportJob(jobId, { 
      status: "processing",
      stage: "processing",
      updatedAt: new Date()
    });
    await processCSVImportInternal(jobId, csvPath);

    await unlink(zipPath).catch(() => {});
    await unlink(csvPath).catch(() => {});

    activeImportJobs.delete(jobId);
  } catch (error: any) {
    console.error("URL import error:", error);
    
    if (!isJobCancelled(jobId)) {
      await storage.updateTseImportJob(jobId, {
        status: "failed",
        stage: "failed",
        completedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: error.message || "Unknown error",
      });
    }

    activeImportJobs.delete(jobId);
  }
};

export const processCSVImportInternal = async (jobId: number, filePath: string) => {
  const job = await storage.getTseImportJob(jobId);
  const cargoFilter = job?.cargoFilter;
  
  let rowCount = 0;
  let filteredCount = 0;
  let insertedCount = 0;
  let errorCount = 0;
  const BATCH_SIZE = 2000;

  const firstRowPromise = new Promise<string[]>((resolve, reject) => {
    const parser = createReadStream(filePath)
      .pipe(iconv.decodeStream("latin1"))
      .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2, to_line: 2 }));
    parser.on("data", (row: string[]) => resolve(row));
    parser.on("error", reject);
    parser.on("end", () => resolve([]));
  });
  const firstRow = await firstRowPromise;
  const columnCount = firstRow.length;
  console.log(`[CANDIDATO] Detected ${columnCount} columns in CSV file`);

  let fieldMap: { [key: number]: keyof InsertTseCandidateVote };

  if (columnCount <= 38) {
    fieldMap = {
      0: "dtGeracao",
      1: "hhGeracao",
      2: "anoEleicao",
      3: "cdTipoEleicao",
      4: "nmTipoEleicao",
      5: "nrTurno",
      6: "cdEleicao",
      7: "dsEleicao",
      8: "dtEleicao",
      9: "tpAbrangencia",
      10: "sgUf",
      11: "sgUe",
      12: "nmUe",
      13: "cdMunicipio",
      14: "nmMunicipio",
      15: "nrZona",
      16: "cdCargo",
      17: "dsCargo",
      18: "sqCandidato",
      19: "nrCandidato",
      20: "nmCandidato",
      21: "nmUrnaCandidato",
      22: "nmSocialCandidato",
      23: "cdSituacaoCandidatura",
      24: "dsSituacaoCandidatura",
      25: "cdDetalheSituacaoCand",
      26: "dsDetalheSituacaoCand",
      27: "tpAgremiacao",
      28: "nrPartido",
      29: "sgPartido",
      30: "nmPartido",
      31: "sqColigacao",
      32: "nmColigacao",
      33: "dsComposicaoColigacao",
      34: "cdSitTotTurno",
      35: "dsSitTotTurno",
      36: "stVotoEmTransito",
      37: "qtVotosNominais",
    };
    console.log(`[CANDIDATO] Using legacy format (2002-2014) field mapping - ${columnCount} columns`);
  } else {
    fieldMap = {
      0: "dtGeracao",
      1: "hhGeracao",
      2: "anoEleicao",
      3: "cdTipoEleicao",
      4: "nmTipoEleicao",
      5: "nrTurno",
      6: "cdEleicao",
      7: "dsEleicao",
      8: "dtEleicao",
      9: "tpAbrangencia",
      10: "sgUf",
      11: "sgUe",
      12: "nmUe",
      13: "cdMunicipio",
      14: "nmMunicipio",
      15: "nrZona",
      16: "cdCargo",
      17: "dsCargo",
      18: "sqCandidato",
      19: "nrCandidato",
      20: "nmCandidato",
      21: "nmUrnaCandidato",
      22: "nmSocialCandidato",
      23: "cdSituacaoCandidatura",
      24: "dsSituacaoCandidatura",
      25: "cdDetalheSituacaoCand",
      26: "dsDetalheSituacaoCand",
      27: "cdSituacaoJulgamento",
      28: "dsSituacaoJulgamento",
      29: "cdSituacaoCassacao",
      30: "dsSituacaoCassacao",
      31: "cdSituacaoDconstDiploma",
      32: "dsSituacaoDconstDiploma",
      33: "tpAgremiacao",
      34: "nrPartido",
      35: "sgPartido",
      36: "nmPartido",
      37: "nrFederacao",
      38: "nmFederacao",
      39: "sgFederacao",
      40: "dsComposicaoFederacao",
      41: "sqColigacao",
      42: "nmColigacao",
      43: "dsComposicaoColigacao",
      44: "stVotoEmTransito",
      45: "qtVotosNominais",
      46: "nmTipoDestinacaoVotos",
      47: "qtVotosNominaisValidos",
      48: "cdSitTotTurno",
      49: "dsSitTotTurno",
    };
    console.log(`[CANDIDATO] Using modern format (2022+) field mapping - ${columnCount} columns`);
  }

  const parseValue = (value: string, field: string): any => {
    if (value === "#NULO" || value === "#NE" || value === "") {
      return null;
    }
    if (field.startsWith("sq")) {
      return value;
    }
    if (field.startsWith("qt") || field.startsWith("nr") || field.startsWith("cd") || field === "anoEleicao" || field === "nrTurno") {
      const num = parseInt(value, 10);
      return isNaN(num) ? null : num;
    }
    return value;
  };

  await storage.deleteBatchesByJob(jobId);

  const parser = createReadStream(filePath)
    .pipe(iconv.decodeStream("latin1"))
    .pipe(parse({
      delimiter: ";",
      quote: '"',
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      from_line: 2,
    }));

  let records: InsertTseCandidateVote[] = [];
  let batchIndex = 0;
  let batchFirstOriginalRow = 1;
  let batchLastOriginalRow = 1;
  let currentBatchRecord: TseImportBatch | null = null;
  let batchInserted = 0;
  let batchSkipped = 0;
  let batchErrors = 0;
  let duplicateCount = 0;

  const finalizeBatch = async () => {
    if (records.length === 0 && !currentBatchRecord) return;
    
    if (records.length > 0) {
      try {
        const actualInserted = await storage.bulkInsertTseCandidateVotes(records);
        batchInserted = actualInserted;
        batchSkipped = records.length - actualInserted;
        insertedCount += batchInserted;
        duplicateCount += batchSkipped;
      } catch (err: any) {
        console.error(`[CANDIDATO] Batch ${batchIndex + 1} insert error:`, err);
        batchErrors = records.length;
        errorCount += batchErrors;
      }
    }

    if (currentBatchRecord) {
      await storage.updateImportBatch(currentBatchRecord.id, {
        status: batchErrors > 0 ? "failed" : "completed",
        rowEnd: batchLastOriginalRow,
        totalRows: records.length,
        processedRows: records.length,
        insertedRows: batchInserted,
        skippedRows: batchSkipped,
        errorCount: batchErrors,
        errorSummary: batchErrors > 0 ? "Batch insert errors" : undefined,
        completedAt: new Date(),
      });
    }

    if ((batchIndex + 1) % 5 === 0) {
      const totalSkipped = filteredCount + duplicateCount;
      await storage.updateTseImportJob(jobId, { 
        processedRows: insertedCount,
        skippedRows: totalSkipped,
        errorCount,
        updatedAt: new Date()
      });
    }

    if ((batchIndex + 1) % 5 === 0) {
      console.log(`[CANDIDATO] Batch ${batchIndex + 1}: ${insertedCount} inserted, ${duplicateCount} duplicates, ${filteredCount} filtered, ${errorCount} errors`);
    }

    records = [];
    batchInserted = 0;
    batchSkipped = 0;
    batchErrors = 0;
    batchIndex++;
    batchFirstOriginalRow = 0;
    batchLastOriginalRow = 0;
    currentBatchRecord = null;
    
    await new Promise(resolve => setImmediate(resolve));
  };

  for await (const row of parser) {
    try {
      rowCount++;
      
      const cdCargo = parseInt(row[16], 10) || null;
      if (cargoFilter && cdCargo !== cargoFilter) {
        filteredCount++;
        continue;
      }

      if (batchFirstOriginalRow === 0) {
        batchFirstOriginalRow = rowCount;
      }
      batchLastOriginalRow = rowCount;

      if (!currentBatchRecord) {
        currentBatchRecord = await storage.createImportBatch({
          importJobId: jobId,
          batchIndex,
          status: "processing",
          rowStart: batchFirstOriginalRow,
          rowEnd: batchFirstOriginalRow + BATCH_SIZE - 1,
          totalRows: BATCH_SIZE,
          processedRows: 0,
          insertedRows: 0,
          skippedRows: 0,
          errorCount: 0,
          startedAt: new Date(),
        });
      }

      const record: Partial<InsertTseCandidateVote> = {};

      for (const [index, field] of Object.entries(fieldMap)) {
        const value = row[parseInt(index)];
        if (value !== undefined) {
          (record as any)[field] = parseValue(value, field);
        }
      }

      if (record.anoEleicao && record.nrCandidato) {
        record.importJobId = jobId;
        records.push(record as InsertTseCandidateVote);
      }

      if (records.length >= BATCH_SIZE) {
        await finalizeBatch();
      }
    } catch (err: any) {
      batchErrors++;
      errorCount++;
      await storage.createTseImportError({
        importJobId: jobId,
        errorType: "parse_error",
        rowNumber: rowCount,
        errorMessage: err.message || "Parse error",
        rawData: JSON.stringify(row).substring(0, 1000),
      });
    }
  }

  if (records.length > 0 || currentBatchRecord) {
    await finalizeBatch();
  }

  console.log(`[CANDIDATO] Completed: ${rowCount} total rows, ${insertedCount} inserted, ${filteredCount} filtered, ${errorCount} errors`);
  
  await storage.updateTseImportJob(jobId, { 
    totalFileRows: rowCount,
    stage: "processing",
    updatedAt: new Date()
  });

  const partiesResult = await storage.syncPartiesFromTseImport(jobId);
  console.log(`TSE Import ${jobId}: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);
  
  const dbRowCount = await storage.countTseCandidateVotesByJob(jobId);
  const isValid = dbRowCount === insertedCount;
  const validationMessage = isValid 
    ? `Validação OK: ${dbRowCount.toLocaleString("pt-BR")} registros importados corretamente`
    : `Discrepância detectada: esperado ${insertedCount.toLocaleString("pt-BR")}, encontrado ${dbRowCount.toLocaleString("pt-BR")} no banco`;

  console.log(`TSE Import ${jobId}: Validation - ${validationMessage}`);

  const totalSkipped = filteredCount + duplicateCount;
  await storage.updateTseImportJob(jobId, {
    status: "completed",
    stage: "completed",
    completedAt: new Date(),
    updatedAt: new Date(),
    totalFileRows: rowCount,
    processedRows: insertedCount,
    skippedRows: totalSkipped,
    errorCount: errorCount,
    validationStatus: isValid ? "passed" : "failed",
    validationMessage: validationMessage,
    validatedAt: new Date(),
  });

  postImportMaintenance("CANDIDATO", jobId);

  if (process.env.OPENAI_API_KEY) {
    console.log(`TSE Import ${jobId}: Starting background embedding generation...`);
    generateEmbeddingsForImportJob(jobId)
      .then(result => {
        console.log(`TSE Import ${jobId}: Embeddings generated - ${result.processed} processed, ${result.skipped} skipped, ${result.errors} errors`);
      })
      .catch(error => {
        console.error(`TSE Import ${jobId}: Embedding generation failed:`, error);
      });
  }
};

export const processDetalheVotacaoImport = (jobId: number, url: string, selectedFile?: string) => {
  addToTseQueue({ 
    jobId, 
    type: "detalhe", 
    url, 
    selectedFile,
    processor: () => processDetalheVotacaoImportInternal(jobId, url, selectedFile)
  });
};

const processDetalheVotacaoImportInternal = async (jobId: number, url: string, selectedFile?: string) => {
  const tmpDir = `/tmp/tse-import-${jobId}`;
  activeImportJobs.set(jobId, { cancelled: false });

  try {
    await storage.updateTseImportJob(jobId, { 
      status: "downloading", 
      stage: "downloading",
      startedAt: new Date(),
      updatedAt: new Date()
    });
    await mkdir(tmpDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength) : 0;
    if (totalBytes > 0) {
      await storage.updateTseImportJob(jobId, { fileSize: totalBytes });
    }

    const zipPath = path.join(tmpDir, "data.zip");
    const fileStream = createWriteStream(zipPath);
    
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    let downloadedBytes = 0;
    
    while (true) {
      if (isJobCancelled(jobId)) {
        reader.cancel();
        fileStream.end();
        throw new Error("Importação cancelada");
      }
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloadedBytes += value.length;
    }
    
    await storage.updateTseImportJob(jobId, { downloadedBytes, updatedAt: new Date() });
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    await storage.updateTseImportJob(jobId, { status: "extracting", stage: "extracting", updatedAt: new Date() });

    const directory = await unzipper.Open.file(zipPath);
    const csvFiles = directory.files.filter(f => 
      (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
    );
    
    if (csvFiles.length === 0) throw new Error("No CSV/TXT file found in ZIP");
    
    const csvPath = path.join(tmpDir, "data.csv");
    if (selectedFile) {
      const csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
      if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
      console.log(`[DETALHE] Using user-selected file: ${csvFile.path}`);
      await pipeline(csvFile.stream(), createWriteStream(csvPath));
    } else {
      const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
      if (brasilFile) {
        console.log(`[DETALHE] Found ${csvFiles.length} CSV files, using: ${brasilFile.path} (arquivo BRASIL consolidado)`);
        await pipeline(brasilFile.stream(), createWriteStream(csvPath));
      } else if (csvFiles.length === 1) {
        console.log(`[DETALHE] Found 1 CSV file, using: ${csvFiles[0].path}`);
        await pipeline(csvFiles[0].stream(), createWriteStream(csvPath));
      } else {
        console.log(`[DETALHE] No _BRASIL file found and no file selected. Using first file: ${csvFiles[0].path}`);
        await pipeline(csvFiles[0].stream(), createWriteStream(csvPath));
      }
    }

    await storage.updateTseImportJob(jobId, { status: "processing", stage: "processing", updatedAt: new Date() });

    const job = await storage.getTseImportJob(jobId);
    const cargoFilter = job?.cargoFilter;
    
    const records: any[] = [];
    let rowCount = 0;
    let cargoFilteredCount = 0;
    let duplicateCount = 0;
    let insertedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 2000;

    const fieldMap: { [key: number]: string } = {
      0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
      5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
      10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
      15: "nrZona", 16: "cdCargo", 17: "dsCargo", 18: "qtAptos", 19: "qtSecoesPrincipais",
      20: "qtSecoesAgregadas", 21: "qtSecoesNaoInstaladas", 22: "qtTotalSecoes",
      23: "qtComparecimento", 24: "qtEleitoresSecoesNaoInstaladas", 25: "qtAbstencoes",
      26: "stVotoEmTransito", 27: "qtVotos", 28: "qtVotosConcorrentes",
      29: "qtTotalVotosValidos", 30: "qtVotosNominaisValidos", 31: "qtTotalVotosLegValidos",
      32: "qtVotosLegValidos", 33: "qtVotosNomConvrLegValidos", 34: "qtTotalVotosAnulados",
      35: "qtVotosNominaisAnulados", 36: "qtVotosLegendaAnulados", 37: "qtTotalVotosAnulSubjud",
      38: "qtVotosNominaisAnulSubjud", 39: "qtVotosLegendaAnulSubjud", 40: "qtVotosBrancos",
      41: "qtTotalVotosNulos", 42: "qtVotosNulos", 43: "qtVotosNulosTecnicos",
      44: "qtVotosAnuladosApuSep"
    };

    const parseValue = (value: string | undefined, isNumeric: boolean = false): any => {
      if (!value || value === "#NULO" || value === "#NE") return isNumeric ? 0 : null;
      if (isNumeric) {
        const parsed = parseInt(value.replace(/"/g, ""), 10);
        return isNaN(parsed) || parsed === -1 || parsed === -3 ? 0 : parsed;
      }
      return value.replace(/"/g, "").trim();
    };

    const numericFields = [2, 3, 5, 6, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44];

    await storage.deleteBatchesByJob(jobId);

    const parser = createReadStream(csvPath, { encoding: "latin1" })
      .pipe(parse({ delimiter: ";", relax_quotes: true, relax_column_count: true, skip_empty_lines: true, from_line: 2 }));

    let batchRecords: any[] = [];
    let batchIndex = 0;
    let batchFirstRow = 0;
    let batchLastRow = 0;
    let currentBatchRecord: TseImportBatch | null = null;
    let batchInserted = 0;
    let batchSkipped = 0;
    let batchErrors = 0;
    let totalFileRows = 0;

    const finalizeBatch = async () => {
      if (batchRecords.length === 0 && !currentBatchRecord) return;

      if (batchRecords.length > 0) {
        try {
          const inserted = await storage.insertTseElectoralStatisticsBatch(batchRecords);
          batchInserted = inserted;
          batchSkipped = batchRecords.length - inserted;
          insertedCount += batchInserted;
          duplicateCount += batchSkipped;
        } catch (err: any) {
          console.error(`[DETALHE] Batch ${batchIndex + 1} error:`, err);
          batchErrors = batchRecords.length;
          errorCount += batchErrors;
        }
      }

      if (currentBatchRecord) {
        await storage.updateImportBatch(currentBatchRecord.id, {
          status: batchErrors > 0 ? "failed" : "completed",
          rowEnd: batchLastRow,
          totalRows: batchRecords.length,
          processedRows: batchRecords.length,
          insertedRows: batchInserted,
          skippedRows: batchSkipped,
          errorCount: batchErrors,
          errorSummary: batchErrors > 0 ? "Batch insert errors" : undefined,
          completedAt: new Date(),
        });
      }

      if ((batchIndex + 1) % 5 === 0) {
        const totalSkipped = cargoFilteredCount + duplicateCount;
        await storage.updateTseImportJob(jobId, {
          processedRows: insertedCount,
          skippedRows: totalSkipped,
          errorCount,
          updatedAt: new Date()
        });
        console.log(`[DETALHE] Batch ${batchIndex + 1}: ${insertedCount} inserted, ${duplicateCount} duplicates, ${cargoFilteredCount} filtered`);
      }

      batchRecords = [];
      batchInserted = 0;
      batchSkipped = 0;
      batchErrors = 0;
      batchIndex++;
      batchFirstRow = 0;
      batchLastRow = 0;
      currentBatchRecord = null;

      await new Promise(resolve => setImmediate(resolve));
    };

    for await (const row of parser) {
      try {
        totalFileRows++;

        const cdCargo = parseValue(row[16], true);
        if (cargoFilter && cdCargo !== cargoFilter) {
          cargoFilteredCount++;
          continue;
        }

        rowCount++;

        if (batchFirstRow === 0) {
          batchFirstRow = totalFileRows;
        }
        batchLastRow = totalFileRows;

        if (!currentBatchRecord) {
          currentBatchRecord = await storage.createImportBatch({
            importJobId: jobId,
            batchIndex,
            status: "processing",
            rowStart: batchFirstRow,
            rowEnd: batchFirstRow + BATCH_SIZE - 1,
            totalRows: BATCH_SIZE,
            processedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            errorCount: 0,
            startedAt: new Date(),
          });
        }

        const record: any = { importJobId: jobId };
        for (const [index, field] of Object.entries(fieldMap)) {
          const idx = parseInt(index);
          if (idx < row.length) {
            record[field] = parseValue(row[idx], numericFields.includes(idx));
          }
        }
        batchRecords.push(record);

        if (batchRecords.length >= BATCH_SIZE) {
          await finalizeBatch();
        }

        if (totalFileRows % 50000 === 0) {
          await storage.updateTseImportJob(jobId, {
            totalFileRows: totalFileRows,
            updatedAt: new Date()
          });
        }
      } catch (err: any) {
        batchErrors++;
        errorCount++;
      }
    }

    if (batchRecords.length > 0 || currentBatchRecord) {
      await finalizeBatch();
    }

    console.log(`[DETALHE] Streaming complete: ${totalFileRows} file rows, ${rowCount} processed`);
    
    await storage.updateTseImportJob(jobId, {
      totalFileRows: totalFileRows,
      stage: "processing",
      updatedAt: new Date()
    });

    const totalSkipped = cargoFilteredCount + duplicateCount;
    const validationMessage = insertedCount === 0 && duplicateCount > 0
      ? `Dados já importados: ${duplicateCount.toLocaleString("pt-BR")} registros duplicados encontrados`
      : insertedCount > 0
        ? `Importação concluída: ${insertedCount.toLocaleString("pt-BR")} inseridos, ${duplicateCount.toLocaleString("pt-BR")} duplicados`
        : null;

    console.log(`[DETALHE] Completed: ${rowCount} total, ${insertedCount} inserted, ${duplicateCount} duplicates, ${cargoFilteredCount} cargo-filtered, ${errorCount} errors`);

    await storage.updateTseImportJob(jobId, {
      status: "completed",
      stage: "completed",
      totalRows: rowCount,
      processedRows: insertedCount,
      skippedRows: totalSkipped,
      errorCount,
      completedAt: new Date(),
      updatedAt: new Date(),
      validationMessage: validationMessage,
    });

    postImportMaintenance("DETALHE", jobId);

    await unlink(zipPath).catch(() => {});
    await unlink(csvPath).catch(() => {});
    activeImportJobs.delete(jobId);
  } catch (error: any) {
    console.error("Detalhe votacao import error:", error);
    if (!isJobCancelled(jobId)) {
      await storage.updateTseImportJob(jobId, {
        status: "failed", stage: "failed", completedAt: new Date(),
        updatedAt: new Date(), errorMessage: error.message || "Unknown error",
      });
    }
    activeImportJobs.delete(jobId);
  }
};

export const processPartidoVotacaoImport = (jobId: number, url: string, selectedFile?: string) => {
  addToTseQueue({ 
    jobId, 
    type: "partido", 
    url, 
    selectedFile,
    processor: () => processPartidoVotacaoImportInternal(jobId, url, selectedFile)
  });
};

const processPartidoVotacaoImportInternal = async (jobId: number, url: string, selectedFile?: string) => {
  const tmpDir = `/tmp/tse-import-${jobId}`;
  activeImportJobs.set(jobId, { cancelled: false });

  try {
    await storage.updateTseImportJob(jobId, { 
      status: "downloading", stage: "downloading", startedAt: new Date(), updatedAt: new Date()
    });
    await mkdir(tmpDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.status} ${response.statusText}`);

    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength) : 0;
    if (totalBytes > 0) await storage.updateTseImportJob(jobId, { fileSize: totalBytes });

    const zipPath = path.join(tmpDir, "data.zip");
    const fileStream = createWriteStream(zipPath);
    
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    let downloadedBytes = 0;
    
    while (true) {
      if (isJobCancelled(jobId)) {
        reader.cancel();
        fileStream.end();
        throw new Error("Importação cancelada");
      }
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloadedBytes += value.length;
    }
    
    await storage.updateTseImportJob(jobId, { downloadedBytes, updatedAt: new Date() });
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    await storage.updateTseImportJob(jobId, { status: "extracting", stage: "extracting", updatedAt: new Date() });

    const directory = await unzipper.Open.file(zipPath);
    const csvFiles = directory.files.filter(f => 
      (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
    );
    
    if (csvFiles.length === 0) throw new Error("No CSV/TXT file found in ZIP");
    
    const csvPath = path.join(tmpDir, "data.csv");
    if (selectedFile) {
      const csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
      if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
      console.log(`[PARTIDO] Using user-selected file: ${csvFile.path}`);
      await pipeline(csvFile.stream(), createWriteStream(csvPath));
    } else {
      const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
      if (brasilFile) {
        console.log(`[PARTIDO] Found ${csvFiles.length} CSV files, using: ${brasilFile.path} (arquivo BRASIL consolidado)`);
        await pipeline(brasilFile.stream(), createWriteStream(csvPath));
      } else if (csvFiles.length === 1) {
        console.log(`[PARTIDO] Found 1 CSV file, using: ${csvFiles[0].path}`);
        await pipeline(csvFiles[0].stream(), createWriteStream(csvPath));
      } else {
        console.log(`[PARTIDO] No _BRASIL file found and no file selected. Using first file: ${csvFiles[0].path}`);
        await pipeline(csvFiles[0].stream(), createWriteStream(csvPath));
      }
    }

    await storage.updateTseImportJob(jobId, { status: "processing", stage: "processing", updatedAt: new Date() });

    const job = await storage.getTseImportJob(jobId);
    const cargoFilter = job?.cargoFilter;
    
    const records: any[] = [];
    let rowCount = 0;
    let cargoFilteredCount = 0;
    let duplicateCount = 0;
    let insertedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 2000;

    const firstRowPromise = new Promise<string[]>((resolve, reject) => {
      const parser = createReadStream(csvPath, { encoding: "latin1" })
        .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2, to_line: 2 }));
      parser.on("data", (row: string[]) => resolve(row));
      parser.on("error", reject);
      parser.on("end", () => resolve([]));
    });
    const firstRow = await firstRowPromise;
    const columnCount = firstRow.length;
    console.log(`[PARTIDO] Detected ${columnCount} columns in CSV file`);

    let fieldMap: { [key: number]: string };
    let numericFields: number[];

    if (columnCount <= 23) {
      fieldMap = {
        0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
        5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
        10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
        15: "nrZona", 16: "cdCargo", 17: "dsCargo",
        18: "nrPartido", 19: "sgPartido", 20: "nmPartido",
        21: "qtVotosNominaisValidos", 22: "qtVotosLegendaValidos"
      };
      numericFields = [2, 3, 5, 6, 13, 15, 16, 18, 21, 22];
      console.log(`[PARTIDO] Using legacy format (≤2010) field mapping - ${columnCount} columns`);
    } else if (columnCount <= 30) {
      fieldMap = {
        0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
        5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
        10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
        15: "nrZona", 16: "cdCargo", 17: "dsCargo", 18: "tpAgremiacao",
        19: "nrPartido", 20: "sgPartido", 21: "nmPartido",
        22: "sqColigacao", 23: "nmColigacao", 24: "dsComposicaoColigacao",
        25: "stVotoEmTransito", 26: "qtVotosNominaisValidos", 27: "qtVotosLegendaValidos"
      };
      numericFields = [2, 3, 5, 6, 13, 15, 16, 19, 26, 27];
      console.log(`[PARTIDO] Using intermediate format (2014-2018) field mapping - ${columnCount} columns`);
    } else {
      fieldMap = {
        0: "dtGeracao", 1: "hhGeracao", 2: "anoEleicao", 3: "cdTipoEleicao", 4: "nmTipoEleicao",
        5: "nrTurno", 6: "cdEleicao", 7: "dsEleicao", 8: "dtEleicao", 9: "tpAbrangencia",
        10: "sgUf", 11: "sgUe", 12: "nmUe", 13: "cdMunicipio", 14: "nmMunicipio",
        15: "nrZona", 16: "cdCargo", 17: "dsCargo", 18: "tpAgremiacao", 19: "nrPartido",
        20: "sgPartido", 21: "nmPartido", 22: "nrFederacao", 23: "nmFederacao", 24: "sgFederacao",
        25: "dsComposicaoFederacao", 26: "sqColigacao", 27: "nmColigacao", 28: "dsComposicaoColigacao",
        29: "stVotoEmTransito", 30: "qtVotosLegendaValidos", 31: "qtVotosNomConvrLegValidos",
        32: "qtTotalVotosLegValidos", 33: "qtVotosNominaisValidos", 34: "qtVotosLegendaAnulSubjud",
        35: "qtVotosNominaisAnulSubjud", 36: "qtVotosLegendaAnulados", 37: "qtVotosNominaisAnulados"
      };
      numericFields = [2, 3, 5, 6, 13, 15, 16, 19, 22, 30, 31, 32, 33, 34, 35, 36, 37];
      console.log(`[PARTIDO] Using modern format (2022+) field mapping - ${columnCount} columns`);
    }

    const getFieldIndex = (fieldName: string): number => {
      for (const [idx, name] of Object.entries(fieldMap)) {
        if (name === fieldName) return parseInt(idx);
      }
      return -1;
    };
    
    const idxAnoEleicao = getFieldIndex("anoEleicao");
    const idxCdEleicao = getFieldIndex("cdEleicao");
    const idxNrTurno = getFieldIndex("nrTurno");
    const idxSgUf = getFieldIndex("sgUf");
    const idxCdMunicipio = getFieldIndex("cdMunicipio");
    const idxNrZona = getFieldIndex("nrZona");
    const idxCdCargo = getFieldIndex("cdCargo");
    const idxNrPartido = getFieldIndex("nrPartido");
    const idxStVotoEmTransito = getFieldIndex("stVotoEmTransito");

    const parseValue = (value: string | undefined, isNumeric: boolean = false): any => {
      if (!value || value === "#NULO" || value === "#NE") return isNumeric ? 0 : null;
      if (isNumeric) {
        const parsed = parseInt(value.replace(/"/g, ""), 10);
        return isNaN(parsed) || parsed === -1 || parsed === -3 ? 0 : parsed;
      }
      return value.replace(/"/g, "").trim();
    };

    await storage.deleteBatchesByJob(jobId);

    const seenKeys = new Set<string>();
    let csvDuplicateCount = 0;
    let totalFileRows = 0;

    const parser = createReadStream(csvPath, { encoding: "latin1" })
      .pipe(parse({ delimiter: ";", relax_quotes: true, relax_column_count: true, skip_empty_lines: true, from_line: 2 }));

    let batchRecords: any[] = [];
    let batchIndex = 0;
    let batchFirstRow = 0;
    let batchLastRow = 0;
    let currentBatchRecord: TseImportBatch | null = null;
    let batchInserted = 0;
    let batchSkipped = 0;
    let batchErrors = 0;

    const finalizeBatch = async () => {
      if (batchRecords.length === 0 && !currentBatchRecord) return;

      if (batchRecords.length > 0) {
        try {
          const inserted = await storage.insertTsePartyVotesBatch(batchRecords);
          batchInserted = inserted;
          batchSkipped = batchRecords.length - inserted;
          insertedCount += batchInserted;
          duplicateCount += batchSkipped;
        } catch (err: any) {
          console.error(`[PARTIDO] Batch ${batchIndex + 1} error:`, err);
          batchErrors = batchRecords.length;
          errorCount += batchErrors;
        }
      }

      if (currentBatchRecord) {
        await storage.updateImportBatch(currentBatchRecord.id, {
          status: batchErrors > 0 ? "failed" : "completed",
          rowEnd: batchLastRow,
          totalRows: batchRecords.length,
          processedRows: batchRecords.length,
          insertedRows: batchInserted,
          skippedRows: batchSkipped,
          errorCount: batchErrors,
          errorSummary: batchErrors > 0 ? "Batch insert errors" : undefined,
          completedAt: new Date(),
        });
      }

      if ((batchIndex + 1) % 5 === 0) {
        const totalSkipped = cargoFilteredCount + duplicateCount + csvDuplicateCount;
        await storage.updateTseImportJob(jobId, {
          processedRows: insertedCount,
          skippedRows: totalSkipped,
          errorCount,
          updatedAt: new Date()
        });
        console.log(`[PARTIDO] Batch ${batchIndex + 1}: ${insertedCount} inserted, ${duplicateCount} DB dupes, ${csvDuplicateCount} CSV dupes`);
      }

      batchRecords = [];
      batchInserted = 0;
      batchSkipped = 0;
      batchErrors = 0;
      batchIndex++;
      batchFirstRow = 0;
      batchLastRow = 0;
      currentBatchRecord = null;

      await new Promise(resolve => setImmediate(resolve));
    };

    for await (const row of parser) {
      try {
        totalFileRows++;

        const cdCargo = parseValue(row[idxCdCargo], true);
        if (cargoFilter && cdCargo !== cargoFilter) {
          cargoFilteredCount++;
          continue;
        }

        const key = [
          parseValue(row[idxAnoEleicao], true),
          parseValue(row[idxCdEleicao], true),
          parseValue(row[idxNrTurno], true),
          parseValue(row[idxSgUf], false),
          parseValue(row[idxCdMunicipio], true),
          parseValue(row[idxNrZona], true),
          parseValue(row[idxCdCargo], true),
          parseValue(row[idxNrPartido], true),
          idxStVotoEmTransito >= 0 ? parseValue(row[idxStVotoEmTransito], false) : "N",
        ].join('|');

        if (seenKeys.has(key)) {
          csvDuplicateCount++;
          continue;
        }
        seenKeys.add(key);

        rowCount++;

        if (batchFirstRow === 0) {
          batchFirstRow = totalFileRows;
        }
        batchLastRow = totalFileRows;

        if (!currentBatchRecord) {
          currentBatchRecord = await storage.createImportBatch({
            importJobId: jobId,
            batchIndex,
            status: "processing",
            rowStart: batchFirstRow,
            rowEnd: batchFirstRow + BATCH_SIZE - 1,
            totalRows: BATCH_SIZE,
            processedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            errorCount: 0,
            startedAt: new Date(),
          });
        }

        const record: any = { importJobId: jobId };
        for (const [index, field] of Object.entries(fieldMap)) {
          const idx = parseInt(index);
          if (idx < row.length) {
            record[field] = parseValue(row[idx], numericFields.includes(idx));
          }
        }
        batchRecords.push(record);

        if (batchRecords.length >= BATCH_SIZE) {
          await finalizeBatch();
        }

        if (totalFileRows % 50000 === 0) {
          await storage.updateTseImportJob(jobId, {
            totalFileRows: totalFileRows,
            updatedAt: new Date()
          });
        }
      } catch (err: any) {
        batchErrors++;
        errorCount++;
      }
    }

    if (batchRecords.length > 0 || currentBatchRecord) {
      await finalizeBatch();
    }

    if (csvDuplicateCount > 0) {
      console.log(`[PARTIDO] Found ${csvDuplicateCount} duplicate rows in CSV (exact same unique key)`);
    }

    const partiesResult = await storage.syncPartiesFromTseImport(jobId);
    console.log(`TSE Import ${jobId} [PARTIDO]: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);

    const totalSkipped = cargoFilteredCount + duplicateCount + csvDuplicateCount;
    const validationMessage = insertedCount === 0 && (duplicateCount > 0 || csvDuplicateCount > 0)
      ? `Dados já importados: ${(duplicateCount + csvDuplicateCount).toLocaleString("pt-BR")} registros duplicados encontrados`
      : insertedCount > 0
        ? `Importação concluída: ${insertedCount.toLocaleString("pt-BR")} inseridos, ${csvDuplicateCount > 0 ? `${csvDuplicateCount.toLocaleString("pt-BR")} duplicados CSV + ` : ''}${duplicateCount.toLocaleString("pt-BR")} duplicados DB`
        : null;

    console.log(`[PARTIDO] Completed: ${totalFileRows} total file rows, ${insertedCount} inserted, ${csvDuplicateCount} CSV duplicates, ${duplicateCount} DB duplicates, ${cargoFilteredCount} cargo-filtered, ${errorCount} errors`);

    await storage.updateTseImportJob(jobId, {
      status: "completed", stage: "completed", totalRows: rowCount,
      totalFileRows: totalFileRows,
      processedRows: insertedCount, skippedRows: totalSkipped,
      errorCount, completedAt: new Date(), updatedAt: new Date(),
      validationMessage: validationMessage,
    });

    postImportMaintenance("PARTIDO", jobId);

    await unlink(zipPath).catch(() => {});
    await unlink(csvPath).catch(() => {});
    activeImportJobs.delete(jobId);
  } catch (error: any) {
    console.error("Partido votacao import error:", error);
    if (!isJobCancelled(jobId)) {
      await storage.updateTseImportJob(jobId, {
        status: "failed", stage: "failed", completedAt: new Date(),
        updatedAt: new Date(), errorMessage: error.message || "Unknown error",
      });
    }
    activeImportJobs.delete(jobId);
  }
};

export async function reprocessBatch(batchId: number, jobId: number): Promise<void> {
  try {
    const batch = await storage.getImportBatch(batchId);
    if (!batch) {
      console.error(`Batch ${batchId} not found for reprocessing`);
      return;
    }

    await storage.updateImportBatch(batchId, { 
      status: "processing", 
      startedAt: new Date() 
    });
    
    emitBatchStatus(jobId, batchId, batch.batchIndex, "processing", 0, batch.totalRows, 0);
    
    const rows = await storage.getBatchRows(batchId, "pending");
    let processed = 0;
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages: string[] = [];
    
    for (const row of rows) {
      try {
        if (!row.parsedData) {
          await storage.updateBatchRow(row.id, { 
            status: "failed", 
            errorType: "parse_error",
            errorMessage: "No parsed data available"
          });
          errors++;
          continue;
        }
        
        const parsedRow = row.parsedData as Record<string, unknown>;
        
        await db.insert(tseCandidateVotes).values({
          importJobId: jobId,
          ...mapParsedRowToVote(parsedRow),
        });
        
        await storage.updateBatchRow(row.id, { status: "success" });
        inserted++;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await storage.updateBatchRow(row.id, { 
          status: "failed", 
          errorType: "insert_error",
          errorMessage
        });
        errors++;
        if (errorMessages.length < 5) {
          errorMessages.push(`Row ${row.rowNumber}: ${errorMessage}`);
        }
        
        emitBatchError(jobId, batchId, row.rowNumber, "insert_error", errorMessage);
      }
      
      processed++;
      
      if (processed % 100 === 0) {
        emitBatchStatus(jobId, batchId, batch.batchIndex, "processing", processed, rows.length, errors);
      }
    }
    
    const finalStatus = errors === 0 ? "completed" : (inserted > 0 ? "completed" : "failed");
    
    await storage.updateImportBatch(batchId, {
      status: finalStatus,
      processedRows: processed,
      insertedRows: inserted,
      skippedRows: skipped,
      errorCount: errors,
      errorSummary: errorMessages.length > 0 ? errorMessages.join("; ") : null,
      completedAt: new Date(),
    });
    
    emitBatchStatus(jobId, batchId, batch.batchIndex, finalStatus, processed, rows.length, errors);
    
    console.log(`Batch ${batchId} reprocessed: ${inserted} inserted, ${errors} errors`);
  } catch (error) {
    console.error(`Batch ${batchId} reprocessing error:`, error);
    await storage.updateImportBatch(batchId, { 
      status: "failed", 
      errorSummary: error instanceof Error ? error.message : "Reprocessing failed"
    });
  }
}
