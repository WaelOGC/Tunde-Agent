import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatCenter from "./components/ChatCenter";
import LandingCanvasPanel from "./components/LandingCanvasPanel";
import ProcessStepper from "./components/ProcessStepper";
import SettingsPanel from "./components/SettingsPanel";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import { getMockSession } from "./state/mockSession";
import { useTundeSocket } from "./state/useTundeSocket";

function makeId() {
  return Math.random().toString(16).slice(2);
}

function backendHttpBase() {
  return import.meta.env.VITE_BACKEND_HTTP_BASE || "http://localhost:8001";
}

function backendHostLabel() {
  try {
    return new URL(backendHttpBase()).host;
  } catch {
    return "localhost:8001";
  }
}

function wsUrl() {
  try {
    const u = new URL(backendHttpBase());
    const p = u.protocol === "https:" ? "wss:" : "ws:";
    return `${p}//${u.host}/ws/tunde`;
  } catch {
    return "ws://localhost:8001/ws/tunde";
  }
}

function isTaskStatusChangePayload(p) {
  return (
    p &&
    typeof p === "object" &&
    typeof p.task_id === "string" &&
    typeof p.correlation_id === "string" &&
    typeof p.status === "string"
  );
}

function isQcRejectionPayload(p) {
  return (
    p &&
    typeof p === "object" &&
    typeof p.task_id === "string" &&
    typeof p.correlation_id === "string" &&
    typeof p.reason === "string" &&
    typeof p.attempt === "number"
  );
}

function isToolActivityPayload(p) {
  return (
    p &&
    typeof p === "object" &&
    typeof p.task_id === "string" &&
    typeof p.correlation_id === "string" &&
    typeof p.message === "string"
  );
}

const ENABLED_TOOLS_STORAGE_KEY = "tunde_enabled_tools";
const CUSTOM_RULES_STORAGE_KEY = "tunde_custom_rules";

