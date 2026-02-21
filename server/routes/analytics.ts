import { Router } from "express";
import { requireAuth, logAudit } from "./shared";
import { storage } from "../storage";

const router = Router();

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

router.get("/api/analytics/summary", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, position, party, municipality, minVotes, maxVotes } = req.query;
    const summary = await storage.getAnalyticsSummary({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
      position: position as string | undefined,
      party: party as string | undefined,
      municipality: municipality as string | undefined,
      minVotes: minVotes ? parseInt(minVotes as string) : undefined,
      maxVotes: maxVotes ? parseInt(maxVotes as string) : undefined,
    });
    res.json(summary);
  } catch (error) {
    console.error("Analytics summary error:", error);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

router.get("/api/analytics/votes-by-party", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, position, party, municipality, limit } = req.query;
    const data = await storage.getVotesByParty({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
      position: position as string | undefined,
      party: party as string | undefined,
      municipality: municipality as string | undefined,
      limit: limit ? parseInt(limit as string) : 20,
    });
    res.json(data);
  } catch (error) {
    console.error("Votes by party error:", error);
    res.status(500).json({ error: "Failed to fetch votes by party" });
  }
});

router.get("/api/analytics/top-candidates", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, position, party, municipality, limit } = req.query;
    const data = await storage.getTopCandidates({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
      position: position as string | undefined,
      party: party as string | undefined,
      municipality: municipality as string | undefined,
      limit: limit ? parseInt(limit as string) : 20,
    });
    res.json(data);
  } catch (error) {
    console.error("Top candidates error:", error);
    res.status(500).json({ error: "Failed to fetch top candidates" });
  }
});

router.get("/api/analytics/votes-by-state", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, position, party, municipality } = req.query;
    const data = await storage.getVotesByState({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
      position: position as string | undefined,
      party: party as string | undefined,
      municipality: municipality as string | undefined,
    });
    res.json(data);
  } catch (error) {
    console.error("Votes by state error:", error);
    res.status(500).json({ error: "Failed to fetch votes by state" });
  }
});

router.get("/api/analytics/votes-by-municipality", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, position, party, municipality, limit } = req.query;
    const data = await storage.getVotesByMunicipality({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
      position: position as string | undefined,
      party: party as string | undefined,
      municipality: municipality as string | undefined,
      limit: limit ? parseInt(limit as string) : 50,
    });
    res.json(data);
  } catch (error) {
    console.error("Votes by municipality error:", error);
    res.status(500).json({ error: "Failed to fetch votes by municipality" });
  }
});

router.get("/api/analytics/election-years", requireAuth, async (req, res) => {
  try {
    const years = await storage.getAvailableElectionYears();
    res.json(years);
  } catch (error) {
    console.error("Election years error:", error);
    res.status(500).json({ error: "Failed to fetch election years" });
  }
});

router.get("/api/analytics/states", requireAuth, async (req, res) => {
  try {
    const { year } = req.query;
    const states = await storage.getAvailableStates(year ? parseInt(year as string) : undefined);
    res.json(states);
  } catch (error) {
    console.error("States error:", error);
    res.status(500).json({ error: "Failed to fetch states" });
  }
});

router.get("/api/analytics/election-types", requireAuth, async (req, res) => {
  try {
    const { year } = req.query;
    const types = await storage.getAvailableElectionTypes(year ? parseInt(year as string) : undefined);
    res.json(types);
  } catch (error) {
    console.error("Election types error:", error);
    res.status(500).json({ error: "Failed to fetch election types" });
  }
});

router.get("/api/analytics/municipalities", requireAuth, async (req, res) => {
  try {
    const { uf, year } = req.query;
    const municipalities = await storage.getMunicipalities({
      uf: uf as string | undefined,
      year: year ? parseInt(year as string) : undefined,
    });
    res.json(municipalities);
  } catch (error) {
    console.error("Municipalities error:", error);
    res.status(500).json({ error: "Failed to fetch municipalities" });
  }
});

router.get("/api/analytics/positions", requireAuth, async (req, res) => {
  try {
    const { year, uf } = req.query;
    const positions = await storage.getPositions({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
    });
    res.json(positions);
  } catch (error) {
    console.error("Positions error:", error);
    res.status(500).json({ error: "Failed to fetch positions" });
  }
});

router.get("/api/analytics/compare", requireAuth, async (req, res) => {
  try {
    const { years, uf, position, party } = req.query;
    const yearList = years ? (years as string).split(",").map(y => parseInt(y)) : [];
    
    if (yearList.length < 2) {
      return res.status(400).json({ error: "At least 2 years required for comparison" });
    }

    const comparisonData = await Promise.all(yearList.map(async (year) => {
      const partyVotes = await storage.getVotesByParty({
        year,
        uf: uf as string | undefined,
        limit: 20,
      });

      const summary = await storage.getAnalyticsSummary({ year, uf: uf as string | undefined });

      return {
        year,
        totalVotes: summary.totalVotes,
        totalCandidates: summary.totalCandidates,
        totalParties: summary.totalParties,
        partyVotes: partyVotes.slice(0, 10),
      };
    }));

    res.json({ years: yearList, data: comparisonData });
  } catch (error) {
    console.error("Comparison error:", error);
    res.status(500).json({ error: "Failed to compare data" });
  }
});

