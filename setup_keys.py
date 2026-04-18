#!/usr/bin/env python3
"""
Interactive helper: save Google and GitHub OAuth client ID/secret into .env.

Run from the project folder:
    python setup_keys.py
"""

from __future__ import annotations

from pathlib import Path


ENV_FILENAME = ".env"

PROMPTS: list[tuple[str, str]] = [
    ("GOOGLE_CLIENT_ID", "Google Client ID"),
    ("GOOGLE_CLIENT_SECRET", "Google Client Secret"),
    ("GITHUB_CLIENT_ID", "GitHub Client ID"),
    ("GITHUB_CLIENT_SECRET", "GitHub Client Secret"),
]


def _assignment_key(line: str) -> str | None:
    """Return the env var name if this line is a KEY=value assignment (not a comment)."""
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    if "=" not in stripped:
        return None
    return stripped.split("=", 1)[0].strip()


def main() -> int:
    project_root = Path(__file__).resolve().parent
    env_path = project_root / ENV_FILENAME

    print()
    print("  " + "=" * 56)
    print("  OAuth keys setup")
    print("  " + "=" * 56)
    print()
    print("  This tool saves your Google and GitHub app credentials into")
    print(f"  the file: {env_path.name}")
    print()
    print("  Tip: You can find these in Google Cloud Console and GitHub")
    print("  Developer Settings. Leave a line empty to keep the current value.")
    print()

    new_values: dict[str, str] = {}
    for env_key, friendly in PROMPTS:
        try:
            raw = input(f"  Paste your {friendly}, then press Enter:\n  > ")
        except (EOFError, KeyboardInterrupt):
            print("\n  Cancelled. Nothing was saved.")
            return 130
        value = raw.strip()
        if value:
            new_values[env_key] = value
        else:
            print(f"  (Keeping existing {friendly} in {ENV_FILENAME}.)\n")

    if not new_values:
        print("  No new values were entered, so the file was not changed.")
        print("  All done.")
        return 0

    if not env_path.is_file():
        print(f"  No {ENV_FILENAME} file was found. Creating one with your keys.")
        body = "\n".join(f"{k}={v}" for k, v in new_values.items()) + "\n"
        env_path.write_text(body, encoding="utf-8")
        print()
        print("  " + "-" * 56)
        print("  Success — created", ENV_FILENAME, "with:")
        for k in new_values:
            print(f"    • {k}")
        print("  " + "-" * 56)
        print()
        return 0

    original = env_path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    line_ending = "\r\n" if "\r\n" in original else "\n"

    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        ak = _assignment_key(line)
        if ak is not None and ak in new_values:
            if line.endswith("\r\n"):
                end = "\r\n"
            elif line.endswith("\n"):
                end = "\n"
            else:
                end = ""
            out.append(f"{ak}={new_values[ak]}{end}")
            seen.add(ak)
        else:
            out.append(line)

    for key in new_values:
        if key not in seen:
            if out and not (out[-1].endswith("\n") or out[-1].endswith("\r\n")):
                out[-1] = out[-1] + line_ending
            out.append(f"{key}={new_values[key]}{line_ending}")

    env_path.write_text("".join(out), encoding="utf-8")

    updated = [k for k, _ in PROMPTS if k in new_values]
    print()
    print("  " + "-" * 56)
    print("  Success — your .env file was updated.")
    print()
    print("  These entries were set:")
    for k in updated:
        print(f"    • {k}")
    print("  " + "-" * 56)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
