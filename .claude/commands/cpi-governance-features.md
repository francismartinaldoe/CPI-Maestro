---
description: >
  Fetch and display CPI ART feature-level governance data for a release — ART list, status,
  owner, release, workstream, hierarchy gaps. Fast (~30s). No story-level fetch.
  Usage: /cpi-governance-features
         /cpi-governance-features RD08
         /cpi-governance-features RD10 out=C:\Users\<you>\Downloads
---

Fetch **CPI ART feature-level governance data** for the given release. No story compliance fetch — this is the fast path.

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
| release (first word, e.g. `RD08`) | all releases | Filter features by release label/version |
| `out=` | `C:\Users\{USERNAME}\Downloads` | Output folder for Excel |

If release provided, build label filter: `TGLRD{MM}.26` / `BGLRD{MM}.26` / `RD{MM}` labels.

```bash
date '+%Y%m%d_%H%M'
```
→ capture as **TIMESTAMP**

---

## STEP 2 — FETCH CPI ARTs

```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Feature AND labels = "INT-CPI" AND status not in (Obsolete, Cancelled) ORDER BY key ASC
fields: summary,status,assignee,fixVersions,labels,components,issuelinks
limit: 50 — paginate fully
```

Filter client-side by release if provided (check labels for TGLRD/BGLRD/RD pattern OR `fixVersions` name).

---

## STEP 3 — FETCH STREAM ARTs (parent features)

From issuelinks of fetched CPI ARTs, collect unique parent YOUR_JIRA_PROJECT keys (stream ARTs).
Fetch in one batch query if any found:
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND key in (<keys>)
fields: summary,status,assignee,labels,components
```

---

## STEP 4 — DISPLAY IN CHAT

Print header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CPI ART Feature View — {release or "All Releases"}
Generated: {today}   Features: {count}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Main table — one row per CPI ART:

| CPI ART | Summary | Stream ART | Workstream | Release | Status | Owner | CPI Section? |
|---|---|---|---|---|---|---|---|

CPI Section = ✅ if description contains `CPI Developer Section:`, else ⚠️ MISSING.

Flag any feature not assigned to CPI team as ⚠️ Not CPI-owned.

Hierarchy gaps: list CPI ARTs with no linked YOUR_JIRA_PROJECT stories as `⚠️ No stories linked`.

---

## STEP 5 — GENERATE EXCEL

Write temp Python to `%TEMP%\cpi_features_build.py`, run, delete.

Excel output: `{out}\{TIMESTAMP}_CPI_ART_Features_{release}.xlsx`

**Sheets:**
1. **Features** — full table from Step 4 with colour coding (status RAG)
2. **Hierarchy Gaps** — CPI ARTs with missing stories or missing Stream ART link
3. **Ownership Gaps** — features not assigned to CPI team

Print: `Excel: {filepath}`

---

## WHAT THIS DOES NOT DO

- Does NOT fetch story descriptions (use `/cpi-governance-stories` for that)
- Does NOT run 15-gate compliance check (use `/cpi-governance-stories`)
- Does NOT build the full 16-sheet workbook (use `/cpi-governance-workbook`)
