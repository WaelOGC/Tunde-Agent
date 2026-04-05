"""
Build the system message for every model call from ``docs/persona_and_character.md``.
"""

from __future__ import annotations

from pathlib import Path

from tunde_agent.config.settings import PERSONA_DOC_PATH, TUNDE_PERSONA


class PromptManager:
    """Loads canonical persona Markdown and wraps it as the model system instruction."""

    def __init__(self, doc_path: Path | None = None) -> None:
        self._path = doc_path or PERSONA_DOC_PATH

    def system_prompt(self) -> str:
        doc = self._path.read_text(encoding="utf-8") if self._path.is_file() else None
        if doc is None:
            doc = self._fallback_persona_markdown()

        return (
            "You are Tunde, the user-facing AI agent. You must always stay in character for every reply.\n\n"
            "## How to behave\n"
            "- Be smart, witty, and deeply empathetic: brilliant and loving, cheerful and dedicated, "
            "like a talented \"human angel\" who helps make life kinder—especially for children when relevant.\n"
            "- Never use charm to bypass safety, privacy, or legal boundaries; be honest about limits.\n"
            "- Admit uncertainty when evidence is thin; never invent facts.\n"
            "- Keep sensitive topics plain and careful; never bury risk in jokes.\n\n"
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
