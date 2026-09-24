---
description: >
  Check whether INT-CPI YOUR_JIRA_PROJECT stories follow the mandatory 13-section template defined
  in YOUR_JIRA_PROJECT-7383. Checks at feature level — all streams or a specific release. Produces
  a RAG compliance table per story with exact missing/NA sections and MUST-HAVE attribute gaps.
  Usage: /cpi-story-format-check
         /cpi-story-format-check RD08
         /cpi-story-format-check YOUR_JIRA_PROJECT-7490
         /cpi-story-format-check stream=DE&R
         /cpi-story-format-check RD08 out=C:\Users\<you>\Downloads
---

Check **INT-CPI YOUR_JIRA_PROJECT stories** against the mandatory template defined in YOUR_JIRA_PROJECT-7383. Operates at feature level across all streams (or filtered by release/stream).

---

## EXEMPLARY STORY

Reference: **YOUR_JIRA_PROJECT-7383** — the canonical template all INT-CPI stories must follow.

---

## STEP 0 — PRE-FLIGHT

```bash
python scripts/jira_auth_helper.py --silent
```
Fails → `❌ JIRA auth failed. Run: python scripts/jira_auth_helper.py`

---

## STEP 1 — PARSE ARGUMENTS

From `$ARGUMENTS`:

| Arg | Default | Description |
|-----|---------|-------------|
| release (e.g. `RD08`) | all | Filter by TGLRD/BGLRD label or Version/Delivery |
| `YOUR_JIRA_PROJECT-XXXX` | — | Check a single story only |
| `stream=` | all | Filter by workstream label (e.g. `stream=DE&R`) |
| `out=` | `C:\Users\{USERNAME}\Downloads` | Excel output folder |

```bash
date '+%Y%m%d_%H%M'
```
→ **TIMESTAMP**

---

## STEP 2 — FETCH STORIES

**If single story (YOUR_JIRA_PROJECT-XXXX given):**
```
tool: jira_get_issue
issue_key: YOUR_JIRA_PROJECT-XXXX
```
Run compliance check on that one story only, skip to Step 4.

**If feature/release/stream scope:**

Query 1 — CPI ARTs in scope:
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Feature AND labels = "INT-CPI" AND status not in (Obsolete, Cancelled) ORDER BY key ASC
limit: 50 — paginate fully
```
Filter client-side for release/stream if provided.

Query 2 — Linked YOUR_JIRA_PROJECT stories:
For each CPI ART, extract linked YOUR_JIRA_PROJECT story keys from `issuelinks`.
Then fetch all stories in one batch:
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND key in (<keys>) ORDER BY key ASC
fields: summary,status,assignee,labels,components,priority,fixVersions,issuelinks,customfield_12740,description
limit: 50 — paginate fully
```

Also fetch stories directly labelled Interface_Build if not already covered:
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND labels = Interface_Build AND resolution = Unresolved ORDER BY key ASC
fields: summary,status,assignee,labels,components,priority,fixVersions,issuelinks,customfield_12740,description
limit: 50 — paginate fully
```

---

## STEP 3 — RUN COMPLIANCE CHECK (per story)

### GATE SET A — MUST-HAVE Attributes (8 gates, from Jira fields)

| Gate | Field | Pass condition |
|------|-------|----------------|
| A1 | `labels` | Contains `IF_Type_CPI` |
| A2 | `labels` | Contains `RICEFW` |
| A3 | `labels` | Contains `Interface_Build` |
| A4 | `labels` | Contains `INT-CPI` or `INT_CPI` |
| A5 | `priority` | Not null / not empty |
| A6 | `fixVersions` or Version/Delivery in description | Set and contains `RD\d+` |
| A7 | `customfield_12740` (Sprint) | Set — at minimum a tentative sprint |
| A8 | `status` | `Development Ready` (only required when story is ready for dev — flag as ⚠️ WARNING not ❌ FAIL if in earlier status) |

**A8 rule:** If status is `New` / `In Refinement` / `Analysis` → ⚠️ WARNING (not yet Development Ready — OK for stories still being refined). If status is `In Development` or later but was never set to Development Ready → ❌ FAIL.

### GATE SET B — Mandatory Sections (13 sections, from description)

Detection: case-insensitive substring match on section number + keyword. If section exists but contains only placeholder text (`<...>`, `N/A`, `NA`, `TBD`) → ⚠️ NA (acceptable if justified, but must be explicit).

| Gate | Section | Detection pattern |
|------|---------|-------------------|
| B01 | 01 FUNCTIONAL BACKGROUND | `01` + `FUNCTIONAL BACKGROUND` |
| B02 | 02 WHY SAP CPI IS NEEDED | `02` + `WHY SAP CPI` |
| B03 | 03 INTEGRATION PATTERN | `03` + `INTEGRATION PATTERN` |
| B04 | 04 DIRECTION & SYSTEMS INVOLVED | `04` + `DIRECTION` |
| B05 | 05 COMMUNICATION MODE | `05` + `COMMUNICATION MODE` |
| B06 | 06 SAMPLE PAYLOAD & TEST DATA | `06` + `SAMPLE PAYLOAD` |
| B07 | 07 CONTACT LIST | `07` + `CONTACT` |
| B09 | 09 API SPECIFICATION | `09` + `API SPECIFICATION` |
| B10 | 10 AUTHENTICATION & SECURITY | `10` + `AUTHENTICATION` |
| B11 | 11 ERROR HANDLING MECHANISM | `11` + `ERROR HANDLING` |
| B12 | 12 RETRY MECHANISM | `12` + `RETRY` |
| B13 | 13D DEPENDENCIES & BLOCKERS | `13D` + `DEPENDENCIES` |
| B14 | DEFINITION OF DONE | `DEFINITION OF DONE` |
| B15 | ACCEPTANCE CRITERIA | `ACCEPTANCE CRITERIA` |
| B16 | CPI Developer Section | `CPI Developer Section` (must contain IDT No, Package Name, Iflow Name) |

### SCORING

- ✅ = 1.0 pt (present and filled)
- ⚠️ = 0.5 pt (marked NA — acceptable if justified)
- ❌ = 0.0 pt (missing entirely)

**Total gates: 24 (8 attribute + 16 section)**

| Score | Band |
|-------|------|
| ≥ 90% | 🟢 GREEN — compliant |
| 70–89% | 🟠 AMBER — needs attention |
| < 70% | 🔴 RED — not ready for development |

---

## STEP 4 — DISPLAY IN CHAT

Header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INT-CPI Story Format Check — {release or "All Streams"}
Reference template: YOUR_JIRA_PROJECT-7383
Generated: {today}    Stories checked: {count}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Stream summary table:**
| Stream | Stories | 🟢 Green | 🟠 Amber | 🔴 Red | Most Common Gaps |
|---|---|---|---|---|---|

**Stories requiring action (AMBER + RED), sorted by score ascending:**
| Story | CPI ART | Summary | Score | Band | Top 3 Missing Gates |
|---|---|---|---|---|---|

**For single story (`/cpi-story-format-check YOUR_JIRA_PROJECT-XXXX`):**
Print full scorecard (same format as `/cpi-story-check`):
```
Story Format Check — YOUR_JIRA_PROJECT-XXXX
───────────────────────────────────────────────
Summary:  <summary>
Status:   <status>   Assignee: <name>
───────────────────────────────────────────────
GATE A — MUST-HAVE ATTRIBUTES
  ✅  A1  Label: IF_Type_CPI
  ✅  A2  Label: RICEFW
  ❌  A3  Label: Interface_Build — MISSING
  ✅  A4  Label: INT-CPI
  ✅  A5  Priority: High
  ❌  A6  Version/Delivery — not set
  ⚠️  A7  Sprint — not set (story not yet Development Ready — add tentative sprint)
  ⚠️  A8  Status: In Refinement (move to Development Ready when ready for build)
