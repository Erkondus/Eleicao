import { Router } from "express";
import { z } from "zod";
import { parse } from "csv-parse";
import { requireAuth, requireRole, logAudit, upload } from "./shared";
import { storage } from "../storage";
import { broadcastScenarioEvent } from "../websocket";

const router = Router();

router.get("/api/parties", requireAuth, async (req, res) => {
  try {
    const parties = await storage.getParties();
    res.json(parties);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch parties" });
  }
});

router.get("/api/parties/paginated", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || "";
    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
    const sortBy = (req.query.sortBy as string) || "name";
    const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
    const tags = req.query.tags ? (req.query.tags as string).split(",") : undefined;

    const result = await storage.getPartiesPaginated({
      page,
      limit,
      search,
      active,
      sortBy,
      sortOrder,
      tags,
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching paginated parties:", error);
    res.status(500).json({ error: "Failed to fetch parties" });
  }
});

router.get("/api/parties/:id/details", requireAuth, async (req, res) => {
  try {
    const partyId = parseInt(req.params.id);
    const party = await storage.getPartyWithDetails(partyId);
    if (!party) {
      return res.status(404).json({ error: "Party not found" });
    }
    res.json(party);
  } catch (error) {
    console.error("Error fetching party details:", error);
    res.status(500).json({ error: "Failed to fetch party details" });
  }
});

router.get("/api/parties/export/csv", requireAuth, async (req, res) => {
  try {
    const parties = await storage.getParties();
    
    const csvHeader = "Numero;Sigla;Nome;Cor;Coligacao;Ativo;Criado_Em\n";
    const csvRows = parties.map(p => 
      `${p.number};"${p.abbreviation}";"${p.name}";"${p.color}";"${p.coalition || ''}";"${p.active ? 'Sim' : 'Nao'}";"${p.createdAt}"`
    ).join("\n");
    
    const csv = csvHeader + csvRows;
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=partidos.csv");
    res.send("\uFEFF" + csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export parties" });
  }
});

const partyInsertSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  abbreviation: z.string().min(2, "Sigla deve ter pelo menos 2 caracteres").max(15),
  number: z.number().int().min(0).max(99),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hexadecimal (#RRGGBB)").optional().default("#003366"),
  coalition: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  active: z.boolean().optional().default(true),
});

const partyUpdateSchema = partyInsertSchema.partial();

router.post("/api/parties", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const validatedData = partyInsertSchema.parse(req.body);
    const party = await storage.createParty({
      ...validatedData,
      createdBy: req.user!.id,
    });
    await logAudit(req, "create", "party", String(party.id), { name: party.name });
    res.json(party);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create party" });
  }
});

router.patch("/api/parties/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const validatedData = partyUpdateSchema.parse(req.body);
    const updated = await storage.updateParty(parseInt(req.params.id), validatedData);
    if (!updated) {
      return res.status(404).json({ error: "Party not found" });
    }
    await logAudit(req, "update", "party", req.params.id);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update party" });
  }
});

router.delete("/api/parties/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    await storage.deleteParty(parseInt(req.params.id));
    await logAudit(req, "delete", "party", req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete party" });
  }
});

