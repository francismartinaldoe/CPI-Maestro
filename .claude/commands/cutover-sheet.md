---
description: >
  Generate an RD05-style integration cutover tracking sheet for a named release.
  Queries INT-CPI features (YOUR_JIRA_PROJECT) and Interface_Build stories (YOUR_JIRA_PROJECT),
  validates CPI team ownership, and outputs a structured table + Excel file.
  Usage: /cutover-sheet RD08
         /cutover-sheet RD10 workstream=DE&R
         /cutover-sheet RD08 owner="<TEAM-MEMBER-NAME>" status=blocked excel=no
---

Generate an **RD05-style integration cutover tracking sheet** for the release specified in `$ARGUMENTS`.

---

## Step 1 — Parse arguments

Extract from `$ARGUMENTS`:

| Argument | Default | Description |
|----------|---------|-------------|
| `release` (positional, first word) | required | Release code e.g. `RD08`, `RD10`, `RD11` |
| `workstream=` | all | Filter by workstream/component e.g. `DE&R`, `O2C`, `DemandGen` |
| `owner=` | all | Filter by CPI owner name (partial match) |
| `status=` | all | Filter by JIRA status e.g. `blocked`, `in development`, `completed` |
| `group=primary` | all groups | Show only the primary release group (exact fix version match) |
| `excel=no` | `yes` | Skip Excel file generation, show data in chat only |

If no release is provided, ask: *"Which release do you want the cutover sheet for? (e.g. RD08, RD10, RD11)"*

Map the release code to PI scope using the CLAUDE.md PI Timeline:
- RD08.2026 → PI26/3 (01.06–04.09.2026)
- RD10.2026 → PI26/3 (01.06–04.09.2026)
- RD11.2026 → PI26/3 (01.06–04.09.2026)

---

## Step 2 — Derive release metadata

From CLAUDE.md release schedule, resolve for the given release:

| Field | Resolve from |
|-------|-------------|
| Fix version label | `RD<MM>.2026` e.g. `RD08.2026` |
| PDD (TEST go-live) | Release schedule table |
| Business Go-Live | Release schedule table |
| TGLRD label | `TGLRD<MM>.26` e.g. `TGLRD08.26` |
| BGLRD label | `BGLRD<MM>.26` e.g. `BGLRD08.26` |
| PI scope | PI Timeline table |

---

## Step 3 — Query JIRA

### Integration Features
```jql
project = YOUR_JIRA_PROJECT
AND issuetype = Feature
AND labels = "INT-CPI"
AND fixVersion = "RD<MM>.26"
AND status != Obsolete
```

**Version format is 2-digit year** — `RD08.26`, `RD10.26`, `RD11.26`. Never use `"Target Release"` (returns zero results) or `RD08.2026` (4-digit year).

Apply `workstream=`, `owner=`, `status=` filters if provided.

Pull fields: Key, Summary, Status, Assignee, Labels, Priority, Fix Versions, Components, Description.

**Paginate fully** — retrieve ALL results, never stop at the first page.

### Integration Stories — NOT queried

`"Epic Link"` and `parent` child-story queries both return zero results in this JIRA instance. Do not attempt them. Leave JIRA Story column blank.

---

## Step 3b — Parse CPI Developer Section

For each feature description, scan for a block beginning with `CPI Developer Section:`. Extract and store the following fields for Excel population:

| Description field | Excel column index | Excel header |
|-------------------|--------------------|--------------|
| `IDT No` | 45 | IDT Number |
| `IDT Status` | 46 | IDT Status |
| `Package Name` | 32 | Package Name |
| `Iflow Name` | 33 | IFlow Name |
| `Version` | 43 | Iflow Version |
| `Consulting Status` | 52 | Dev Consulting Status |
| `Consulting Date(Dev)` | 50 | Dev Consulting Dates (CET) |
| `Consulting Date(Test)` | 53 | Test Consulting Dates (CET) |
| `Scenario Document Link` | 72 | Scenario Document Link |

If the block is **absent** → set Col 28 (Remarks) = `"⚠️ CPI Section not found"`. Do not fabricate values.

Note: `Iflow Name` may be a bulleted list (multiple iFlows per feature). Store all names newline-separated in Col 33.

---

## Step 3c — iFlow inspection via CPI DEV

For each row where an IFlow Name was extracted:

1. Call `get_runtime_artifacts` on `CPI-DEV` — match iFlow by partial name (case-insensitive)
2. If found → call `get_iflow_content` to read the externalized parameters
3. **AEM detection**: check params for `AEM_Host`, `Host`, or `QueueName` containing `<YOUR-AEM-HOST>:55443`; OR AMQP adapter in BPMN
   - AEM found → Col 34 = `Yes`; extract `QueueName` → Col 37 and Col 38
   - No AEM → Col 34 = `No`
4. Artifact ID from runtime → Col 56 (IFlow ID)
5. Sender adapter name → infer Col 14 (Source System); receiver adapter → Col 17 (Target System)
6. Package name starts with `SAP ` → Col 57 = `Y` (standard); else `N`
7. iFlow **not found** → Col 42 = `New`, Col 34 = `NA`, Col 56 = blank

