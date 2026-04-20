import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChatCenter from "./components/ChatCenter";
import LandingCanvasPanel from "./components/LandingCanvasPanel";
import BusinessAnalysisCanvas from "./components/BusinessAnalysisCanvas";
import BusinessSimulateModal from "./components/BusinessSimulateModal";
import { parseBusinessBrief } from "./utils/businessBrief";
import { buildFullBusinessReportHtml } from "./utils/businessReportHtml";
import { generatePage, publishPage } from "./utils/canvasExportCore";
import SettingsPanel from "./components/SettingsPanel";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import TundeHub from "./components/TundeHub";
import { getMockSession } from "./state/mockSession";
import { useTundeSocket } from "./state/useTundeSocket";

function makeId() {
  return Math.random().toString(16).slice(2);
}

/** UUID for chat rows — must match backend ``/db/messages`` (UUID PK). */
function makeMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DEV_DB_USER = "dev_user";
const TUNDE_LAST_ACTIVE_CONV_KEY = "tunde_last_active_conv_id";

function isUuidLike(s) {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
  );
}

function findBusinessSolutionBlock(sessions, sessionId, messageId) {
  const sess = sessions.find((s) => s.id === sessionId);
  const msg = sess?.messages?.find((m) => m.id === messageId);
  if (!msg?.blocks) return null;
  return msg.blocks.find((b) => String(b?.type || "").toLowerCase() === "business_solution") || null;
}

function buildBusinessWebPageContext(block, userNotes = "") {
  if (!block || typeof block !== "object") return "";
  const parts = [];
  const notes = typeof userNotes === "string" ? userNotes.trim() : "";
  if (notes) parts.push(`# Instructions from you\n${notes}`);
  const ns = typeof block.narrative_summary === "string" ? block.narrative_summary.trim() : "";
  if (ns) parts.push(`# Executive summary\n${ns}`);
  const q = typeof block.query === "string" ? block.query.trim() : "";
  if (q) parts.push(`# Original brief\n${q}`);
  try {
    const slice = { ...block };
    delete slice.type;
    delete slice.canvas_html;
    parts.push(`# Structured JSON (for page layout)\n${JSON.stringify(slice, null, 2)}`);
  } catch {
    /* ignore */
  }
  return parts.join("\n\n").slice(0, 99_000);
}

async function fetchConversationList() {
  const base = backendHttpBase().replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/db/conversations?user_id=${encodeURIComponent(DEV_DB_USER)}`);
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    return Array.isArray(j?.conversations) ? j.conversations : [];
  } catch {
    return [];
  }
}

async function fetchConversationMessages(convId) {
  const base = backendHttpBase().replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/db/conversations/${encodeURIComponent(convId)}/messages`);
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    const rows = Array.isArray(j?.messages) ? j.messages : [];
    return rows.map(mapDbApiMessageToSessionMessage);
  } catch {
    return [];
  }
}

/** DB ``tool_type`` / legacy slugs → workspace tool id (see ``enabledTools`` in ChatCenter). */
function workspaceToolFromDbToolType(tt) {
  const t = String(tt || "").toLowerCase();
  if (t === "math" || t === "math_solver") return "math_solver";
  return null;
}

/** When older rows lack ``tool_type``, infer workspace tool from ``blocks_json`` shape. */
function inferWorkspaceToolFromBlocks(blocks) {
  if (!Array.isArray(blocks)) return null;
  if (blocks.some((b) => String(b?.type || "").toLowerCase() === "math_solution")) return "math_solver";
  return null;
}

/** Map ``GET /db/conversations/.../messages`` row → in-memory session message. */
function mapDbApiMessageToSessionMessage(row) {
  let blocks = [];
  if (row?.blocks_json && typeof row.blocks_json === "string" && row.blocks_json.trim()) {
    try {
      const parsed = JSON.parse(row.blocks_json);
      blocks = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? [parsed] : [];
    } catch {
      blocks = [];
    }
  }
  const roleRaw = String(row?.role || "").toLowerCase();
  const role = roleRaw === "user" ? "user" : roleRaw === "ceo" ? "ceo" : "assistant";
  const tool =
    workspaceToolFromDbToolType(row?.tool_type) || inferWorkspaceToolFromBlocks(blocks);
  return {
    id: String(row.message_id),
    role,
    content: typeof row.content === "string" ? row.content : "",
    timestamp: row.timestamp || new Date().toISOString(),
    blocks,
    tool,
  };
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

async function saveToolResult(toolType, inputData, resultJson, convId, messageId) {
  if (!convId || !messageId) return;
  try {
    await fetch(`${backendHttpBase().replace(/\/$/, "")}/db/tool-results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conv_id: convId,
        message_id: messageId,
        tool_type: toolType,
        input_data: typeof inputData === "string" ? inputData : String(inputData ?? ""),
        result_json: typeof resultJson === "string" ? resultJson : JSON.stringify(resultJson),
      }),
    });
  } catch (e) {
    console.warn("Failed to save tool result:", e);
  }
}

async function postDbMessage({ convId, messageId, role, content, blocks, toolType }) {
  if (!convId || !messageId) return;
  try {
    const blocks_json =
      blocks == null ? null : typeof blocks === "string" ? blocks : JSON.stringify(blocks);
    await fetch(`${backendHttpBase().replace(/\/$/, "")}/db/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conv_id: convId,
        message_id: messageId,
        role,
        content: content ?? "",
        blocks_json,
        tool_type: toolType ?? null,
      }),
    });
  } catch (e) {
    console.warn("Failed to save message:", e);
  }
}

async function postDbCanvasPage({ convId, messageId, kind, title, htmlContent, toolType }) {
  if (!convId || !htmlContent?.trim()) return null;
  try {
    const r = await fetch(`${backendHttpBase().replace(/\/$/, "")}/db/canvas-pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conv_id: convId,
        message_id: String(messageId || "__workspace__").slice(0, 256),
        kind: String(kind || "web_page").slice(0, 64),
        title: String(title || "Canvas").slice(0, 512),
        html_content: htmlContent,
        tool_type: String(toolType || "unknown").slice(0, 64),
      }),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j?.canvas_page?.canvas_id || null;
  } catch (e) {
    console.warn("Failed to save canvas page:", e);
    return null;
  }
}

async function putDbCanvasPage(canvasId, { title, htmlContent, kind, toolType }) {
  if (!canvasId) return;
  try {
    const body = {};
    if (title != null) body.title = title;
    if (htmlContent != null) body.html_content = htmlContent;
    if (kind != null) body.kind = kind;
    if (toolType != null) body.tool_type = toolType;
    if (!Object.keys(body).length) return;
    await fetch(`${backendHttpBase().replace(/\/$/, "")}/db/canvas-pages/${canvasId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("Failed to update canvas page:", e);
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

/** Stable key for Canvas-generated HTML (survives panel close; dedupes /generate). */
function canvasPageCacheKey(linkedMessageId, segment, variant) {
  const mid = linkedMessageId == null || linkedMessageId === "" ? "__workspace__" : String(linkedMessageId);
  return `${mid}::${segment}::${variant}`;
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
          if (b.type === "study_solution") return `[study: ${b.topic || "topic"}]`;
          if (b.type === "data_solution") return `[data: ${b.dataset_name || "dataset"}]`;
          if (b.type === "document_solution") return `[document: ${b.title || b.document_type || "doc"}]`;
          return b.type ? `[${b.type}]` : "";
        })
        .filter(Boolean)
        .join(" ");
    }
    parts.push(`## ${role}\n${body}${extra ? `\n${extra}` : ""}`);
  }
  return parts.join("\n\n").slice(0, 26000);
}

function buildDataAnalysisExportContext(block) {
  if (!block || typeof block !== "object") return "";
  const name = typeof block.dataset_name === "string" && block.dataset_name.trim() ? block.dataset_name.trim() : "Dataset";
  const lines = [];
  lines.push(`# ${name}`);
  lines.push(`Rows: ${Number(block.row_count) || 0}, Columns: ${Number(block.column_count) || 0}`);
  const dq = block.data_quality && typeof block.data_quality === "object" ? block.data_quality : {};
  lines.push(`Data quality: ${dq.score || ""} — ${(dq.notes || "").trim()}`);
  lines.push(`Confidence: ${typeof block.confidence === "string" ? block.confidence : ""}`);
  lines.push("");
  lines.push("## AI narrative");
  lines.push(String(block.ai_narrative || "").trim());
  lines.push("");
  lines.push("## Key insights");
  const insights = Array.isArray(block.key_insights) ? block.key_insights : [];
  insights.forEach((x, i) => {
    lines.push(`${i + 1}. ${typeof x === "string" ? x : String(x)}`);
  });
  lines.push("");
  lines.push("## Smart alerts");
  const alerts = Array.isArray(block.smart_alerts) ? block.smart_alerts : [];
  if (alerts.length) alerts.forEach((a) => lines.push(`- ${typeof a === "string" ? a : String(a)}`));
  else lines.push("- (none)");
  lines.push("");
  lines.push("## Summary statistics (aggregates)");
  const cols = Array.isArray(block.columns) ? block.columns : [];
  const stats = block.summary_stats && typeof block.summary_stats === "object" ? block.summary_stats : {};
  cols.forEach((c) => {
    const st = stats[c];
    if (!st || typeof st !== "object") return;
    lines.push(
      `- ${c}: dtype=${st.dtype ?? ""} nulls=${st.null_count ?? ""} min=${st.min ?? "—"} max=${st.max ?? "—"} mean=${st.mean ?? "—"} median=${st.median ?? "—"}`
    );
  });
  const trends = Array.isArray(block.trends) ? block.trends : [];
  if (trends.length) {
    lines.push("");
    lines.push("## Detected trends");
    trends.forEach((t) => {
      if (!t || typeof t !== "object") return;
      lines.push(
        `- ${t.metric ?? "?"} (${t.direction ?? ""}): ${typeof t.detail === "string" ? t.detail : ""}`
      );
    });
  }
  const preds = Array.isArray(block.predictions) ? block.predictions : [];
  if (preds.length) {
    lines.push("");
    lines.push("## Predictions (illustrative)");
    preds.forEach((p) => lines.push(`- ${typeof p.text === "string" ? p.text : String(p.text ?? "")}`));
  }
  return lines.join("\n").slice(0, 95_000);
}

