import { Router } from "express";
import { createReadStream, createWriteStream } from "fs";
import { unlink, mkdir, readdir, stat, rm } from "fs/promises";
import { parse } from "csv-parse";
import iconv from "iconv-lite";
import unzipper from "unzipper";
import { pipeline } from "stream/promises";
import path from "path";
import { z } from "zod";
import { sql, eq, and, desc, gte, lte } from "drizzle-orm";
import { requireAuth, requireRole, logAudit, upload } from "./shared";
import { storage } from "../storage";
import { db } from "../db";
import {
  emitBatchStatus,
  emitBatchError,
} from "../websocket";
import { generateEmbeddingsForImportJob } from "../semantic-search";
import { refreshAllSummaries } from "../summary-refresh";
import type { InsertTseCandidateVote, TseImportBatch } from "@shared/schema";
import { tseCandidateVotes } from "@shared/schema";

const router = Router();

const activeImportJobs = new Map<number, { cancelled: boolean; abortController?: AbortController }>();

function postImportMaintenance(importType: string, jobId: number): void {
  setTimeout(async () => {
    try {
      console.log(`TSE Import ${jobId}: Running post-import maintenance for ${importType}...`);
      if (importType === "CANDIDATO" || importType === "PARTIDO") {
        const tableName = importType === "CANDIDATO" ? "tse_candidate_votes" : "tse_party_votes";
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

function isJobCancelled(jobId: number): boolean {
  const job = activeImportJobs.get(jobId);
  return job?.cancelled ?? false;
}

interface TseQueueItem {
  jobId: number;
  type: "url" | "detalhe" | "partido";
  url: string;
  selectedFile?: string;
  processor: () => Promise<void>;
}

const tseImportQueue: TseQueueItem[] = [];
let isTseQueueProcessing = false;
let currentTseJob: number | null = null;

function getTseQueueStatus() {
  return {
    isProcessing: isTseQueueProcessing,
    currentJob: currentTseJob,
    queueLength: tseImportQueue.length,
    queue: [
      ...(currentTseJob !== null ? [{
        position: 0,
        jobId: currentTseJob,
        type: "processing" as const,
        isProcessing: true,
      }] : []),
      ...tseImportQueue.map((item, index) => ({
        position: index + 1,
        jobId: item.jobId,
        type: item.type,
        isProcessing: false,
      })),
    ],
  };
}

async function addToTseQueue(item: TseQueueItem) {
  const position = tseImportQueue.length + 1;
  tseImportQueue.push(item);
  console.log(`[TSE Queue] Job ${item.jobId} added to queue at position ${position}. Queue length: ${tseImportQueue.length}`);
  
  await storage.updateTseImportJob(item.jobId, {
    stage: "queued",
    updatedAt: new Date(),
  });
  
  processNextTseJob();
}

async function removeFromTseQueue(jobId: number): Promise<boolean> {
  const index = tseImportQueue.findIndex(item => item.jobId === jobId);
  if (index !== -1) {
    tseImportQueue.splice(index, 1);
    console.log(`[TSE Queue] Job ${jobId} removed from queue. Queue length: ${tseImportQueue.length}`);
    return true;
  }
  return false;
}

async function processNextTseJob() {
  if (isTseQueueProcessing || tseImportQueue.length === 0) {
    return;
  }

  const item = tseImportQueue.shift();
  if (!item) return;

  isTseQueueProcessing = true;
  currentTseJob = item.jobId;
  console.log(`[TSE Queue] Starting job ${item.jobId}. Remaining in queue: ${tseImportQueue.length}`);

  try {
    await item.processor();
  } catch (error) {
    console.error(`[TSE Queue] Job ${item.jobId} failed:`, error);
  } finally {
    isTseQueueProcessing = false;
    currentTseJob = null;
    console.log(`[TSE Queue] Job ${item.jobId} finished. Processing next...`);
    processNextTseJob();
  }
}

router.get("/api/imports/tse", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobs = await storage.getTseImportJobs();
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch import jobs" });
  }
});

router.get("/api/imports/tse/queue/status", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const status = getTseQueueStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch queue status" });
  }
});

router.get("/api/imports/tse/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const job = await storage.getTseImportJob(parseInt(req.params.id));
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }
    res.json(job);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch import job" });
  }
});

router.get("/api/imports/tse/:id/errors", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const errors = await storage.getTseImportErrors(parseInt(req.params.id));
    res.json(errors);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch import errors" });
  }
});

router.get("/api/imports/tse/:id/batches", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }
    const batches = await storage.getImportBatches(jobId);
    const stats = await storage.getBatchStats(jobId);
    res.json({ batches, stats });
  } catch (error) {
    console.error("Failed to fetch import batches:", error);
    res.status(500).json({ error: "Failed to fetch import batches" });
  }
});

router.get("/api/imports/tse/:jobId/batches/:batchId", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const batchId = parseInt(req.params.batchId);
    if (isNaN(jobId) || isNaN(batchId)) {
      return res.status(400).json({ error: "Invalid IDs" });
    }
    
    const batch = await storage.getImportBatch(batchId);
    if (!batch || batch.importJobId !== jobId) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    const rows = await storage.getBatchRows(batchId);
    const failedRows = rows.filter(r => r.status === "failed");
    
    res.json({ 
      batch, 
      rows,
      summary: {
        total: rows.length,
        success: rows.filter(r => r.status === "success").length,
        failed: failedRows.length,
        skipped: rows.filter(r => r.status === "skipped").length,
        pending: rows.filter(r => r.status === "pending").length,
      }
    });
  } catch (error) {
    console.error("Failed to fetch batch details:", error);
    res.status(500).json({ error: "Failed to fetch batch details" });
  }
});

router.get("/api/imports/tse/:jobId/batches/:batchId/failed-rows", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const batchId = parseInt(req.params.batchId);
    if (isNaN(batchId)) {
      return res.status(400).json({ error: "Invalid batch ID" });
    }
    
    const rows = await storage.getFailedBatchRows(batchId);
    res.json(rows);
  } catch (error) {
    console.error("Failed to fetch failed rows:", error);
    res.status(500).json({ error: "Failed to fetch failed rows" });
  }
});

