"""Send professional report summaries via SMTP (e.g. reports@tundeai.com)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from tunde_agent.config.settings import Settings

logger = logging.getLogger(__name__)


class ReportEmailError(Exception):
    """SMTP or configuration failure."""


def smtp_configured(settings: Settings) -> bool:
    return bool((settings.smtp_host or "").strip() and (settings.smtp_user or "").strip())


def send_report_summary_email(
    settings: Settings,
    *,
    to_email: str,
    subject: str,
    summary_plain: str,
    report_url: str,
    pdf_bytes: bytes | None = None,
    pdf_filename: str = "tunde-report.pdf",
) -> None:
    """
    Send plain-text summary + report link; optional PDF attachment.

    ``REPORT_FROM_EMAIL`` defaults to reports@tundeai.com; SMTP credentials come from .env.
    """
    to_addr = (to_email or "").strip()
    if not to_addr:
        raise ReportEmailError("Recipient email is empty.")

    if not smtp_configured(settings):
        raise ReportEmailError("SMTP is not configured (set SMTP_HOST and SMTP_USER).")

    from_addr = (settings.report_from_email or "reports@tundeai.com").strip()
    pwd = (settings.smtp_password or "").strip()
    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)

    body_lines = [
        "Hello,",
        "",
        "Here is your Tunde AI Agent report summary.",
        "",
        summary_plain.strip()[:12_000],
        "",
        "Full interactive report:",
        (report_url or "").strip() or "(link unavailable — open from Telegram)",
        "",
        "— Tunde AI Agent",
    ]
    body = "\n".join(body_lines)

    msg = EmailMessage()
    msg["Subject"] = subject[:200]
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body)
    if pdf_bytes and len(pdf_bytes) > 50:
        msg.add_attachment(
            pdf_bytes,
            maintype="application",
            subtype="pdf",
            filename=pdf_filename[:120],
        )

    try:
        with smtplib.SMTP(host, port, timeout=45) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if pwd:
                smtp.login(settings.smtp_user.strip(), pwd)
            smtp.send_message(msg)
    except Exception as exc:
        logger.exception("SMTP send failed to=%s", to_addr[:80])
        raise ReportEmailError(f"Could not send email: {exc!s}") from exc


def send_report_to_recipients(
    settings: Settings,
    *,
    to_emails: list[str],
    subject: str,
    summary_plain: str,
    report_url: str,
    pdf_bytes: bytes | None = None,
) -> None:
    """One message with multiple To: addresses (visible to all recipients)."""
    cleaned = [x.strip() for x in to_emails if x and str(x).strip()]
    if not cleaned:
        raise ReportEmailError("No valid recipient addresses.")
    if not smtp_configured(settings):
        raise ReportEmailError("SMTP is not configured (set SMTP_HOST and SMTP_USER).")

    from_addr = (settings.report_from_email or "reports@tundeai.com").strip()
    pwd = (settings.smtp_password or "").strip()
    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)

    body_lines = [
        "Hello,",
        "",
        "Here is your Tunde AI Agent report summary.",
        "",
        summary_plain.strip()[:12_000],
        "",
        "Full interactive report:",
        (report_url or "").strip() or "(link unavailable)",
        "",
        "— Tunde AI Agent",
    ]
    body = "\n".join(body_lines)

    msg = EmailMessage()
    msg["Subject"] = subject[:200]
    msg["From"] = from_addr
    msg["To"] = ", ".join(cleaned)
    msg.set_content(body)
    if pdf_bytes and len(pdf_bytes) > 50:
        msg.add_attachment(
            pdf_bytes,
            maintype="application",
            subtype="pdf",
            filename="tunde-report.pdf",
        )

    try:
        with smtplib.SMTP(host, port, timeout=120) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if pwd:
                smtp.login(settings.smtp_user.strip(), pwd)
            smtp.send_message(msg)
    except Exception as exc:
        logger.exception("SMTP bulk send failed recipients=%s", len(cleaned))
        raise ReportEmailError(f"Could not send email: {exc!s}") from exc
