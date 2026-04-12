# Media standards (Telegram-facing)

This document defines **product-facing** specifications for creative and video tracks in the nested Telegram menus. Implementation status is called out explicitly.

---

## 1. Image generation (Creative Media Studio)

Styles map to internal prompt prefixes in `telegram_ux_menus._IMAGE_STYLE_PREFIX` when the operator completes a style pick and sends a **text brief**.

| Menu option | Intent | Prompt direction |
| ----------- | ------ | ---------------- |
| 🖼️ Photorealistic | Real-world lighting, materials, believable detail | Photorealistic, highly detailed, realistic lighting and materials. |
| 🖌️ Digital art | Illustration-forward, expressive | Digital illustration, expressive brushwork, gallery-quality color. |
| 📐 UI/UX concept | Product / screen concepts | UI/UX product concept, clean layout, modern design system. |
| 🏢 Architectural viz | Built environment, scale | Architectural visualization, accurate scale, materials, and environment. |

**Output:** PNG via the existing image pipeline (same technical path as legacy “draw …” chat triggers). **User-facing copy** does not name third-party hosts.

---

## 1b. Photo edit (reference image + instruction) — **active**

**Telegram (private chat):**

| Flow | Behavior |
| ---- | -------- |
| **Photo + caption** | Largest `photo[]` or an **image** `document` is downloaded via Bot API `getFile`; bytes are normalized (RGB, max side 1536px, PNG) then sent with the caption as the edit instruction to the configured image model (`GEMINI_IMAGE_MODEL`, same path as text-only generation but with an `inline_data` image part). |
| **Photo, then text** | If the user sends a photo **without** a caption, the bot stores the `file_id` and asks for the next **plain-text** instruction; the following text message triggers the same pipeline. |
| **Menu** | **Creative Media Studio → 📷 Edit my photo** sets UX state `expect_photo_for_edit`, then the user sends the photo (same rules as above). |

**Requirements:** `GEMINI_API_KEY`, `TELEGRAM_TOKEN`, and a model that returns **IMAGE** parts for multimodal input (default `gemini-2.5-flash-image` in `.env.example`). If the API returns text only, the user sees a generic failure hint (no raw provider errors in chat).

**Limits:** Downloads are capped at ~18 MB; very large originals are shrunk before the API call. **Escape hatch:** `/cancel_photo_edit` clears a waiting two-step edit.

**Code:** `telegram_chat_handler.py` (routing + pending), `telegram_pending_photo_edit.py`, `TelegramService.fetch_telegram_file_bytes`, `gemini_image_generation.generate_image_from_reference_bytes`.

---

## 2. Pro video generation (Veo — **active**)

Telegram **Pro Video Generation** uses Google **Veo** via the Gemini API (`predictLongRunning` + operation polling + download). Env: `GEMINI_API_KEY`, `GEMINI_VIDEO_MODEL` (default `veo-3.1-generate-preview`), optional `TUNDE_VEO_*` — see [`.env.example`](../.env.example).

### Operator flow

1. Tap **⏱️ 10 / 20 / 30 seconds** (`u:v:10` …).  
2. Send the **next message** as a plain-text **scene description** (subjects, action, setting, camera, optional dialogue/SFX).  
3. Wait — renders are **async** (often **minutes**); the bot sends an MP4 in chat (`sendVideo`, document fallback).  
4. **`/cancel_video`** clears a preset if you have not sent the scene text yet.

### Preset → pipeline (honest lengths)

Google’s API delivers **4 / 6 / 8** second **segments** per generation; **extension** adds about **7 seconds** per step at **720p**. Product tiers map as follows:

| Button | Pipeline | Approx. output length |
| ------ | --------- | --------------------- |
| **10s** | One Veo clip, `durationSeconds: "8"`, first-clip resolution from `TUNDE_VEO_FIRST_CLIP_RESOLUTION` (`720p` or `1080p`) | **~8 s** (tier label ≈10s) |
| **20s** | One **8 s** 720p clip + **two** chained extensions | **~22 s** |
| **30s** | One **8 s** 720p clip + **three** extensions | **~29 s** |

Tiers **20** and **30** always use **720p** for the base clip so **video-to-video extension** stays within [Google’s Veo rules](https://ai.google.dev/gemini-api/docs/video).

### Animate image

| Control | Status |
| ------- | ------ |
| 🔄 **Animate image** (`u:v:ani`) | **Roadmap** — image-to-video from a still is not wired in this build. |

Compliance: follow [security_and_legal_compliance.md](./security_and_legal_compliance.md) and [human_approval_gate.md](./human_approval_gate.md) for prompts involving real people, brands, or sensitive contexts.

**Code:** `gemini_veo_video.py`, `telegram_pending_video_generation.py`, `telegram_ux_menus.py` (`v:` callbacks), `telegram_chat_handler.py`, `TelegramService.send_video_to_chat`.

---

## 3. Voiceover synthesis (roadmap)

**Planned:** optional narration track aligned to video duration presets (10 / 20 / 30 s), with language and tone chosen after script approval. Not shipped in the current tree — see [roadmap.md](./roadmap.md).

---

## 4. PDF export

**Deep research delivery:** the report message includes **📄 PDF** and **📥 Export to PDF** (same underlying export). Professional PDF layout is described under reporter / post-task handlers in code; roadmap item [roadmap.md](./roadmap.md) tracks further productization.

---

## 5. Related UX doc

Button hierarchy and text-input handoff: [ux_framework.md](./ux_framework.md).