router.post("/api/imports/tse/:jobId/batches/:batchId/reprocess", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const batchId = parseInt(req.params.batchId);
    if (isNaN(jobId) || isNaN(batchId)) {
      return res.status(400).json({ error: "Invalid IDs" });
    }
    
    const batch = await storage.getImportBatch(batchId);
    if (!batch || batch.importJobId !== jobId) {
      return res.status(404).json({ error: "Batch not found" });
    }
    
    if (batch.status !== "failed") {
      return res.status(400).json({ error: "Only failed batches can be reprocessed" });
    }
    
    const resetCount = await storage.resetBatchRowsForReprocess(batchId);
    
    await storage.updateImportBatch(batchId, { 
      status: "pending",
      errorCount: 0,
      processedRows: 0,
      errorSummary: null,
    });
    
    reprocessBatch(batchId, jobId).catch(err => {
      console.error(`Batch ${batchId} reprocessing failed:`, err);
    });
    
    await logAudit(req, "update", "tse_import_batch", String(batchId), {
      action: "reprocess",
      jobId,
      rowsReset: resetCount,
    });
    
    res.json({ 
      success: true, 
      message: "Batch reprocessing started",
      rowsToReprocess: resetCount
    });
  } catch (error) {
    console.error("Failed to reprocess batch:", error);
    res.status(500).json({ error: "Failed to reprocess batch" });
  }
});

router.post("/api/imports/tse/:id/batches/reprocess-all-failed", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }
    
    const failedBatches = await storage.getFailedBatches(jobId);
    if (failedBatches.length === 0) {
      return res.status(400).json({ error: "No failed batches to reprocess" });
    }
    
    let totalRowsReset = 0;
    for (const batch of failedBatches) {
      const resetCount = await storage.resetBatchRowsForReprocess(batch.id);
      totalRowsReset += resetCount;
      
      await storage.updateImportBatch(batch.id, { 
        status: "pending",
        errorCount: 0,
        processedRows: 0,
        errorSummary: null,
      });
      
      reprocessBatch(batch.id, jobId).catch(err => {
        console.error(`Batch ${batch.id} reprocessing failed:`, err);
      });
    }
    
    await logAudit(req, "update", "tse_import_job", String(jobId), {
      action: "reprocess_all_failed",
      batchCount: failedBatches.length,
      totalRowsReset,
    });
    
    res.json({ 
      success: true, 
      message: `Reprocessing ${failedBatches.length} failed batches`,
      batchCount: failedBatches.length,
      totalRowsToReprocess: totalRowsReset
    });
  } catch (error) {
    console.error("Failed to reprocess failed batches:", error);
    res.status(500).json({ error: "Failed to reprocess failed batches" });
  }
});

router.get("/api/imports/tse/:id/validation", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }
    
    const { getValidationStatus } = await import("../data-validation");
    const status = await getValidationStatus(jobId);
    res.json(status);
  } catch (error) {
    console.error("Failed to fetch validation status:", error);
    res.status(500).json({ error: "Failed to fetch validation status" });
  }
});

router.post("/api/imports/tse/:id/validation/run", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }
    
    const job = await storage.getTseImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }
    
    if (job.status !== "completed") {
      return res.status(400).json({ error: "Can only validate completed imports" });
    }
    
    const { runValidation } = await import("../data-validation");
    const result = await runValidation(jobId);
    
    await logAudit(req, "create", "validation_run", String(result.runId), {
      jobId,
      issuesFound: result.summary.issuesFound,
    });
    
    res.json(result);
  } catch (error) {
    console.error("Failed to run validation:", error);
    res.status(500).json({ error: "Failed to run validation" });
  }
});

router.get("/api/validation-runs/:runId/issues", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) {
      return res.status(400).json({ error: "Invalid run ID" });
    }
    
    const type = req.query.type as string | undefined;
    const severity = req.query.severity as string | undefined;
    const status = req.query.status as string | undefined;
    
    const issues = await storage.getValidationIssuesForRun(runId, { type, severity, status });
    res.json(issues);
  } catch (error) {
    console.error("Failed to fetch validation issues:", error);
    res.status(500).json({ error: "Failed to fetch validation issues" });
  }
});

router.post("/api/imports/tse/:id/validate-integrity", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const job = await storage.getTseImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }

    if (job.status !== "completed") {
      return res.status(400).json({ error: "Só é possível validar importações concluídas" });
    }

    let dbRowCount: number;
    const filename = job.filename || "";
    if (filename.startsWith("[DETALHE]")) {
      dbRowCount = await storage.countTseElectoralStatisticsByJob(jobId);
    } else if (filename.startsWith("[PARTIDO]")) {
      dbRowCount = await storage.countTsePartyVotesByJob(jobId);
    } else {
      dbRowCount = await storage.countTseCandidateVotesByJob(jobId);
    }
    
    const totalFileRows = job.totalFileRows || job.processedRows || 0;
    const skippedRows = job.skippedRows || 0;
    const errorCount = job.errorCount || 0;
    const expectedCount = job.processedRows || (totalFileRows - skippedRows - errorCount);
    
    const isValid = dbRowCount === expectedCount;
    const validationMessage = isValid 
      ? `Validação OK: ${dbRowCount.toLocaleString("pt-BR")} registros verificados no banco`
      : `Discrepância detectada: esperado ${expectedCount.toLocaleString("pt-BR")}, encontrado ${dbRowCount.toLocaleString("pt-BR")} no banco`;

    await storage.updateTseImportJob(jobId, {
      validationStatus: isValid ? "passed" : "failed",
      validationMessage: validationMessage,
      validatedAt: new Date(),
      updatedAt: new Date(),
    });

    await logAudit(req, "validate", "tse_import", String(jobId), {
      isValid,
      dbRowCount,
      expectedCount,
      validationMessage
    });

    res.json({
      success: true,
      isValid,
      dbRowCount,
      expectedCount,
      totalFileRows,
      skippedRows,
      errorCount,
      validationMessage,
      validatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Failed to validate import integrity:", error);
    res.status(500).json({ error: "Failed to validate import integrity" });
  }
});

