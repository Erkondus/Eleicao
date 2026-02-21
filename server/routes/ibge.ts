import { Router } from "express";
import { requireAuth, requireRole, logAudit } from "./shared";
import { storage } from "../storage";
import { ibgeService } from "../ibge-service";

const router = Router();

router.get("/api/ibge/stats", requireAuth, async (_req, res) => {
  try {
    const stats = await ibgeService.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching IBGE stats:", error);
    res.status(500).json({ error: "Failed to fetch IBGE statistics" });
  }
});

router.get("/api/ibge/import-jobs", requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const jobs = await ibgeService.getImportJobs(limit);
    res.json(jobs);
  } catch (error) {
    console.error("Error fetching IBGE import jobs:", error);
    res.status(500).json({ error: "Failed to fetch import jobs" });
  }
});

router.post("/api/ibge/import/municipios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const userId = req.user?.id;
    const jobId = await ibgeService.createImportJob("municipios", userId, {});
    
    await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "municipios" });
    
    res.json({ jobId, message: "Import started" });

    ibgeService.importMunicipios(jobId, userId).catch(err => {
      console.error("Error in municipios import:", err);
    });
  } catch (error) {
    console.error("Error starting municipios import:", error);
    res.status(500).json({ error: "Failed to start municipios import" });
  }
});

router.post("/api/ibge/import/populacao", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const userId = req.user?.id;
    const ano = req.body.ano || 2024;
    const jobId = await ibgeService.createImportJob("populacao", userId, { ano });
    
    await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "populacao", ano });
    
    res.json({ jobId, message: "Import started" });

    ibgeService.importPopulacao(jobId, ano).catch(err => {
      console.error("Error in populacao import:", err);
    });
  } catch (error) {
    console.error("Error starting populacao import:", error);
    res.status(500).json({ error: "Failed to start population import" });
  }
});

router.post("/api/ibge/import/indicadores", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const userId = req.user?.id;
    const jobId = await ibgeService.createImportJob("indicadores", userId, {});
    
    await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "indicadores" });
    
    res.json({ jobId, message: "Import started" });

    ibgeService.importIndicadores(jobId).catch(err => {
      console.error("Error in indicadores import:", err);
    });
  } catch (error) {
    console.error("Error starting indicadores import:", error);
    res.status(500).json({ error: "Failed to start indicators import" });
  }
});

router.post("/api/ibge/import/all", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const userId = req.user?.id;
    const ano = req.body.ano || 2024;
    
    const jobId = await ibgeService.createImportJob("all", userId, { ano });
    
    await logAudit(req, "IBGE_IMPORT_START", "ibge_import_jobs", jobId.toString(), { type: "all", ano });
    
    res.json({ jobId, message: "Full import started" });

    (async () => {
      let totalImported = 0;
      let totalErrors = 0;
      const startTime = Date.now();
      
      try {
        await ibgeService.updateJobProgress(jobId, {
          status: "running",
          phase: "import",
          phaseDescription: "Importando municípios..."
        });
        
        const munJobId = await ibgeService.createImportJob("municipios", userId, {});
        const munResult = await ibgeService.importMunicipios(munJobId, userId);
        totalImported += munResult.imported;
        totalErrors += munResult.errors;
        
        await ibgeService.updateJobProgress(jobId, {
          phase: "import",
          phaseDescription: "Importando população..."
        });
        
        const popJobId = await ibgeService.createImportJob("populacao", userId, { ano });
        const popResult = await ibgeService.importPopulacao(popJobId, ano);
        totalImported += popResult.imported;
        totalErrors += popResult.errors;

        await ibgeService.updateJobProgress(jobId, {
          phase: "import",
          phaseDescription: "Gerando indicadores..."
        });

        const indJobId = await ibgeService.createImportJob("indicadores", userId, {});
        const indResult = await ibgeService.importIndicadores(indJobId);
        totalImported += indResult.imported;
        totalErrors += indResult.errors;
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        await ibgeService.completeJob(jobId, totalImported, totalErrors, {
          summary: {
            totalProcessed: totalImported,
            totalErrors,
            duration: `${duration}s`,
            successRate: totalImported > 0 ? `${((totalImported / (totalImported + totalErrors)) * 100).toFixed(1)}%` : "0%"
          }
        });
        
      } catch (err) {
        console.error("Error in full IBGE import:", err);
        await ibgeService.failJob(jobId, err instanceof Error ? err.message : "Erro na importação completa");
      }
    })();
  } catch (error) {
    console.error("Error starting full IBGE import:", error);
    res.status(500).json({ error: "Failed to start full import" });
  }
});