router.post("/api/parties/import-csv", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { csvContent } = req.body;
    if (!csvContent || typeof csvContent !== "string") {
      return res.status(400).json({ error: "CSV content is required" });
    }

    const cleanContent = csvContent.replace(/^\uFEFF/, "");
    
    const firstLine = cleanContent.split(/[\r\n]/)[0];
    const delimiter = firstLine.includes(";") ? ";" : ",";

    const records: string[][] = await new Promise((resolve, reject) => {
      const rows: string[][] = [];
      const parser = parse(cleanContent, {
        delimiter,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
      parser.on("data", (row: string[]) => rows.push(row));
      parser.on("error", reject);
      parser.on("end", () => resolve(rows));
    });

    if (records.length < 2) {
      return res.status(400).json({ error: "CSV must have header and at least one data row" });
    }

    const headers = records[0].map(h => h.toLowerCase().trim());
    
    const numIdx = headers.findIndex(h => h === "numero" || h === "number");
    const siglaIdx = headers.findIndex(h => h === "sigla" || h === "abbreviation");
    const nomeIdx = headers.findIndex(h => h === "nome" || h === "name");
    const corIdx = headers.findIndex(h => h === "cor" || h === "color");
    const coligIdx = headers.findIndex(h => h === "coligacao" || h === "coalition");
    const ativoIdx = headers.findIndex(h => h === "ativo" || h === "active");

    if (numIdx === -1 || siglaIdx === -1 || nomeIdx === -1) {
      return res.status(400).json({ 
        error: "CSV must have columns: Numero, Sigla, Nome (or Number, Abbreviation, Name)" 
      });
    }

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    const existingParties = await storage.getParties();
    const partyByNumber = new Map(existingParties.map(p => [p.number, p]));
    const partyByAbbrev = new Map(existingParties.map(p => [p.abbreviation.toUpperCase(), p]));
    
    const seenNumbers = new Set<number>();
    const seenAbbrevs = new Set<string>();

    for (let i = 1; i < records.length; i++) {
      const values = records[i];
      const lineNum = i + 1;
      
      try {
        const number = parseInt(values[numIdx] || "");
        const abbreviation = (values[siglaIdx] || "").trim().toUpperCase();
        const name = (values[nomeIdx] || "").trim();
        const color = corIdx >= 0 && values[corIdx] ? values[corIdx].trim() : "#003366";
        const coalition = coligIdx >= 0 && values[coligIdx] ? values[coligIdx].trim() : null;
        const activeStr = ativoIdx >= 0 ? (values[ativoIdx] || "").toLowerCase() : "";
        const active = ativoIdx >= 0 ? 
          (activeStr === "sim" || activeStr === "true" || activeStr === "1") 
          : true;

        if (isNaN(number) || !abbreviation || !name) {
          results.errors.push(`Linha ${lineNum}: Dados inválidos (número, sigla ou nome ausentes)`);
          results.skipped++;
          continue;
        }

        if (seenNumbers.has(number)) {
          results.errors.push(`Linha ${lineNum}: Número ${number} duplicado no arquivo`);
          results.skipped++;
          continue;
        }
        if (seenAbbrevs.has(abbreviation)) {
          results.errors.push(`Linha ${lineNum}: Sigla ${abbreviation} duplicada no arquivo`);
          results.skipped++;
          continue;
        }

        const existingByNum = partyByNumber.get(number);
        const existingByAbbrev = partyByAbbrev.get(abbreviation);

        if (existingByNum && existingByAbbrev && existingByNum.id !== existingByAbbrev.id) {
          results.errors.push(`Linha ${lineNum}: Conflito - número ${number} pertence a ${existingByNum.abbreviation}, mas sigla ${abbreviation} pertence a outro partido`);
          results.skipped++;
          continue;
        }

        if (existingByNum || existingByAbbrev) {
          const existing = existingByNum || existingByAbbrev!;
          const updated = await storage.updateParty(existing.id, {
            name,
            abbreviation,
            number,
            color,
            coalition,
            active,
          });
          
          if (updated) {
            partyByNumber.delete(existing.number);
            partyByAbbrev.delete(existing.abbreviation.toUpperCase());
            partyByNumber.set(number, updated);
            partyByAbbrev.set(abbreviation, updated);
          }
          
          results.updated++;
        } else {
          const newParty = await storage.createParty({
            name,
            abbreviation,
            number,
            color,
            coalition,
            active,
            createdBy: req.user!.id,
          });
          
          partyByNumber.set(number, newParty);
          partyByAbbrev.set(abbreviation, newParty);
          
          results.created++;
        }
        
        seenNumbers.add(number);
        seenAbbrevs.add(abbreviation);
        
      } catch (err: any) {
        results.errors.push(`Linha ${lineNum}: ${err.message || "Erro desconhecido"}`);
        results.skipped++;
      }
    }

    await logAudit(req, "import_csv", "party", undefined, { 
      created: results.created, 
      updated: results.updated, 
      skipped: results.skipped 
    });

    res.json({
      success: true,
      message: `Importação concluída: ${results.created} criados, ${results.updated} atualizados, ${results.skipped} ignorados`,
      ...results,
    });
  } catch (error: any) {
    console.error("CSV import error:", error);
    res.status(500).json({ error: "Falha ao importar CSV: " + (error.message || "Erro desconhecido") });
  }
});

router.get("/api/candidates", requireAuth, async (req, res) => {
  try {
    const candidates = await storage.getCandidates();
    res.json(candidates);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch candidates" });
  }
});