function buildDocumentExportContext(block) {
  if (!block || typeof block !== "object") return "";
  const title = typeof block.title === "string" && block.title.trim() ? block.title.trim() : "Document";
  const docType = typeof block.document_type === "string" ? block.document_type : "other";
  const tone = typeof block.tone === "string" ? block.tone : "";
  const lang = typeof block.language === "string" ? block.language : "";
  const confidence = typeof block.confidence === "string" ? block.confidence : "";
  const sections = Array.isArray(block.sections) ? block.sections : [];
  const lines = [];
  lines.push(`# ${title}`);
  lines.push(`Document type: ${docType}`);
  lines.push(`Tone: ${tone} · Language: ${lang} · Confidence: ${confidence}`);
  if (sections.length) {
    lines.push("");
    lines.push("## Sections");
    sections.forEach((s) => lines.push(`- ${typeof s === "string" ? s : String(s)}`));
  }
  lines.push("");
  lines.push("## Body");
  lines.push(String(block.content || "").trim());
  return lines.join("\n").slice(0, 95_000);
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
          math_solver: Boolean(j.math_solver),
          science_agent: Boolean(j.science_agent),
          chemistry_agent: Boolean(j.chemistry_agent),
          space_agent: Boolean(j.space_agent),
          health_agent: Boolean(j.health_agent),
          code_assistant: Boolean(j.code_assistant),
          translation_agent: Boolean(j.translation_agent),
          research_agent: Boolean(j.research_agent),
          study_assistant: Boolean(j.study_assistant),
          data_analyst: Boolean(j.data_analyst),
          document_writer: Boolean(j.document_writer),
          business_agent: Boolean(j.business_agent),
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {
    search: true,
    analysis: false,
    vision: false,
    memory: false,
    file_analyst: false,
    math_solver: false,
    science_agent: false,
    chemistry_agent: false,
    space_agent: false,
    health_agent: false,
    code_assistant: false,
    translation_agent: false,
    research_agent: false,
    study_assistant: false,
    data_analyst: false,
    document_writer: false,
    business_agent: false,
  };
}

function sessionPreview(messages) {
  const last = messages[messages.length - 1];
  if (!last) return "Empty session";
  const t = last.content || last.text || "";
  return t.slice(0, 72) || "…";
}

