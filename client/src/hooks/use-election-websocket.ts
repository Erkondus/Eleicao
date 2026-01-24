import { useEffect, useRef, useCallback, useState } from "react";

export interface ElectionUpdate {
  countedVotes: number;
  totalVotes: number;
  percentageCounted: number;
  partyResults: Array<{ party: string; votes: number; percentage: number; projected?: number }>;
  candidateResults: Array<{ name: string; party: string; votes: number; percentage: number }>;
  regionsCounted: number;
  totalRegions: number;
  timestamp: string;
}

export interface ElectionProjection {
  partyProjections: Array<{ 
    party: string; 
    currentVotes: number; 
    projectedVotes: number; 
    confidence: number;
    trend: "up" | "down" | "stable";
  }>;
  leadingCandidates: Array<{
    name: string;
    party: string;
    currentVotes: number;
    projectedVotes: number;
    winProbability: number;
  }>;
  percentageCounted: number;
  timestamp: string;
}

export interface ElectionSimulationStarted {
  year: number;
  state?: string;
  position?: string;
  totalVotes: number;
  totalParties: number;
  totalCandidates: number;
  startedAt: string;
}

export interface ElectionSimulationCompleted {
  totalVotes: number;
  partyResults: Array<{ party: string; votes: number; percentage: number }>;
  candidateResults: Array<{ name: string; party: string; votes: number }>;
  completedAt: string;
  duration: number;
}

export interface ElectionWebSocketState {
  connected: boolean;
  connectionError: boolean;
  simulationId: string | null;
  status: "idle" | "running" | "paused" | "completed";
  latestUpdate: ElectionUpdate | null;
  latestProjection: ElectionProjection | null;
  simulationInfo: ElectionSimulationStarted | null;
  completedData: ElectionSimulationCompleted | null;
}

export function useElectionWebSocket(enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [state, setState] = useState<ElectionWebSocketState>({
    connected: false,
    connectionError: false,
    simulationId: null,
    status: "idle",
    latestUpdate: null,
    latestProjection: null,
    simulationInfo: null,
    completedData: null,
  });

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/imports`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Election WebSocket connected");
        setState(prev => ({ ...prev, connected: true, connectionError: false }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case "election.simulation.started":
              setState(prev => ({
                ...prev,
                simulationId: data.simulationId,
                status: "running",
                simulationInfo: data.data as ElectionSimulationStarted,
                latestUpdate: null,
                latestProjection: null,
                completedData: null,
              }));
              break;
              
            case "election.simulation.update":
              setState(prev => ({
                ...prev,
                simulationId: data.simulationId,
                latestUpdate: data.data as ElectionUpdate,
              }));
              break;
              
            case "election.simulation.projection":
              setState(prev => ({
                ...prev,
                simulationId: data.simulationId,
                latestProjection: data.data as ElectionProjection,
              }));
              break;
              
            case "election.simulation.completed":
              setState(prev => ({
                ...prev,
                simulationId: data.simulationId,
                status: "completed",
                completedData: data.data as ElectionSimulationCompleted,
              }));
              break;
          }
        } catch (e) {
          console.error("Failed to parse election WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        console.log("Election WebSocket disconnected");
        setState(prev => ({ ...prev, connected: false }));
        
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("Election WebSocket error:", error);
        setState(prev => ({ ...prev, connectionError: true }));
      };
    } catch (error) {
      console.error("Failed to create Election WebSocket:", error);
    }
  }, [enabled]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState(prev => ({ ...prev, connected: false }));
  }, []);

  const reset = useCallback(() => {
    setState({
      connected: state.connected,
      connectionError: false,
      simulationId: null,
      status: "idle",
      latestUpdate: null,
      latestProjection: null,
      simulationInfo: null,
      completedData: null,
    });
  }, [state.connected]);

  const setStatus = useCallback((status: "idle" | "running" | "paused" | "completed") => {
    setState(prev => ({ ...prev, status }));
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => disconnect();
  }, [enabled, connect, disconnect]);

  return {
    ...state,
    connect,
    disconnect,
    reset,
    setStatus,
  };
}
