import { storage } from "./storage";
import { broadcastElectionEvent, emitElectionUpdate, emitElectionProjection } from "./websocket";
import { randomUUID } from "crypto";

interface PartyVoteState {
  party: string;
  totalVotes: number;
  countedVotes: number;
  projectedVotes: number;
  confidence: number;
  trend: "up" | "down" | "stable";
  color?: string;
}

interface CandidateVoteState {
  name: string;
  party: string;
  totalVotes: number;
  countedVotes: number;
  winProbability: number;
}

interface SimulationState {
  id: string;
  status: "running" | "paused" | "completed" | "cancelled";
  startedAt: Date;
  year: number;
  state?: string;
  position?: string;
  totalVotes: number;
  countedVotes: number;
  percentageCounted: number;
  totalRegions: number;
  regionsCounted: number;
  partyStates: Map<string, PartyVoteState>;
  candidateStates: Map<string, CandidateVoteState>;
  updateInterval?: ReturnType<typeof setInterval>;
  projectionInterval?: ReturnType<typeof setInterval>;
}

const activeSimulations = new Map<string, SimulationState>();

export async function startElectionSimulation(options: {
  year: number;
  state?: string;
  position?: string;
  speed?: number;
}): Promise<{ simulationId: string; message: string }> {
  const simulationId = randomUUID();
  const speed = options.speed || 1;

  const historicalData = await storage.getHistoricalVotesByParty({
    years: [options.year],
    position: options.position,
    state: options.state,
  });

  if (historicalData.length === 0) {
    throw new Error("No historical data found for the specified parameters");
  }

  const totalVotes = historicalData.reduce((sum, d) => sum + d.totalVotes, 0);
  const totalCandidates = historicalData.reduce((sum, d) => sum + d.candidateCount, 0);

  const partyStates = new Map<string, PartyVoteState>();
  for (const data of historicalData) {
    if (!partyStates.has(data.party)) {
      partyStates.set(data.party, {
        party: data.party,
        totalVotes: data.totalVotes,
        countedVotes: 0,
        projectedVotes: data.totalVotes,
        confidence: 0,
        trend: "stable",
      });
    } else {
      const existing = partyStates.get(data.party)!;
      existing.totalVotes += data.totalVotes;
      existing.projectedVotes += data.totalVotes;
    }
  }

  const candidateStates = new Map<string, CandidateVoteState>();
  const topCandidatesData = await storage.getTopCandidates({
    year: options.year,
    uf: options.state,
    limit: 20,
  });

  for (const candidate of topCandidatesData) {
    candidateStates.set(candidate.name, {
      name: candidate.name,
      party: candidate.party || "N/A",
      totalVotes: candidate.votes,
      countedVotes: 0,
      winProbability: 0,
    });
  }

  const simulation: SimulationState = {
    id: simulationId,
    status: "running",
    startedAt: new Date(),
    year: options.year,
    state: options.state,
    position: options.position,
    totalVotes,
    countedVotes: 0,
    percentageCounted: 0,
    totalRegions: 27,
    regionsCounted: 0,
    partyStates,
    candidateStates,
  };

  activeSimulations.set(simulationId, simulation);

  broadcastElectionEvent({
    type: "election.simulation.started",
    simulationId,
    data: {
      year: options.year,
      state: options.state,
      position: options.position,
      totalVotes,
      totalParties: partyStates.size,
      totalCandidates: candidateStates.size,
      startedAt: simulation.startedAt.toISOString(),
    },
  });

  const baseInterval = 2000 / speed;
  simulation.updateInterval = setInterval(() => {
    updateSimulation(simulationId);
  }, baseInterval);

  simulation.projectionInterval = setInterval(() => {
    updateProjections(simulationId);
  }, baseInterval * 3);

  return { simulationId, message: "Simulação de apuração iniciada" };
}

