import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Map common aliases to highlight.js language ids (subset supported by default build). */
function normalizeHljsLanguage(lang) {
  let s = String(lang || "").trim().toLowerCase();
  if (s.includes("c++") || s === "cxx") {
    return "cpp";
  }
  s = s.replace(/#/g, "sharp");
  const map = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    kt: "kotlin",
    fs: "fsharp",
    cs: "csharp",
    cpp: "cpp",
    cxx: "cpp",
    cc: "cpp",
    h: "cpp",
    sh: "bash",
    zsh: "bash",
    yml: "yaml",
    md: "markdown",
    plaintext: "plaintext",
    text: "plaintext",
  };
  const k = map[s] || s;
  return k || "plaintext";
}

function languageBadgeClass(lang) {
  const l = String(lang || "").toLowerCase();
  if (l.includes("python")) return "border-sky-500/40 bg-sky-500/15 text-sky-200";
  if (l.includes("javascript") || l === "js") return "border-amber-400/45 bg-amber-500/15 text-amber-100";
  if (l.includes("typescript") || l === "ts") return "border-blue-500/45 bg-blue-600/20 text-blue-100";
  if (l.includes("rust")) return "border-orange-600/45 bg-orange-950/40 text-orange-100";
  if (l.includes("go")) return "border-cyan-500/40 bg-cyan-600/15 text-cyan-100";
  if (l.includes("java")) return "border-red-500/35 bg-red-950/35 text-red-100";
  if (l.includes("csharp") || l.includes("c#")) return "border-violet-500/40 bg-violet-950/35 text-violet-100";
  if (l.includes("cpp") || l.includes("c++") || l === "c") return "border-pink-500/35 bg-pink-950/30 text-pink-100";
  if (l.includes("ruby")) return "border-red-700/40 bg-red-950/40 text-red-100";
  if (l.includes("php")) return "border-indigo-500/40 bg-indigo-950/35 text-indigo-100";
  if (l.includes("swift")) return "border-orange-400/40 bg-orange-950/35 text-orange-50";
  if (l.includes("kotlin")) return "border-purple-500/40 bg-purple-950/35 text-purple-100";
  if (l.includes("bash") || l.includes("shell")) return "border-lime-500/35 bg-lime-950/25 text-lime-100";
  if (l.includes("sql")) return "border-yellow-600/35 bg-yellow-950/25 text-yellow-100";
  if (l.includes("html")) return "border-orange-500/35 bg-orange-950/25 text-orange-50";
  if (l.includes("css")) return "border-sky-400/35 bg-sky-950/25 text-sky-50";
  if (l.includes("json")) return "border-slate-400/35 bg-slate-800/50 text-slate-100";
  return "border-slate-500/35 bg-slate-800/60 text-slate-200";
}

function taskTypeLabel(tt) {
  const t = String(tt || "").toLowerCase();
  const labels = {
    write: "Write",
    explain: "Explain",
    debug: "Debug",
    review: "Review",
    convert: "Convert",
    test: "Test",
  };
  return labels[t] || (tt ? String(tt) : "Task");
}

/**
 * Syntax-highlighted code with line numbers, language / task / complexity badges, copy.
 * Requires highlight.js + atom-one-dark loaded from CDN on `window.hljs`.
 */
export default function CodeBlock({ code = "", language = "plaintext", taskType = "write", complexity = "" }) {
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const lines = String(code || "").split("\n");
  const hljsLang = normalizeHljsLanguage(language);

  useLayoutEffect(() => {
    const el = codeRef.current;
    const hljs = typeof window !== "undefined" ? window.hljs : null;
    if (!el) return;
    if (!hljs) {
      el.textContent = code;
      return;
    }
    el.textContent = code;
    el.className = `hljs language-${hljsLang}`;
    el.removeAttribute("data-highlighted");
    try {
      hljs.highlightElement(el);
    } catch {
      try {
        const r = hljs.highlightAuto(code);
        el.innerHTML = r.value;
        el.className = "hljs";
      } catch {
        el.textContent = code;
      }
    }
  }, [code, hljsLang]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [code]);

  const langDisplay = String(language || "plaintext").replace(/_/g, " ");

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700/70 bg-[#282c34] shadow-inner ring-1 ring-black/30">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700/80 bg-[#21252b] px-3 py-2">
        <span
          className={[
            "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            languageBadgeClass(language),
          ].join(" ")}
        >
          {langDisplay}
        </span>
        <span className="rounded-md border border-violet-500/35 bg-violet-950/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-100">
          {taskTypeLabel(taskType)}
        </span>
        {complexity && complexity !== "—" ? (
          <span className="rounded-md border border-purple-500/45 bg-purple-950/45 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-purple-100">
            {complexity}
          </span>
        ) : null}
        <button
          type="button"
          onClick={copy}
          className="ml-auto rounded-md border border-slate-600/80 bg-slate-800/90 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-slate-500 hover:bg-slate-700/90"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex max-h-[min(70vh,520px)] overflow-auto">
        <div
          className="shrink-0 select-none border-r border-slate-700/90 bg-[#21252b] py-3 pr-2 pl-3 text-right font-mono text-[11px] leading-[1.55] text-slate-500"
          aria-hidden
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="m-0 min-w-0 flex-1 overflow-x-auto p-3 font-mono text-[12px] leading-[1.55]">
          <code ref={codeRef} className="hljs language-plaintext block whitespace-pre text-left" />
        </pre>
      </div>
    </div>
  );
}
