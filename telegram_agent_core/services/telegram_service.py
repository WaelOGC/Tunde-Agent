"""Telegram Bot API client (human approval + CAPTCHA handoff). Uses httpx only."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import httpx

from tunde_agent.config.settings import Settings, get_settings
from telegram_agent_core.services.telegram_photo_util import prepare_png_for_telegram_photo

logger = logging.getLogger(__name__)


class TelegramService:
    """sendMessage / sendPhoto / answerCallbackQuery against api.telegram.org."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def token(self) -> str:
        return (self._settings.telegram_token or "").strip()

    @property
    def chat_id(self) -> str:
        """
        Outbound chat for missions / approvals.

        Order: (1) ``data/telegram_operator_chat_id.txt`` if present (written when you message the bot),
        (2) env ``MY_TELEGRAM_CHAT_ID``. Not the DB RLS ``user_id``.
        """
        from telegram_agent_core.services.telegram_operator_chat import read_saved_operator_chat_id

        saved = read_saved_operator_chat_id()
        if saved:
            return saved
        return (self._settings.telegram_chat_id or "").strip()

    def _base_url(self) -> str:
        return f"https://api.telegram.org/bot{self.token}"

    def delete_webhook(self, *, drop_pending_updates: bool = True) -> bool:
        """
        Remove Bot API webhook so ``getUpdates`` polling works.

        Call at startup if using long polling; stray webhooks block updates.
        """
        if not self.token:
            logger.warning("delete_webhook skipped: TELEGRAM_TOKEN empty.")
            return False
        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(
                    f"{self._base_url()}/deleteWebhook",
                    json={"drop_pending_updates": drop_pending_updates},
                )
                body = r.json()
        except Exception as exc:
            logger.exception("deleteWebhook request failed: %s", exc)
            return False
        if not body.get("ok"):
            logger.error("deleteWebhook failed: %s", body.get("description", r.text[:300]))
            return False
        logger.info("Telegram deleteWebhook ok (drop_pending=%s).", drop_pending_updates)
        return True

    def _configured(self) -> bool:
        if not self.token or not self.chat_id:
            logger.debug("Telegram skipped: TELEGRAM_TOKEN or MY_TELEGRAM_CHAT_ID empty.")
            return False
        return True

    @staticmethod
    def _approval_reply_markup_json(request_id: uuid.UUID) -> str:
        """Inline Approve/Deny; ``callback_data`` is ``a:uuid`` / ``d:uuid`` (under 64 bytes)."""
        rid = str(request_id)
        return json.dumps(
            {
                "inline_keyboard": [
                    [
                        {"text": "✅ Approve", "callback_data": f"a:{rid}"},
                        {"text": "❌ Deny", "callback_data": f"d:{rid}"},
                    ]
                ]
            },
            separators=(",", ":"),
        )

    def send_approval_request(self, request_id: uuid.UUID, message: str) -> None:
        """Text message with inline Approve / Deny."""
        if not self._configured():
            return
        data = {
            "chat_id": self.chat_id,
            "text": message,
            "reply_markup": self._approval_reply_markup_json(request_id),
        }
        self._post_form("sendMessage", data)

    def send_document(
        self,
        doc_bytes: bytes,
        caption: str,
        *,
        filename: str = "attachment.png",
        mime: str = "image/png",
        request_id: uuid.UUID | None = None,
        caption_parse_mode: str | None = None,
    ) -> None:
        """Send a file as a document (works when ``sendPhoto`` rejects dimensions)."""
        if not self._configured():
            return
        cap = (caption or "")[:1024]
        data: dict[str, str] = {
            "chat_id": self.chat_id,
            "caption": cap,
        }
        if request_id is not None:
            data["reply_markup"] = self._approval_reply_markup_json(request_id)
        if caption_parse_mode:
            data["parse_mode"] = caption_parse_mode
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                f"{self._base_url()}/sendDocument",
                data=data,
                files={"document": (filename, doc_bytes, mime)},
            )
        self._raise_for_telegram(r, "sendDocument")

    def send_photo(
        self,
        photo_bytes: bytes,
        caption: str,
        *,
        filename: str = "photo.png",
        request_id: uuid.UUID | None = None,
        caption_parse_mode: str | None = None,
    ) -> None:
        """
        Send a PNG with caption. If ``request_id`` is set, attaches the same Approve/Deny keyboard as text approvals.

        Images are normalized for Telegram dimension rules; on ``PHOTO_INVALID_DIMENSIONS``, falls back to
        ``sendDocument``. Use ``caption_parse_mode='MarkdownV2'`` only when ``caption`` is fully escaped.
        """
        if not self._configured():
            return
        cap = (caption or "")[:1024]
        prepared = prepare_png_for_telegram_photo(bytes(photo_bytes))
        data: dict[str, str] = {
            "chat_id": self.chat_id,
            "caption": cap,
        }
        if request_id is not None:
            data["reply_markup"] = self._approval_reply_markup_json(request_id)
        if caption_parse_mode:
            data["parse_mode"] = caption_parse_mode
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                f"{self._base_url()}/sendPhoto",
                data=data,
                files={"photo": (filename, prepared, "image/png")},
            )
            try:
                body = r.json()
            except Exception:
                r.raise_for_status()
                return
            if body.get("ok"):
                logger.debug("Telegram sendPhoto ok")
                return
            desc = str(body.get("description", ""))
            logger.error("Telegram sendPhoto failed: %s", desc)
            if any(
                x in desc
                for x in ("PHOTO_INVALID_DIMENSIONS", "photo dimensions", "wrong file identifier")
            ):
                logger.info("Telegram sendPhoto retrying as sendDocument for %s", filename)
                self.send_document(
                    prepared,
                    cap,
                    filename=filename,
                    mime="image/png",
                    request_id=request_id,
                    caption_parse_mode=caption_parse_mode,
                )
                return
            if "chat not found" in desc.lower():
                logger.error(
                    "Telegram fix: open your bot in Telegram and send /start once, then retry. "
                    "Or set MY_TELEGRAM_CHAT_ID to your numeric user id (from @userinfobot)."
                )

    def send_captcha_image(self, photo_bytes: bytes, url: str) -> None:
        """Send CAPTCHA screenshot to the operator chat."""
        self.send_photo(photo_bytes, f"CAPTCHA screenshot — {url}", filename="captcha.png")

    def send_text(
        self,
        text: str,
        *,
        parse_mode: str | None = None,
        reply_markup: str | None = None,
    ) -> None:
        if not self._configured():
            return
        payload: dict[str, str] = {"chat_id": self.chat_id, "text": text[:4096]}
        if parse_mode:
            payload["parse_mode"] = parse_mode
        if reply_markup:
            payload["reply_markup"] = reply_markup
        self._post_form("sendMessage", payload)

    def send_text_chunks(self, text: str, *, max_len: int = 4096, parse_mode: str | None = None) -> None:
        """Send long text as multiple Telegram messages (plain or same parse_mode per chunk)."""
        if not self._configured() or not text:
            return
        t = text.strip()
        for i in range(0, len(t), max_len):
            self.send_text(t[i : i + max_len], parse_mode=parse_mode)

    def send_markdown_v2(
        self,
        text: str,
        *,
        reply_markup_json: str | None = None,
    ) -> None:
        """
        Send MarkdownV2 message(s); splits safely for the 4096 limit.

        Optional ``reply_markup_json`` is attached only to the **last** chunk (e.g. inline URL button).
        """
        if not self._configured() or not text:
            return
        from telegram_agent_core.services.telegram_markdown_v2 import split_markdown_v2_message

        chunks = split_markdown_v2_message(text.strip(), 4096)
        for i, chunk in enumerate(chunks):
            last = i == len(chunks) - 1
            self.send_text(
                chunk,
                parse_mode="MarkdownV2",
                reply_markup=reply_markup_json if last else None,
            )

    def send_html(
        self,
        text: str,
        *,
        reply_markup_json: str | None = None,
    ) -> None:
        """
        Send HTML message(s) (``parse_mode=HTML``); splits for the 4096 limit.

        Prefer this for mission teasers so ``<a href>`` CTAs render as tappable links in all clients.
        """
        if not self._configured() or not text:
            return
        from telegram_agent_core.services.telegram_markdown_v2 import split_html_message

        chunks = split_html_message(text.strip(), 4096)
        for i, chunk in enumerate(chunks):
            last = i == len(chunks) - 1
            markup = reply_markup_json if last else None
            payload: dict[str, str] = {
                "chat_id": self.chat_id,
                "text": chunk[:4096],
                "parse_mode": "HTML",
            }
            if markup:
                payload["reply_markup"] = markup
            ok, desc = self._post_form_result("sendMessage", payload)
            if not ok and markup:
                logger.warning(
                    "Telegram sendMessage failed with inline keyboard; retrying without reply_markup: %s",
                    desc[:400],
                )
                payload.pop("reply_markup", None)
                self._post_form_result("sendMessage", payload)

    def answer_callback_query(
        self,
        callback_query_id: str,
        *,
        text: str | None = None,
        url: str | None = None,
    ) -> None:
        if not self.token:
            return
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if text is not None:
            payload["text"] = text[:200]
            payload["show_alert"] = False
        if url:
            payload["url"] = str(url).strip()[:2048]
        with httpx.Client(timeout=30.0) as client:
            r = client.post(f"{self._base_url()}/answerCallbackQuery", json=payload)
        self._raise_for_telegram(r, "answerCallbackQuery")

    def _post_form_result(self, method: str, data: dict[str, str]) -> tuple[bool, str]:
        """Return ``(ok, description)`` for Bot API JSON responses."""
        if not self.token:
            return False, "TELEGRAM_TOKEN empty"
        with httpx.Client(timeout=30.0) as client:
            r = client.post(f"{self._base_url()}/{method}", data=data)
        try:
            body = r.json()
        except Exception:
            logger.error("Telegram %s: non-JSON response status=%s", method, r.status_code)
            return False, r.text[:400]
        if body.get("ok"):
            logger.debug("Telegram %s ok", method)
            return True, ""
        desc = str(body.get("description", r.text))
        logger.error("Telegram %s failed: %s", method, desc)
        if "chat not found" in desc.lower():
            logger.error(
                "Telegram fix: open your bot in Telegram and send /start once, then retry. "
                "Or set MY_TELEGRAM_CHAT_ID to your numeric user id (from @userinfobot)."
            )
        return False, desc

    def _post_form(self, method: str, data: dict[str, str]) -> None:
        self._post_form_result(method, data)

    @staticmethod
    def _raise_for_telegram(response: httpx.Response, method: str) -> None:
        try:
            body = response.json()
        except Exception:
            response.raise_for_status()
            logger.warning("Telegram %s: non-JSON response status=%s", method, response.status_code)
            return
        if not body.get("ok"):
            desc = body.get("description", response.text)
            logger.error("Telegram %s failed: %s", method, desc)
            if "chat not found" in str(desc).lower():
                logger.error(
                    "Telegram fix: open your bot in Telegram and send /start once, then retry. "
                    "Or set MY_TELEGRAM_CHAT_ID to your numeric user id (from @userinfobot)."
                )
            return
        logger.debug("Telegram %s ok", method)

    def edit_message_html_in_chat(
        self,
        chat_id: str | int,
        message_id: int,
        text: str,
        *,
        reply_markup_json: str | None = None,
    ) -> tuple[bool, str]:
        """
        ``editMessageText`` with ``parse_mode=HTML`` for nested menu navigation.

        Returns ``(ok, description)`` so callers can fall back to ``sendMessage`` if the message
        is no longer editable.
        """
        if not self.token:
            return False, "TELEGRAM_TOKEN empty"
        data: dict[str, str] = {
            "chat_id": str(chat_id).strip(),
            "message_id": str(int(message_id)),
            "text": (text or "")[:4096],
            "parse_mode": "HTML",
        }
        if reply_markup_json:
            data["reply_markup"] = reply_markup_json
        return self._post_form_result("editMessageText", data)

    def fetch_telegram_file_bytes(self, file_id: str) -> tuple[bytes, str] | None:
        """
        Resolve a Bot API ``file_id`` via ``getFile`` and download the file.

        Returns ``(raw_bytes, mime_guess)`` or ``None`` on failure. MIME is inferred from the path
        extension (Telegram does not always send ``mime_type`` on ``getFile``).
        """
        if not self.token:
            return None
        fid = (file_id or "").strip()
        if not fid:
            return None
        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.get(f"{self._base_url()}/getFile", params={"file_id": fid})
                body = r.json()
        except Exception as exc:
            logger.warning("Telegram getFile failed: %s", exc)
            return None
        if not body.get("ok"):
            logger.warning("Telegram getFile not ok: %s", body.get("description", body))
            return None
        res = body.get("result") or {}
        path = res.get("file_path")
        if not isinstance(path, str) or not path.strip():
            return None
        path = path.strip()
        lower = path.lower()
        if lower.endswith(".png"):
            mime = "image/png"
        elif lower.endswith(".webp"):
            mime = "image/webp"
        elif lower.endswith(".gif"):
            mime = "image/gif"
        else:
            mime = "image/jpeg"
        url = f"https://api.telegram.org/file/bot{self.token}/{path}"
        try:
            with httpx.Client(timeout=120.0) as client:
                dr = client.get(url)
                dr.raise_for_status()
                return dr.content, mime
        except Exception as exc:
            logger.warning("Telegram file download failed: %s", exc)
            return None

    def send_message_to_chat(
        self,
        chat_id: str | int,
        text: str,
        *,
        reply_markup_json: str | None = None,
        parse_mode: str | None = None,
    ) -> bool:
        """sendMessage to an explicit chat (e.g. right after user messages the bot)."""
        if not self.token:
            return False
        cid = str(chat_id).strip()
        if not cid:
            return False
        payload: dict[str, str] = {"chat_id": cid, "text": text[:4096]}
        if parse_mode:
            payload["parse_mode"] = parse_mode
        if reply_markup_json:
            payload["reply_markup"] = reply_markup_json
        self._post_form("sendMessage", payload)
        return True

    def send_video_to_chat(
        self,
        chat_id: str | int,
        video_bytes: bytes,
        caption: str = "",
        *,
        filename: str = "tunde_video.mp4",
    ) -> None:
        """Send an MP4 as ``sendVideo`` (falls back to ``sendDocument`` if the API rejects the upload)."""
        if not self.token:
            return
        cid = str(chat_id).strip()
        if not cid:
            return
        cap = (caption or "")[:1024]
        data: dict[str, str] = {"chat_id": cid, "caption": cap}
        with httpx.Client(timeout=300.0) as client:
            r = client.post(
                f"{self._base_url()}/sendVideo",
                data=data,
                files={"video": (filename, bytes(video_bytes), "video/mp4")},
            )
        try:
            body = r.json()
        except Exception:
            r.raise_for_status()
            return
        if body.get("ok"):
            return
        desc = str(body.get("description", ""))
        logger.warning("Telegram sendVideo failed (%s); retrying as document.", desc[:200])
        self.send_document_to_chat(
            cid,
            video_bytes,
            cap or "Video (MP4)",
            filename=filename,
            mime="video/mp4",
        )

    def send_photo_to_chat(
        self,
        chat_id: str | int,
        photo_bytes: bytes,
        caption: str = "",
        *,
        filename: str = "tunde_image.png",
    ) -> None:
        """Send a PNG to a specific chat (conversational image generation)."""
        if not self.token:
            return
        cid = str(chat_id).strip()
        if not cid:
            return
        cap = (caption or "")[:1024]
        prepared = prepare_png_for_telegram_photo(bytes(photo_bytes))
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                f"{self._base_url()}/sendPhoto",
                data={"chat_id": cid, "caption": cap},
                files={"photo": (filename, prepared, "image/png")},
            )
        self._raise_for_telegram(r, "sendPhoto")

    def send_document_to_chat(
        self,
        chat_id: str | int,
        doc_bytes: bytes,
        caption: str,
        *,
        filename: str = "document.bin",
        mime: str = "application/octet-stream",
    ) -> None:
        """Send a file document to a specific chat (post-report PDF, DOCX, CSV, HTML)."""
        if not self.token:
            return
        cid = str(chat_id).strip()
        if not cid:
            return
        cap = (caption or "")[:1024]
        data: dict[str, str] = {"chat_id": cid, "caption": cap}
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                f"{self._base_url()}/sendDocument",
                data=data,
                files={"document": (filename, bytes(doc_bytes), mime)},
            )
        self._raise_for_telegram(r, "sendDocument")

    def verify_operator_chat(self) -> bool:
        """Call getChat for the resolved operator id; False if missing or Telegram rejects."""
        cid = self.chat_id
        if not cid or not self.token:
            return False
        try:
            with httpx.Client(timeout=15.0) as client:
                r = client.get(f"{self._base_url()}/getChat", params={"chat_id": cid})
                body = r.json()
        except Exception as exc:
            logger.warning("Telegram getChat failed: %s", exc)
            return False
        if not body.get("ok"):
            logger.warning("Telegram getChat not ok: %s", body.get("description", r.text[:200]))
            return False
        return True