router.get("/api/candidates/paginated", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || "";
    const partyId = req.query.partyId ? parseInt(req.query.partyId as string) : undefined;
    const position = (req.query.position as string) || undefined;
    const active = req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
    const sortBy = (req.query.sortBy as string) || "name";
    const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
    const tags = req.query.tags ? (req.query.tags as string).split(",") : undefined;

    const result = await storage.getCandidatesPaginated({
      page,
      limit,
      search,
      partyId,
      position,
      active,
      sortBy,
      sortOrder,
      tags,
    });
    res.json(result);
  } catch (error) {
    console.error("Error fetching paginated candidates:", error);
    res.status(500).json({ error: "Failed to fetch candidates" });
  }
});

router.get("/api/candidates/:id/details", requireAuth, async (req, res) => {
  try {
    const candidateId = parseInt(req.params.id);
    const candidate = await storage.getCandidateWithDetails(candidateId);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    res.json(candidate);
  } catch (error) {
    console.error("Error fetching candidate details:", error);
    res.status(500).json({ error: "Failed to fetch candidate details" });
  }
});

router.post("/api/candidates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const candidate = await storage.createCandidate({
      ...req.body,
      createdBy: req.user!.id,
    });
    await logAudit(req, "create", "candidate", String(candidate.id), { name: candidate.name });
    res.json(candidate);
  } catch (error) {
    console.error("Failed to create candidate:", error);
    res.status(500).json({ error: "Failed to create candidate" });
  }
});

router.patch("/api/candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const updated = await storage.updateCandidate(parseInt(req.params.id), req.body);
    if (!updated) {
      return res.status(404).json({ error: "Candidate not found" });
    }
    await logAudit(req, "update", "candidate", req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update candidate" });
  }
});

router.delete("/api/candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    await storage.deleteCandidate(parseInt(req.params.id));
    await logAudit(req, "delete", "candidate", req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete candidate" });
  }
});

router.get("/api/scenarios", requireAuth, async (req, res) => {
  try {
    const scenarios = await storage.getScenarios();
    res.json(scenarios);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch scenarios" });
  }
});

router.post("/api/scenarios", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const scenario = await storage.createScenario({
      ...req.body,
      createdBy: req.user!.id,
    });
    await logAudit(req, "create", "scenario", String(scenario.id), { name: scenario.name });
    res.json(scenario);
  } catch (error) {
    res.status(500).json({ error: "Failed to create scenario" });
  }
});

router.patch("/api/scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { expectedUpdatedAt, ...data } = req.body;

    if (expectedUpdatedAt) {
      const current = await storage.getScenario(id);
      if (!current) {
        return res.status(404).json({ error: "Scenario not found" });
      }
      const currentTs = new Date(current.updatedAt).getTime();
      const expectedTs = new Date(expectedUpdatedAt).getTime();
      if (currentTs !== expectedTs) {
        return res.status(409).json({
          error: "conflict",
          message: "Este cenário foi modificado por outro usuário. Recarregue os dados antes de salvar.",
          currentData: current,
        });
      }
    }

    const updated = await storage.updateScenario(id, data);
    if (!updated) {
      return res.status(404).json({ error: "Scenario not found" });
    }
    await logAudit(req, "update", "scenario", req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to update scenario" });
  }
});

router.delete("/api/scenarios/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    await storage.deleteScenario(parseInt(req.params.id));
    await logAudit(req, "delete", "scenario", req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete scenario" });
  }
});

