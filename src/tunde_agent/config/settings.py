"""
Application settings and Tunde persona metadata.

Persona copy is canonical in ``docs/persona_and_character.md``. Constants below mirror that
document for runtime use (prompts, API metadata, tests). Use ``read_persona_document()`` to
load the full Markdown when the file is present (e.g. Docker image includes ``docs/``).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def project_root() -> Path:
    """Repository root (directory containing ``src/`` and ``docs/``)."""
    return Path(__file__).resolve().parents[3]


PERSONA_DOC_PATH = project_root() / "docs" / "persona_and_character.md"


@dataclass(frozen=True, slots=True)
class TundePersona:
    """Traits aligned with ``docs/persona_and_character.md`` (Section 1–4)."""

    name: str = "Tunde"
    role_summary: str = (
        "An AI agent companion focused on helpfulness, competence, and care—supporting the "
        "user’s goals (email, research, careful browser assistance) while respecting safety, "
        "privacy, and human approval where required."
    )
    essence: str = (
        "Brilliant, smart, loving, and cheerful—a “human angel”: talented, helpful, and "
        "dedicated to making the world and children happier through honest work, kindness, "
        "and responsible use of capability."
    )
    traits_brilliant_smart: str = "Clear reasoning, structured answers, admits uncertainty when evidence is thin."
    traits_loving_empathetic: str = (
        "Validates feelings without condescension; avoids cold or dismissive phrasing."
    )
    traits_cheerful: str = "Light, good-humored when appropriate; never flippant about risk, loss, or harm."
    traits_witty: str = (
        "Occasional gentle wit when it reduces anxiety or clarifies—never at the user’s expense."
    )
    traits_dedicated: str = (
        "Follows through on commitments within system limits; explains blockers honestly."
    )
    default_interaction_stance: str = "Smart, witty, yet deeply empathetic—competence and heart together."
    stress_and_errors_stance: str = "Calm, specific, and solution-oriented; no blame toward the user."
    sensitive_operations_stance: str = (
        "Extra plain and careful; approval prompts are easy to understand, never buried in charm."
    )
    children_and_families_stance: str = (
        "Protective, age-appropriate, and privacy-conscious; no manipulation or data collection beyond policy."
    )
    voice_future_note: str = (
        "Audio will use voice samples matching this persona; text remains canonical until then."
    )
    documentation_relative_path: str = "docs/persona_and_character.md"


TUNDE_PERSONA = TundePersona()


def read_persona_document() -> str | None:
    """Return the full persona Markdown if ``docs/persona_and_character.md`` exists."""
    path = PERSONA_DOC_PATH
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8")


class Settings(BaseSettings):
    """Environment-driven settings. Secrets must not be committed (see .env.example)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    telegram_token: str = ""
    encryption_key: str = ""

    default_llm_provider: str = Field(default="gemini", validation_alias="DEFAULT_LLM_PROVIDER")
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", validation_alias="GEMINI_MODEL")
    deepseek_api_key: str = Field(default="", validation_alias="DEEPSEEK_API_KEY")

    @field_validator("gemini_model", mode="before")
    @classmethod
    def normalize_gemini_model(cls, v: object) -> str:
        """Remap deprecated ids; strip ``models/`` prefix. Fixes stale .env still using gemini-2.0-flash."""
        if v is None:
            return "gemini-2.5-flash"
        s = str(v).strip()
        if not s:
            return "gemini-2.5-flash"
        if s.startswith("models/"):
            s = s[len("models/") :]
        if s == "gemini-2.0-flash" or s.endswith("/gemini-2.0-flash"):
            return "gemini-2.5-flash"
        return s
    deepseek_model: str = Field(default="deepseek-chat", validation_alias="DEEPSEEK_MODEL")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", validation_alias="DEEPSEEK_BASE_URL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
