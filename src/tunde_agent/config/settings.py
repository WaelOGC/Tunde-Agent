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

from pydantic import AliasChoices, Field, field_validator
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
    telegram_token: str = Field(default="", validation_alias="TELEGRAM_TOKEN")
    telegram_chat_id: str = Field(default="", validation_alias="MY_TELEGRAM_CHAT_ID")
    encryption_key: str = ""

    default_llm_provider: str = Field(default="gemini", validation_alias="DEFAULT_LLM_PROVIDER")
    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", validation_alias="GEMINI_MODEL")
    gemini_image_model: str = Field(
        default="gemini-2.5-flash-image",
        validation_alias="GEMINI_IMAGE_MODEL",
        description="Model id for native Gemini image generation (generateContent + responseModalities IMAGE).",
    )
    deepseek_api_key: str = Field(default="", validation_alias="DEEPSEEK_API_KEY")
    deepseek_model: str = Field(default="deepseek-chat", validation_alias="DEEPSEEK_MODEL")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", validation_alias="DEEPSEEK_BASE_URL")

    # Research missions: final report language (en or ar) + optional multilingual SERP override.
    research_output_language: str = Field(default="en", validation_alias="TUNDE_RESEARCH_OUTPUT_LANG")
    research_search_locales: str = Field(
        default="",
        validation_alias="TUNDE_RESEARCH_SEARCH_LOCALES",
        description="Optional comma-separated hl:gl pairs, e.g. en:US,zh-CN:cn,ar:SA (max first 3 used).",
    )

    # Public origin for links to ``/reports/view/{id}`` (scheme + host[:port] only; no path).
    # ``REPORT_PUBLIC_BASE_URL`` is a supported alias for ``TUNDE_PUBLIC_BASE_URL``. If empty, missions
    # default to http://localhost:8000 (fine locally; set HTTPS in production for Telegram).
    public_base_url: str = Field(
        default="",
        validation_alias=AliasChoices("TUNDE_PUBLIC_BASE_URL", "REPORT_PUBLIC_BASE_URL"),
    )

    # Optional HTTP SERP APIs (rotation: Google CSE → Serper → Riley). Browser SERP is fallback.
    google_search_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GOOGLE_SEARCH_API_KEY", "SEARCH_API_KEY"),
    )
    google_custom_search_cx: str = Field(
        default="",
        validation_alias=AliasChoices(
            "GOOGLE_CUSTOM_SEARCH_CX",
            "GOOGLE_SEARCH_ENGINE_ID",
            "GOOGLE_CX",
        ),
    )
    serper_api_key: str = Field(default="", validation_alias="SERPER_API_KEY")
    riley_api_key: str = Field(default="", validation_alias="RILEY_API_KEY")
    riley_search_api_url: str = Field(
        default="",
        validation_alias="RILEY_SEARCH_API_URL",
        description="POST JSON search endpoint when using RILEY_API_KEY.",
    )

    # Outbound report email (SMTP). From-address is typically reports@tundeai.com on your domain.
    smtp_host: str = Field(default="", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str = Field(default="", validation_alias="SMTP_USER")
    smtp_password: str = Field(default="", validation_alias="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(default=True, validation_alias="SMTP_USE_TLS")
    report_from_email: str = Field(
        default="reports@tundeai.com",
        validation_alias="REPORT_FROM_EMAIL",
    )
    report_email_to: str = Field(
        default="",
        validation_alias=AliasChoices("REPORT_EMAIL_TO", "TUNDE_REPORT_EMAIL_TO"),
        description="Default recipient for “Send to Email” post-report action.",
    )

    @field_validator("smtp_use_tls", mode="before")
    @classmethod
    def parse_smtp_use_tls(cls, v: object) -> bool:
        if isinstance(v, bool):
            return v
        s = str(v).strip().lower()
        if s in ("0", "false", "no", "off"):
            return False
        return True

    @field_validator("gemini_image_model", mode="before")
    @classmethod
    def normalize_gemini_image_model(cls, v: object) -> str:
        if v is None:
            return "gemini-2.5-flash-image"
        s = str(v).strip()
        if not s:
            return "gemini-2.5-flash-image"
        if s.startswith("models/"):
            s = s[len("models/") :]
        return s

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

    @field_validator("telegram_token", mode="before")
    @classmethod
    def strip_telegram_token(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("telegram_chat_id", mode="before")
    @classmethod
    def strip_telegram_chat_id(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