router.get("/api/ibge/municipio/:codigoIbge", requireAuth, async (req, res) => {
  try {
    const { codigoIbge } = req.params;
    const data = await ibgeService.getMunicipioWithData(codigoIbge);
    
    if (!data) {
      return res.status(404).json({ error: "Municipality not found" });
    }
    
    res.json(data);
  } catch (error) {
    console.error("Error fetching municipality data:", error);
    res.status(500).json({ error: "Failed to fetch municipality data" });
  }
});

router.get("/api/ibge/demographic-data", requireAuth, async (req, res) => {
  try {
    const { codigoIbge, uf, search } = req.query;
    const data = await ibgeService.getDemographicDataForPrediction(
      codigoIbge as string,
      uf as string,
      search as string
    );
    res.json(data);
  } catch (error) {
    console.error("Error fetching demographic data:", error);
    res.status(500).json({ error: "Failed to fetch demographic data" });
  }
});

router.post("/api/ibge/import/:jobId/cancel", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    await ibgeService.cancelJob(jobId);
    await logAudit(req, "IBGE_IMPORT_CANCEL", "ibge_import_jobs", jobId.toString(), {});
    res.json({ success: true, message: "Job cancelado com sucesso" });
  } catch (error) {
    console.error("Error cancelling IBGE import job:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to cancel job" });
  }
});

router.post("/api/ibge/import/:jobId/restart", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const oldJobId = parseInt(req.params.jobId);
    const userId = req.user?.id;
    
    const originalJob = await ibgeService.getJob(oldJobId);
    if (!originalJob) {
      return res.status(404).json({ error: "Job não encontrado" });
    }

    const newJobId = await ibgeService.restartJob(oldJobId, userId);
    await logAudit(req, "IBGE_IMPORT_RESTART", "ibge_import_jobs", newJobId.toString(), { originalJobId: oldJobId });

    (async () => {
      try {
        const type = originalJob.type;
        const params = originalJob.parameters || {};

        if (type === "municipios") {
          await ibgeService.importMunicipios(newJobId, userId);
        } else if (type === "populacao") {
          await ibgeService.importPopulacao(newJobId, params.ano);
        } else if (type === "indicadores") {
          await ibgeService.importIndicadores(newJobId);
        } else if (type === "all") {
          await ibgeService.importMunicipios(newJobId, userId);
          const popJobId = await ibgeService.createImportJob("populacao", userId, { ano: params.ano || 2024 });
          await ibgeService.importPopulacao(popJobId, params.ano || 2024);
          const indJobId = await ibgeService.createImportJob("indicadores", userId, {});
          await ibgeService.importIndicadores(indJobId);
        }
      } catch (err) {
        console.error("Error restarting IBGE import:", err);
      }
    })();

    res.json({ success: true, newJobId, message: "Importação reiniciada" });
  } catch (error) {
    console.error("Error restarting IBGE import job:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to restart job" });
  }
});

router.get("/api/ibge/import/:jobId/report", requireAuth, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const report = await ibgeService.getJobErrorReport(jobId);
    
    if (!report) {
      return res.status(404).json({ error: "Job não encontrado" });
    }
    
    res.json(report);
  } catch (error) {
    console.error("Error fetching IBGE import report:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch report" });
  }
});

router.get("/api/ibge/import/:jobId", requireAuth, async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = await ibgeService.getJob(jobId);
    
    if (!job) {
      return res.status(404).json({ error: "Job não encontrado" });
    }
    
    res.json(job);
  } catch (error) {
    console.error("Error fetching IBGE import job:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch job" });
  }
});

export default router;
