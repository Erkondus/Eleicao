import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

interface ScenarioEvent {
  type: "scenario.candidate.added" | "scenario.candidate.updated" | "scenario.candidate.deleted";
  scenarioId: number;
  candidateId: number;
  updatedAt?: string;
  updatedBy: string;
}

export function useScenarioWebSocket(scenarioId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scenarioIdNum = scenarioId ? parseInt(scenarioId) : null;

  const connect = useCallback(() => {
    if (!scenarioIdNum || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/imports`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data.type?.startsWith("scenario.candidate.")) return;

          const scenarioEvent = data as ScenarioEvent;
          if (scenarioEvent.scenarioId !== scenarioIdNum) return;

          queryClient.invalidateQueries({
            queryKey: ["/api/scenarios", scenarioId, "candidates"],
          });
          queryClient.invalidateQueries({
            queryKey: ["/api/scenarios", scenarioId],
          });
        } catch {
        }
      };

      ws.onclose = () => {
        if (scenarioIdNum) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {};
    } catch {
    }
  }, [scenarioId, scenarioIdNum]);

  useEffect(() => {
    if (scenarioId) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [scenarioId, connect]);
}
