"""
Persist the Telegram operator chat id on disk.

Bots cannot open a private chat by themselves. If ``MY_TELEGRAM_CHAT_ID`` is wrong or you never
messaged the bot, Telegram returns ``chat not found``. After you send ``/start`` (or any message)
to the bot, we save ``message.chat.id`` here and prefer it over env for outbound sends.
"""

from __future__ import annotations

from tunde_agent.config.settings import project_root

_DATA_DIR = project_root() / "data"
_FILE = _DATA_DIR / "telegram_operator_chat_id.txt"


def read_saved_operator_chat_id() -> str:
    if not _FILE.is_file():
        return ""
    try:
        return _FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def save_operator_chat_id(chat_id: str | int) -> None:
    cid = str(chat_id).strip()
    if not cid:
        return
    if read_saved_operator_chat_id() == cid:
        return
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(cid + "\n", encoding="utf-8")
    print(
        f"Telegram: saved operator chat_id to {_FILE} (use this value for MY_TELEGRAM_CHAT_ID if you prefer .env).",
        flush=True,
    )
