import { useEffect, useRef, useCallback, useState } from "react";
import { queryClient } from "@/lib/queryClient";

export interface ImportEvent {
  type: string;
  jobId: number;
  data: Record<string, unknown>;
}

export interface ImportWebSocketState {
  connected: boolean;
  lastEvent: ImportEvent | null;
  events: ImportEvent[];
}

export function useImportWebSocket(enabled: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [state, setState] = useState<ImportWebSocketState>({
    connected: false,
    lastEvent: null,
    events: [],
  });

  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/imports`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("Import WebSocket connected");
        setState(prev => ({ ...prev, connected: true }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ImportEvent;
          
          setState(prev => ({
            ...prev,
            lastEvent: data,
            events: [...prev.events.slice(-99), data],
          }));

          // Invalidate queries based on event type for real-time updates
          switch (data.type) {
            case "import.job.status":
            case "import.job.completed":
            case "import.job.failed":
            case "import.job.progress":
              queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
              break;
              
            case "import.batch.status":
            case "import.batch.error":
              queryClient.invalidateQueries({ 
                queryKey: ["/api/imports/tse", data.jobId, "batches"] 
              });
              // Also refresh main job list for overall progress
              queryClient.invalidateQueries({ queryKey: ["/api/imports/tse"] });
              break;
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        console.log("Import WebSocket disconnected");
        setState(prev => ({ ...prev, connected: false }));
        
        if (enabled) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
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

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ping" }));
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendPing,
  };
}