function updateSimulation(simulationId: string): void {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation || simulation.status !== "running") return;

  const incrementPercent = 0.5 + Math.random() * 1.5;
  const increment = Math.floor((simulation.totalVotes * incrementPercent) / 100);
  
  simulation.countedVotes = Math.min(simulation.countedVotes + increment, simulation.totalVotes);
  simulation.percentageCounted = (simulation.countedVotes / simulation.totalVotes) * 100;

  const regionProgress = simulation.percentageCounted / 100;
  simulation.regionsCounted = Math.floor(simulation.totalRegions * regionProgress);

  const partyResults: Array<{ party: string; votes: number; percentage: number; projected?: number }> = [];
  let totalCountedPartyVotes = 0;

  Array.from(simulation.partyStates.entries()).forEach(([party, state]) => {
    const noise = 0.95 + Math.random() * 0.1;
    const targetVotes = Math.floor(state.totalVotes * regionProgress * noise);
    state.countedVotes = Math.min(targetVotes, state.totalVotes);
    totalCountedPartyVotes += state.countedVotes;
  });

  Array.from(simulation.partyStates.entries()).forEach(([party, state]) => {
    const percentage = totalCountedPartyVotes > 0 
      ? (state.countedVotes / totalCountedPartyVotes) * 100 
      : 0;
    
    partyResults.push({
      party,
      votes: state.countedVotes,
      percentage,
      projected: state.projectedVotes,
    });
  });

  partyResults.sort((a, b) => b.votes - a.votes);

  const candidateResults: Array<{ name: string; party: string; votes: number; percentage: number }> = [];
  let totalCountedCandidateVotes = 0;

  Array.from(simulation.candidateStates.entries()).forEach(([name, state]) => {
    const noise = 0.9 + Math.random() * 0.2;
    const targetVotes = Math.floor(state.totalVotes * regionProgress * noise);
    state.countedVotes = Math.min(targetVotes, state.totalVotes);
    totalCountedCandidateVotes += state.countedVotes;
  });

  Array.from(simulation.candidateStates.entries()).forEach(([name, state]) => {
    const percentage = totalCountedCandidateVotes > 0 
      ? (state.countedVotes / totalCountedCandidateVotes) * 100 
      : 0;
    
    candidateResults.push({
      name,
      party: state.party,
      votes: state.countedVotes,
      percentage,
    });
  });

  candidateResults.sort((a, b) => b.votes - a.votes);

  emitElectionUpdate(simulationId, {
    countedVotes: simulation.countedVotes,
    totalVotes: simulation.totalVotes,
    percentageCounted: simulation.percentageCounted,
    partyResults: partyResults.slice(0, 15),
    candidateResults: candidateResults.slice(0, 10),
    regionsCounted: simulation.regionsCounted,
    totalRegions: simulation.totalRegions,
    timestamp: new Date().toISOString(),
  });

  if (simulation.percentageCounted >= 100) {
    completeSimulation(simulationId);
  }
}

function updateProjections(simulationId: string): void {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation || simulation.status !== "running") return;
  if (simulation.percentageCounted < 5) return;

  const partyProjections: Array<{ 
    party: string; 
    currentVotes: number; 
    projectedVotes: number; 
    confidence: number;
    trend: "up" | "down" | "stable";
  }> = [];

  const percentCounted = simulation.percentageCounted / 100;
  const confidenceBase = Math.min(95, 50 + (percentCounted * 45));

  Array.from(simulation.partyStates.entries()).forEach(([party, state]) => {
    if (state.countedVotes === 0) return;

    const projectionFactor = 1 / percentCounted;
    const noise = 0.98 + Math.random() * 0.04;
    const projectedVotes = Math.floor(state.countedVotes * projectionFactor * noise);
    
    const prevProjected = state.projectedVotes;
    state.projectedVotes = projectedVotes;
    
    if (projectedVotes > prevProjected * 1.02) {
      state.trend = "up";
    } else if (projectedVotes < prevProjected * 0.98) {
      state.trend = "down";
    } else {
      state.trend = "stable";
    }
    
    state.confidence = confidenceBase + (Math.random() * 5 - 2.5);

    partyProjections.push({
      party,
      currentVotes: state.countedVotes,
      projectedVotes: state.projectedVotes,
      confidence: state.confidence,
      trend: state.trend,
    });
  });

  partyProjections.sort((a, b) => b.projectedVotes - a.projectedVotes);

  const leadingCandidates: Array<{
    name: string;
    party: string;
    currentVotes: number;
    projectedVotes: number;
    winProbability: number;
  }> = [];

  const candidateArray = Array.from(simulation.candidateStates.values());
  candidateArray.sort((a, b) => b.countedVotes - a.countedVotes);
  
  const topCandidates = candidateArray.slice(0, 5);
  const totalTopVotes = topCandidates.reduce((sum, c) => sum + c.countedVotes, 0);

  for (const candidate of topCandidates) {
    const projectionFactor = 1 / percentCounted;
    const projectedVotes = Math.floor(candidate.countedVotes * projectionFactor);
    
    const voteShare = totalTopVotes > 0 ? candidate.countedVotes / totalTopVotes : 0;
    candidate.winProbability = Math.min(99, voteShare * 100 * (0.8 + percentCounted * 0.2));

    leadingCandidates.push({
      name: candidate.name,
      party: candidate.party,
      currentVotes: candidate.countedVotes,
      projectedVotes,
      winProbability: candidate.winProbability,
    });
  }

  emitElectionProjection(simulationId, {
    partyProjections: partyProjections.slice(0, 10),
    leadingCandidates,
    percentageCounted: simulation.percentageCounted,
    timestamp: new Date().toISOString(),
  });
}

