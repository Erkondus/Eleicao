import { Router } from "express";
import { createWriteStream } from "fs";
import { unlink, mkdir, readdir, stat, rm } from "fs/promises";
import { parse } from "csv-parse";
import unzipper from "unzipper";
import path from "path";
import { requireAuth, requireRole, logAudit, upload } from "./shared";
import { storage } from "../storage";
import { refreshAllSummaries } from "../summary-refresh";
import {
  activeImportJobs,
  isJobCancelled,
  getTseQueueStatus,
  removeFromTseQueue,
} from "../services/tse-queue-service";
import {
  processCSVImport,
  processURLImport,
  processDetalheVotacaoImport,
  processPartidoVotacaoImport,
  reprocessBatch,
} from "../services/tse-import-service";

const router = Router();

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

export default router;