export function App() {
  const session = useMemo(() => getMockSession(), []);
  const initialLocalDraftIdRef = useRef(`local_${makeId()}`);
  const [sessions, setSessions] = useState(() => [
    {
      id: initialLocalDraftIdRef.current,
      title: "New chat",
      messages: [],
      isLocalDraft: true,
      messagesHydrated: true,
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState(() => initialLocalDraftIdRef.current);
  const [view, setView] = useState("chat");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tundeHubOpen, setTundeHubOpen] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [currentRun, setCurrentRun] = useState(null);
  const currentRunRef = useRef(null);
  currentRunRef.current = currentRun;
  const runSessionRef = useRef(null);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchConversationList();
        if (cancelled) return;
        const fromDb = rows.map((c) => ({
          id: c.conv_id,
          dbConvId: c.conv_id,
          title: (c.title && String(c.title).trim()) || "Chat",
          messages: [],
          messagesHydrated: false,
          startedAt: c.started_at || null,
          toolUsed: c.tool_used || null,
          isLocalDraft: false,
        }));
        const draft = {
          id: `local_${makeId()}`,
          title: "New chat",
          messages: [],
          isLocalDraft: true,
          messagesHydrated: true,
        };
        let nextActive = draft.id;
        try {
          const last = localStorage.getItem(TUNDE_LAST_ACTIVE_CONV_KEY);
          if (last && fromDb.some((x) => x.id === last)) {
            nextActive = last;
          } else if (fromDb.length > 0) {
            nextActive = fromDb[0].id;
          }
        } catch {
          /* ignore */
        }
        const nextSessions = [draft, ...fromDb];
        setSessions(nextSessions);
        setActiveSessionId(nextActive);
        if (nextActive !== draft.id && fromDb.some((x) => x.id === nextActive)) {
          const msgs = await fetchConversationMessages(nextActive);
          if (!cancelled) {
            setSessions((ss) =>
              ss.map((x) => (x.id === nextActive ? { ...x, messages: msgs, messagesHydrated: true } : x))
            );
          }
        }
      } catch (e) {
        console.warn("Failed to load conversation history:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSessionId || String(activeSessionId).startsWith("local_")) {
      try {
        localStorage.removeItem(TUNDE_LAST_ACTIVE_CONV_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      localStorage.setItem(TUNDE_LAST_ACTIVE_CONV_KEY, activeSessionId);
    } catch {
      /* ignore */
    }
  }, [activeSessionId]);

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
  /** 'landing' | 'research' | 'code' — right-hand Canvas panel mode */
  const [canvasView, setCanvasView] = useState("landing");
  const [canvasLinkedMessageId, setCanvasLinkedMessageId] = useState(null);
  const canvasLinkedMessageIdRef = useRef(null);
  /** In-memory fallback if a hydrated message omits blocks (edge cases). */
  const businessBlockCacheRef = useRef({});
  const [canvasResearchBlock, setCanvasResearchBlock] = useState(null);
  const [canvasCodeBlock, setCanvasCodeBlock] = useState(null);
  const [canvasBusinessBlock, setCanvasBusinessBlock] = useState(null);
  /** Increment `id` whenever chat toolkit should switch BusinessAnalysisCanvas tab. */
  const [businessTabRequest, setBusinessTabRequest] = useState({ id: 0, tab: "overview" });
  const [businessSimulateMessageId, setBusinessSimulateMessageId] = useState(null);
  const [businessSimulateNotes, setBusinessSimulateNotes] = useState("");
  const [businessCanvasShareUrl, setBusinessCanvasShareUrl] = useState("");
  const canvasPanelRef = useRef(null);
  /** @type {React.MutableRefObject<Record<string, { html: string; title: string; kind?: string }>>} */
  const canvasGeneratedHtmlRef = useRef({});
  /** `workspace` = Preview in Canvas; `data_export` = Data Analyst export */
  const landingPageVariantRef = useRef("workspace");
  const lastDataExportRef = useRef(null);
  const lastDocumentExportRef = useRef(null);
  /** When reopening Research canvas from a saved card, prefer this create kind in cache peek. */
  const researchCacheKindHintRef = useRef(null);
  /** Backend ``canvas_pages.canvas_id`` for the open landing/HTML canvas (refine uses PUT). */
  const landingCanvasDbIdRef = useRef(null);

  useEffect(() => {
    canvasLinkedMessageIdRef.current = canvasLinkedMessageId;
  }, [canvasLinkedMessageId]);

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
    setCanvasView("landing");
    setCanvasLinkedMessageId(null);
    canvasLinkedMessageIdRef.current = null;
    setCanvasResearchBlock(null);
    setCanvasCodeBlock(null);
    setCanvasBusinessBlock(null);
    canvasGeneratedHtmlRef.current = {};
    landingPageVariantRef.current = "workspace";
    lastDataExportRef.current = null;
    lastDocumentExportRef.current = null;
    landingCanvasDbIdRef.current = null;
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

  /** Restore landing HTML from cache when reopening Canvas (panel unmount clears child state; parent may have empty html). */
  useEffect(() => {
    if (!landingOpen || canvasView !== "landing" || landingBusy) return;
    const htmlNow = (landingStateRef.current.html || "").trim();
    const pending = (landingPendingFullHtmlRef.current || "").trim();
    if (htmlNow || pending) return;
    const linked = canvasLinkedMessageIdRef.current;
    const variant = linked ? "data_export" : "workspace";
    const key = canvasPageCacheKey(linked, "landing", variant);
    const hit = canvasGeneratedHtmlRef.current[key];
    if (!hit?.html?.trim()) return;
    landingPendingFullHtmlRef.current = hit.html;
    setLandingState((s) => ({
      ...s,
      title: hit.title || s.title,
      html: "",
      lastShareUrl: s.lastShareUrl || "",
    }));
    setLandingStreamTick((t) => t + 1);
  }, [landingOpen, canvasView, canvasLinkedMessageId, landingBusy]);

  useEffect(() => {
    thoughtLogRef.current = thoughtLog;
  }, [thoughtLog]);

  const activeSession = useMemo(
    () => sessions.find((x) => x.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const hydrateSessionMessages = useCallback(async (sessionId) => {
    const s = sessionsRef.current.find((x) => x.id === sessionId);
    if (!s || s.isLocalDraft || s.messagesHydrated) return;
    const convId = s.dbConvId || (isUuidLike(s.id) ? s.id : null);
    if (!convId) return;
    let msgs = [];
    try {
      msgs = await fetchConversationMessages(convId);
    } catch {
      msgs = [];
    }
    setSessions((ss) =>
      ss.map((x) => (x.id === sessionId ? { ...x, messages: msgs, messagesHydrated: true } : x))
    );
  }, []);

  const sidebarSessions = useMemo(
    () =>
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        preview:
          s.messagesHydrated === false && !s.isLocalDraft
            ? "Open to load messages"
            : sessionPreview(s.messages),
        startedAt: s.startedAt || null,
        toolUsed: s.toolUsed || null,
        isLocalDraft: Boolean(s.isLocalDraft),
      })),
    [sessions]
  );

  const chatMessages = useMemo(() => {
    const raw = activeSession?.messages || [];
    return raw.map((m) => {
      const blocksArr = Array.isArray(m.blocks)
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
        : [];
      const tool = m.tool || inferWorkspaceToolFromBlocks(blocksArr);
      return {
        id: m.id,
        role: m.role === "user" ? "user" : "assistant",
        text: m.content || m.text || "",
        canvasFollowUp: Boolean(m.canvasFollowUp),
        tool,
        blocks: blocksArr,
      };
    });
  }, [activeSession?.messages]);

  const liveToolLineForChat = useMemo(() => {
    if (!processing) return "";
    if (thoughtLog.length) return thoughtLog[thoughtLog.length - 1];
    return latestMessage || "";
  }, [processing, thoughtLog, latestMessage]);

  const sessionTitle = activeSession?.title || "Session";

  const patchSessionMessages = useCallback((sessionId, updater) => {
    setSessions((ss) =>
      ss.map((s) => {
        if (s.id !== activeSessionIdRef.current || s.id !== sessionId) return s;
        const nextMessages = typeof updater === "function" ? updater(s.messages) : updater;
        return { ...s, messages: nextMessages };
      })
    );
  }, []);

  const ensureDbConversation = useCallback(async (sessionId, opts = {}) => {
    const cur = sessionsRef.current.find((x) => x.id === sessionId);
    if (cur?.dbConvId) return cur.dbConvId;
    if (cur && !cur.isLocalDraft && isUuidLike(String(sessionId)) && !cur.dbConvId) {
      setSessions((ss) =>
        ss.map((s) => (s.id === sessionId && !s.dbConvId ? { ...s, dbConvId: String(sessionId) } : s))
      );
      return String(sessionId);
    }
    const base = backendHttpBase().replace(/\/$/, "");
    try {
      const r = await fetch(`${base}/db/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: DEV_DB_USER,
          title: opts.title ?? null,
          tool_used: opts.tool_used ?? null,
        }),
      });
      if (!r.ok) {
        console.warn("Failed to create conversation:", await r.text());
        return null;
      }
      const j = await r.json().catch(() => null);
      const convId = j?.conversation?.conv_id;
      if (!convId) return null;
      const startedAt =
        typeof j?.conversation?.started_at === "string" ? j.conversation.started_at : null;
      setSessions((ss) =>
        ss.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                dbConvId: convId,
                toolUsed: opts.tool_used ?? s.toolUsed ?? null,
                startedAt: startedAt || s.startedAt || null,
              }
            : s
        )
      );
      return convId;
    } catch (e) {
      console.warn("Failed to create conversation:", e);
      return null;
    }
  }, []);

  const upsertCanvasCardBlock = useCallback((messageId, { title, kind }) => {
    if (!messageId || !kind) return;
    const sid = activeSessionIdRef.current;
    patchSessionMessages(sid, (msgs) =>
      msgs.map((m) => {
        if (m.id !== messageId) return m;
        const blocks = Array.isArray(m.blocks) ? [...m.blocks] : [];
        const idx = blocks.findIndex(
          (b) => String(b?.type || "").toLowerCase() === "canvas_card" && b.kind === kind
        );
        const card = {
          type: "canvas_card",
          messageId,
          title: String(title || "").trim() || "Canvas",
          kind,
          generatedAt: new Date().toISOString(),
        };
        if (idx >= 0) {
          const prevAt = blocks[idx].generatedAt;
          blocks[idx] = {
            ...blocks[idx],
            ...card,
            generatedAt: typeof prevAt === "string" ? prevAt : card.generatedAt,
          };
        } else {
          const k = String(kind).toLowerCase();
          if (k === "data_export") {
            const di = blocks.findIndex((b) => String(b?.type || "").toLowerCase() === "data_solution");
            if (di >= 0) blocks.splice(di + 1, 0, card);
            else blocks.push(card);
          } else if (k === "document_export") {
            const dj = blocks.findIndex((b) => String(b?.type || "").toLowerCase() === "document_solution");
            if (dj >= 0) blocks.splice(dj + 1, 0, card);
            else blocks.push(card);
          } else {
            const ri = blocks.findIndex((b) => String(b?.type || "").toLowerCase() === "research_solution");
            if (ri >= 0) blocks.splice(ri + 1, 0, card);
            else blocks.push(card);
          }
        }
        return { ...m, blocks };
      })
    );
  }, [patchSessionMessages]);

  const onCanvasCardOpen = useCallback((messageId, kind) => {
    if (!messageId || !kind) return;
    if (kind === "data_export") {
      const key = canvasPageCacheKey(messageId, "landing", "data_export");
      const hit = canvasGeneratedHtmlRef.current[key];
      if (!hit?.html?.trim()) return;
      const session = sessionsRef.current.find((s) => s.id === activeSessionIdRef.current);
      const msg = session?.messages?.find((m) => m.id === messageId);
      const dataBlock = msg?.blocks?.find((b) => String(b?.type || "").toLowerCase() === "data_solution");
      if (dataBlock) lastDataExportRef.current = { block: dataBlock, assistantMessageId: messageId };
      landingPageVariantRef.current = "data_export";
      canvasLinkedMessageIdRef.current = messageId;
      setCanvasLinkedMessageId(messageId);
      setCanvasView("landing");
      setCanvasResearchBlock(null);
      setCanvasCodeBlock(null);
      setCanvasBusinessBlock(null);
      landingPendingFullHtmlRef.current = hit.html;
      setLandingState((s) => ({
        ...s,
        title: hit.title || s.title,
        html: hit.html,
        lastShareUrl: s.lastShareUrl || "",
      }));
      setLandingStreamTick(0);
      setLandingStreaming(false);
      setLandingOpen(true);
      setLandingBusy(false);
      return;
    }
    if (kind === "document_export") {
      const key = canvasPageCacheKey(messageId, "landing", "document_export");
      const hit = canvasGeneratedHtmlRef.current[key];
      if (!hit?.html?.trim()) return;
      const session = sessionsRef.current.find((s) => s.id === activeSessionIdRef.current);
      const msg = session?.messages?.find((m) => m.id === messageId);
      const docBlock = msg?.blocks?.find((b) => String(b?.type || "").toLowerCase() === "document_solution");
      if (docBlock) lastDocumentExportRef.current = { block: docBlock, assistantMessageId: messageId };
      landingPageVariantRef.current = "document_export";
      canvasLinkedMessageIdRef.current = messageId;
      setCanvasLinkedMessageId(messageId);
      setCanvasView("landing");
      setCanvasResearchBlock(null);
      setCanvasCodeBlock(null);
      setCanvasBusinessBlock(null);
      landingPendingFullHtmlRef.current = hit.html;
      setLandingState((s) => ({
        ...s,
        title: hit.title || s.title,
        html: hit.html,
        lastShareUrl: s.lastShareUrl || "",
      }));
      setLandingStreamTick(0);
      setLandingStreaming(false);
      setLandingOpen(true);
      setLandingBusy(false);
      return;
    }
    const rKey = canvasPageCacheKey(messageId, "research", kind);
    const hit = canvasGeneratedHtmlRef.current[rKey];
    if (!hit?.html?.trim()) return;
    researchCacheKindHintRef.current = kind;
    const session = sessionsRef.current.find((s) => s.id === activeSessionIdRef.current);
    const msg = session?.messages?.find((m) => m.id === messageId);
    const rb = msg?.blocks?.find((b) => String(b?.type || "").toLowerCase() === "research_solution");
    if (!rb) return;
    canvasLinkedMessageIdRef.current = messageId;
    setCanvasLinkedMessageId(messageId);
    setCanvasView("research");
    setCanvasResearchBlock(rb);
    setCanvasCodeBlock(null);
    setCanvasBusinessBlock(null);
    setLandingOpen(true);
    setLandingBusy(false);
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
                id: makeMessageId(),
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
              id: makeMessageId(),
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
              id: makeMessageId(),
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
            id: makeMessageId(),
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
            id: makeMessageId(),
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
          id: makeMessageId(),
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
          id: makeMessageId(),
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
        const assistantMsgId = makeMessageId();
        const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
        patchSessionMessages(targetSession, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "ceo",
            style: "ceo_final",
            content: msg || "Task complete.",
            timestamp: ts,
            correlationId: payload.correlation_id,
            blocks,
            canvasFollowUp,
          },
        ]);
        void (async () => {
          const sid = targetSession;
          const s = sessionsRef.current.find((x) => x.id === sid);
          let convId = s?.dbConvId;
          if (!convId) {
            convId = await ensureDbConversation(sid, {
              title: (s?.title || "Chat").slice(0, 512),
              tool_used: "ceo",
            });
          }
          if (convId) {
            await postDbMessage({
              convId,
              messageId: assistantMsgId,
              role: "ceo",
              content: msg || "Task complete.",
              blocks,
              toolType: null,
            });
          }
        })();
      }
      if (status === "failed") {
        setPendingInfographic(false);
        if (corr && seenFinalCorrelationIdsRef.current.has(corr)) return;
        if (corr) seenFinalCorrelationIdsRef.current.add(corr);
        setProcessing(false);
        runToolsRef.current = { search: false, analysis: false, file_work: false };
        const failMsgId = makeMessageId();
        const failBlocks = Array.isArray(payload.blocks) ? payload.blocks : [];
        patchSessionMessages(targetSession, (m) => [
          ...m,
          {
            id: failMsgId,
            role: "ceo",
            style: "ceo_final",
            content: msg || "Task failed.",
            timestamp: ts,
            correlationId: payload.correlation_id,
            blocks: failBlocks,
          },
        ]);
        void (async () => {
          const sid = targetSession;
          const s = sessionsRef.current.find((x) => x.id === sid);
          let convId = s?.dbConvId;
          if (!convId) {
            convId = await ensureDbConversation(sid, {
              title: (s?.title || "Chat").slice(0, 512),
              tool_used: "ceo",
            });
          }
          if (convId) {
            await postDbMessage({
              convId,
              messageId: failMsgId,
              role: "ceo",
              content: msg || "Task failed.",
              blocks: failBlocks,
              toolType: null,
            });
          }
        })();
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
  }, [patchSessionMessages, ensureDbConversation]);

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
          const userMsgId = makeMessageId();
          const sid = activeSessionId;
          const cur = sessionsRef.current.find((s) => s.id === sid);
          let convId = cur?.dbConvId;
          if (!convId) {
            convId = await ensureDbConversation(sid, {
              title: (trimmed || display).slice(0, 512),
              tool_used: null,
            });
          }
          patchSessionMessages(sid, (m) => [
            ...m,
            { id: userMsgId, role: "user", content: display, timestamp: ts },
          ]);
          if (convId) {
            await postDbMessage({
              convId,
              messageId: userMsgId,
              role: "user",
              content: display,
              blocks: null,
              toolType: null,
            });
          }
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
    [activeSessionId, connected, patchSessionMessages, ensureDbConversation, session.userId]
  );

  const submitMathProblem = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "math",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Math Solver…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/math`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ problem: trimmed }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Math Solver failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Math Solver** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const steps = Array.isArray(data.steps) ? data.steps : [];
        const answer = typeof data.answer === "string" ? data.answer : "";
        const topic = typeof data.topic === "string" ? data.topic : "general";
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const blocks = [
          {
            type: "math_solution",
            steps,
            answer,
            topic,
            confidence,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            tool: "math_solver",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "math_solver",
          });
          await saveToolResult("math", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Math Solver** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitScienceQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "science",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Science Agent…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/science`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Science Agent failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Science Agent** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const domain = typeof data.domain === "string" ? data.domain : "general";
        const explanation = typeof data.explanation === "string" ? data.explanation : "";
        const keyConcepts = Array.isArray(data.key_concepts) ? data.key_concepts : [];
        const realWorldExample =
          typeof data.real_world_example === "string" ? data.real_world_example : "";
        const furtherReading = Array.isArray(data.further_reading) ? data.further_reading : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const isDebated = Boolean(data.is_debated);
        const blocks = [
          {
            type: "science_solution",
            domain,
            explanation,
            key_concepts: keyConcepts,
            real_world_example: realWorldExample,
            further_reading: furtherReading,
            confidence,
            is_debated: isDebated,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "science",
          });
          await saveToolResult("science", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Science Agent** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitChemistryQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "chemistry",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Chemistry Agent…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/chemistry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Chemistry Agent failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Chemistry Agent** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const reaction_type = typeof data.reaction_type === "string" ? data.reaction_type : "general";
        const explanation = typeof data.explanation === "string" ? data.explanation : "";
        const balanced_equation =
          typeof data.balanced_equation === "string" ? data.balanced_equation : "";
        const molecules = Array.isArray(data.molecules) ? data.molecules : [];
        const hazard_level = typeof data.hazard_level === "string" ? data.hazard_level : "none";
        const hazard_warning =
          typeof data.hazard_warning === "string" ? data.hazard_warning : "";
        const safety_tips = Array.isArray(data.safety_tips) ? data.safety_tips : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";

        const blocks = [
          {
            type: "chemistry_solution",
            reaction_type,
            explanation,
            balanced_equation,
            molecules,
            hazard_level,
            hazard_warning,
            safety_tips,
            confidence,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "chemistry",
          });
          await saveToolResult("chemistry", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Chemistry Agent** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitSpaceQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "space",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Space Agent…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/space`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Space Agent failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Space Agent** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const topic = typeof data.topic === "string" ? data.topic : "solar_system";
        const explanation = typeof data.explanation === "string" ? data.explanation : "";
        const key_facts = Array.isArray(data.key_facts) ? data.key_facts : [];
        const scale = typeof data.scale === "string" ? data.scale : "";
        const missions = Array.isArray(data.missions) ? data.missions : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const is_theoretical = Boolean(data.is_theoretical);
        const visualization =
          data.visualization && typeof data.visualization === "object" ? data.visualization : {};

        const blocks = [
          {
            type: "space_solution",
            topic,
            explanation,
            key_facts,
            scale,
            missions,
            confidence,
            is_theoretical,
            visualization,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "space",
          });
          await saveToolResult("space", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Space Agent** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitHealthQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "health",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Health Agent…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/health`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Health Agent failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Health Agent** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const category = typeof data.category === "string" ? data.category : "general";
        const explanation = typeof data.explanation === "string" ? data.explanation : "";
        const key_facts = Array.isArray(data.key_facts) ? data.key_facts : [];
        const when_to_see_doctor =
          typeof data.when_to_see_doctor === "string" ? data.when_to_see_doctor : "";
        const emergency_warning =
          Boolean(data.emergency_warning) || r.headers.get("X-Emergency") === "true";
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const disclaimer =
          typeof data.disclaimer === "string"
            ? data.disclaimer
            : "This is educational information only. Always consult a qualified healthcare professional.";

        const blocks = [
          {
            type: "health_solution",
            category,
            explanation,
            key_facts,
            when_to_see_doctor,
            emergency_warning,
            sources,
            confidence,
            disclaimer,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "health",
          });
          await saveToolResult("health", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Health Agent** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitCodeQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "code",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Code Assistant…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const raw = await r.text();
        if (!r.ok) {
          let detail = raw.slice(0, 400);
          try {
            const ej = JSON.parse(raw);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Code Assistant failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Code Assistant** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const language = typeof data.language === "string" ? data.language : "plaintext";
        const task_type = typeof data.task_type === "string" ? data.task_type : "write";
        const code = typeof data.code === "string" ? data.code : "";
        const explanation = typeof data.explanation === "string" ? data.explanation : "";
        const complexity = typeof data.complexity === "string" ? data.complexity : "";
        const best_practices = Array.isArray(data.best_practices) ? data.best_practices : [];
        const warnings = Array.isArray(data.warnings) ? data.warnings : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";

        const blocks = [
          {
            type: "code_solution",
            language,
            task_type,
            code,
            explanation,
            complexity,
            best_practices,
            warnings,
            confidence,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "code",
          });
          await saveToolResult("code", trimmed, data, convId, assistantMsgId);
        }
        setCanvasView("code");
        setCanvasCodeBlock({
          language,
          task_type,
          code,
          explanation,
          complexity,
          best_practices,
          warnings,
          confidence,
        });
        setCanvasResearchBlock(null);
        setCanvasBusinessBlock(null);
        setCanvasLinkedMessageId(assistantMsgId);
        canvasLinkedMessageIdRef.current = assistantMsgId;
        setLandingOpen(true);
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Code Assistant** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitTranslation = useCallback(
    async (text) => {
      const raw = (text || "").trim();
      if (!raw || !connected) return;

      let target_language = "";
      let payloadText = raw;
      const m = raw.match(/^Target\s*language\s*:\s*([^\n]+)\s*\n+([\s\S]+)$/i);
      if (m && m[2]?.trim()) {
        target_language = m[1].trim();
        payloadText = m[2].trim();
      }

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: raw.slice(0, 512),
        tool_used: "translation",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: raw, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: raw,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: raw.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Translation…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/translation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: payloadText, target_language }),
        });
        const rawBody = await r.text();
        if (!r.ok) {
          let detail = rawBody.slice(0, 400);
          try {
            const ej = JSON.parse(rawBody);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Translation failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Translation** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const source_language = typeof data.source_language === "string" ? data.source_language : "";
        const tl = typeof data.target_language === "string" ? data.target_language : "";
        const original_text = typeof data.original_text === "string" ? data.original_text : payloadText;
        const translated_text = typeof data.translated_text === "string" ? data.translated_text : "";
        const transliteration = typeof data.transliteration === "string" ? data.transliteration : "";
        const tone = typeof data.tone === "string" ? data.tone : "neutral";
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const alternative_translations = Array.isArray(data.alternative_translations)
          ? data.alternative_translations
          : [];

        const blocks = [
          {
            type: "translation_solution",
            source_language,
            target_language: tl,
            original_text,
            translated_text,
            transliteration,
            tone,
            confidence,
            alternative_translations,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "translation",
          });
          await saveToolResult("translation", raw, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Translation** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitResearchQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "research",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Research Agent…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const rawBody = await r.text();
        if (!r.ok) {
          let detail = rawBody.slice(0, 400);
          try {
            const ej = JSON.parse(rawBody);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Research Agent failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Research Agent** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const topic = typeof data.topic === "string" ? data.topic : "";
        const summary = typeof data.summary === "string" ? data.summary : "";
        const key_findings = Array.isArray(data.key_findings) ? data.key_findings : [];
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const citations = Array.isArray(data.citations) ? data.citations : [];
        const conflicting_views = Array.isArray(data.conflicting_views) ? data.conflicting_views : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const disclaimer =
          typeof data.disclaimer === "string" && data.disclaimer.trim()
            ? data.disclaimer.trim()
            : "Research is based on AI knowledge. Always verify with primary sources.";

        const researchBlockPayload = {
          type: "research_solution",
          topic,
          summary,
          key_findings,
          sources,
          citations,
          conflicting_views,
          confidence,
          disclaimer,
        };
        const topicLabel = topic.trim() || "your topic";
        const introText = `I've completed your research report on **${topicLabel}**. You can view the full report in the Canvas panel on the right. Use the **Create** button to convert it into a Web page, Infographic, Quiz, or Flashcards.`;
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: introText,
            timestamp: new Date().toISOString(),
            blocks: [researchBlockPayload],
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: introText,
            blocks: [researchBlockPayload],
            toolType: "research",
          });
          await saveToolResult("research", trimmed, data, convId, assistantMsgId);
        }
        setCanvasView("research");
        setCanvasResearchBlock(researchBlockPayload);
        setCanvasCodeBlock(null);
        setCanvasBusinessBlock(null);
        setCanvasLinkedMessageId(assistantMsgId);
        canvasLinkedMessageIdRef.current = assistantMsgId;
        setLandingOpen(true);
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Research Agent** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitBusinessQuestion = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "business_agent",
      });
      const briefFields = parseBusinessBrief(trimmed).fields;
      const userBlocks = [{ type: "business_brief", fields: briefFields, raw: trimmed }];
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts, blocks: userBlocks },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: userBlocks,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Business Agent…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/business/research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            user_id: session.userId || "anonymous",
            include_live_search: true,
          }),
        });
        const rawBody = await r.text();
        if (!r.ok) {
          let detail = rawBody.slice(0, 400);
          try {
            const ej = JSON.parse(rawBody);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Business Agent** — request failed\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Business Agent** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const businessBlockPayload = { ...data, type: "business_solution" };
        businessBlockCacheRef.current[assistantMsgId] = businessBlockPayload;
        const qLabel = typeof data.query === "string" && data.query.trim() ? data.query.trim().slice(0, 120) : "your market";
        const introText = `**Business Agent** — business pack ready for *${qLabel}*. Summary and toolkit are below; open the Canvas anytime.`;
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: introText,
            timestamp: new Date().toISOString(),
            blocks: [businessBlockPayload],
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: introText,
            blocks: [businessBlockPayload],
            toolType: "business_agent",
          });
          await saveToolResult("business_agent", trimmed, data, convId, assistantMsgId);
        }
        setCanvasView("business");
        setCanvasBusinessBlock(businessBlockPayload);
        setCanvasResearchBlock(null);
        setCanvasCodeBlock(null);
        setCanvasLinkedMessageId(assistantMsgId);
        canvasLinkedMessageIdRef.current = assistantMsgId;
        setBusinessTabRequest((prev) => ({ id: prev.id + 1, tab: "overview" }));
        setLandingOpen(true);
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Business Agent** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages, session.userId]
  );

  const openBusinessPack = useCallback((messageId, tab = "overview", extras = {}) => {
    const sid = activeSessionIdRef.current;
    let b =
      findBusinessSolutionBlock(sessionsRef.current, sid, messageId) || businessBlockCacheRef.current[messageId];
    if (!b) return;
    if (canvasLinkedMessageIdRef.current !== messageId) {
      setBusinessCanvasShareUrl("");
    }
    const normalized = { ...b, type: "business_solution", ...(extras && typeof extras === "object" ? extras : {}) };
    businessBlockCacheRef.current[messageId] = normalized;
    setCanvasBusinessBlock(normalized);
    setCanvasView("business");
    setCanvasResearchBlock(null);
    setCanvasCodeBlock(null);
    setCanvasLinkedMessageId(messageId);
    canvasLinkedMessageIdRef.current = messageId;
    setBusinessTabRequest((prev) => ({ id: prev.id + 1, tab: tab || "overview" }));
    setLandingOpen(true);
  }, []);

  const applyBusinessSimulation = useCallback(
    (messageId, simData) => {
      if (!messageId || !simData) return;
      const sid = activeSessionIdRef.current;
      const block =
        findBusinessSolutionBlock(sessionsRef.current, sid, messageId) || businessBlockCacheRef.current[messageId];
      if (!block) return;
      const nextBlock = {
        ...block,
        type: "business_solution",
        scenario_simulation: {
          ...(typeof block.scenario_simulation === "object" ? block.scenario_simulation : {}),
          label: simData.label,
          assumptions: simData.assumptions,
          pl_rows: simData.pl_rows,
          chart_series: simData.chart_series,
          warnings: simData.warnings,
        },
      };
      businessBlockCacheRef.current[messageId] = nextBlock;
      patchSessionMessages(sid, (msgs) =>
        msgs.map((m) => {
          if (m.id !== messageId) return m;
          const blocks = (m.blocks || []).map((bb) =>
            String(bb?.type || "").toLowerCase() === "business_solution" ? nextBlock : bb
          );
          return { ...m, blocks };
        })
      );
      setCanvasBusinessBlock(nextBlock);
      setCanvasLinkedMessageId(messageId);
      canvasLinkedMessageIdRef.current = messageId;
      setCanvasResearchBlock(null);
      setCanvasCodeBlock(null);
      setBusinessSimulateMessageId(null);
      setCanvasView("business");
      setLandingOpen(true);
      setBusinessTabRequest((prev) => ({ id: prev.id + 1, tab: "financials" }));
    },
    [patchSessionMessages]
  );

  const runBusinessWebPageGenerate = useCallback(
    async (messageId, userNotes = "") => {
      const sid = activeSessionIdRef.current;
      const block =
        findBusinessSolutionBlock(sessionsRef.current, sid, messageId) || businessBlockCacheRef.current[messageId];
      if (!block || !connected) return;
      const ctx = buildBusinessWebPageContext(block, userNotes);
      const titleHint =
        (typeof block.query === "string" && block.query.trim().slice(0, 80)) || "Business intelligence report";
      setLandingBusy(true);
      try {
        const result = await generatePage({
          userId: session.userId,
          source: "business_agent",
          context: ctx,
          title_hint: titleHint,
        });
        if (!result.ok) {
          patchSessionMessages(sid, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Web page generation failed**\n\n${result.detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const html = typeof result.html === "string" ? result.html : "";
        const title =
          typeof result.title === "string" && result.title.trim() ? result.title.trim() : titleHint;
        const nextBlock = { ...block, type: "business_solution", canvas_html: html, _web_page_title: title };
        businessBlockCacheRef.current[messageId] = nextBlock;
        patchSessionMessages(sid, (msgs) =>
          msgs.map((m) => {
            if (m.id !== messageId) return m;
            const blocks = (m.blocks || []).map((bb) =>
              String(bb?.type || "").toLowerCase() === "business_solution" ? nextBlock : bb
            );
            return { ...m, blocks };
          })
        );
        setCanvasBusinessBlock(nextBlock);
        setCanvasLinkedMessageId(messageId);
        canvasLinkedMessageIdRef.current = messageId;
        setCanvasResearchBlock(null);
        setCanvasCodeBlock(null);
        setCanvasView("business");
        setLandingOpen(true);
        setBusinessTabRequest((prev) => ({ id: prev.id + 1, tab: "page" }));
      } catch {
        patchSessionMessages(sid, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Web page generation** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, patchSessionMessages, session.userId]
  );

  const handleBusinessShare = useCallback(async () => {
    const mid = canvasLinkedMessageIdRef.current;
    const sid = activeSessionIdRef.current;
    const block =
      findBusinessSolutionBlock(sessionsRef.current, sid, mid) || businessBlockCacheRef.current[mid];
    if (!block) return undefined;
    const html = buildFullBusinessReportHtml(block);
    const title =
      (typeof block.query === "string" && block.query.trim().slice(0, 80)) || "Business Agent · Business report";
    const result = await publishPage({ userId: session.userId, title, html });
    if (!result.ok) {
      patchSessionMessages(activeSessionIdRef.current, (m) => [
        ...m,
        {
          id: makeMessageId(),
          role: "assistant",
          content: `⚠️ **Publish failed**\n\n${result.detail}`,
          timestamp: new Date().toISOString(),
        },
      ]);
      return undefined;
    }
    const url = result.share_url || "";
    if (url) setBusinessCanvasShareUrl(url);
    return url || undefined;
  }, [patchSessionMessages, session.userId]);

  const handleBusinessCanvasRevision = useCallback(
    async (revisionNotes) => {
      const notes = (revisionNotes || "").trim();
      if (!notes || !connected) return;
      const mid = canvasLinkedMessageIdRef.current;
      const sid = activeSessionIdRef.current;
      let block =
        findBusinessSolutionBlock(sessionsRef.current, sid, mid) || businessBlockCacheRef.current[mid];
      if (!block) return;
      const prev = buildFullBusinessReportHtml(block);
      const ctx = buildWorkspaceExport({
        messages: sessionsRef.current.find((x) => x.id === sid)?.messages || [],
        thoughtLog: thoughtLogRef.current,
        fileAnalystContext: fileAnalystContextRef.current,
      });
      const titleHint =
        (typeof block.query === "string" && block.query.trim().slice(0, 80)) || "Business intelligence report";
      setLandingBusy(true);
      try {
        const result = await generatePage({
          userId: session.userId,
          source: "business_agent",
          context: ctx,
          title_hint: titleHint,
          existing_html: prev,
          revision_notes: notes,
        });
        if (!result.ok) {
          patchSessionMessages(sid, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Canvas revision failed**\n\n${result.detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const nextHtml = typeof result.html === "string" && result.html.trim() ? result.html : prev;
        const nextTitle =
          typeof result.title === "string" && result.title.trim() ? result.title.trim() : titleHint;
        const nextBlock = {
          ...block,
          type: "business_solution",
          canvas_html: nextHtml,
          _web_page_title: nextTitle,
        };
        businessBlockCacheRef.current[mid] = nextBlock;
        patchSessionMessages(sid, (msgs) =>
          msgs.map((m) => {
            if (m.id !== mid) return m;
            const blocks = (m.blocks || []).map((bb) =>
              String(bb?.type || "").toLowerCase() === "business_solution" ? nextBlock : bb
            );
            return { ...m, blocks };
          })
        );
        setCanvasBusinessBlock(nextBlock);
        setBusinessTabRequest((prev) => ({ id: prev.id + 1, tab: "page" }));
      } catch {
        patchSessionMessages(sid, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Canvas revision** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, patchSessionMessages, session.userId]
  );

  const handleBusinessAction = useCallback(
    ({ action, messageId, context }) => {
      if (!messageId) return;
      const ctx = typeof context === "string" ? context.trim() : "";
      const extras = ctx ? { _action_user_notes: ctx } : {};
      if (action === "simulate") {
        setBusinessSimulateNotes(ctx);
        setBusinessSimulateMessageId(messageId);
        return;
      }
      if (action === "web_page") {
        void runBusinessWebPageGenerate(messageId, ctx);
        return;
      }
      const tabMap = { open: "overview", radar: "radar", swot: "swot", tax: "financials" };
      const tab = tabMap[action] || "overview";
      openBusinessPack(messageId, tab, extras);
    },
    [openBusinessPack, runBusinessWebPageGenerate]
  );

  const invalidateResearchPageCache = useCallback(() => {
    const id = canvasLinkedMessageIdRef.current;
    if (!id) return;
    researchCacheKindHintRef.current = null;
    delete canvasGeneratedHtmlRef.current[canvasPageCacheKey(id, "research", "web_page")];
    delete canvasGeneratedHtmlRef.current[canvasPageCacheKey(id, "research", "infographic")];
  }, []);

  const getResearchCachedPreview = useCallback(() => {
    const id = canvasLinkedMessageIdRef.current;
    if (!id) return null;
    const hint = researchCacheKindHintRef.current;
    if (hint === "web_page" || hint === "infographic") {
      const e = canvasGeneratedHtmlRef.current[canvasPageCacheKey(id, "research", hint)];
      if (e?.html?.trim()) {
        researchCacheKindHintRef.current = null;
        return { html: e.html, title: e.title || "", kind: hint };
      }
      researchCacheKindHintRef.current = null;
    }
    for (const rk of ["web_page", "infographic"]) {
      const e = canvasGeneratedHtmlRef.current[canvasPageCacheKey(id, "research", rk)];
      if (e?.html?.trim()) return { html: e.html, title: e.title || "", kind: rk };
    }
    return null;
  }, []);

  const runResearchPagesGenerate = useCallback(
    async ({ kind, force, body }) => {
      const id = canvasLinkedMessageIdRef.current;
      if (!id) return { html: "", title: "" };
      const cacheKey = canvasPageCacheKey(id, "research", kind);
      const titleFromBody =
        body && typeof body.title_hint === "string" ? body.title_hint.trim() : "";
      if (!force) {
        const hit = canvasGeneratedHtmlRef.current[cacheKey];
        if (hit?.html?.trim()) {
          const cardTitle = hit.title || titleFromBody || "Canvas";
          upsertCanvasCardBlock(id, { kind, title: cardTitle });
          return { html: hit.html, title: hit.title || "" };
        }
      }
      if (!connected) return { html: "", title: "" };
      const base = backendHttpBase().replace(/\/$/, "");
      const r = await fetch(`${base}/api/pages/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: session.userId, ...body }),
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
        throw new Error(detail || "Generation failed.");
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Invalid server response.");
      }
      const htmlOut = typeof data.html === "string" ? data.html : "";
      const titleOut = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "";
      if (htmlOut.trim()) {
        canvasGeneratedHtmlRef.current[cacheKey] = { html: htmlOut, title: titleOut, kind: `research_${kind}` };
        const cardTitle = titleOut || titleFromBody || "Canvas";
        upsertCanvasCardBlock(id, { kind, title: cardTitle });
        const sid = activeSessionIdRef.current;
        const convId = await ensureDbConversation(sid, {
          title: (titleOut || titleFromBody || "Research").slice(0, 512),
          tool_used: "research",
        });
        if (convId) {
          const cid = await postDbCanvasPage({
            convId,
            messageId: id,
            kind: String(kind || "web_page").slice(0, 64),
            title: cardTitle,
            htmlContent: htmlOut,
            toolType: "research",
          });
          if (cid) landingCanvasDbIdRef.current = cid;
        }
      }
      return { html: htmlOut, title: titleOut };
    },
    [connected, ensureDbConversation, session.userId, upsertCanvasCardBlock]
  );

  const runResearchPagesRevision = useCallback(
    async ({ body, createKind }) => {
      const id = canvasLinkedMessageIdRef.current;
      if (!id) return { html: "", title: "" };
      const kind = createKind || "web_page";
      const cacheKey = canvasPageCacheKey(id, "research", kind);
      if (!connected) return { html: "", title: "" };
      const base = backendHttpBase().replace(/\/$/, "");
      const r = await fetch(`${base}/api/pages/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: session.userId, ...body }),
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
        throw new Error(detail || "Refine failed.");
      }
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Invalid server response.");
      }
      const htmlOut = typeof data.html === "string" ? data.html : "";
      const titleOut = typeof data.title === "string" && data.title.trim() ? data.title.trim() : "";
      if (htmlOut.trim()) {
        canvasGeneratedHtmlRef.current[cacheKey] = { html: htmlOut, title: titleOut, kind: `research_${kind}_rev` };
      }
      return { html: htmlOut, title: titleOut };
    },
    [connected, session.userId]
  );

  const submitStudyTopic = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "study",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Study Assistant…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/study`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const rawBody = await r.text();
        if (!r.ok) {
          let detail = rawBody.slice(0, 400);
          try {
            const ej = JSON.parse(rawBody);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Study Assistant failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Study Assistant** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const topic = typeof data.topic === "string" ? data.topic : "";
        const summary = typeof data.summary === "string" ? data.summary : "";
        const key_concepts = Array.isArray(data.key_concepts) ? data.key_concepts : [];
        const study_plan = Array.isArray(data.study_plan) ? data.study_plan : [];
        const memory_tips = Array.isArray(data.memory_tips) ? data.memory_tips : [];
        const practice_questions = Array.isArray(data.practice_questions) ? data.practice_questions : [];
        const practice_hints = Array.isArray(data.practice_hints) ? data.practice_hints : [];
        const difficulty_level =
          typeof data.difficulty_level === "string" ? data.difficulty_level : "intermediate";
        const estimated_time = typeof data.estimated_time === "string" ? data.estimated_time : "";
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";

        const blocks = [
          {
            type: "study_solution",
            topic,
            summary,
            key_concepts,
            study_plan,
            memory_tips,
            practice_questions,
            practice_hints,
            difficulty_level,
            estimated_time,
            confidence,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "study",
          });
          await saveToolResult("study", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Study Assistant** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const submitDocumentRequest = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "document_writer",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Document Writer…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/document`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request: trimmed }),
        });
        const rawBody = await r.text();
        if (!r.ok) {
          let detail = rawBody.slice(0, 400);
          try {
            const ej = JSON.parse(rawBody);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Document Writer failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Document Writer** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const document_type = typeof data.document_type === "string" ? data.document_type : "other";
        const title = typeof data.title === "string" ? data.title : "";
        const docContent = typeof data.content === "string" ? data.content : "";
        const word_count = Number(data.word_count) || 0;
        const tone = typeof data.tone === "string" ? data.tone : "formal";
        const language = typeof data.language === "string" ? data.language : "English";
        const sections = Array.isArray(data.sections) ? data.sections : [];
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";

        const blocks = [
          {
            type: "document_solution",
            document_type,
            title,
            content: docContent,
            word_count,
            tone,
            language,
            sections,
            confidence,
          },
        ];
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: "",
            timestamp: new Date().toISOString(),
            blocks,
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: "",
            blocks,
            toolType: "document_writer",
          });
          await saveToolResult("document_writer", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Document Writer** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const exportDataAnalysisToCanvas = useCallback(
    async (block, assistantMessageId, force = false) => {
      const plain = buildDataAnalysisExportContext(block);
      if (!plain.trim() || !connected) return;
      const mid = typeof assistantMessageId === "string" ? assistantMessageId : null;
      const titleHint =
        (block && typeof block.dataset_name === "string" && block.dataset_name.trim()
          ? block.dataset_name.trim()
          : "Data analysis") || "Data analysis";
      const cacheKey = canvasPageCacheKey(mid, "landing", "data_export");
      lastDataExportRef.current = { block, assistantMessageId: mid };
      landingPageVariantRef.current = "data_export";

      if (!force) {
        const hit = canvasGeneratedHtmlRef.current[cacheKey];
        if (hit?.html?.trim()) {
          upsertCanvasCardBlock(mid, { kind: "data_export", title: hit.title || titleHint });
          landingPendingFullHtmlRef.current = hit.html;
          setLandingStreamTick(0);
          setLandingStreaming(false);
          setCanvasView("landing");
          setCanvasResearchBlock(null);
          setCanvasCodeBlock(null);
          setCanvasBusinessBlock(null);
          setCanvasLinkedMessageId(mid);
          canvasLinkedMessageIdRef.current = mid;
          setLandingState({ html: hit.html, title: hit.title || titleHint, lastShareUrl: "" });
          setLandingOpen(true);
          setLandingBusy(false);
          return;
        }
      }

      landingPendingFullHtmlRef.current = "";
      setLandingStreamTick(0);
      setLandingStreaming(false);
      setCanvasView("landing");
      setCanvasResearchBlock(null);
      setCanvasCodeBlock(null);
      setCanvasBusinessBlock(null);
      setCanvasLinkedMessageId(mid);
      canvasLinkedMessageIdRef.current = mid;
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
            source: "data_analysis",
            context: plain,
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
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Export to Canvas failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          setLandingOpen(false);
          patchSessionMessages(activeSessionIdRef.current, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Export to Canvas** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const htmlOut = typeof data.html === "string" ? data.html : "";
        const titleOut = typeof data.title === "string" && data.title.trim() ? data.title.trim() : titleHint;
        canvasGeneratedHtmlRef.current[cacheKey] = { html: htmlOut, title: titleOut, kind: "data_export" };
        if (mid && htmlOut.trim()) {
          upsertCanvasCardBlock(mid, { kind: "data_export", title: titleOut });
        }
        landingPendingFullHtmlRef.current = htmlOut;
        setLandingState((s) => ({
          ...s,
          title: titleOut,
          html: "",
          lastShareUrl: "",
        }));
        setLandingBusy(false);
        setLandingStreamTick((t) => t + 1);
        const sid = activeSessionIdRef.current;
        const convId = await ensureDbConversation(sid, {
          title: (titleOut || titleHint).slice(0, 512),
          tool_used: "data_analyst",
        });
        if (convId && htmlOut.trim() && mid) {
          const cid = await postDbCanvasPage({
            convId,
            messageId: mid,
            kind: "data_export",
            title: titleOut || titleHint,
            htmlContent: htmlOut,
            toolType: "data_analyst",
          });
          if (cid) landingCanvasDbIdRef.current = cid;
        }
      } catch {
        setLandingOpen(false);
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Export to Canvas** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, ensureDbConversation, patchSessionMessages, session.userId, upsertCanvasCardBlock]
  );

  const exportDocumentWriterToCanvas = useCallback(
    async (block, assistantMessageId, force = false) => {
      const plain = buildDocumentExportContext(block);
      if (!plain.trim() || !connected) return;
      const mid = typeof assistantMessageId === "string" ? assistantMessageId : null;
      const titleHint =
        (block && typeof block.title === "string" && block.title.trim()
          ? block.title.trim()
          : "Document") || "Document";
      const cacheKey = canvasPageCacheKey(mid, "landing", "document_export");
      lastDocumentExportRef.current = { block, assistantMessageId: mid };
      landingPageVariantRef.current = "document_export";

      if (!force) {
        const hit = canvasGeneratedHtmlRef.current[cacheKey];
        if (hit?.html?.trim()) {
          upsertCanvasCardBlock(mid, { kind: "document_export", title: hit.title || titleHint });
          landingPendingFullHtmlRef.current = hit.html;
          setLandingStreamTick(0);
          setLandingStreaming(false);
          setCanvasView("landing");
          setCanvasResearchBlock(null);
          setCanvasCodeBlock(null);
          setCanvasBusinessBlock(null);
          setCanvasLinkedMessageId(mid);
          canvasLinkedMessageIdRef.current = mid;
          setLandingState({ html: hit.html, title: hit.title || titleHint, lastShareUrl: "" });
          setLandingOpen(true);
          setLandingBusy(false);
          return;
        }
      }

      landingPendingFullHtmlRef.current = "";
      setLandingStreamTick(0);
      setLandingStreaming(false);
      setCanvasView("landing");
      setCanvasResearchBlock(null);
      setCanvasCodeBlock(null);
      setCanvasBusinessBlock(null);
      setCanvasLinkedMessageId(mid);
      canvasLinkedMessageIdRef.current = mid;
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
            source: "document_writer",
            context: plain,
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
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Export to Canvas failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          setLandingOpen(false);
          patchSessionMessages(activeSessionIdRef.current, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Export to Canvas** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const htmlOut = typeof data.html === "string" ? data.html : "";
        const titleOut = typeof data.title === "string" && data.title.trim() ? data.title.trim() : titleHint;
        canvasGeneratedHtmlRef.current[cacheKey] = { html: htmlOut, title: titleOut, kind: "document_export" };
        if (mid && htmlOut.trim()) {
          upsertCanvasCardBlock(mid, { kind: "document_export", title: titleOut });
        }
        landingPendingFullHtmlRef.current = htmlOut;
        setLandingState((s) => ({
          ...s,
          title: titleOut,
          html: "",
          lastShareUrl: "",
        }));
        setLandingBusy(false);
        setLandingStreamTick((t) => t + 1);
        const sid = activeSessionIdRef.current;
        const convId = await ensureDbConversation(sid, {
          title: (titleOut || titleHint).slice(0, 512),
          tool_used: "document_writer",
        });
        if (convId && htmlOut.trim() && mid) {
          const cid = await postDbCanvasPage({
            convId,
            messageId: mid,
            kind: "document_export",
            title: titleOut || titleHint,
            htmlContent: htmlOut,
            toolType: "document_writer",
          });
          if (cid) landingCanvasDbIdRef.current = cid;
        }
      } catch {
        setLandingOpen(false);
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Export to Canvas** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, ensureDbConversation, patchSessionMessages, session.userId, upsertCanvasCardBlock]
  );

  const handleDataAnalystFollowUp = useCallback(
    async (assistantMessageId, question, blockSnapshot, blockIndex) => {
      const q = (question || "").trim();
      if (!q || !connected || !assistantMessageId) return;
      const base = backendHttpBase().replace(/\/$/, "");
      const source_data = typeof blockSnapshot?.source_data === "string" ? blockSnapshot.source_data : "";
      const previous_analysis = { ...(blockSnapshot && typeof blockSnapshot === "object" ? blockSnapshot : {}) };
      delete previous_analysis.source_data;
      delete previous_analysis.type;
      delete previous_analysis.follow_up_history;

      const appendFollowUp = (answerText) => {
        patchSessionMessages(activeSessionIdRef.current, (msgs) =>
          msgs.map((m) => {
            if (m.id !== assistantMessageId) return m;
            const blocks = [...(m.blocks || [])];
            let target = typeof blockIndex === "number" ? blockIndex : -1;
            if (target < 0 || String(blocks[target]?.type || "").toLowerCase() !== "data_solution") {
              target = blocks.findIndex((b) => String(b?.type || "").toLowerCase() === "data_solution");
            }
            if (target < 0 || !blocks[target]) return m;
            const b = blocks[target];
            const hist = Array.isArray(b.follow_up_history) ? [...b.follow_up_history] : [];
            hist.push({ question: q, answer: answerText, at: new Date().toISOString() });
            blocks[target] = { ...b, follow_up_history: hist };
            return { ...m, blocks };
          })
        );
      };

      try {
        const r = await fetch(`${base}/tools/data-follow-up`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            original_data: source_data,
            previous_analysis,
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
          appendFollowUp(`⚠️ Follow-up failed: ${detail}`);
          return;
        }
        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          appendFollowUp("⚠️ Invalid follow-up response from server.");
          return;
        }
        const answer = typeof data.answer === "string" ? data.answer : "";
        appendFollowUp(answer || "(empty)");
        const sid = activeSessionIdRef.current;
        const convId = sessionsRef.current.find((s) => s.id === sid)?.dbConvId;
        if (convId && isUuidLike(String(convId))) {
          await saveToolResult("data_analyst_follow_up", q, { answer: answer || "" }, convId, assistantMessageId);
        }
      } catch {
        appendFollowUp("⚠️ Could not reach the server for a follow-up.");
      }
    },
    [connected, patchSessionMessages]
  );

  const submitDataAnalysis = useCallback(
    async (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed || !connected) return;

      const userMsgId = makeMessageId();
      const assistantMsgId = makeMessageId();
      const ts = new Date().toISOString();
      const convId = await ensureDbConversation(activeSessionId, {
        title: trimmed.slice(0, 512),
        tool_used: "data_analyst",
      });
      patchSessionMessages(activeSessionId, (m) => [
        ...m,
        { id: userMsgId, role: "user", content: trimmed, timestamp: ts },
      ]);
      if (convId) {
        await postDbMessage({
          convId,
          messageId: userMsgId,
          role: "user",
          content: trimmed,
          blocks: null,
          toolType: null,
        });
      }
      setSessions((ss) =>
        ss.map((s) =>
          s.id === activeSessionId && s.title === "New chat" ? { ...s, title: trimmed.slice(0, 40) } : s
        )
      );

      setProcessing(true);
      setLatestStatus("running");
      setLatestMessage("Data Analyst…");
      setThoughtLog([]);

      const base = backendHttpBase().replace(/\/$/, "");
      try {
        const r = await fetch(`${base}/tools/data-analysis`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: trimmed, dataset_name: "" }),
        });
        const rawBody = await r.text();
        if (!r.ok) {
          let detail = rawBody.slice(0, 400);
          try {
            const ej = JSON.parse(rawBody);
            if (ej && typeof ej.detail === "string") detail = ej.detail;
            else if (Array.isArray(ej?.detail) && ej.detail[0]?.msg) detail = String(ej.detail[0].msg);
          } catch {
            /* ignore */
          }
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Data Analyst failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          patchSessionMessages(activeSessionId, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: "⚠️ **Data Analyst** — invalid server response.",
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const dataset_name = typeof data.dataset_name === "string" ? data.dataset_name : "Dataset";
        const row_count = Number(data.row_count) || 0;
        const column_count = Number(data.column_count) || 0;
        const columns = Array.isArray(data.columns) ? data.columns : [];
        const summary_stats = data.summary_stats && typeof data.summary_stats === "object" ? data.summary_stats : {};
        const key_insights = Array.isArray(data.key_insights) ? data.key_insights : [];
        const ai_narrative = typeof data.ai_narrative === "string" ? data.ai_narrative : "";
        const smart_alerts = Array.isArray(data.smart_alerts) ? data.smart_alerts : [];
        const data_quality =
          data.data_quality && typeof data.data_quality === "object"
            ? {
                score: typeof data.data_quality.score === "string" ? data.data_quality.score : "fair",
                notes: typeof data.data_quality.notes === "string" ? data.data_quality.notes : "",
              }
            : { score: "fair", notes: "" };
        const confidence = typeof data.confidence === "string" ? data.confidence : "medium";
        const chart_data = data.chart_data && typeof data.chart_data === "object" ? data.chart_data : {};
        const trends = Array.isArray(data.trends) ? data.trends : [];
        const predictions = Array.isArray(data.predictions) ? data.predictions : [];

        const dataBlockPayload = {
          type: "data_solution",
          source_data: trimmed,
          dataset_name,
          row_count,
          column_count,
          columns,
          summary_stats,
          key_insights,
          ai_narrative,
          smart_alerts,
          data_quality,
          confidence,
          chart_data,
          trends,
          predictions,
          follow_up_history: [],
        };
        const introText = `Here is your **Data Analyst** report for **${dataset_name}** (${row_count}×${column_count}). Use **Export to Canvas** for a shareable page or **Download** to save the source table as CSV.`;
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: assistantMsgId,
            role: "assistant",
            content: introText,
            timestamp: new Date().toISOString(),
            blocks: [dataBlockPayload],
          },
        ]);
        if (convId) {
          await postDbMessage({
            convId,
            messageId: assistantMsgId,
            role: "assistant",
            content: introText,
            blocks: [dataBlockPayload],
            toolType: "data_analyst",
          });
          await saveToolResult("data_analyst", trimmed, data, convId, assistantMsgId);
        }
      } catch {
        patchSessionMessages(activeSessionId, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Data Analyst** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setProcessing(false);
        setLatestStatus("idle");
        setLatestMessage("");
      }
    },
    [activeSessionId, connected, ensureDbConversation, patchSessionMessages]
  );

  const onDataWizardAction = useCallback(
    (actionId) => {
      if (!fileAnalystContextRef.current?.fileId || !enabledToolsRef.current.file_analyst) return;
      if (!actionId) return;
      submitUserMessage("", { fileAnalystAction: actionId });
    },
    [submitUserMessage]
  );

  const handleCreateLandingPage = useCallback(
    async (opts) => {
      const force = opts?.force === true;
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
            id: makeMessageId(),
            role: "assistant",
            content:
              "📑 Add a message, run a tool, or attach a file first — then you can open **Preview in Canvas**.",
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
      landingPageVariantRef.current = "workspace";
      const titleHint =
        sessionsRef.current.find((x) => x.id === activeSessionIdRef.current)?.title || "Tunde Report";
      const cacheKey = canvasPageCacheKey(null, "landing", "workspace");

      if (!force) {
        const hit = canvasGeneratedHtmlRef.current[cacheKey];
        if (hit?.html?.trim()) {
          landingPendingFullHtmlRef.current = hit.html;
          setLandingStreamTick(0);
          setLandingStreaming(false);
          setCanvasView("landing");
          setCanvasLinkedMessageId(null);
          canvasLinkedMessageIdRef.current = null;
          setCanvasResearchBlock(null);
          setCanvasCodeBlock(null);
          setCanvasBusinessBlock(null);
          setLandingState({ html: hit.html, title: hit.title || titleHint, lastShareUrl: "" });
          setLandingOpen(true);
          setLandingBusy(false);
          return;
        }
      }

      landingPendingFullHtmlRef.current = "";
      setLandingStreamTick(0);
      setLandingStreaming(false);
      setCanvasView("landing");
      setCanvasLinkedMessageId(null);
      canvasLinkedMessageIdRef.current = null;
      setCanvasResearchBlock(null);
      setCanvasCodeBlock(null);
      setCanvasBusinessBlock(null);
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
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Landing page generate failed**\n\n${detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const data = JSON.parse(raw);
        const htmlOut = typeof data.html === "string" ? data.html : "";
        const titleOut = typeof data.title === "string" && data.title.trim() ? data.title.trim() : titleHint;
        canvasGeneratedHtmlRef.current[cacheKey] = { html: htmlOut, title: titleOut, kind: "workspace" };
        landingPendingFullHtmlRef.current = htmlOut;
        setLandingState((s) => ({
          ...s,
          title: titleOut,
          html: "",
          lastShareUrl: "",
        }));
        setLandingBusy(false);
        setLandingStreamTick((t) => t + 1);
        const sid = activeSessionIdRef.current;
        const convId = await ensureDbConversation(sid, {
          title: titleOut.slice(0, 512),
          tool_used: "landing",
        });
        if (convId && htmlOut.trim()) {
          const cid = await postDbCanvasPage({
            convId,
            messageId: "__workspace__",
            kind: "web_page",
            title: titleOut,
            htmlContent: htmlOut,
            toolType: "landing",
          });
          if (cid) landingCanvasDbIdRef.current = cid;
        }
      } catch {
        setLandingOpen(false);
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Landing page generate failed** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, ensureDbConversation, patchSessionMessages, session.userId]
  );

  const handleLandingCanvasRegenerate = useCallback(() => {
    const variant = landingPageVariantRef.current;
    const linked = canvasLinkedMessageIdRef.current;
    const key = canvasPageCacheKey(linked, "landing", variant);
    delete canvasGeneratedHtmlRef.current[key];
    if (variant === "workspace") {
      void handleCreateLandingPage({ force: true });
    } else if (lastDataExportRef.current?.block) {
      const { block, assistantMessageId } = lastDataExportRef.current;
      void exportDataAnalysisToCanvas(block, assistantMessageId, true);
    } else if (lastDocumentExportRef.current?.block) {
      const { block, assistantMessageId } = lastDocumentExportRef.current;
      void exportDocumentWriterToCanvas(block, assistantMessageId, true);
    }
  }, [exportDataAnalysisToCanvas, exportDocumentWriterToCanvas, handleCreateLandingPage]);

  const handleLandingShare = useCallback(async () => {
    const { html, title } = landingStateRef.current;
    if (!html?.trim()) return undefined;
    const result = await publishPage({
      userId: session.userId,
      title: title || "Tunde Report",
      html,
    });
    if (!result.ok) {
      patchSessionMessages(activeSessionIdRef.current, (m) => [
        ...m,
        {
          id: makeMessageId(),
          role: "assistant",
          content: `⚠️ **Publish failed**\n\n${result.detail}`,
          timestamp: new Date().toISOString(),
        },
      ]);
      return undefined;
    }
    const url = result.share_url || "";
    if (url) setLandingState((s) => ({ ...s, lastShareUrl: url }));
    return url || undefined;
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
      try {
        const gen = await generatePage({
          userId: session.userId,
          source: "workspace",
          context: ctx,
          title_hint: landingStateRef.current.title,
          existing_html: prev,
          revision_notes: notes,
        });
        if (!gen.ok) {
          patchSessionMessages(activeSessionIdRef.current, (m) => [
            ...m,
            {
              id: makeMessageId(),
              role: "assistant",
              content: `⚠️ **Page revision failed**\n\n${gen.detail}`,
              timestamp: new Date().toISOString(),
            },
          ]);
          return;
        }
        const nextHtml = gen.html || prev;
        const nextTitle =
          typeof gen.title === "string" && gen.title.trim()
            ? gen.title.trim()
            : landingStateRef.current.title;
        landingPendingFullHtmlRef.current = nextHtml;
        const linked = canvasLinkedMessageIdRef.current;
        const variant = landingPageVariantRef.current;
        const revKey = canvasPageCacheKey(linked, "landing", variant);
        canvasGeneratedHtmlRef.current[revKey] = {
          html: nextHtml,
          title: nextTitle,
          kind: `${variant}_revision`,
        };
        setLandingBusy(false);
        setLandingState((s) => ({
          ...s,
          title: gen.title || s.title,
          html: "",
        }));
        setLandingStreamTick((t) => t + 1);
        const toolT =
          variant === "data_export"
            ? "data_analyst"
            : variant === "document_export"
              ? "document_writer"
              : variant === "workspace"
                ? "landing"
                : "research";
        const kindOut = String(
          variant === "data_export" ? "data_export" : variant === "document_export" ? "document_export" : "web_page"
        ).slice(0, 64);
        const canvasDb = landingCanvasDbIdRef.current;
        if (canvasDb) {
          await putDbCanvasPage(canvasDb, {
            title: nextTitle,
            htmlContent: nextHtml,
            kind: `${variant}_revision`.slice(0, 64),
            toolType: toolT,
          });
        } else {
          const sid = activeSessionIdRef.current;
          const convId = await ensureDbConversation(sid, {
            title: nextTitle.slice(0, 512),
            tool_used: toolT,
          });
          if (convId && nextHtml.trim()) {
            const mid = linked || "__workspace__";
            const cid = await postDbCanvasPage({
              convId,
              messageId: mid,
              kind: kindOut,
              title: nextTitle,
              htmlContent: nextHtml,
              toolType: toolT,
            });
            if (cid) landingCanvasDbIdRef.current = cid;
          }
        }
      } catch {
        patchSessionMessages(activeSessionIdRef.current, (m) => [
          ...m,
          {
            id: makeMessageId(),
            role: "assistant",
            content: "⚠️ **Page revision failed** — could not reach the server.",
            timestamp: new Date().toISOString(),
          },
        ]);
      } finally {
        setLandingBusy(false);
      }
    },
    [connected, ensureDbConversation, patchSessionMessages, session.userId]
  );

  const retryLastUserPrompt = useCallback(() => {
    const t = (lastUserPromptRef.current || "").trim();
    if (!t || processing || !connected) return;
    submitUserMessage(t, { skipUserBubble: true });
  }, [connected, processing, submitUserMessage]);

  const closeCanvasPanel = useCallback(() => {
    setLandingOpen(false);
  }, []);

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
    setCanvasView("landing");
    setCanvasLinkedMessageId(null);
    canvasLinkedMessageIdRef.current = null;
    setCanvasResearchBlock(null);
    setCanvasCodeBlock(null);
    setCanvasBusinessBlock(null);
    setBusinessCanvasShareUrl("");
    setBusinessSimulateMessageId(null);
    setBusinessSimulateNotes("");
    canvasGeneratedHtmlRef.current = {};
    landingPageVariantRef.current = "workspace";
    lastDataExportRef.current = null;
    lastDocumentExportRef.current = null;
    landingCanvasDbIdRef.current = null;
    setSessions((ss) =>
      ss.map((s) => {
        if (s.id !== activeSessionId) return s;
        const keepDb =
          Boolean(s.dbConvId) || (isUuidLike(s.id) && !s.isLocalDraft);
        return {
          ...s,
          messages: [],
          ...(keepDb ? {} : { dbConvId: undefined }),
        };
      })
    );
    resetRunUi();
  };

  const clearActivity = () => {
    setLatestMessage("");
    setQcRejected(false);
    setQcReason("");
  };

  const newChat = () => {
    const id = `local_${makeId()}`;
    setImageGenWizard(null);
    setFileAnalystContext(null);
    setLandingOpen(false);
    setLandingState({ html: "", title: "Tunde Report", lastShareUrl: "" });
    landingPendingFullHtmlRef.current = "";
    setLandingStreamTick(0);
    setLandingStreaming(false);
    setCanvasView("landing");
    setCanvasLinkedMessageId(null);
    canvasLinkedMessageIdRef.current = null;
    setCanvasResearchBlock(null);
    setCanvasCodeBlock(null);
    setCanvasBusinessBlock(null);
    canvasGeneratedHtmlRef.current = {};
    landingPageVariantRef.current = "workspace";
    lastDataExportRef.current = null;
    lastDocumentExportRef.current = null;
    setSessions((ss) => [
      {
        id,
        title: "New chat",
        messages: [],
        isLocalDraft: true,
        messagesHydrated: true,
      },
      ...ss,
    ]);
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
          onSelectSession={async (id) => {
            await hydrateSessionMessages(id);
            setActiveSessionId(id);
            setView("chat");
            setMobileNavOpen(false);
          }}
          onNewChat={() => {
            newChat();
            setMobileNavOpen(false);
          }}
          onOpenTundeHub={() => {
            setTundeHubOpen(true);
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
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] bg-tunde-surface px-3 py-2.5 md:hidden">
          <button
            type="button"
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-sm text-slate-200"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            Menu
          </button>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm font-semibold text-violet-200"
            onClick={() => setTundeHubOpen(true)}
          >
            Hub
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
                  onClick={closeCanvasPanel}
                />
              ) : null}
              <div className="flex min-h-0 min-w-0 flex-1 flex-row">
                <div
                  className={
                    landingOpen
                      ? "flex min-h-0 min-w-0 flex-1 flex-col lg:max-w-[40%] lg:shrink-0 lg:basis-[40%]"
                      : "flex min-h-0 min-w-0 flex-1 flex-col"
                  }
                >
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
                    canvasOpen={landingOpen}
                    canvasView={canvasView}
                    canvasLinkedMessageId={canvasLinkedMessageId}
                    onCanvasChipFocus={() => {
                      if (!landingOpen) {
                        const st = landingStateRef.current;
                        const hasCanvasContent =
                          Boolean(canvasResearchBlock) ||
                          Boolean(canvasCodeBlock) ||
                          Boolean(canvasBusinessBlock) ||
                          Boolean((st.html || "").trim()) ||
                          Boolean((landingPendingFullHtmlRef.current || "").trim());
                        if (hasCanvasContent) setLandingOpen(true);
                      }
                      canvasPanelRef.current?.focus?.({ preventScroll: true });
                      canvasPanelRef.current?.scrollIntoView?.({
                        behavior: "smooth",
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                    onSend={(text) => submitUserMessage(text)}
                    onMathSolve={submitMathProblem}
                    onScienceSolve={submitScienceQuestion}
                    onChemistrySolve={submitChemistryQuestion}
                    onSpaceSolve={submitSpaceQuestion}
                    onHealthSolve={submitHealthQuestion}
                    onCodeSolve={submitCodeQuestion}
                    onTranslationSolve={submitTranslation}
                    onResearchSolve={submitResearchQuestion}
                    onBusinessSolve={submitBusinessQuestion}
                    onStudySolve={submitStudyTopic}
                    onDocumentWriterSolve={submitDocumentRequest}
                    onDataAnalystSolve={submitDataAnalysis}
                    onDataAnalystExportCanvas={exportDataAnalysisToCanvas}
                    onDocumentWriterExportCanvas={exportDocumentWriterToCanvas}
                    onCanvasCardOpen={onCanvasCardOpen}
                    onDataAnalystFollowUp={handleDataAnalystFollowUp}
                    onRetryLastPrompt={retryLastUserPrompt}
                    onBusinessAction={handleBusinessAction}
                  />
                </div>
                {landingOpen && canvasView === "business" ? (
                  <BusinessAnalysisCanvas
                    ref={canvasPanelRef}
                    open={landingOpen}
                    businessBlock={canvasBusinessBlock}
                    tabRequest={businessTabRequest}
                    onClose={closeCanvasPanel}
                    busy={landingBusy}
                    shareUrl={businessCanvasShareUrl}
                    onShare={handleBusinessShare}
                    onApplyRevision={handleBusinessCanvasRevision}
                  />
                ) : null}
                {landingOpen && canvasView !== "business" ? (
                  <LandingCanvasPanel
                    ref={canvasPanelRef}
                    open={landingOpen}
                    canvasView={canvasView}
                    researchBlock={canvasResearchBlock}
                    codeBlock={canvasCodeBlock}
                    canvasTitleOverride=""
                    canvasLinkedMessageId={canvasLinkedMessageId}
                    title={landingState.title}
                    html={landingState.html}
                    busy={landingBusy}
                    streaming={landingStreaming}
                    shareUrl={landingState.lastShareUrl}
                    onClose={closeCanvasPanel}
                    onShare={handleLandingShare}
                    onApplyRevision={handleLandingRevision}
                    onLandingCanvasRegenerate={handleLandingCanvasRegenerate}
                    onResearchPagesGenerate={runResearchPagesGenerate}
                    onResearchPagesRevision={runResearchPagesRevision}
                    getResearchCachedPreview={getResearchCachedPreview}
                    onInvalidateResearchPageCache={invalidateResearchPageCache}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      <BusinessSimulateModal
        open={Boolean(businessSimulateMessageId)}
        messageId={businessSimulateMessageId}
        sessionNotes={businessSimulateNotes}
        onClose={() => {
          setBusinessSimulateMessageId(null);
          setBusinessSimulateNotes("");
        }}
        backendBase={backendHttpBase()}
        onApplied={(data, mid) => {
          if (mid) applyBusinessSimulation(mid, data);
        }}
      />

      <TundeHub
        open={tundeHubOpen}
        onClose={() => setTundeHubOpen(false)}
        apiBase={backendHttpBase().replace(/\/$/, "")}
      />
    </div>
  );
}
