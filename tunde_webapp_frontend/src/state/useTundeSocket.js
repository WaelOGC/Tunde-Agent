import { useEffect, useRef, useState } from "react";

function buildWsUrl(httpBase) {
  const raw = (httpBase || "").trim() || "http://localhost:8001";
  const u = new URL(raw);
  const proto = u.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${u.host}/ws/tunde`;
}

/** Process-wide: one socket per URL; refcount so React remounts/HMR do not stack connections. */
let globalTundeWs = null;
let globalTundeUrl = "";
let globalTundeRefcount = 0;
let globalTundeReconnectTimer = null;
let globalTundeRetry = 0;

export function useTundeSocket(args) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(args.onEvent);
  const backendBaseRef = useRef(args.backendHttpBase);
  onEventRef.current = args.onEvent;
  backendBaseRef.current = args.backendHttpBase;

  useEffect(() => {
    const url = buildWsUrl(backendBaseRef.current);

    const clearReconnectTimer = () => {
      if (globalTundeReconnectTimer != null) {
        window.clearTimeout(globalTundeReconnectTimer);
        globalTundeReconnectTimer = null;
      }
    };

    const attachHandlers = (ws) => {
      ws.onopen = () => {
        if (globalTundeWs !== ws) return;
        globalTundeRetry = 0;
        setConnected(true);
      };

      ws.onclose = () => {
        if (globalTundeWs === ws) {
          globalTundeWs = null;
          globalTundeUrl = "";
        }
        setConnected(false);
        if (globalTundeRefcount <= 0) return;
        clearReconnectTimer();
        globalTundeRetry += 1;
        const delayMs = Math.min(10_000, 500 * Math.pow(1.6, globalTundeRetry));
        globalTundeReconnectTimer = window.setTimeout(() => {
          globalTundeReconnectTimer = null;
          openIfNeeded();
        }, delayMs);
      };

      ws.onerror = () => {
        // onclose handles reconnect
      };

      ws.onmessage = (ev) => {
        if (globalTundeWs !== ws) return;
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

    const openIfNeeded = () => {
      if (globalTundeRefcount <= 0) return;

      const existing = globalTundeWs;
      if (existing && globalTundeUrl === url) {
        const rs = existing.readyState;
        if (rs === WebSocket.CONNECTING || rs === WebSocket.OPEN) {
          if (rs === WebSocket.OPEN) setConnected(true);
          return;
        }
      }

      clearReconnectTimer();

      if (existing) {
        try {
          existing.close();
        } catch {
          /* ignore */
        }
        if (globalTundeWs === existing) {
          globalTundeWs = null;
          globalTundeUrl = "";
        }
      }

      const ws = new WebSocket(url);
      globalTundeWs = ws;
      globalTundeUrl = url;
      attachHandlers(ws);
    };

    globalTundeRefcount += 1;
    openIfNeeded();

    return () => {
      globalTundeRefcount -= 1;
      setConnected(false);
      clearReconnectTimer();

      if (globalTundeRefcount <= 0) {
        globalTundeRetry = 0;
        const w = globalTundeWs;
        globalTundeWs = null;
        globalTundeUrl = "";
        if (w) {
          try {
            w.close();
          } catch {
            /* ignore */
          }
        }
      }
    };
  }, [args.backendHttpBase]);

  return { connected };
}