function completeSimulation(simulationId: string): void {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) return;

  if (simulation.updateInterval) clearInterval(simulation.updateInterval);
  if (simulation.projectionInterval) clearInterval(simulation.projectionInterval);
  
  simulation.status = "completed";

  const finalPartyResults = Array.from(simulation.partyStates.values())
    .map(s => ({
      party: s.party,
      votes: s.countedVotes,
      percentage: (s.countedVotes / simulation.countedVotes) * 100,
    }))
    .sort((a, b) => b.votes - a.votes);

  const finalCandidateResults = Array.from(simulation.candidateStates.values())
    .map(s => ({
      name: s.name,
      party: s.party,
      votes: s.countedVotes,
    }))
    .sort((a, b) => b.votes - a.votes);

  broadcastElectionEvent({
    type: "election.simulation.completed",
    simulationId,
    data: {
      totalVotes: simulation.countedVotes,
      partyResults: finalPartyResults.slice(0, 15),
      candidateResults: finalCandidateResults.slice(0, 10),
      completedAt: new Date().toISOString(),
      duration: Date.now() - simulation.startedAt.getTime(),
    },
  });

  setTimeout(() => {
    activeSimulations.delete(simulationId);
  }, 60000);
}

export function pauseSimulation(simulationId: string): boolean {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation || simulation.status !== "running") return false;

  if (simulation.updateInterval) clearInterval(simulation.updateInterval);
  if (simulation.projectionInterval) clearInterval(simulation.projectionInterval);
  simulation.status = "paused";

  return true;
}

export function resumeSimulation(simulationId: string, speed: number = 1): boolean {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation || simulation.status !== "paused") return false;

  simulation.status = "running";
  const baseInterval = 2000 / speed;
  
  simulation.updateInterval = setInterval(() => {
    updateSimulation(simulationId);
  }, baseInterval);

  simulation.projectionInterval = setInterval(() => {
    updateProjections(simulationId);
  }, baseInterval * 3);

  return true;
}

export function cancelSimulation(simulationId: string): boolean {
  const simulation = activeSimulations.get(simulationId);
  if (!simulation) return false;

  if (simulation.updateInterval) clearInterval(simulation.updateInterval);
  if (simulation.projectionInterval) clearInterval(simulation.projectionInterval);
  simulation.status = "cancelled";
  
  activeSimulations.delete(simulationId);
  return true;
}

export function getSimulationStatus(simulationId: string): SimulationState | null {
  return activeSimulations.get(simulationId) || null;
}

export function getActiveSimulations(): Array<{
  id: string;
  status: string;
  year: number;
  state?: string;
  percentageCounted: number;
  startedAt: string;
}> {
  return Array.from(activeSimulations.values()).map(s => ({
    id: s.id,
    status: s.status,
    year: s.year,
    state: s.state,
    percentageCounted: s.percentageCounted,
    startedAt: s.startedAt.toISOString(),
  }));
}
