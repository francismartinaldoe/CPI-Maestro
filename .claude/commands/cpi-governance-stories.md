---
description: >
  Fetch story-level compliance data for INT-CPI YOUR_JIRA_PROJECT stories — runs the 15-gate template
  check per story and outputs a RAG compliance matrix by stream. Slow (~60-90s). Use after
  /cpi-governance-features to drill into story quality.
  Usage: /cpi-governance-stories
         /cpi-governance-stories RD08
         /cpi-governance-stories RD08 out=C:\Users\<you>\Downloads
---

Fetch **YOUR_JIRA_PROJECT story-level compliance data** for INT-CPI stories — 15-gate template check, RAG matrix by stream.

---

## STEP 0 — PRE-FLIGHT

```bash
python scripts/jira_auth_helper.py --silent
```
- Prints "Token still valid" → continue
- Refreshes silently → continue
- Fails → print: `❌ JIRA auth failed. Run: python scripts/jira_auth_helper.py`

---

## STEP 1 — PARSE ARGUMENTS

From `$ARGUMENTS`:

| Arg | Default | Description |
|-----|---------|-------------|
| release (first word, e.g. `RD08`) | all | Filter stories linked to CPI ARTs in scope |
| `out=` | `C:\Users\{USERNAME}\Downloads` | Output folder |

```bash
date '+%Y%m%d_%H%M'
```
→ capture as **TIMESTAMP**

---

## STEP 2 — FETCH STORIES

```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND labels = Interface_Build AND resolution = Unresolved ORDER BY key ASC
fields: summary,status,assignee,labels,components,priority,fixVersions,issuelinks,customfield_12740,description
limit: 50 — paginate fully
```

If release provided, also fetch CPI ARTs for that release (same filter as `/cpi-governance-features`) and keep only stories linked to those ARTs via `issuelinks`.

---

## STEP 3 — RUN 15-GATE COMPLIANCE CHECK

For each story run both gate sets:

**Metadata gates (8) — from Jira fields:**
| Gate | Check |
|------|-------|
| M1 | `labels` contains `IF_Type_CPI` |
| M2 | `labels` contains `RICEFW` |
| M3 | `labels` contains `Interface_Build` |
| M4 | `priority` is set |
| M5 | `fixVersions` / Version/Delivery is set |
| M6 | Sprint (`customfield_12740`) is set |
| M7 | Status is `Development Ready` |
| M8 | Component is set |

**Section gates (7+DoD) — from description:**
| Gate | Section keyword |
|------|----------------|
| S01 | `01  FUNCTIONAL BACKGROUND` |
| S02 | `02  WHY SAP CPI IS NEEDED` |
| S03 | `03  INTEGRATION PATTERN` |
| S04 | `04  DIRECTION & SYSTEMS INVOLVED` |
| S05 | `05  COMMUNICATION MODE` |
| S10 | `10  AUTHENTICATION & SECURITY` |
| S11 | `11  ERROR HANDLING MECHANISM` |
| DoD | `DEFINITION OF DONE` |

Score: ✅ = 1pt · ⚠️ N/A = 0.5pt · ❌ = 0pt
Band: ≥90% = 🟢 GREEN · 70–89% = 🟠 AMBER · <70% = 🔴 RED

---

## STEP 4 — DISPLAY IN CHAT

Header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CPI Story Compliance — {release or "All"}
Generated: {today}   Stories checked: {count}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Stream rollup table:**
| Stream | Stories | 🟢 Green | 🟠 Amber | 🔴 Red | Top Missing Sections |
|---|---|---|---|---|---|

**RED stories needing immediate action:**
| Story | Summary | Score | Top 3 missing gates |
|---|---|---|---|

---

## STEP 5 — GENERATE EXCEL

Write temp Python to `%TEMP%\cpi_stories_build.py`, run, delete.

Excel output: `{out}\{TIMESTAMP}_CPI_Story_Compliance_{release}.xlsx`

**Sheets:**
1. **Compliance Matrix** — one row per story, one column per gate, RAG cells
2. **Stream Summary** — rollup counts per stream
3. **Action Required** — RED stories only, sorted by score ascending, exact missing gates listed

Colour coding: ✅ `D5F5E3` · ⚠️ `FFF3CD` · ❌ `FFCCCC` · Header `1F4E79` (white text)

Print: `Excel: {filepath}`

---

## WHAT THIS DOES NOT DO

- Does NOT fetch CPI ART hierarchy (use `/cpi-governance-features`)
- Does NOT build the full 16-sheet workbook (use `/cpi-governance-workbook`)
