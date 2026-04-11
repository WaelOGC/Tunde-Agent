# Research language and search locales

How to control **(A)** the language of the **written mission report** and **(B)** where **web search** looks for sources. Copy variables from [`.env.example`](../.env.example) into your `.env`.

Related: [current_implementation.md](./current_implementation.md) (mission flow), [features.md](./features.md) §7.

---

## A. Report language — `TUNDE_RESEARCH_OUTPUT_LANG`

**What it is:** The default language for the **final report text** (summary, insights, and similar fields) when you start a mission **without** passing `output_language` in `POST /mission/start`.

**What to put:** Use **`en`** for English or **`ar`** for Arabic. These are the values the prompts treat in a first-class way.

**Override per mission:** In the JSON body of `POST /mission/start`, you can send `"output_language": "ar"` or `"en"` for that run only.

---

## B. Where search looks — `TUNDE_RESEARCH_SEARCH_LOCALES`

**What it is:** Optional list that steers **search** (finding URLs) toward certain **language + region** combinations, using pairs written as **`language:region`**.

**Examples (European and others):**

| You want more results shaped like… | Example pair |
| ---------------------------------- | -------------- |
| German / Germany | `de:DE` |
| French / France | `fr:FR` |
| Spanish / Spain | `es:ES` |
| Italian / Italy | `it:IT` |
| English / UK | `en:GB` |
| English / US | `en:US` |
| Arabic / Saudi Arabia | `ar:SA` |

Put several pairs in **one line**, separated by **commas**, no spaces required (spaces after commas are fine):

`en:GB,de:DE,fr:FR`

**Rules:**

1. The app uses **at most three** pairs (the first three valid ones).
2. Your list is used only if there are **at least two** valid pairs. If you only set one pair, the app **ignores** this variable and picks locales automatically from the topic and report language instead.

**Important:** This setting changes **which pages are found**, not the same thing as “write the whole report in German.” For report wording, see section A.

---

## Quick reference

| Variable | Controls | Typical values |
| -------- | -------- | ---------------- |
| `TUNDE_RESEARCH_OUTPUT_LANG` | Default **report** language | `en`, `ar` |
| `TUNDE_RESEARCH_SEARCH_LOCALES` | **Search** language/region bias | `hl:gl` list, 2–3 pairs, e.g. `en:US,de:DE,fr:FR` |

---

## Summary in one sentence

**Set `TUNDE_RESEARCH_OUTPUT_LANG` for English or Arabic reports; set `TUNDE_RESEARCH_SEARCH_LOCALES` (two or three `hl:gl` pairs) when you want search to favor specific countries and languages—including European ones—for finding sources.**