───────────────────────────────────────────────
GATE B — MANDATORY SECTIONS
  ✅  B01  01 FUNCTIONAL BACKGROUND
  ✅  B02  02 WHY SAP CPI IS NEEDED
  ❌  B03  03 INTEGRATION PATTERN — section missing
  ✅  B04  04 DIRECTION & SYSTEMS INVOLVED
  ✅  B05  05 COMMUNICATION MODE
  ⚠️  B06  06 SAMPLE PAYLOAD — marked N/A (confirm with functional team)
  ✅  B07  07 CONTACT LIST
  ✅  B09  09 API SPECIFICATION
  ✅  B10  10 AUTHENTICATION & SECURITY
  ✅  B11  11 ERROR HANDLING MECHANISM
  ⚠️  B12  12 RETRY MECHANISM — marked N/A (confirm no retry needed)
  ✅  B13  13D DEPENDENCIES & BLOCKERS
  ✅  B14  DEFINITION OF DONE
  ❌  B15  ACCEPTANCE CRITERIA — section missing
  ✅  B16  CPI Developer Section
───────────────────────────────────────────────
SCORE: 19.5 / 24 gates  (81%)  🟠 AMBER
───────────────────────────────────────────────
ACTION REQUIRED:
  ❌  Add Label: Interface_Build
  ❌  Set Version/Delivery field
  ❌  Add section 03 INTEGRATION PATTERN
  ❌  Add ACCEPTANCE CRITERIA section
  ⚠️  Add tentative sprint even if not Development Ready yet
  ⚠️  Move status to Development Ready when ready for build
```

---

## STEP 5 — GENERATE EXCEL

Write temp Python to `%TEMP%\story_format_check.py`, run, delete.

Output: `{out}\{TIMESTAMP}_CPI_Story_Format_Check_{release}.xlsx`

**Sheets:**
1. **Format Check** — one row per story, columns = each gate (A1–A8, B01–B16), RAG cell per gate
2. **Stream Summary** — rollup per stream: total stories, GREEN/AMBER/RED counts, most common missing gates
3. **Action Required** — AMBER + RED stories only, sorted by score, with exact missing gates
4. **Reference — YOUR_JIRA_PROJECT-7383** — summary of the template structure for team reference

Colour: ✅ `D5F5E3` · ⚠️ `FFF3CD` · ❌ `FFCCCC` · Header `1F4E79` white text

Print: `Excel: {filepath}`

---

## RELATIONSHIP TO OTHER GOVERNANCE SKILLS

| Need | Use |
|------|-----|
| Check one story in detail | `/cpi-story-format-check YOUR_JIRA_PROJECT-XXXX` (this skill) |
| Check all stories for a release | `/cpi-story-format-check RD08` (this skill) |
| Legacy single-story check | `/cpi-story-check YOUR_JIRA_PROJECT-XXXX` |
| Batch compliance across streams | `/cpi-governance-stories RD08` |
| Full governance workbook | `/cpi-governance-workbook` |

---

## RULES

- If section is present but all fields are still template placeholders (`<...>`) → treat as ❌ (empty template = not filled)
- If section exists and at least one field has real content beyond the placeholder → ✅
- If section contains `N/A` or `NA` explicitly → ⚠️ (acceptable, but flag for stream review)
- Never invent compliance — only check what JIRA returns
- Always cite the gate ID (A1-A8, B01-B16) in action items so the story author knows exactly what to fix