router.post("/api/scenarios/:id/duplicate", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const original = await storage.getScenario(id);
    if (!original) {
      return res.status(404).json({ error: "Scenario not found" });
    }

    const existingScenarios = await storage.getScenarios();
    const baseName = original.name;
    let copyNumber = 1;
    const copyPattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(cópia\\s*(\\d+)?\\)$`);
    for (const s of existingScenarios) {
      if (s.name === baseName || copyPattern.test(s.name)) {
        const match = s.name.match(copyPattern);
        if (match && match[1]) {
          copyNumber = Math.max(copyNumber, parseInt(match[1]) + 1);
        } else if (s.name !== baseName) {
          copyNumber = Math.max(copyNumber, 2);
        }
      }
    }
    const newName = `${baseName} (cópia ${copyNumber})`;

    const newScenario = await storage.duplicateScenario(id, newName);
    await logAudit(req, "duplicate", "scenario", String(newScenario.id), { originalId: id, originalName: baseName });
    res.json(newScenario);
  } catch (error: any) {
    console.error("Failed to duplicate scenario:", error);
    res.status(500).json({ error: "Failed to duplicate scenario" });
  }
});

router.get("/api/simulations/recent", requireAuth, async (req, res) => {
  try {
    const simulations = await storage.getRecentSimulations(5);
    res.json(simulations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch simulations" });
  }
});

router.get("/api/simulations", requireAuth, async (req, res) => {
  try {
    const scenarioId = req.query.scenarioId ? parseInt(req.query.scenarioId as string) : undefined;
    const simulations = await storage.getSimulations(scenarioId);
    res.json(simulations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch simulations" });
  }
});

router.post("/api/simulations", requireAuth, async (req, res) => {
  try {
    const simulation = await storage.createSimulation({
      ...req.body,
      createdBy: req.user!.id,
    });
    await logAudit(req, "simulation", "simulation", String(simulation.id), { scenarioId: req.body.scenarioId });
    res.json(simulation);
  } catch (error) {
    res.status(500).json({ error: "Failed to create simulation" });
  }
});

router.get("/api/scenarios/:id/votes", requireAuth, async (req, res) => {
  try {
    const votes = await storage.getScenarioVotes(parseInt(req.params.id));
    res.json(votes);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch scenario votes" });
  }
});

router.post("/api/scenarios/:id/votes", requireAuth, async (req, res) => {
  try {
    const scenarioId = parseInt(req.params.id);
    const { votes } = req.body;
    const savedVotes = await storage.saveScenarioVotes(scenarioId, votes);
    await logAudit(req, "update", "scenario_votes", req.params.id, { votesCount: votes.length });
    res.json(savedVotes);
  } catch (error) {
    res.status(500).json({ error: "Failed to save scenario votes" });
  }
});

router.get("/api/scenarios/:id/alliances", requireAuth, async (req, res) => {
  try {
    const alliances = await storage.getAlliances(parseInt(req.params.id));
    const alliancesWithParties = await Promise.all(
      alliances.map(async (alliance) => {
        const members = await storage.getAllianceParties(alliance.id);
        return { ...alliance, partyIds: members.map((m) => m.partyId) };
      })
    );
    res.json(alliancesWithParties);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch alliances" });
  }
});

router.post("/api/scenarios/:id/alliances", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const scenarioId = parseInt(req.params.id);
    const { name, type, color, partyIds } = req.body;
    const alliance = await storage.createAlliance({
      scenarioId,
      name,
      type: type || "coalition",
      color: color || "#003366",
      createdBy: req.user!.id,
    });
    if (partyIds && partyIds.length > 0) {
      await storage.setAllianceParties(alliance.id, partyIds);
    }
    await logAudit(req, "create", "alliance", String(alliance.id), { name, type, partyIds });
    const members = await storage.getAllianceParties(alliance.id);
    res.json({ ...alliance, partyIds: members.map((m) => m.partyId) });
  } catch (error) {
    res.status(500).json({ error: "Failed to create alliance" });
  }
});

router.put("/api/alliances/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, type, color, partyIds } = req.body;
    const alliance = await storage.updateAlliance(id, { name, type, color });
    if (!alliance) {
      return res.status(404).json({ error: "Alliance not found" });
    }
    if (partyIds !== undefined) {
      await storage.setAllianceParties(id, partyIds);
    }
    await logAudit(req, "update", "alliance", String(id), { name, type, partyIds });
    const members = await storage.getAllianceParties(id);
    res.json({ ...alliance, partyIds: members.map((m) => m.partyId) });
  } catch (error) {
    res.status(500).json({ error: "Failed to update alliance" });
  }
});

router.delete("/api/alliances/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteAlliance(id);
    await logAudit(req, "delete", "alliance", String(id), {});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete alliance" });
  }
});

router.get("/api/scenarios/:id/candidates", requireAuth, async (req, res) => {
  try {
    const scenarioId = parseInt(req.params.id);
    const scenarioCandidates = await storage.getScenarioCandidates(scenarioId);
    res.json(scenarioCandidates);
  } catch (error) {
    console.error("Failed to fetch scenario candidates:", error);
    res.status(500).json({ error: "Failed to fetch scenario candidates" });
  }
});

router.post("/api/scenarios/:id/candidates", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const scenarioId = parseInt(req.params.id);
    const { candidateId, partyId, ballotNumber, nickname, votes } = req.body;
    
    if (!candidateId || !partyId || !ballotNumber) {
      return res.status(400).json({ error: "candidateId, partyId, and ballotNumber are required" });
    }

    const scenario = await storage.getScenario(scenarioId);
    if (!scenario) {
      return res.status(404).json({ error: "Cenário não encontrado" });
    }

    const candidate = await storage.getCandidate(candidateId);
    if (!candidate) {
      return res.status(404).json({ error: "Candidato não encontrado no sistema. Cadastre o candidato primeiro." });
    }

    const party = await storage.getParty(partyId);
    if (!party) {
      return res.status(404).json({ error: "Partido não encontrado no sistema. Cadastre o partido primeiro." });
    }
    
    const scenarioCandidate = await storage.addCandidateToScenario(
      scenarioId,
      candidateId,
      partyId,
      ballotNumber,
      nickname,
      votes
    );
    await logAudit(req, "create", "scenario_candidate", String(scenarioCandidate.id), { scenarioId, candidateId, ballotNumber, votes });

    broadcastScenarioEvent({
      type: "scenario.candidate.added",
      scenarioId,
      candidateId: scenarioCandidate.id,
      updatedBy: req.user?.username || "unknown",
    });

    res.json(scenarioCandidate);
  } catch (error) {
    console.error("Failed to add candidate to scenario:", error);
    const message = error instanceof Error ? error.message : "Failed to add candidate to scenario";
    res.status(500).json({ error: message });
  }
});

router.put("/api/scenario-candidates/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { ballotNumber, nickname, status, votes, expectedUpdatedAt } = req.body;

    if (expectedUpdatedAt) {
      const current = await storage.getScenarioCandidate(id);
      if (!current) {
        return res.status(404).json({ error: "Scenario candidate not found" });
      }
      const currentTs = new Date(current.updatedAt).getTime();
      const expectedTs = new Date(expectedUpdatedAt).getTime();
      if (currentTs !== expectedTs) {
        return res.status(409).json({
          error: "conflict",
          message: "Este candidato foi modificado por outro usuário.",
          currentData: current,
        });
      }
    }

    const updated = await storage.updateScenarioCandidate(id, { ballotNumber, nickname, status, votes });
    if (!updated) {
      return res.status(404).json({ error: "Scenario candidate not found" });
    }
    await logAudit(req, "update", "scenario_candidate", String(id), { ballotNumber, nickname, status, votes });

    broadcastScenarioEvent({
      type: "scenario.candidate.updated",
      scenarioId: updated.scenarioId,
      candidateId: id,
      updatedAt: updated.updatedAt.toISOString(),
      updatedBy: req.user?.username || "unknown",
    });

    res.json(updated);
  } catch (error) {
    console.error("Failed to update scenario candidate:", error);
    res.status(500).json({ error: "Failed to update scenario candidate" });
  }
});

router.delete("/api/scenario-candidates/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const expectedUpdatedAt = req.query.expectedUpdatedAt as string | undefined;
    const current = await storage.getScenarioCandidate(id);
    if (!current) {
      return res.status(404).json({ error: "Scenario candidate not found" });
    }

    if (expectedUpdatedAt) {
      const currentTs = new Date(current.updatedAt).getTime();
      const expectedTs = new Date(expectedUpdatedAt).getTime();
      if (currentTs !== expectedTs) {
        return res.status(409).json({
          error: "conflict",
          message: "Este candidato foi modificado por outro usuário desde que você carregou os dados.",
          currentData: current,
        });
      }
    }

    const scenarioId = current.scenarioId;

    await storage.deleteScenarioCandidate(id);
    await logAudit(req, "delete", "scenario_candidate", String(id), {});

    broadcastScenarioEvent({
      type: "scenario.candidate.deleted",
      scenarioId,
      candidateId: id,
      updatedBy: req.user?.username || "unknown",
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove candidate from scenario" });
  }
});

router.post("/api/electoral/calculate", requireAuth, async (req, res) => {
  try {
    const { scenarioId, partyVotes, candidateVotes } = req.body;
    
    if (!scenarioId || typeof scenarioId !== "number") {
      return res.status(400).json({ error: "Invalid scenarioId" });
    }
    
    const scenario = await storage.getScenario(scenarioId);
    if (!scenario) {
      return res.status(404).json({ error: "Scenario not found" });
    }

    const allParties = await storage.getParties();
    const allCandidates = await storage.getCandidates();
    const scenarioAlliances = await storage.getAlliances(scenarioId);

    const validVotes = scenario.validVotes;
    const availableSeats = scenario.availableSeats;
    
    if (availableSeats <= 0) {
      return res.status(400).json({ error: "Available seats must be greater than zero" });
    }
    
    if (validVotes < availableSeats) {
      return res.status(400).json({ error: "Valid votes must be greater than or equal to available seats" });
    }
    
    const electoralQuotient = Math.floor(validVotes / availableSeats);
    const barrierThreshold = Math.floor(electoralQuotient * 0.80);
    const candidateMinVotes = Math.floor(electoralQuotient * 0.20);
    
    if (electoralQuotient <= 0) {
      return res.status(400).json({ error: "Electoral quotient must be greater than zero" });
    }

    const allianceMembers: Record<number, number[]> = {};
    const partyToAlliance: Record<number, number> = {};
    const federationAlliances = scenarioAlliances.filter(a => a.type === "federation");
    
    for (const alliance of federationAlliances) {
      const members = await storage.getAllianceParties(alliance.id);
      allianceMembers[alliance.id] = members.map(m => m.partyId);
      members.forEach(m => { partyToAlliance[m.partyId] = alliance.id; });
    }

    const candidatesByParty: Record<number, typeof allCandidates> = {};
    allParties.forEach((p) => {
      candidatesByParty[p.id] = allCandidates.filter((c) => c.partyId === p.id);
    });

    type EntityResult = {
      entityId: string;
      entityType: "party" | "federation";
      name: string;
      abbreviation: string;
      totalVotes: number;
      quotient: number;
      seatsFromQuotient: number;
      seatsFromRemainder: number;
      totalSeats: number;
      color: string;
      memberPartyIds?: number[];
      meetsBarrier: boolean;
      barrierDetail: string;
    };

    const entityResults: EntityResult[] = [];
    const partiesInFederations = new Set(Object.keys(partyToAlliance).map(Number));

    for (const federation of federationAlliances) {
      const memberPartyIds = allianceMembers[federation.id] || [];
      const totalVotes = memberPartyIds.reduce((sum, pid) => sum + (partyVotes[pid] || 0), 0);
      const quotient = totalVotes / electoralQuotient;
      const seatsFromQuotient = totalVotes >= electoralQuotient ? Math.floor(quotient) : 0;
      const meetsBarrier = totalVotes >= barrierThreshold;

      entityResults.push({
        entityId: `federation-${federation.id}`,
        entityType: "federation",
        name: federation.name,
        abbreviation: federation.name.substring(0, 10),
        totalVotes,
        quotient,
        seatsFromQuotient,
        seatsFromRemainder: 0,
        totalSeats: 0,
        color: federation.color,
        memberPartyIds,
        meetsBarrier,
        barrierDetail: meetsBarrier 
          ? `Atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos >= ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`
          : `NÃO atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos < ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`,
      });
    }

    for (const party of allParties) {
      if (partiesInFederations.has(party.id)) continue;
      const totalVotes = partyVotes[party.id] || 0;
      const quotient = totalVotes / electoralQuotient;
      const seatsFromQuotient = totalVotes >= electoralQuotient ? Math.floor(quotient) : 0;
      const meetsBarrier = totalVotes >= barrierThreshold;

      entityResults.push({
        entityId: `party-${party.id}`,
        entityType: "party",
        name: party.name,
        abbreviation: party.abbreviation,
        totalVotes,
        quotient,
        seatsFromQuotient,
        seatsFromRemainder: 0,
        totalSeats: 0,
        color: party.color,
        meetsBarrier,
        barrierDetail: meetsBarrier 
          ? `Atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos >= ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`
          : `NÃO atingiu barreira: ${totalVotes.toLocaleString("pt-BR")} votos < ${barrierThreshold.toLocaleString("pt-BR")} (80% QE)`,
      });
    }

    const entitiesReachingQE = entityResults.filter(e => e.totalVotes >= electoralQuotient);
    const barrierEligible = entityResults.filter(e => e.meetsBarrier);

    let seatsDistributedByQuotient = entitiesReachingQE.reduce((sum, e) => sum + e.seatsFromQuotient, 0);
    let remainingSeats = availableSeats - seatsDistributedByQuotient;

    let remainderPool: EntityResult[];
    let noPartyReachedQE = false;

    if (entitiesReachingQE.length === 0) {
      noPartyReachedQE = true;
      remainderPool = entityResults.filter(e => e.totalVotes > 0);
      remainingSeats = availableSeats;
    } else {
      remainderPool = barrierEligible;
    }

    const totalRemainderRounds = remainingSeats;
    for (let round = 0; round < totalRemainderRounds; round++) {
      let maxQ = 0;
      let winnerIdx = -1;

      remainderPool.forEach((e, idx) => {
        const currentSeats = e.seatsFromQuotient + e.seatsFromRemainder;
        const q = e.totalVotes / (currentSeats + 1);
        if (q > maxQ || (q === maxQ && winnerIdx >= 0 && e.totalVotes > remainderPool[winnerIdx].totalVotes)) {
          maxQ = q;
          winnerIdx = idx;
        }
      });

      if (winnerIdx >= 0) {
        remainderPool[winnerIdx].seatsFromRemainder += 1;
      }
    }

    entityResults.forEach(e => { e.totalSeats = e.seatsFromQuotient + e.seatsFromRemainder; });

    type CandidateResult = { candidateId: number; name: string; votes: number; elected: boolean; position: number; belowMinThreshold: boolean; thresholdDetail: string };

    type PartyResultWithAlliance = {
      partyId: number;
      partyName: string;
      abbreviation: string;
      totalVotes: number;
      partyQuotient: number;
      seatsFromQuotient: number;
      seatsFromRemainder: number;
      totalSeats: number;
      electedCandidates: CandidateResult[];
      color: string;
      federationId?: number;
      federationName?: string;
      meetsBarrier: boolean;
      barrierDetail: string;
    };

    const partyResults: PartyResultWithAlliance[] = [];

    const buildCandidateResults = (
      candidates: typeof allCandidates,
      totalSeats: number,
    ): CandidateResult[] => {
      const results: CandidateResult[] = candidates.map(c => {
        const votes = candidateVotes[c.id] || 0;
        const belowMinThreshold = votes < candidateMinVotes;
        return {
          candidateId: c.id,
          name: c.nickname || c.name,
          votes,
          elected: false,
          position: 0,
          belowMinThreshold,
          thresholdDetail: belowMinThreshold 
            ? `Abaixo do mínimo: ${votes.toLocaleString("pt-BR")} < ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`
            : `Acima do mínimo: ${votes.toLocaleString("pt-BR")} >= ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`,
        };
      }).sort((a, b) => b.votes - a.votes);

      let electedCount = 0;
      results.forEach(c => {
        if (electedCount < totalSeats && !c.belowMinThreshold) {
          c.elected = true;
          c.position = electedCount + 1;
          electedCount++;
        }
      });

      return results;
    }

    for (const entity of entityResults) {
      if (entity.totalSeats === 0 && entity.totalVotes === 0) continue;

      if (entity.entityType === "party") {
        const partyId = parseInt(entity.entityId.replace("party-", ""));
        const party = allParties.find(p => p.id === partyId)!;
        const partyCandidates = candidatesByParty[partyId] || [];
        const candidateResults = buildCandidateResults(partyCandidates, entity.totalSeats);

        partyResults.push({
          partyId: party.id,
          partyName: party.name,
          abbreviation: party.abbreviation,
          totalVotes: entity.totalVotes,
          partyQuotient: entity.quotient,
          seatsFromQuotient: entity.seatsFromQuotient,
          seatsFromRemainder: entity.seatsFromRemainder,
          totalSeats: entity.totalSeats,
          electedCandidates: candidateResults,
          color: entity.color,
          meetsBarrier: entity.meetsBarrier,
          barrierDetail: entity.barrierDetail,
        });
      } else {
        const federationId = parseInt(entity.entityId.replace("federation-", ""));
        const federation = federationAlliances.find(a => a.id === federationId)!;
        const memberPartyIds = entity.memberPartyIds || [];

        const allFederationCandidates: (CandidateResult & { partyId: number })[] = [];
        for (const pid of memberPartyIds) {
          const partyCandidates = candidatesByParty[pid] || [];
          for (const c of partyCandidates) {
            const votes = candidateVotes[c.id] || 0;
            const belowMinThreshold = votes < candidateMinVotes;
            allFederationCandidates.push({
              candidateId: c.id,
              name: c.nickname || c.name,
              votes,
              elected: false,
              position: 0,
              belowMinThreshold,
              thresholdDetail: belowMinThreshold
                ? `Abaixo do mínimo: ${votes.toLocaleString("pt-BR")} < ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`
                : `Acima do mínimo: ${votes.toLocaleString("pt-BR")} >= ${candidateMinVotes.toLocaleString("pt-BR")} (20% QE)`,
              partyId: pid,
            });
          }
        }
        allFederationCandidates.sort((a, b) => b.votes - a.votes);

        const partySeatsInFederation: Record<number, number> = {};
        memberPartyIds.forEach(pid => { partySeatsInFederation[pid] = 0; });

        let electedCount = 0;
        allFederationCandidates.forEach(c => {
          if (electedCount < entity.totalSeats && !c.belowMinThreshold) {
            c.elected = true;
            c.position = electedCount + 1;
            partySeatsInFederation[c.partyId] = (partySeatsInFederation[c.partyId] || 0) + 1;
            electedCount++;
          }
        });

        for (const pid of memberPartyIds) {
          const party = allParties.find(p => p.id === pid)!;
          const partyVotesTotal = partyVotes[pid] || 0;
          const partyCandidates = allFederationCandidates.filter(c => c.partyId === pid);
          const partySeats = partySeatsInFederation[pid] || 0;

          partyResults.push({
            partyId: party.id,
            partyName: party.name,
            abbreviation: party.abbreviation,
            totalVotes: partyVotesTotal,
            partyQuotient: partyVotesTotal / electoralQuotient,
            seatsFromQuotient: 0,
            seatsFromRemainder: 0,
            totalSeats: partySeats,
            electedCandidates: partyCandidates.map(c => ({
              candidateId: c.candidateId,
              name: c.name,
              votes: c.votes,
              elected: c.elected,
              position: c.position,
              belowMinThreshold: c.belowMinThreshold,
              thresholdDetail: c.thresholdDetail,
            })),
            color: party.color,
            federationId: federation.id,
            federationName: federation.name,
            meetsBarrier: entity.meetsBarrier,
            barrierDetail: entity.barrierDetail,
          });
        }
      }
    }

    partyResults.sort((a, b) => b.totalSeats - a.totalSeats || b.totalVotes - a.totalVotes);

    const federationResults = entityResults.filter(e => e.entityType === "federation").map(e => ({
      federationId: parseInt(e.entityId.replace("federation-", "")),
      name: e.name,
      totalVotes: e.totalVotes,
      totalSeats: e.totalSeats,
      seatsFromQuotient: e.seatsFromQuotient,
      seatsFromRemainder: e.seatsFromRemainder,
      memberPartyIds: e.memberPartyIds,
      color: e.color,
      meetsBarrier: e.meetsBarrier,
      barrierDetail: e.barrierDetail,
    }));

    const calculationLog = {
      step1_QE: `QE = floor(${validVotes} / ${availableSeats}) = ${electoralQuotient}`,
      step2_barrier: `Cláusula de barreira = 80% × QE = ${barrierThreshold} votos mínimos`,
      step3_candidateMin: `Votação mínima individual = 20% × QE = ${candidateMinVotes} votos`,
      step4_quotientSeats: `${seatsDistributedByQuotient} vagas distribuídas pelo quociente partidário`,
      step5_remainderSeats: `${totalRemainderRounds} vagas distribuídas por sobras (D'Hondt)`,
      step6_totalEntities: `${entityResults.length} entidades analisadas (${federationAlliances.length} federações + ${entityResults.length - federationAlliances.length} partidos isolados)`,
      step7_barrierEligible: `${barrierEligible.length} entidades atingiram a barreira para sobras`,
      noPartyReachedQE,
      warnings: noPartyReachedQE 
        ? ["Nenhuma entidade atingiu o QE. Vagas distribuídas por D'Hondt entre todos os partidos com votos."]
        : [],
    };

    const result = {
      electoralQuotient,
      barrierThreshold,
      candidateMinVotes,
      totalValidVotes: validVotes,
      availableSeats,
      seatsDistributedByQuotient,
      seatsDistributedByRemainder: totalRemainderRounds,
      partyResults,
      federationResults,
      allianceResults: federationResults,
      hasAlliances: federationAlliances.length > 0,
      hasFederations: federationAlliances.length > 0,
      noPartyReachedQE,
      calculationLog,
      tseRulesApplied: [
        "Art. 106 CE: Quociente Eleitoral (QE) = votos válidos / vagas",
        "Art. 107 CE: Quociente Partidário (QP) = votos da legenda / QE",
        "Art. 108 CE: Distribuição de sobras pelo método D'Hondt (maiores médias)",
        "Art. 108 §1º: Cláusula de barreira de 80% do QE para participar das sobras (Lei 14.211/2021)",
        "Art. 108 §1º-A: Votação nominal mínima de 20% do QE para eleição individual",
        "Federações partidárias computadas como entidade única (Lei 14.208/2021)",
      ],
    };

    await logAudit(req, "simulation", "electoral_calculation", String(scenarioId), { 
      electoralQuotient, 
      barrierThreshold,
      candidateMinVotes,
      availableSeats,
      federationsCount: federationAlliances.length,
      noPartyReachedQE,
    });

    res.json(result);
  } catch (error) {
    console.error("Electoral calculation error:", error);
    res.status(500).json({ error: "Failed to calculate electoral results" });
  }
});

export default router;
