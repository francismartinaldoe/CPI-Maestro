---
description: >
  Full CPI ART Governance Workbook — 16-sheet Excel combining feature hierarchy AND story
  compliance. Calls /cpi-governance-features + /cpi-governance-stories internally then
  assembles into one workbook. Slow (~2 min). Use for weekly/monthly governance reporting.
  Usage: /cpi-governance-workbook
         /cpi-governance-workbook RD08
         /cpi-governance-workbook RD08 out=C:\Users\<you>\Downloads
         /cpi-governance-workbook cache=true    ← reuse last JIRA fetch if < 4h old
---

Build the **full CPI ART Governance Workbook** — combines feature hierarchy + story compliance into one 16-sheet Excel. This is the full governance report used for weekly/monthly management reporting.

---

## STEP 0 — PRE-FLIGHT

Run in parallel:

```bash
python scripts/jira_auth_helper.py --silent
```
```bash
python -c "import openpyxl; print('ok')"
```
```bash
python -c "import os; print(os.path.exists('scripts/build_cpi_governance.py'))"
```

All must pass. On any failure:
- openpyxl missing → `pip install -r scripts/requirements.txt`
- build script missing → `git pull`
- JIRA auth → `python scripts/jira_auth_helper.py`

---

## STEP 1 — PARSE ARGUMENTS

From `$ARGUMENTS`:

| Arg | Default | Description |
|-----|---------|-------------|
| release (first word, e.g. `RD08`) | all releases | Scope filter — applied to both features and stories |
| `out=` | `C:\Users\{USERNAME}\Downloads\governance_report` | Output folder |
| `cache=true` | off | Skip JIRA fetch, reuse `_jira_data.json` if < 4h old |

```bash
date '+%Y%m%d_%H%M'
python -c "import os; print(os.environ.get('USERNAME', os.environ.get('USER','unknown')))"
python -c "import os; print(os.path.abspath('scripts'))"
```
→ capture **TIMESTAMP**, **USERNAME**, **SCRIPTS_DIR**

If `cache=true` and `_jira_data.json` exists and is < 4h old → skip Steps 2-3, go to Step 4.

---

## STEP 2 — FETCH ALL JIRA DATA

Run all 4 queries (same as `/cpi-governance`). Apply release filter client-side after fetching.

**Query 1 — CPI ARTs:**
```
jql: project = YOUR_JIRA_PROJECT AND issuetype = Feature AND labels = "INT-CPI" AND status not in (Obsolete, Cancelled) ORDER BY key ASC
fields: summary,status,assignee,fixVersions,labels,components,issuelinks,customfield_12740,customfield_10253,comment
paginate fully
```

**Query 2 — Stories (with descriptions for compliance):**
```
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND labels = Interface_Build AND resolution = Unresolved ORDER BY key ASC
fields: summary,status,assignee,fixVersions,labels,components,issuelinks,customfield_12740,customfield_10253,description,priority
paginate fully
```

**Query 3 — Stream ARTs** (derived from CPI ART issuelinks — same logic as `/cpi-governance`).

**Query 4 — Orphan candidates:**
```
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND resolution = Unresolved AND labels in (RICEFW, "INT-CPI", YOUR-TEAM-LABEL, Interface_Build, IF_Type_CPI) ORDER BY created DESC
fields: summary,status,assignee,fixVersions,labels,components,issuelinks
paginate fully
```

---

## STEP 3 — SAVE TO JSON

Write to `%TEMP%\cpi_gov_data.json`:
```json
{
  "timestamp": "<TIMESTAMP>",
  "today_iso": "<TODAY_ISO>",
  "release_filter": "<release or null>",
  "cpi_arts": [...],
  "stories": [...],
  "stream_arts": [...],
  "orphan_candidates": [...]
}
```

---

## STEP 4 — BUILD WORKBOOK

```bash
python "{SCRIPTS_DIR}\build_cpi_governance.py" \
  --data "%TEMP%\cpi_gov_data.json" \
  --out  "{out}" \
  --name "{TIMESTAMP}_CPI_ART_Governance_Workbook.xlsx" \
  --cleanup
```

Print script output verbatim. Show full traceback on error.

**Output sheets (16):**
1. Dashboard — KPI strip: total ARTs, stories, compliance %, expiring certs
2. MASTER_REPORT — all CPI ARTs with full metadata
3. Hierarchy Tree — Stream ART → CPI ART → YOUR_JIRA_PROJECT indented tree
4. Story Compliance Matrix — 15-gate RAG per story
5. Stream Summary — rollup per workstream
6. Action Required — RED stories + CRITICAL ARTs
7-12. Per-release sheets (RD05, RD07, RD08, RD10, RD11, TBD)
13. Intelligence Signals — ownership gaps, missing links, stale stories
14. Stream Action Register — open actions by workstream
15. Orphan Stories — YOUR_JIRA_PROJECT stories not linked to any CPI ART
16. Raw Data — all fetched JIRA data for audit trail

---

## STEP 5 — CONFIRM

```bash
ls "{out}" 2>/dev/null || dir "{out}"
```

Report filename and size. Print:
```
Workbook: {filepath}
Sheets: 16   CPI ARTs: {n}   Stories: {n}   Orphans: {n}
```

---

## RELATIONSHIP TO OTHER GOVERNANCE SKILLS

| Need | Use |
|------|-----|
| Quick feature list for a release | `/cpi-governance-features RD08` (~30s) |
| Story compliance for a release only | `/cpi-governance-stories RD08` (~90s) |
| Single story deep-check | `/cpi-story-check YOUR_JIRA_PROJECT-XXXX` |
| Full weekly governance report | `/cpi-governance-workbook` (~2min) ← this skill |
| Legacy full workbook (identical output) | `/cpi-governance` |