function loadCustomRules() {
  try {
    const raw = sessionStorage.getItem(CUSTOM_RULES_STORAGE_KEY);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

const DATA_WIZARD_LABELS = {
  summarize: "Summarize Content",
  analyze: "Perform Data Analysis",
  insights: "Extract Key Insights",
  visualize: "Visualize Data",
};

function buildWorkspaceExport({ messages, thoughtLog, fileAnalystContext }) {
  const msgs = Array.isArray(messages) ? messages : [];
  const parts = [];
  if (fileAnalystContext?.summary) {
    parts.push(
      `## File analyst\n${fileAnalystContext.summary}\n(filename: ${fileAnalystContext.filename || "upload"})`
    );
  }
  if (Array.isArray(thoughtLog) && thoughtLog.length) {
    parts.push(`## Recent tool activity\n${thoughtLog.slice(-10).join("\n")}`);
  }
  const recent = msgs.slice(-14);
  for (const m of recent) {
    const role = m.role === "user" ? "User" : "Assistant";
    const body = (m.content || m.text || "").trim();
    if (!body) continue;
    let extra = "";
    if (Array.isArray(m.blocks) && m.blocks.length) {
      extra = m.blocks
        .map((b) => {
          if (!b || typeof b !== "object") return "";
          if (b.type === "table")
            return `[table: ${(b.headers || []).length}×${(b.rows || []).length}]`;
          if (b.type === "image") return "[canvas image]";
          if (b.type === "file_preview") return `[file: ${b.name}]`;
          return b.type ? `[${b.type}]` : "";
        })
        .filter(Boolean)
        .join(" ");
    }
    parts.push(`## ${role}\n${body}${extra ? `\n${extra}` : ""}`);
  }
  return parts.join("\n\n").slice(0, 26000);
}

function loadEnabledTools() {
  try {
    const raw = sessionStorage.getItem(ENABLED_TOOLS_STORAGE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === "object") {
        return {
          search: j.search !== false,
          analysis: Boolean(j.analysis),
          vision: Boolean(j.vision),
          memory: Boolean(j.memory),
          file_analyst: Boolean(j.file_analyst),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { search: true, analysis: false, vision: false, memory: false, file_analyst: false };
}

function statusToActiveStep(status, processing) {
  if (!processing && (status === "idle" || !status)) return null;
  if (status === "qc_review") return "qc";
  if (status === "complete" || status === "failed") return "ceo";
  return "agent";
}

function sessionPreview(messages) {
  const last = messages[messages.length - 1];
  if (!last) return "Empty session";
  const t = last.content || last.text || "";
  return t.slice(0, 72) || "…";
}

export function App() {
  const session = useMemo(() => getMockSession(), []);
  const [sessions, setSessions] = useState(() => [{ id: "s1", title: "New chat", messages: [] }]);
  const [activeSessionId, setActiveSessionId] = useState("s1");
  const [view, setView] = useState("chat");
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const currentRunRef = useRef(null);
  currentRunRef.current = currentRun;
  const runSessionRef = useRef(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const [pendingInfographic, setPendingInfographic] = useState(false);
  // Guard against duplicate final events (WebSocket reconnects / multiple connections).
  const seenFinalCorrelationIdsRef = useRef(new Set());

  const [latestStatus, setLatestStatus] = useState("idle");
  const [latestMessage, setLatestMessage] = useState("");
  const [thoughtLog, setThoughtLog] = useState([]);
  const [qcRejected, setQcRejected] = useState(false);
  const [qcReason, setQcReason] = useState("");
  const [enabledTools, setEnabledTools] = useState(loadEnabledTools);
  const enabledToolsRef = useRef(enabledTools);
  enabledToolsRef.current = enabledTools;
  const [customRules, setCustomRules] = useState(loadCustomRules);
  const lastUserPromptRef = useRef("");
  /** Interactive image wizard: null | { phase, style?, ratio? } */
  const [imageGenWizard, setImageGenWizard] = useState(null);
  const imageGenWizardRef = useRef(null);
  imageGenWizardRef.current = imageGenWizard;
  const [fileAnalystContext, setFileAnalystContext] = useState(null);
  const fileAnalystContextRef = useRef(null);
  fileAnalystContextRef.current = fileAnalystContext;
  const [landingOpen, setLandingOpen] = useState(false);
  const [landingBusy, setLandingBusy] = useState(false);
  const [landingState, setLandingState] = useState({
    html: "",
    title: "Tunde Report",
    lastShareUrl: "",
  });
  const landingStateRef = useRef(landingState);
  landingStateRef.current = landingState;
  const thoughtLogRef = useRef(thoughtLog);
  thoughtLogRef.current = thoughtLog;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  /** Tracks whether the current task run used web research or tabular analysis (for contextual Canvas chip). */
  const runToolsRef = useRef({ search: false, analysis: false, file_work: false });
  const landingPendingFullHtmlRef = useRef("");
  const [landingStreamTick, setLandingStreamTick] = useState(0);
  const [landingStreaming, setLandingStreaming] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(ENABLED_TOOLS_STORAGE_KEY, JSON.stringify(enabledTools));
    } catch {
      /* ignore */
    }
  }, [enabledTools]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CUSTOM_RULES_STORAGE_KEY, customRules);
    } catch {
      /* ignore */
    }
  }, [customRules]);

  useEffect(() => {
    setImageGenWizard(null);
    setFileAnalystContext(null);
    setLandingOpen(false);
    setLandingState({ html: "", title: "Tunde Report", lastShareUrl: "" });
    landingPendingFullHtmlRef.current = "";
    setLandingStreamTick(0);
    setLandingStreaming(false);
  }, [activeSessionId]);

  useEffect(() => {
    if (!landingOpen) {
      setLandingStreaming(false);
      return;
    }
    const full = landingPendingFullHtmlRef.current;
    if (!full) {
      setLandingStreaming(false);
      return;
    }
    if (landingStreamTick === 0) return;

    let len = 0;
    let raf = 0;

    const runChunk = () => {
      const step = Math.max(120, Math.min(800, Math.floor(full.length / 40)));
      len = Math.min(full.length, len + step);
      setLandingState((s) => ({ ...s, html: full.slice(0, len) }));
      if (len >= full.length) {
        setLandingStreaming(false);
        return;
      }
      raf = requestAnimationFrame(runChunk);
    };

    setLandingStreaming(true);
    const first = Math.min(full.length, Math.max(80, Math.floor(full.length / 50)));
    len = first;
    setLandingState((s) => ({ ...s, html: full.slice(0, len) }));
    if (len >= full.length) {
      setLandingStreaming(false);
      return undefined;
    }
    raf = requestAnimationFrame(runChunk);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [landingOpen, landingStreamTick]);

  useEffect(() => {
    thoughtLogRef.current = thoughtLog;
  }, [thoughtLog]);

  const activeSession = useMemo(
    () => sessions.find((x) => x.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const sidebarSessions = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        preview: sessionPreview(s.messages),
      })),
    [sessions]
  );

  const chatMessages = useMemo(() => {
    const raw = activeSession?.messages || [];
    return raw.map((m) => ({
      id: m.id,
      role: m.role === "user" ? "user" : "assistant",
      text: m.content || m.text || "",
      canvasFollowUp: Boolean(m.canvasFollowUp),
      blocks: Array.isArray(m.blocks)
        ? m.blocks.map((b) => {
            if (!b || typeof b !== "object") return b;
            const type = String(b.type || "").toLowerCase();
            if (type === "image") {
              return {
                ...b,
                type: "image",
                src: (b.src || b.url || b.data_url || b.image_url || "").trim(),
              };
            }
            return { ...b, type };
          })
        : [],
    }));
  }, [activeSession?.messages]);

  const liveToolLineForChat = useMemo(() => {
    if (!processing) return "";
    if (thoughtLog.length) return thoughtLog[thoughtLog.length - 1];
    return latestMessage || "";
  }, [processing, thoughtLog, latestMessage]);

  const sessionTitle = activeSession?.title || "Session";

  const activity = useMemo(() => {
    const activeStep = statusToActiveStep(latestStatus, processing);
    const showQcNote =
      qcReason && (latestStatus === "qc_review" || qcRejected);
    return {
      activeStep,
      statusLabel: latestMessage || latestStatus,
      qcNote: showQcNote ? qcReason : null,
      thoughtLog,
    };
  }, [latestStatus, latestMessage, processing, qcReason, qcRejected, thoughtLog]);

  const patchSessionMessages = useCallback((sessionId, updater) => {
    setSessions((ss) =>
      ss.map((s) => {
        if (s.id !== sessionId) return s;
        const nextMessages = typeof updater === "function" ? updater(s.messages) : updater;
        return { ...s, messages: nextMessages };
      })
    );
  }, []);

  const handleToggleTool = useCallback(
    (id) => {
      if (id === "vision") {
        setEnabledTools((prev) => {
          const nextVision = !prev.vision;
          if (nextVision) {
            setImageGenWizard({ phase: "pick_style" });
            patchSessionMessages(activeSessionIdRef.current, (m) => [
              ...m,
              {
                id: makeId(),
                role: "assistant",
                content:
                  "🎨\n\n## Image Generation Setup: Choose Your Style\n\nPick a visual style below. **Generate Image** stays on until you turn it off in the **+** menu.",
                timestamp: new Date().toISOString(),
              },
            ]);
          } else {
            setImageGenWizard(null);
          }
          return { ...prev, vision: nextVision };
        });
        return;
      }
      if (id === "file_analyst") {
        setEnabledTools((prev) => {
          const next = !prev.file_analyst;
          if (!next) setFileAnalystContext(null);
          return { ...prev, file_analyst: next };
        });
        return;
      }
      setEnabledTools((prev) => ({ ...prev, [id]: !prev[id] }));
    },
    [patchSessionMessages]
  );

  const handleAnalystFile = useCallback(
    async (file) => {
      if (!enabledToolsRef.current.file_analyst) return;
      const sid = activeSessionIdRef.current;
      const ts = new Date().toISOString();
      const form = new FormData();
      form.append("user_id", session.userId);
      form.append("file", file);
      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/files/upload`, { method: "POST", body: form });
        const errText = await r.text();
        if (!r.ok) {
          let errMsg = errText.slice(0, 400);
          try {
            const ej = JSON.parse(errText);
            if (ej && typeof ej.detail === "string") errMsg = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) errMsg = String(ej.detail[0].msg);
          } catch {
            /* keep errMsg */
          }
          patchSessionMessages(sid, (m) => [
            ...m,
            {
              id: makeId(),
              role: "assistant",
              content: `⚠️ **Upload failed**\n\n${errMsg}`,
              timestamp: ts,
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(errText);
        } catch {
          patchSessionMessages(sid, (m) => [
            ...m,
            {
              id: makeId(),
              role: "assistant",
              content: "⚠️ **Upload failed** — invalid server response.",
              timestamp: ts,
            },
          ]);
          return;
        }
        setFileAnalystContext({
          fileId: data.file_id,
          filename: data.filename,
          size: data.size,
          kind: data.kind,
          summary: data.summary,
        });
        patchSessionMessages(sid, (m) => [
          ...m,
          {
            id: makeId(),
            role: "assistant",
            content: `📂 **File received**\n\n## Tunde Data & File Analyst\n\n${data.summary}\n\nUse the **Data Wizard** below or type your own question in the box.`,
            timestamp: ts,
            blocks: [
              {
                type: "file_preview",
                name: data.filename,
                size: data.size,
                kind: data.kind,
                fileId: data.file_id,
              },
            ],
          },
        ]);
      } catch {
        patchSessionMessages(sid, (m) => [
          ...m,
          {
            id: makeId(),
            role: "assistant",
            content: "⚠️ **Upload failed** — could not reach the server.",
            timestamp: ts,
          },
        ]);
      }
    },
    [patchSessionMessages, session.userId]
  );

  const onImageStyleSelect = useCallback(
    (style) => {
      patchSessionMessages(activeSessionIdRef.current, (m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          content: `✅ **Style:** ${style.label}\n\n## Step 2 · Choose aspect ratio\n\nSelect a frame size (common presets).`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setImageGenWizard({ phase: "pick_ratio", style });
    },
    [patchSessionMessages]
  );

  const onImageRatioSelect = useCallback(
    (ratio) => {
      const snap = imageGenWizardRef.current;
      if (!snap?.style) return;
      const { style } = snap;
      patchSessionMessages(activeSessionIdRef.current, (m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          content: `✅ **Style:** ${style.label} · ✅ **Ratio:** ${ratio.label}\n\n💡 **Describe your image** in the message box below and click **Send**. Nothing generates until your text is sent.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setImageGenWizard({ phase: "awaiting_prompt", style, ratio });
    },
    [patchSessionMessages]
  );

  const onSocketEvent = useCallback((env) => {
    const ts = env?.timestamp || new Date().toISOString();
    const payload = env?.payload || {};
    const targetSession = runSessionRef.current || activeSessionIdRef.current;
    const runId = currentRunRef.current?.taskId;

    if (env?.event === "tool_activity" && isToolActivityPayload(payload)) {
      if (runId != null && runId !== "" && String(payload.task_id) !== String(runId)) return;
      const line = payload.message.trim();
      const tool = typeof payload.tool === "string" ? payload.tool : "";
      const phase = typeof payload.phase === "string" ? payload.phase : "";
      if (tool === "image_generation") {
        if (phase === "generate") setPendingInfographic(true);
        if (phase === "skipped" || phase === "error" || phase === "complete") setPendingInfographic(false);
      }
      if (tool === "web_research" && phase !== "skipped") {
        runToolsRef.current.search = true;
      }
      if (tool === "data_analysis" && phase !== "skipped" && phase !== "empty") {
        runToolsRef.current.analysis = true;
      }
      if (tool === "file_analyst" && phase !== "error") {
        runToolsRef.current.file_work = true;
      }
      if (line) {
        setLatestMessage(line);
        setThoughtLog((prev) => [...prev.slice(-11), line]);
      }
      return;
    }

    if (env?.event === "task_status_change" && isTaskStatusChangePayload(payload)) {
      if (runId != null && runId !== "" && String(payload.task_id) !== String(runId)) return;
      const status = payload.status;
      const msg = typeof payload.message === "string" ? payload.message : "";
      const corr =
        typeof payload.correlation_id === "string" ? payload.correlation_id : undefined;
      setLatestStatus(status);
      if (msg) setLatestMessage(msg);
      if (status === "complete") setQcRejected(false);

      if (status === "queued" || status === "running" || status === "qc_review") {
        setProcessing(true);
      }
      if (status === "complete") {
        setPendingInfographic(false);
        if (corr && seenFinalCorrelationIdsRef.current.has(corr)) return;
        if (corr) seenFinalCorrelationIdsRef.current.add(corr);
        setProcessing(false);
        const rt = runToolsRef.current;
        const canvasFollowUp = Boolean(rt.search || rt.analysis || rt.file_work);
        runToolsRef.current = { search: false, analysis: false, file_work: false };
        patchSessionMessages(targetSession, (m) => [
          ...m,
          {
            id: makeId(),
            role: "ceo",
            style: "ceo_final",
            content: msg || "Task complete.",
            timestamp: ts,
            correlationId: payload.correlation_id,
            blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
            canvasFollowUp,
          },
        ]);
      }
      if (status === "failed") {
        setPendingInfographic(false);
        if (corr && seenFinalCorrelationIdsRef.current.has(corr)) return;
        if (corr) seenFinalCorrelationIdsRef.current.add(corr);
        setProcessing(false);
        runToolsRef.current = { search: false, analysis: false, file_work: false };
        patchSessionMessages(targetSession, (m) => [
          ...m,
          {
            id: makeId(),
            role: "ceo",
            style: "ceo_final",
            content: msg || "Task failed.",
            timestamp: ts,
            correlationId: payload.correlation_id,
            blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
          },
        ]);
      }
      return;
    }

    if (env?.event === "qc_rejection" && isQcRejectionPayload(payload)) {
      if (runId != null && runId !== "" && String(payload.task_id) !== String(runId)) return;
      setProcessing(true);
      setQcRejected(true);
      setQcReason(payload.reason || "");
      setLatestStatus("qc_review");
      setLatestMessage(payload.reason || "QC rejected.");
    }
  }, [patchSessionMessages]);

  const { connected } = useTundeSocket({
    backendHttpBase: backendHttpBase(),
    onEvent: onSocketEvent,
  });

  const submitUserMessage = useCallback(
    async (text, { skipUserBubble = false, fileAnalystAction = null } = {}) => {
      const trimmed = (text || "").trim();
      const et = enabledToolsRef.current;
      const fac = fileAnalystContextRef.current;
      const hasFileCtx = Boolean(et.file_analyst && fac?.fileId);
      if (!trimmed && !(fileAnalystAction && hasFileCtx)) return;

      const ts = new Date().toISOString();
      const payloadMessage = trimmed;
      lastUserPromptRef.current = payloadMessage || `[Data Wizard: ${fileAnalystAction}]`;
      runSessionRef.current = activeSessionId;
      setProcessing(true);
      setCurrentRun(null);
      currentRunRef.current = null;
      setPendingInfographic(false);
      setQcRejected(false);
      setQcReason("");
      setThoughtLog([]);
      runToolsRef.current = { search: false, analysis: false, file_work: false };
      setLatestStatus("queued");
      setLatestMessage("Submitted.");

      if (!skipUserBubble) {
        const display =
          trimmed ||
          (fileAnalystAction
            ? `📊 Data Wizard · ${DATA_WIZARD_LABELS[fileAnalystAction] || fileAnalystAction}`
            : "");
        if (display) {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            { id: makeId(), role: "user", content: display, timestamp: ts },
          ]);
        }
        if (trimmed) {
          setSessions((ss) =>
            ss.map((s) =>
              s.id === activeSessionId && s.title === "New chat"
                ? { ...s, title: trimmed.slice(0, 40) }
                : s
            )
          );
        }
      }

      if (!connected) {
        setProcessing(false);
        setLatestStatus("failed");
        setLatestMessage("Server offline.");
        return;
      }

      try {
        const base = backendHttpBase();
        const wiz = imageGenWizardRef.current;
        let image_generation = undefined;
        if (
          et.vision &&
          wiz?.phase === "awaiting_prompt" &&
          wiz.style &&
          wiz.ratio
        ) {
          image_generation = {
            style_id: wiz.style.id,
            style_label: wiz.style.label,
            aspect_ratio_id: wiz.ratio.id,
            aspect_ratio_label: wiz.ratio.label,
            aspect_ratio: wiz.ratio.ratio,
          };
          setImageGenWizard(null);
        }
        const file_context =
          hasFileCtx && fac?.fileId ? { file_id: fac.fileId } : undefined;
        const file_analyst_action =
          fileAnalystAction && hasFileCtx ? String(fileAnalystAction) : undefined;
        const r = await fetch(`${base.replace(/\/$/, "")}/tasks/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payload: {
              user_id: session.userId,
              user_message: payloadMessage,
              enabled_tools: {
                search: et.search,
                analysis: et.analysis,
                memory: et.memory,
                vision: et.vision,
                file_analyst: et.file_analyst,
              },
              ...(image_generation ? { image_generation } : {}),
              ...(file_context ? { file_context } : {}),
              ...(file_analyst_action ? { file_analyst_action } : {}),
            },
          }),
        });
        if (r.ok) {
          const j = await r.json().catch(() => null);
          if (j && typeof j === "object") {
            const taskId = j.task_id || j.taskId;
            const correlationId = j.correlation_id || j.correlationId;
            if (taskId != null && taskId !== "") {
              const tid = String(taskId);
              const run = {
                taskId: tid,
                correlationId: typeof correlationId === "string" ? correlationId : undefined,
              };
              setCurrentRun(run);
              currentRunRef.current = run;
            }
          }
        } else {
          await r.text();
          setProcessing(false);
          setLatestStatus("failed");
          setLatestMessage("Submit failed.");
        }
      } catch {
        setProcessing(false);
        setLatestStatus("failed");
        setLatestMessage("Server offline.");
      }
    },
    [activeSessionId, connected, patchSessionMessages, session.userId]
  );

  const onDataWizardAction = useCallback(
    (actionId) => {
      if (!fileAnalystContextRef.current?.fileId || !enabledToolsRef.current.file_analyst) return;
      if (!actionId) return;
      submitUserMessage("", { fileAnalystAction: actionId });
    },
    [submitUserMessage]
  );

  const handleCreateLandingPage = useCallback(async () => {
    if (!connected) return;
    const ctx = buildWorkspaceExport({
      messages: sessionsRef.current.find((x) => x.id === activeSessionIdRef.current)?.messages || [],
      thoughtLog: thoughtLogRef.current,
      fileAnalystContext: fileAnalystContextRef.current,
    });
    if (!ctx.trim()) {
      patchSessionMessages(activeSessionIdRef.current, (m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          content:
            "📑 Add a message, run a tool, or attach a file first — then you can open **Preview in Canvas**.",
          timestamp: new Date().toISOString(),
        },
      ]);
      return;
    }
    landingPendingFullHtmlRef.current = "";
    setLandingStreamTick(0);
    setLandingStreaming(false);
    const titleHint =
      sessionsRef.current.find((x) => x.id === activeSessionIdRef.current)?.title || "Tunde Report";
    setLandingState({ html: "", title: titleHint, lastShareUrl: "" });
    setLandingOpen(true);
    setLandingBusy(true);
    const base = backendHttpBase().replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/api/pages/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: session.userId,
          source: "workspace",
          context: ctx,
          title_hint: titleHint,
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        let detail = raw.slice(0, 400);
        try {
          const ej = JSON.parse(raw);
          if (ej && typeof ej.detail === "string") detail = ej.detail;
        } catch {
          /* ignore */
        }
        setLandingOpen(false);
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeId(),
            role: "assistant",
            content: `⚠️ **Landing page generate failed**\n\n${detail}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
      const data = JSON.parse(raw);
      landingPendingFullHtmlRef.current = data.html || "";
      setLandingState((s) => ({
        ...s,
        title: data.title || titleHint,
        html: "",
        lastShareUrl: "",
      }));
      setLandingBusy(false);
      setLandingStreamTick((t) => t + 1);
    } catch {
      setLandingOpen(false);
      patchSessionMessages(activeSessionIdRef.current, (m) => [
        ...m,
        {
          id: makeId(),
          role: "assistant",
          content: "⚠️ **Landing page generate failed** — could not reach the server.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLandingBusy(false);
    }
  }, [connected, patchSessionMessages, session.userId]);

  const handleLandingShare = useCallback(async () => {
    const { html, title } = landingStateRef.current;
    if (!html?.trim()) return undefined;
    const base = backendHttpBase().replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/api/pages/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: session.userId,
          title: title || "Tunde Report",
          html,
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        let detail = raw.slice(0, 300);
        try {
          const ej = JSON.parse(raw);
          if (ej && typeof ej.detail === "string") detail = ej.detail;
        } catch {
          /* ignore */
        }
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeId(),
            role: "assistant",
            content: `⚠️ **Publish failed**\n\n${detail}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        return undefined;
      }
      const j = JSON.parse(raw);
      const url = typeof j.share_url === "string" ? j.share_url : "";
      if (url) setLandingState((s) => ({ ...s, lastShareUrl: url }));
      return url || undefined;
    } catch {
      return undefined;
    }
  }, [patchSessionMessages, session.userId]);

  const handleLandingRevision = useCallback(
    async (revisionNotes) => {
      const notes = (revisionNotes || "").trim();
      if (!notes || !connected) return;
      const prev = landingStateRef.current.html;
      if (!prev?.trim()) return;
      const ctx = buildWorkspaceExport({
        messages: sessionsRef.current.find((x) => x.id === activeSessionIdRef.current)?.messages || [],
        thoughtLog: thoughtLogRef.current,
        fileAnalystContext: fileAnalystContextRef.current,
      });
      setLandingBusy(true);
      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/api/pages/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: session.userId,
            source: "workspace",
            context: ctx,
            title_hint: landingStateRef.current.title,
            existing_html: prev,
            revision_notes: notes,
          }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionIdRef.current, (m) => [
            ...m,
            {
              id: makeId(),
              role: "assistant",
              content: `⚠️ **Page revision failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const data = JSON.parse(raw);
        const nextHtml = data.html || prev;
        landingPendingFullHtmlRef.current = nextHtml;
        setLandingBusy(false);
        setLandingState((s) => ({
          ...s,
          title: data.title || s.title,
          html: "",
        }));
        setLandingStreamTick((t) => t + 1);
      } catch {
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeId(),
            role: "assistant",
            content: "⚠️ **Page revision failed** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, patchSessionMessages, session.userId]
  );

  const retryLastUserPrompt = useCallback(() => {
    const t = (lastUserPromptRef.current || "").trim();
    if (!t || processing || !connected) return;
    submitUserMessage(t, { skipUserBubble: true });
  }, [connected, processing, submitUserMessage]);

  const resetRunUi = () => {
    setProcessing(false);
    setCurrentRun(null);
    currentRunRef.current = null;
    setPendingInfographic(false);
    runSessionRef.current = null;
    seenFinalCorrelationIdsRef.current = new Set();
    setLatestStatus("idle");
    setLatestMessage("");
    setThoughtLog([]);
    setQcRejected(false);
    setQcReason("");
  };

  const clearChat = () => {
    setImageGenWizard(null);
    setFileAnalystContext(null);
    setLandingOpen(false);
    setLandingState({ html: "", title: "Tunde Report", lastShareUrl: "" });
    landingPendingFullHtmlRef.current = "";
    setLandingStreamTick(0);
    setLandingStreaming(false);
    patchSessionMessages(activeSessionId, () => []);
    resetRunUi();
  };

  const clearActivity = () => {
    setLatestMessage("");
    setQcRejected(false);
    setQcReason("");
  };

  const newChat = () => {
    const id = `s_${makeId()}`;
    setImageGenWizard(null);
    setFileAnalystContext(null);
    setLandingOpen(false);
    setLandingState({ html: "", title: "Tunde Report", lastShareUrl: "" });
    landingPendingFullHtmlRef.current = "";
    setLandingStreamTick(0);
    setLandingStreaming(false);
    setSessions((ss) => [{ id, title: "New chat", messages: [] }, ...ss]);
    setActiveSessionId(id);
    setView("chat");
    resetRunUi();
  };

  return (
    <div className="flex h-screen max-h-screen w-full overflow-hidden font-sans antialiased">
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          role="presentation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <div
        className={[
          "z-50 h-full shrink-0 md:relative md:flex",
          "fixed left-0 top-0 md:static",
          mobileNavOpen ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        <WorkspaceSidebar
          sessions={sidebarSessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            setActiveSessionId(id);
            setView("chat");
            setMobileNavOpen(false);
          }}
          onNewChat={() => {
            newChat();
            setMobileNavOpen(false);
          }}
          onOpenSettings={() => {
            setView("settings");
            setMobileNavOpen(false);
          }}
          connected={connected}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-tunde-surface md:pl-0">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-800/80 bg-tunde-surface px-3 py-2.5 md:hidden">
          <button
            type="button"
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-sm text-slate-200"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{sessionTitle}</p>
            <p className="text-[10px] text-slate-500">v0.1.0 · {connected ? "Live" : "Offline"}</p>
          </div>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1">
          {view === "settings" ? (
            <SettingsPanel
              onClose={() => setView("chat")}
              memoryEnabled={Boolean(enabledTools.memory)}
              onMemoryEnabledChange={(v) => setEnabledTools((p) => ({ ...p, memory: v }))}
              customRules={customRules}
              onCustomRulesChange={setCustomRules}
              backendHttpBase={backendHttpBase()}
              wsUrl={wsUrl()}
              backendHostLabel={backendHostLabel()}
              onClearChat={clearChat}
              onClearActivity={clearActivity}
            />
          ) : (
            <>
              {landingOpen ? (
                <button
                  type="button"
                  className="fixed inset-0 z-[55] bg-black/50 lg:hidden"
                  aria-label="Close landing preview"
                  onClick={() => setLandingOpen(false)}
                />
              ) : null}
              <div className="flex min-h-0 min-w-0 flex-1">
                <ChatCenter
                  sessionTitle={sessionTitle}
                  messages={chatMessages}
                  connected={connected}
                  processing={processing}
                  liveToolLine={liveToolLineForChat}
                  pendingInfographic={pendingInfographic}
                  enabledTools={enabledTools}
                  onToggleTool={handleToggleTool}
                  imageGenWizard={imageGenWizard}
                  onImageStyleSelect={onImageStyleSelect}
                  onImageRatioSelect={onImageRatioSelect}
                  fileAnalystContext={fileAnalystContext}
                onAnalystFile={handleAnalystFile}
                onDataWizardAction={onDataWizardAction}
                onCanvasOpen={handleCreateLandingPage}
                canvasBusy={landingBusy}
                  onSend={(text) => submitUserMessage(text)}
                  onRetryLastPrompt={retryLastUserPrompt}
                />
                {landingOpen ? (
                  <LandingCanvasPanel
                    open={landingOpen}
                    title={landingState.title}
                    html={landingState.html}
                    busy={landingBusy}
                    streaming={landingStreaming}
                    shareUrl={landingState.lastShareUrl}
                    onClose={() => setLandingOpen(false)}
                    onShare={handleLandingShare}
                    onApplyRevision={handleLandingRevision}
                  />
                ) : (
                  <div className="hidden h-full shrink-0 lg:flex">
                    <ProcessStepper activity={activity} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {mobileActivityOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          role="presentation"
          onClick={() => setMobileActivityOpen(false)}
        />
      ) : null}
      <div
        className={[
          "fixed inset-y-0 right-0 z-40 h-full w-[min(100vw,300px)] border-l border-slate-800/80 shadow-2xl transition-transform lg:hidden",
          mobileActivityOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <ProcessStepper activity={activity} collapsible={false} />
      </div>

      <button
        type="button"
        className="fixed bottom-20 right-4 z-20 rounded-full border border-slate-700 bg-tunde-bg px-4 py-2 text-[11px] font-semibold text-slate-200 shadow-lg lg:hidden"
        onClick={() => setMobileActivityOpen((o) => !o)}
      >
        Process
      </button>
    </div>
  );
}