router.get("/api/analytics/export/csv", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, reportType } = req.query;
    const filters = {
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
    };

    let data: any[];
    let filename: string;

    switch (reportType) {
      case "parties":
        data = await storage.getVotesByParty({ ...filters, limit: 10000 });
        filename = "votos_por_partido.csv";
        break;
      case "candidates":
        data = await storage.getTopCandidates({ ...filters, limit: 10000 });
        filename = "candidatos_mais_votados.csv";
        break;
      case "states":
        data = await storage.getVotesByState(filters);
        filename = "votos_por_estado.csv";
        break;
      case "municipalities":
        data = await storage.getVotesByMunicipality({ ...filters, limit: 10000 });
        filename = "votos_por_municipio.csv";
        break;
      default:
        return res.status(400).json({ error: "Invalid report type" });
    }

    if (data.length === 0) {
      return res.status(404).json({ error: "No data found for the specified filters" });
    }

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(",")];
    for (const row of data) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      });
      csvRows.push(values.join(","));
    }

    await logAudit(req, "export", "analytics_csv", reportType as string, { filters, rowCount: data.length });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csvRows.join("\n"));
  } catch (error) {
    console.error("Analytics CSV export error:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

router.get("/api/analytics/parties-list", requireAuth, async (req, res) => {
  try {
    const { year, uf } = req.query;
    const parties = await storage.getAvailableParties({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
    });
    res.json(parties);
  } catch (error) {
    console.error("Parties list error:", error);
    res.status(500).json({ error: "Failed to fetch parties" });
  }
});

router.get("/api/analytics/advanced", requireAuth, async (req, res) => {
  try {
    const { year, uf, electionType, position, party, minVotes, maxVotes, limit } = req.query;
    const result = await storage.getAdvancedAnalytics({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      electionType: electionType as string | undefined,
      position: position as string | undefined,
      party: party as string | undefined,
      minVotes: minVotes ? parseInt(minVotes as string) : undefined,
      maxVotes: maxVotes ? parseInt(maxVotes as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100,
    });
    res.json(result);
  } catch (error) {
    console.error("Advanced analytics error:", error);
    res.status(500).json({ error: "Failed to fetch advanced analytics" });
  }
});

router.post("/api/analytics/compare", requireAuth, async (req, res) => {
  try {
    const { years, states, groupBy } = req.body;
    if (!groupBy || !["party", "state", "position"].includes(groupBy)) {
      return res.status(400).json({ error: "Invalid groupBy parameter" });
    }
    const result = await storage.getComparisonData({
      years: years?.map((y: string | number) => typeof y === "string" ? parseInt(y) : y),
      states,
      groupBy,
    });
    await logAudit(req, "compare", "analytics", undefined, { years, states, groupBy });
    res.json(result);
  } catch (error) {
    console.error("Comparison error:", error);
    res.status(500).json({ error: "Failed to get comparison data" });
  }
});

router.get("/api/analytics/drill-down/candidates-by-party", requireAuth, async (req, res) => {
  try {
    const { year, uf, party, position, limit } = req.query;
    if (!party) {
      return res.status(400).json({ error: "Party parameter is required" });
    }
    const candidates = await storage.getCandidatesByParty({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
      party: party as string,
      position: position as string | undefined,
      limit: limit ? parseInt(limit as string) : 100,
    });
    res.json(candidates);
  } catch (error) {
    console.error("Candidates by party error:", error);
    res.status(500).json({ error: "Failed to fetch candidates by party" });
  }
});

router.get("/api/analytics/drill-down/party-by-state", requireAuth, async (req, res) => {
  try {
    const { year, party, position } = req.query;
    const data = await storage.getPartyPerformanceByState({
      year: year ? parseInt(year as string) : undefined,
      party: party as string | undefined,
      position: position as string | undefined,
    });
    res.json(data);
  } catch (error) {
    console.error("Party by state error:", error);
    res.status(500).json({ error: "Failed to fetch party performance by state" });
  }
});

router.get("/api/analytics/drill-down/votes-by-position", requireAuth, async (req, res) => {
  try {
    const { year, uf } = req.query;
    const data = await storage.getVotesByPosition({
      year: year ? parseInt(year as string) : undefined,
      uf: uf as string | undefined,
    });
    res.json(data);
  } catch (error) {
    console.error("Votes by position error:", error);
    res.status(500).json({ error: "Failed to fetch votes by position" });
  }
});

export default router;
