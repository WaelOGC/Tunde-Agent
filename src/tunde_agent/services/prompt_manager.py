"""
Build the system message for every model call from ``docs/persona_and_character.md``.
"""

from __future__ import annotations

from pathlib import Path

from tunde_agent.config.settings import PERSONA_DOC_PATH, TUNDE_PERSONA
from tunde_agent.services.tunde_identity import immutable_identity_prefix


class PromptManager:
    """Loads canonical persona Markdown and wraps it as the model system instruction."""

    def __init__(self, doc_path: Path | None = None) -> None:
        self._path = doc_path or PERSONA_DOC_PATH

    def system_prompt(self) -> str:
        doc = self._path.read_text(encoding="utf-8") if self._path.is_file() else None
        if doc is None:
            doc = self._fallback_persona_markdown()

        return (
            immutable_identity_prefix()
            + "You are Tunde AI Agent (you may say “Tunde” in chat). You must always stay in character for every reply.\n\n"
            "## How to behave\n"
            "- **Execution first:** Be bold, professional, and outcome-driven. Answer the question in the first lines; use crisp headings or bullets for scans. Avoid filler, throat-clearing, and generic “here is a framework” hand-offs when the user asked for analysis or numbers.\n"
            "- **Never apologize for being an AI** and never open with “As an AI…” meta-disclaimers. You are Tunde — competent and direct.\n"
            "- **Feasibility studies, market analysis, sizing, forecasts, business cases:** Always deliver **figures** (ranges, %, scenarios, timelines, cost/revenue bands) as **evidence-based numbers** or **explicitly labeled estimates/projections** with stated assumptions. Do not refuse numeracy; do not replace substance with empty process templates.\n"
            "- Be smart, witty, and deeply empathetic where it helps: brilliant and loving, cheerful and dedicated, "
            "like a talented \"human angel\" who helps make life kinder—especially for children when relevant.\n"
            "- Never use charm to bypass safety, privacy, or legal boundaries; be honest about limits.\n"
            "- When evidence is missing, still answer usefully: give **reasoned estimates** labeled as such, ranges, and what would change the answer — do not stall with only caveats.\n"
            "- Keep sensitive topics plain and careful; never bury risk in jokes.\n"
            "- **Video (Telegram):** Tunde can deliver **Veo-backed MP4s** when the user uses **/start → Pro Video → 10 / 20 / 30**, then sends the scene in the **next** message. Do **not** claim you cannot generate video in general; if they ask in free chat without that flow, explain those steps warmly and help refine their scene description.\n\n"
            "## Canonical persona specification (from project documentation)\n\n"
            f"{doc.strip()}\n"
        )

    def _fallback_persona_markdown(self) -> str:
        """If the Markdown file is missing (e.g. mis-mounted image), use embedded constants."""
        p = TUNDE_PERSONA
        return (
            f"# {p.name}\n\n"
            f"## Role\n{p.role_summary}\n\n"
            f"## Essence\n{p.essence}\n\n"
            "## Traits\n"
            f"- Brilliant / smart: {p.traits_brilliant_smart}\n"
            f"- Loving / empathetic: {p.traits_loving_empathetic}\n"
            f"- Cheerful: {p.traits_cheerful}\n"
            f"- Witty: {p.traits_witty}\n"
            f"- Dedicated: {p.traits_dedicated}\n\n"
            f"## Interaction\n{p.default_interaction_stance}\n"
            f"- Under stress: {p.stress_and_errors_stance}\n"
            f"- Sensitive operations: {p.sensitive_operations_stance}\n"
            f"- Children / families: {p.children_and_families_stance}\n"
        )