router.post("/api/imports/tse/:id/cancel", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const job = await storage.getTseImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }

    const inProgressStatuses = ["pending", "queued", "downloading", "extracting", "processing"];
    if (!inProgressStatuses.includes(job.status || "") && job.stage !== "queued") {
      return res.status(400).json({ 
        error: "Só é possível cancelar importações em andamento",
        currentStatus: job.status
      });
    }

    removeFromTseQueue(jobId);

    const activeJob = activeImportJobs.get(jobId);
    if (activeJob) {
      activeJob.cancelled = true;
      activeJob.abortController?.abort();
    } else {
      activeImportJobs.set(jobId, { cancelled: true });
    }

    await storage.updateTseImportJob(jobId, {
      status: "cancelled",
      stage: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
      errorMessage: "Importação cancelada pelo usuário",
    });

    const tmpDir = `/tmp/tse-import-${jobId}`;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    await logAudit(req, "cancel", "tse_import", String(jobId), { previousStatus: job.status });

    res.json({ success: true, message: "Importação cancelada com sucesso" });
  } catch (error: any) {
    console.error("Failed to cancel import:", error);
    res.status(500).json({ error: "Failed to cancel import" });
  }
});

router.post("/api/imports/tse/:id/restart", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const job = await storage.getTseImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }

    const restartableStatuses = ["failed", "cancelled"];
    if (!restartableStatuses.includes(job.status || "")) {
      return res.status(400).json({ 
        error: "Só é possível reiniciar importações falhadas ou canceladas",
        currentStatus: job.status
      });
    }

    const isUrlImport = job.filename?.startsWith("[URL]");
    if (!isUrlImport) {
      return res.status(400).json({ 
        error: "Apenas importações via URL podem ser reiniciadas. Para arquivos, faça upload novamente."
      });
    }

    await storage.deleteTseCandidateVotesByJob(jobId);
    await storage.deleteTseImportErrorsByJob(jobId);

    activeImportJobs.delete(jobId);
    await storage.updateTseImportJob(jobId, {
      status: "pending",
      stage: "pending",
      downloadedBytes: 0,
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errorCount: 0,
      errorMessage: null,
      totalFileRows: null,
      validationStatus: "pending",
      validationMessage: null,
      validatedAt: null,
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    });

    await logAudit(req, "restart", "tse_import", String(jobId), { previousStatus: job.status });

    if (job.sourceUrl) {
      processURLImport(jobId, job.sourceUrl);
    } else {
      const urlMatch = job.filename?.match(/\[URL\] (.+)/);
      if (urlMatch) {
        const filename = urlMatch[1];
        const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/${filename}`;
        processURLImport(jobId, url);
      } else {
        return res.status(400).json({ 
          error: "URL de origem não encontrada. Faça upload do arquivo novamente."
        });
      }
    }

    res.json({ success: true, message: "Importação reiniciada com sucesso", jobId });
  } catch (error: any) {
    console.error("Failed to restart import:", error);
    res.status(500).json({ error: "Failed to restart import" });
  }
});

router.delete("/api/imports/tse/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const job = await storage.getTseImportJob(jobId);
    if (!job) {
      return res.status(404).json({ error: "Import job not found" });
    }

    const inProgressStatuses = ["pending", "downloading", "extracting", "processing"];
    if (inProgressStatuses.includes(job.status || "")) {
      return res.status(400).json({ 
        error: "Não é possível excluir importações em andamento. Cancele primeiro.",
        currentStatus: job.status
      });
    }

    const filename = job.filename || "";
    if (filename.includes("[PARTIDO]")) {
      await storage.deleteTsePartyVotesByJob(jobId);
      console.log(`[DELETE] Deleted party votes for job ${jobId}`);
    } else if (filename.includes("[DETALHE]")) {
      await storage.deleteTseElectoralStatisticsByJob(jobId);
      console.log(`[DELETE] Deleted electoral statistics for job ${jobId}`);
    } else {
      await storage.deleteTseCandidateVotesByJob(jobId);
      console.log(`[DELETE] Deleted candidate votes for job ${jobId}`);
    }
    
    await storage.deleteBatchesByJob(jobId);
    await storage.deleteTseImportErrorsByJob(jobId);
    await storage.deleteValidationRunsByJob(jobId);
    await storage.deleteTseImportJob(jobId);

    const tmpDir = `/tmp/tse-import-${jobId}`;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});

    await logAudit(req, "delete", "tse_import", String(jobId), { filename: job.filename });

    refreshAllSummaries().catch((err) => console.error("[DELETE] Summary refresh failed:", err));

    res.json({ success: true, message: "Importação excluída com sucesso" });
  } catch (error: any) {
    console.error("Failed to delete import:", error);
    res.status(500).json({ error: "Failed to delete import" });
  }
});

router.get("/api/imports/files", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const baseDir = "/tmp";
    const entries = await readdir(baseDir, { withFileTypes: true });
    
    const importDirs = entries.filter(entry => 
      entry.isDirectory() && entry.name.startsWith("tse-import-")
    );

    const files: Array<{
      jobId: number;
      directory: string;
      files: Array<{ name: string; size: number; modifiedAt: string }>;
      totalSize: number;
    }> = [];

    for (const dir of importDirs) {
      const jobIdMatch = dir.name.match(/tse-import-(\d+)/);
      if (!jobIdMatch) continue;

      const jobId = parseInt(jobIdMatch[1]);
      const dirPath = path.join(baseDir, dir.name);
      
      try {
        const dirEntries = await readdir(dirPath);
        const fileInfos: Array<{ name: string; size: number; modifiedAt: string }> = [];
        let totalSize = 0;

        for (const fileName of dirEntries) {
          const filePath = path.join(dirPath, fileName);
          try {
            const fileStat = await stat(filePath);
            if (fileStat.isFile()) {
              fileInfos.push({
                name: fileName,
                size: fileStat.size,
                modifiedAt: fileStat.mtime.toISOString()
              });
              totalSize += fileStat.size;
            }
          } catch (e) {
          }
        }

        if (fileInfos.length > 0) {
          files.push({
            jobId,
            directory: dir.name,
            files: fileInfos,
            totalSize
          });
        }
      } catch (e) {
      }
    }

    const uploadsDir = "/tmp/uploads";
    try {
      const uploadEntries = await readdir(uploadsDir);
      const uploadFiles: Array<{ name: string; size: number; modifiedAt: string }> = [];
      let uploadsTotalSize = 0;

      for (const fileName of uploadEntries) {
        const filePath = path.join(uploadsDir, fileName);
        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile()) {
            uploadFiles.push({
              name: fileName,
              size: fileStat.size,
              modifiedAt: fileStat.mtime.toISOString()
            });
            uploadsTotalSize += fileStat.size;
          }
        } catch (e) {
        }
      }

      if (uploadFiles.length > 0) {
        files.push({
          jobId: 0,
          directory: "uploads",
          files: uploadFiles,
          totalSize: uploadsTotalSize
        });
      }
    } catch (e) {
    }

    res.json(files);
  } catch (error: any) {
    console.error("Failed to list import files:", error);
    res.status(500).json({ error: "Failed to list import files" });
  }
});

router.delete("/api/imports/files/:jobId", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    
    if (jobId === 0) {
      const uploadsDir = "/tmp/uploads";
      await rm(uploadsDir, { recursive: true, force: true });
      await mkdir(uploadsDir, { recursive: true });
      
      await logAudit(req, "delete_files", "uploads", "all", {});
      
      return res.json({ success: true, message: "Arquivos de upload excluídos com sucesso" });
    }

    if (isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid job ID" });
    }

    const tmpDir = `/tmp/tse-import-${jobId}`;
    await rm(tmpDir, { recursive: true, force: true });

    await logAudit(req, "delete_files", "tse_import", String(jobId), {});

    res.json({ success: true, message: "Arquivos excluídos com sucesso" });
  } catch (error: any) {
    console.error("Failed to delete import files:", error);
    res.status(500).json({ error: "Failed to delete import files" });
  }
});

router.patch("/api/validation-issues/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const issueId = parseInt(req.params.id);
    if (isNaN(issueId)) {
      return res.status(400).json({ error: "Invalid issue ID" });
    }
    
    const { status } = req.body;
    if (!status || !["open", "resolved", "ignored"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: open, resolved, or ignored" });
    }
    
    const user = req.user as any;
    const updateData: any = { status };
    
    if (status === "resolved" || status === "ignored") {
      updateData.resolvedBy = user?.id;
      updateData.resolvedAt = new Date();
    } else {
      updateData.resolvedBy = null;
      updateData.resolvedAt = null;
    }
    
    const updated = await storage.updateValidationIssue(issueId, updateData);
    if (!updated) {
      return res.status(404).json({ error: "Issue not found" });
    }
    
    await logAudit(req, "update", "validation_issue", String(issueId), { status });
    
    res.json(updated);
  } catch (error) {
    console.error("Failed to update validation issue:", error);
    res.status(500).json({ error: "Failed to update validation issue" });
  }
});

router.get("/api/analytics/historical-years", requireAuth, async (req, res) => {
  try {
    const position = req.query.position as string | undefined;
    const state = req.query.state as string | undefined;
    
    const years = await storage.getHistoricalVotesByParty({
      years: [2002, 2006, 2010, 2014, 2018, 2022],
      position,
      state,
    });
    
    const uniqueYears = Array.from(new Set(years.map(y => y.year))).sort((a, b) => b - a);
    res.json(uniqueYears);
  } catch (error) {
    console.error("Failed to fetch historical years:", error);
    res.status(500).json({ error: "Failed to fetch historical years" });
  }
});

router.post("/api/imports/tse", requireAuth, requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const electionYear = req.body.electionYear ? parseInt(req.body.electionYear) : null;
    const uf = req.body.uf || null;
    const electionType = req.body.electionType || null;
    const parsedCargo = req.body.cargoFilter ? parseInt(req.body.cargoFilter) : NaN;
    const cargoFilter = !isNaN(parsedCargo) ? parsedCargo : null;
    
    const existingImport = await storage.findExistingImport(
      req.file.originalname,
      electionYear,
      uf,
      electionType
    );

    if (existingImport) {
      if (existingImport.isInProgress) {
        return res.status(409).json({ 
          error: "Importação em andamento",
          message: `Este arquivo já está sendo processado. Aguarde a conclusão da importação atual.`,
          existingJob: existingImport.job,
          isInProgress: true
        });
      } else {
        const importDate = existingImport.job.completedAt 
          ? new Date(existingImport.job.completedAt).toLocaleDateString("pt-BR") 
          : "data desconhecida";
        return res.status(409).json({ 
          error: "Dados já importados",
          message: `Este arquivo já foi importado com sucesso em ${importDate}. Foram processados ${existingImport.job.processedRows?.toLocaleString("pt-BR") || 0} registros.`,
          existingJob: existingImport.job,
          isInProgress: false
        });
      }
    }

    const job = await storage.createTseImportJob({
      filename: req.file.originalname,
      fileSize: req.file.size,
      status: "pending",
      electionYear,
      electionType,
      uf,
      cargoFilter,
      createdBy: req.user?.id || null,
    });

    await logAudit(req, "create", "tse_import", String(job.id), { filename: req.file.originalname });

    processCSVImport(job.id, req.file.path);

    res.json({ jobId: job.id, message: "Import started" });
  } catch (error) {
    console.error("TSE import error:", error);
    res.status(500).json({ error: "Failed to start import" });
  }
});

router.post("/api/imports/tse/url", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { url, electionYear, electionType, uf, cargoFilter } = req.body;
    
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
      return res.status(400).json({ error: "URL must be from TSE domain (cdn.tse.jus.br or dadosabertos.tse.jus.br)" });
    }

    if (!url.toLowerCase().endsWith(".zip")) {
      return res.status(400).json({ error: "URL must point to a .zip file" });
    }

    const filename = path.basename(url);
    const fullFilename = `[URL] ${filename}`;
    const parsedYear = electionYear ? parseInt(electionYear) : null;

    const existingImport = await storage.findExistingImport(
      fullFilename,
      parsedYear,
      uf || null,
      electionType || null
    );

    if (existingImport) {
      if (existingImport.isInProgress) {
        return res.status(409).json({ 
          error: "Importação em andamento",
          message: `Esta URL já está sendo processada. Aguarde a conclusão da importação atual.`,
          existingJob: existingImport.job,
          isInProgress: true
        });
      } else {
        const importDate = existingImport.job.completedAt 
          ? new Date(existingImport.job.completedAt).toLocaleDateString("pt-BR") 
          : "data desconhecida";
        return res.status(409).json({ 
          error: "Dados já importados",
          message: `Estes dados do TSE já foram importados com sucesso em ${importDate}. Foram processados ${existingImport.job.processedRows?.toLocaleString("pt-BR") || 0} registros.`,
          existingJob: existingImport.job,
          isInProgress: false
        });
      }
    }

    const job = await storage.createTseImportJob({
      filename: fullFilename,
      fileSize: 0,
      status: "pending",
      electionYear: parsedYear,
      electionType: electionType || null,
      uf: uf || null,
      cargoFilter: cargoFilter && !isNaN(parseInt(cargoFilter)) ? parseInt(cargoFilter) : null,
      sourceUrl: url,
      createdBy: req.user?.id || null,
    });

    await logAudit(req, "create", "tse_import_url", String(job.id), { url, filename });

    processURLImport(job.id, url);

    res.json({ jobId: job.id, message: "URL import started" });
  } catch (error) {
    console.error("TSE URL import error:", error);
    res.status(500).json({ error: "Failed to start URL import" });
  }
});

router.post("/api/imports/tse/preview-files", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
      return res.status(400).json({ error: "URL must be from TSE domain" });
    }

    const tmpDir = `/tmp/tse-preview-${Date.now()}`;
    await mkdir(tmpDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }

    const zipPath = path.join(tmpDir, "data.zip");
    const fileStream = createWriteStream(zipPath);
    
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
    }
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    const directory = await unzipper.Open.file(zipPath);
    const csvFiles = directory.files.filter(f => 
      (f.path.endsWith(".csv") || f.path.endsWith(".txt")) && !f.path.startsWith("__MACOSX")
    );

    const brasilFile = csvFiles.find(f => 
      f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT")
    );

    await unlink(zipPath).catch(() => {});
    await rm(tmpDir, { recursive: true }).catch(() => {});

    const files = csvFiles.map(f => ({
      path: f.path,
      name: path.basename(f.path),
      size: f.uncompressedSize || 0,
      isBrasil: f.path.toUpperCase().includes("_BRASIL")
    }));

    res.json({
      hasBrasilFile: !!brasilFile,
      brasilFile: brasilFile ? path.basename(brasilFile.path) : null,
      files: files.sort((a, b) => (b.isBrasil ? 1 : 0) - (a.isBrasil ? 1 : 0) || a.name.localeCompare(b.name))
    });
  } catch (error: any) {
    console.error("TSE preview files error:", error);
    res.status(500).json({ error: error.message || "Failed to preview files" });
  }
});

router.post("/api/imports/tse/detalhe-votacao/url", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { url, electionYear, electionType, uf, cargoFilter, selectedFile } = req.body;
    
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
      return res.status(400).json({ error: "URL must be from TSE domain" });
    }

    const filename = path.basename(url);
    const fullFilename = `[DETALHE] ${filename}`;
    const parsedYear = electionYear ? parseInt(electionYear) : null;

    const job = await storage.createTseImportJob({
      filename: fullFilename,
      fileSize: 0,
      status: "pending",
      stage: "pending",
      downloadedBytes: 0,
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errorCount: 0,
      electionYear: parsedYear,
      electionType: electionType || null,
      uf: uf || null,
      cargoFilter: cargoFilter || null,
      sourceUrl: url,
      createdBy: req.user!.id,
    });

    await logAudit(req, "create", "tse_import_detalhe", String(job.id), { url, filename, selectedFile });

    processDetalheVotacaoImport(job.id, url, selectedFile);

    res.json({ jobId: job.id, message: "Electoral statistics import started" });
  } catch (error) {
    console.error("TSE detalhe_votacao import error:", error);
    res.status(500).json({ error: "Failed to start electoral statistics import" });
  }
});

router.post("/api/imports/tse/partido/url", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { url, electionYear, electionType, uf, cargoFilter, selectedFile } = req.body;
    
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!url.startsWith("https://cdn.tse.jus.br/") && !url.startsWith("https://dadosabertos.tse.jus.br/")) {
      return res.status(400).json({ error: "URL must be from TSE domain" });
    }

    const filename = path.basename(url);
    const fullFilename = `[PARTIDO] ${filename}`;
    const parsedYear = electionYear ? parseInt(electionYear) : null;

    const job = await storage.createTseImportJob({
      filename: fullFilename,
      fileSize: 0,
      status: "pending",
      stage: "pending",
      downloadedBytes: 0,
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errorCount: 0,
      electionYear: parsedYear,
      electionType: electionType || null,
      uf: uf || null,
      cargoFilter: cargoFilter || null,
      sourceUrl: url,
      createdBy: req.user!.id,
    });

    await logAudit(req, "create", "tse_import_partido", String(job.id), { url, filename, selectedFile });

    processPartidoVotacaoImport(job.id, url, selectedFile);

    res.json({ jobId: job.id, message: "Party votes import started" });
  } catch (error) {
    console.error("TSE partido import error:", error);
    res.status(500).json({ error: "Failed to start party votes import" });
  }
});

router.get("/api/historical-elections", requireAuth, async (req, res) => {
  try {
    const { year, uf, cargo, turno } = req.query;
    
    const filters: any = {};
    if (year) filters.anoEleicao = parseInt(year as string);
    if (uf) filters.sgUf = uf as string;
    if (cargo) filters.cdCargo = parseInt(cargo as string);
    if (turno) filters.nrTurno = parseInt(turno as string);

    const statistics = await storage.getElectoralStatisticsSummary(filters);
    res.json(statistics);
  } catch (error) {
    console.error("Failed to fetch historical elections:", error);
    res.status(500).json({ error: "Failed to fetch historical elections" });
  }
});

router.get("/api/historical-elections/available", requireAuth, async (req, res) => {
  try {
    const elections = await storage.getAvailableHistoricalElections();
    res.json(elections);
  } catch (error) {
    console.error("Failed to fetch available elections:", error);
    res.status(500).json({ error: "Failed to fetch available elections" });
  }
});

router.get("/api/historical-elections/party-votes", requireAuth, async (req, res) => {
  try {
    const { year, uf, cargo, municipio } = req.query;
    
    if (!year || !cargo) {
      return res.status(400).json({ error: "Year and cargo are required" });
    }

    const filters = {
      anoEleicao: parseInt(year as string),
      sgUf: uf as string || undefined,
      cdCargo: parseInt(cargo as string),
      cdMunicipio: municipio ? parseInt(municipio as string) : undefined,
    };

    const partyVotes = await storage.getHistoricalPartyVotes(filters);
    res.json(partyVotes);
  } catch (error) {
    console.error("Failed to fetch party votes:", error);
    res.status(500).json({ error: "Failed to fetch party votes" });
  }
});

const processURLImport = (jobId: number, url: string) => {
  addToTseQueue({ 
    jobId, 
    type: "url", 
    url,
    processor: () => processURLImportInternal(jobId, url)
  });
};

const processURLImportInternal = async (jobId: number, url: string) => {
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
    
    const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
    const csvFile = brasilFile || csvFiles[0];
    
    console.log(`Found ${csvFiles.length} CSV files, using: ${csvFile.path}${brasilFile ? " (prioritized _BRASIL file)" : ""}`);
    
    if (!csvFile) {
      throw new Error("No CSV/TXT file found in ZIP");
    }

    csvPath = path.join(tmpDir, "data.csv");
    await pipeline(csvFile.stream(), createWriteStream(csvPath));

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

const processCSVImportInternal = async (jobId: number, filePath: string) => {
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

  postImportMaintenance("CANDIDATO", jobId).catch(() => {});

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

const processDetalheVotacaoImport = (jobId: number, url: string, selectedFile?: string) => {
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
    
    let csvFile;
    if (selectedFile) {
      csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
      if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
      console.log(`[DETALHE] Using user-selected file: ${csvFile.path}`);
    } else {
      const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
      csvFile = brasilFile || csvFiles[0];
      console.log(`[DETALHE] Found ${csvFiles.length} CSV files, using: ${csvFile.path}${brasilFile ? " (arquivo BRASIL consolidado)" : ""}`);
    }
    
    const csvPath = path.join(tmpDir, "data.csv");
    await pipeline(csvFile.stream(), createWriteStream(csvPath));

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

    const allRows: string[][] = [];
    await new Promise<void>((resolve, reject) => {
      const parser = createReadStream(csvPath, { encoding: "latin1" })
        .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2 }));

      parser.on("data", (row: string[]) => {
        allRows.push(row);
      });
      parser.on("end", () => resolve());
      parser.on("error", reject);
    });

    console.log(`[DETALHE] Parsed ${allRows.length} rows, processing in batches...`);
    
    await storage.updateTseImportJob(jobId, { 
      totalFileRows: allRows.length,
      stage: "processing",
      updatedAt: new Date()
    });

    await storage.deleteBatchesByJob(jobId);
    
    const filteredRows: { index: number; row: string[] }[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const cdCargo = parseValue(row[16], true);
      if (cargoFilter && cdCargo !== cargoFilter) {
        cargoFilteredCount++;
        continue;
      }
      filteredRows.push({ index: i, row });
    }
    
    console.log(`[DETALHE] After cargo filter: ${filteredRows.length} rows to process (${cargoFilteredCount} filtered)`);
    
    const totalBatches = Math.ceil(filteredRows.length / BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, filteredRows.length);
      const batchRows = filteredRows.slice(startIdx, endIdx);
      
      const originalRowStart = batchRows[0].index + 2;
      const originalRowEnd = batchRows[batchRows.length - 1].index + 2;
      
      const batchRecord = await storage.createImportBatch({
        importJobId: jobId,
        batchIndex,
        status: "processing",
        rowStart: originalRowStart,
        rowEnd: originalRowEnd,
        totalRows: batchRows.length,
        processedRows: 0,
        insertedRows: 0,
        skippedRows: 0,
        errorCount: 0,
        startedAt: new Date(),
      });
      
      let batchInserted = 0;
      let batchSkipped = 0;
      let batchErrors = 0;
      let batchErrorSummary = "";
      
      try {
        const batchRecords: any[] = [];
        for (const { row } of batchRows) {
          rowCount++;
          const record: any = { importJobId: jobId };
          for (const [index, field] of Object.entries(fieldMap)) {
            const idx = parseInt(index);
            if (idx < row.length) {
              record[field] = parseValue(row[idx], numericFields.includes(idx));
            }
          }
          batchRecords.push(record);
        }
        
        const inserted = await storage.insertTseElectoralStatisticsBatch(batchRecords);
        batchInserted = inserted;
        batchSkipped = batchRecords.length - inserted;
        insertedCount += batchInserted;
        duplicateCount += batchSkipped;
        
        await storage.updateImportBatch(batchRecord.id, {
          status: "completed",
          processedRows: batchRows.length,
          insertedRows: batchInserted,
          skippedRows: batchSkipped,
          errorCount: 0,
          completedAt: new Date(),
        });
      } catch (err: any) {
        console.error(`[DETALHE] Batch ${batchIndex + 1} error:`, err);
        batchErrors = batchRows.length;
        batchErrorSummary = err.message || "Unknown error";
        errorCount += batchErrors;
        
        await storage.updateImportBatch(batchRecord.id, {
          status: "failed",
          processedRows: 0,
          errorCount: batchErrors,
          errorSummary: batchErrorSummary,
          completedAt: new Date(),
        });
      }
      
      if ((batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
        const totalSkipped = cargoFilteredCount + duplicateCount;
        await storage.updateTseImportJob(jobId, { 
          processedRows: insertedCount,
          skippedRows: totalSkipped,
          errorCount,
          updatedAt: new Date()
        });
        console.log(`[DETALHE] Batch ${batchIndex + 1}/${totalBatches}: ${insertedCount} inserted, ${duplicateCount} duplicates`);
      }
      
      await new Promise(resolve => setImmediate(resolve));
    }

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

    postImportMaintenance("DETALHE", jobId).catch(() => {});

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

const processPartidoVotacaoImport = (jobId: number, url: string, selectedFile?: string) => {
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
    
    let csvFile;
    if (selectedFile) {
      csvFile = csvFiles.find(f => f.path === selectedFile || path.basename(f.path) === selectedFile);
      if (!csvFile) throw new Error(`Selected file not found: ${selectedFile}`);
      console.log(`[PARTIDO] Using user-selected file: ${csvFile.path}`);
    } else {
      const brasilFile = csvFiles.find(f => f.path.toUpperCase().includes("_BRASIL.CSV") || f.path.toUpperCase().includes("_BRASIL.TXT"));
      csvFile = brasilFile || csvFiles[0];
      console.log(`[PARTIDO] Found ${csvFiles.length} CSV files, using: ${csvFile.path}${brasilFile ? " (arquivo BRASIL consolidado)" : ""}`);
    }
    
    const csvPath = path.join(tmpDir, "data.csv");
    await pipeline(csvFile.stream(), createWriteStream(csvPath));

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

    const allRows: string[][] = [];
    await new Promise<void>((resolve, reject) => {
      const parser = createReadStream(csvPath, { encoding: "latin1" })
        .pipe(parse({ delimiter: ";", relax_quotes: true, skip_empty_lines: true, from_line: 2 }));

      parser.on("data", (row: string[]) => {
        allRows.push(row);
      });
      parser.on("end", () => resolve());
      parser.on("error", reject);
    });

    console.log(`[PARTIDO] Parsed ${allRows.length} rows, processing in batches...`);
    
    await storage.updateTseImportJob(jobId, { 
      totalFileRows: allRows.length,
      stage: "processing",
      updatedAt: new Date()
    });

    await storage.deleteBatchesByJob(jobId);
    
    const filteredRows: { index: number; row: string[] }[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const cdCargo = parseValue(row[idxCdCargo], true);
      if (cargoFilter && cdCargo !== cargoFilter) {
        cargoFilteredCount++;
        continue;
      }
      filteredRows.push({ index: i, row });
    }
    
    console.log(`[PARTIDO] After cargo filter: ${filteredRows.length} rows to process (${cargoFilteredCount} filtered)`);
    
    const seenKeys = new Set<string>();
    const deduplicatedRows: { index: number; row: string[] }[] = [];
    let csvDuplicateCount = 0;
    
    for (const item of filteredRows) {
      const row = item.row;
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
      } else {
        seenKeys.add(key);
        deduplicatedRows.push(item);
      }
    }
    
    if (csvDuplicateCount > 0) {
      console.log(`[PARTIDO] Found ${csvDuplicateCount} duplicate rows in CSV file (exact same unique key), keeping ${deduplicatedRows.length} unique rows`);
    }
    
    const rowsToProcess = deduplicatedRows;
    
    const totalBatches = Math.ceil(rowsToProcess.length / BATCH_SIZE);
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, rowsToProcess.length);
      const batchRows = rowsToProcess.slice(startIdx, endIdx);
      
      const originalRowStart = batchRows[0].index + 2;
      const originalRowEnd = batchRows[batchRows.length - 1].index + 2;
      
      const batchRecord = await storage.createImportBatch({
        importJobId: jobId,
        batchIndex,
        status: "processing",
        rowStart: originalRowStart,
        rowEnd: originalRowEnd,
        totalRows: batchRows.length,
        processedRows: 0,
        insertedRows: 0,
        skippedRows: 0,
        errorCount: 0,
        startedAt: new Date(),
      });
      
      let batchInserted = 0;
      let batchSkipped = 0;
      let batchErrors = 0;
      let batchErrorSummary = "";
      
      try {
        const batchRecords: any[] = [];
        for (const { row } of batchRows) {
          rowCount++;
          const record: any = { importJobId: jobId };
          for (const [index, field] of Object.entries(fieldMap)) {
            const idx = parseInt(index);
            if (idx < row.length) {
              record[field] = parseValue(row[idx], numericFields.includes(idx));
            }
          }
          batchRecords.push(record);
        }
        
        const inserted = await storage.insertTsePartyVotesBatch(batchRecords);
        batchInserted = inserted;
        batchSkipped = batchRecords.length - inserted;
        insertedCount += batchInserted;
        duplicateCount += batchSkipped;
        
        await storage.updateImportBatch(batchRecord.id, {
          status: "completed",
          processedRows: batchRows.length,
          insertedRows: batchInserted,
          skippedRows: batchSkipped,
          errorCount: 0,
          completedAt: new Date(),
        });
      } catch (err: any) {
        console.error(`[PARTIDO] Batch ${batchIndex + 1} error:`, err);
        batchErrors = batchRows.length;
        batchErrorSummary = err.message || "Unknown error";
        errorCount += batchErrors;
        
        await storage.updateImportBatch(batchRecord.id, {
          status: "failed",
          processedRows: 0,
          errorCount: batchErrors,
          errorSummary: batchErrorSummary,
          completedAt: new Date(),
        });
      }
      
      if ((batchIndex + 1) % 5 === 0 || batchIndex === totalBatches - 1) {
        const totalSkipped = cargoFilteredCount + duplicateCount;
        await storage.updateTseImportJob(jobId, { 
          processedRows: insertedCount,
          skippedRows: totalSkipped,
          errorCount,
          updatedAt: new Date()
        });
        console.log(`[PARTIDO] Batch ${batchIndex + 1}/${totalBatches}: ${insertedCount} inserted, ${duplicateCount} duplicates`);
      }
      
      await new Promise(resolve => setImmediate(resolve));
    }

    const partiesResult = await storage.syncPartiesFromTseImport(jobId);
    console.log(`TSE Import ${jobId} [PARTIDO]: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);

    const totalSkipped = cargoFilteredCount + duplicateCount + csvDuplicateCount;
    const validationMessage = insertedCount === 0 && (duplicateCount > 0 || csvDuplicateCount > 0)
      ? `Dados já importados: ${(duplicateCount + csvDuplicateCount).toLocaleString("pt-BR")} registros duplicados encontrados`
      : insertedCount > 0
        ? `Importação concluída: ${insertedCount.toLocaleString("pt-BR")} inseridos, ${csvDuplicateCount > 0 ? `${csvDuplicateCount.toLocaleString("pt-BR")} duplicados CSV + ` : ''}${duplicateCount.toLocaleString("pt-BR")} duplicados DB`
        : null;

    console.log(`[PARTIDO] Completed: ${allRows.length} total file rows, ${insertedCount} inserted, ${csvDuplicateCount} CSV duplicates removed, ${duplicateCount} DB duplicates, ${cargoFilteredCount} cargo-filtered, ${errorCount} errors`);

    await storage.updateTseImportJob(jobId, {
      status: "completed", stage: "completed", totalRows: rowCount,
      processedRows: insertedCount, skippedRows: totalSkipped,
      errorCount, completedAt: new Date(), updatedAt: new Date(),
      validationMessage: validationMessage,
    });

    postImportMaintenance("PARTIDO", jobId).catch(() => {});

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

router.get("/api/tse/candidates", requireAuth, async (req, res) => {
  try {
    const { year, uf, cargo, limit = 100, offset = 0 } = req.query;
    const candidates = await storage.getTseCandidateVotes({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      cargo: cargo ? parseInt(cargo as string) : undefined,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch TSE candidates" });
  }
});

router.get("/api/tse/stats", requireAuth, async (req, res) => {
  try {
    const stats = await storage.getTseStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch TSE stats" });
  }
});

router.get("/api/tse/search", requireAuth, async (req, res) => {
  try {
    const { q, year, uf, cargo } = req.query;
    if (!q || typeof q !== "string" || q.length < 2) {
      return res.json([]);
    }
    const candidates = await storage.searchTseCandidates(q, {
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      cargo: cargo ? parseInt(cargo as string) : undefined,
    });
    res.json(candidates);
  } catch (error) {
    console.error("TSE search error:", error);
    res.status(500).json({ error: "Failed to search TSE candidates" });
  }
});

const processCSVImport = async (jobId: number, filePath: string) => {
  try {
    await storage.updateTseImportJob(jobId, { 
      status: "processing", 
      stage: "processing",
      startedAt: new Date(),
      updatedAt: new Date()
    });
    
    const job = await storage.getTseImportJob(jobId);
    const cargoFilter = job?.cargoFilter;

    const records: InsertTseCandidateVote[] = [];
    let rowCount = 0;
    let filteredCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 2000;

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

    const fieldMap: { [key: number]: keyof InsertTseCandidateVote } = {
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

    const parseValue = (value: string, field: string): any => {
      if (value === "#NULO" || value === "#NE" || value === "") {
        return null;
      }
      const intFields = [
        "anoEleicao", "cdTipoEleicao", "nrTurno", "cdEleicao", "cdMunicipio",
        "nrZona", "cdCargo", "nrCandidato", "cdSituacaoCandidatura",
        "cdDetalheSituacaoCand", "cdSituacaoJulgamento", "cdSituacaoCassacao",
        "cdSituacaoDconstDiploma", "nrPartido", "nrFederacao", "qtVotosNominais",
        "qtVotosNominaisValidos", "cdSitTotTurno"
      ];
      if (intFields.includes(field)) {
        const num = parseInt(value);
        if (isNaN(num) || num === -1 || num === -3) return null;
        return num;
      }
      return value;
    };

    for await (const row of parser) {
      try {
        rowCount++;
        const record: any = { importJobId: jobId };

        for (let i = 0; i < row.length; i++) {
          const field = fieldMap[i];
          if (field) {
            record[field] = parseValue(row[i], field);
          }
        }

        if (cargoFilter && record.cdCargo !== cargoFilter) {
          filteredCount++;
        } else {
          records.push(record);
        }

        if (records.length >= BATCH_SIZE) {
          await storage.bulkInsertTseCandidateVotes(records);
          await storage.updateTseImportJob(jobId, { 
            processedRows: rowCount,
            updatedAt: new Date()
          });
          records.length = 0;
        }
      } catch (err: any) {
        errorCount++;
        await storage.createTseImportError({
          importJobId: jobId,
          rowNumber: rowCount,
          errorType: "parse_error",
          errorMessage: err.message,
          rawData: JSON.stringify(row).substring(0, 1000),
        });
      }
    }

    if (records.length > 0) {
      await storage.bulkInsertTseCandidateVotes(records);
    }

    const partiesResult = await storage.syncPartiesFromTseImport(jobId);
    console.log(`TSE Import ${jobId}: Synced parties - ${partiesResult.created} created, ${partiesResult.updated} updated, ${partiesResult.existing} existing`);

    await storage.updateTseImportJob(jobId, {
      status: "completed",
      stage: "completed",
      totalRows: rowCount,
      processedRows: rowCount,
      errorCount,
      completedAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(`TSE Import ${jobId} completed: ${rowCount} rows, ${errorCount} errors`);

    postImportMaintenance("CANDIDATO", jobId).catch(() => {});

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

async function reprocessBatch(batchId: number, jobId: number): Promise<void> {
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

function mapParsedRowToVote(row: Record<string, unknown>): Record<string, unknown> {
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

export default router;