If CPI MCP is unavailable → skip Step 3c, add note: `⚠️ CPI MCP not connected — iFlow inspection skipped.`

---

## Step 4 — Validate ownership

Cross-check every feature and story assignee against the **CPI Integration Team** defined in `config/team.json`.

Flag any item not assigned to someone on this list as **⚠️ Not CPI-owned**.

---

## Step 5 — Display in chat (always, before Excel)

Show the results in this format:

### Header block
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<RELEASE> Cutover Tracking Sheet — <today's date>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Release:         <release>
PDD (TEST):      <pdd>
Business Go-Live: <go-live>
PI Scope:        <pi>
Filters applied: <list any workstream/owner/status filters, or "none">

INT-CPI Features found:  XX  (primary release: XX | other: XX)
CPI-owned: XX  |  ⚠️ Not CPI-owned: XX
⚠️ CPI Section not found: XX  |  AEM iFlows: XX
```

### Main table — grouped by fix version

**GROUP 1 — <release>.26 | Primary Go-Live Scope**

| Feature | Summary | Workstream | CPI Owner | CPI-Owned? | JIRA Status | IFlow Name | AEM? | IDT No | TGLRD | BGLRD | Flags |
|---------|---------|-----------|---------|-----------|------------|-----------|------|--------|-------|-------|-------|

Repeat for other fix version groups (informational), then a "No fix version" group.

### Ownership gaps
List every ⚠️ item separately after the table.

### Active filters reminder
If any filters were applied, show them clearly at the bottom so the user knows the view is scoped.

---

## Step 6 — Generate Excel (unless `excel=no`)

After displaying in chat, generate the Excel file using Python + openpyxl.

**Before building**: Read column headers from your team's live RD05 Tracker (configure the path in `CLAUDE.md`). Do **not** hardcode headers — always read from source.

**File path:** `output\<RELEASE> Tracker.xlsx`
e.g. `output\RD08 Tracker.xlsx`

**Sheet tab order (mandatory):**
1. **Guide** — colour legend, column guide, release overview (always first tab)
2. **\<RELEASE\> Sheet** — full 77-column RD05-style table, frozen header row, grouped by fix version
3. **Ownership Gaps** — all ⚠️ not-CPI-owned items
4. **CPI Team** — team member reference table

**Column auto-fill summary (key mappings):**

| Col | Header | Auto-filled from |
|-----|--------|-----------------|
| 0 | FEATURE/ART | Feature key |
| 1 | JIRA ID | Feature key |
| 3 | Workstream Sub Topic | Feature summary |
| 4 | RD0X Relevant | `"Yes"` (all rows) |
| 5 | TGL/BGL | Labels matching `TGLRD\d+\.\d+` / `BGLRD\d+\.\d+` |
| 7 | Responsible | Feature assignee |
| 8 | CPI Owner | Feature assignee |
| 13 | Workstream | Feature components |
| 14 | Source System | Inferred from sender adapter (CPI inspection) |
| 17 | Target System | Inferred from receiver adapter (CPI inspection) |
| 25 | JIRA Status | Feature status |
| 28 | Remarks | `"⚠️ CPI Section not found"` if block absent |
| 30 | PDD | From CLAUDE.md release schedule |
| 32 | Package Name | CPI Developer Section |
| 33 | IFlow Name | CPI Developer Section |
| 34 | AEM Usage Y/N? | CPI inspection (AMQP / aem-dev host) |
| 37 | AEM Associated Queue | `QueueName` from CPI params |
| 38 | Associated Queue in DEV | `QueueName` from CPI params |
| 42 | Existing/New IFlow | `Existing` if found in CPI, `New` if not |
| 43 | Iflow Version | CPI Developer Section |
| 44 | IFlow Configuration Parameters | Key params summary from CPI inspection |
| 45 | IDT Number | CPI Developer Section |
| 46 | IDT Status | CPI Developer Section |
| 50 | Dev Consulting Dates (CET) | CPI Developer Section |
| 52 | Dev Consulting Status | CPI Developer Section |
| 53 | Test Consulting Dates (CET) | CPI Developer Section |
| 56 | IFlow ID | Artifact ID from CPI runtime |
| 57 | Standard flow | Y if Package starts with `SAP `, else N |
| 72 | Scenario Document Link | CPI Developer Section |

Columns not listed above → leave blank for manual team entry.

**Colour coding (standard — must match across all releases):**
- `1F4E79` — header background (dark blue, white text)
- `D5F5E3` — Completed / Closed rows (green)
- `FFF3CD` — Blocked / at-risk rows (amber)
- `FFCCCC` — Not CPI-owned rows (red)
- `F2F7FB` / `FFFFFF` — alternating standard rows

After saving, verify: print sheet names, row count, and column count. Delete the build script.

---

## What this command does NOT do

- Does **not** check CPI runtime health (failed messages, traces) — use `@integration-detective` for that
- Does **not** run go/no-go scoring, auth matrix, or dependency maps — parked for future
- Does **not** check cross-tenant drift — use `@gatekeeper-goofy` for that
