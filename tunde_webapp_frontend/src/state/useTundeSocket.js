import { useEffect, useRef, useState } from "react";

function buildWsUrl(httpBase) {
  const raw = (httpBase || "").trim() || "http://localhost:8001";
  const u = new URL(raw);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/ws/tunde`;
}

export function useTundeSocket(args) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const closedByUserRef = useRef(false);
  const timerRef = useRef(null);
  const onEventRef = useRef(args.onEvent);
  onEventRef.current = args.onEvent;

  useEffect(() => {
    closedByUserRef.current = false;

    const connect = () => {
      const url = buildWsUrl(args.backendHttpBase);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (closedByUserRef.current) return;

        retryRef.current += 1;
        const delayMs = Math.min(10_000, 500 * Math.pow(1.6, retryRef.current));
        timerRef.current = window.setTimeout(connect, delayMs);
      };

      ws.onerror = () => {
        // let onclose handle reconnects
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (
            data &&
            typeof data === "object" &&
            typeof data.event === "string" &&
            typeof data.timestamp === "string" &&
            data.payload &&
            typeof data.payload === "object"
          ) {
            onEventRef.current(data);
          }
        } catch {
          // ignore non-JSON
        }
      };
    };

    connect();

    return () => {
      closedByUserRef.current = true;
      setConnected(false);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [args.backendHttpBase]);

  return { connected };
}

