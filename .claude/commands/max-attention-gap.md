---
description: >
  Run the Max Attention iFlow gap analysis for a given release.
  Reads the Max Attention & EOX IFlows Excel tracker, fetches all [Max Attention]
  JIRA records for the release, parses iFlow names from story descriptions, and
  produces a colour-coded Excel mapping: which iFlows are covered by a JIRA story
  and which have no story at all.
  Usage: /max-attention-gap RD08
         /max-attention-gap RD10
         /max-attention-gap        ← Claude will ask for release and file path
---

Run the **Max Attention iFlow JIRA Gap Analysis** for the release in `$ARGUMENTS`.

---

## Step 0 — Intake gate

Before doing anything, collect the two required inputs:

**If release is missing from `$ARGUMENTS`:**
Ask: *"Which release are you analysing? (e.g. RD08, RD10, RD11)"*

**Always ask for the Excel file path:**
Ask: *"Please provide the full path to the Max Attention & EOX IFlows.xlsx tracker file (e.g. `C:\Users\<YOUR-USERNAME>\...\Max Attention & EOX IFlows.xlsx`) — press Enter to confirm or paste a new path."*

Wait for both answers before proceeding.

Store as:
- `RELEASE` = the release code (e.g. `RD08`)
- `EXCEL_PATH` = full path to the xlsx file

---

## Step 1 — Read the Excel tracker

Using Python + openpyxl, open `EXCEL_PATH` and read **Sheet 2: "MAX Attention(Till RD05)"**.

Extract the following columns for every non-blank row (starting from row 2):

| Col | Letter | Field |
|-----|--------|-------|
| 2 | B | Package |
| 3 | C | iFlow Name |
| 24 | X | Existing JIRA User Story |
| 30 | Z | Excluded from MAX Attention (Y/N) |

Build a list of all iFlows: `[(package, iflow_name, existing_jira, excluded)]`

Print a confirmation: *"Read XX iFlows from Sheet 2."*

---

## Step 2 — Bulk JIRA fetch (hardcoded filters, only RELEASE is dynamic)

Run **two queries in parallel** — all filters are fixed except `<RELEASE>`:

**Query A — All issue types with [Max Attention] + release in title:**
```jql
project = YOUR_JIRA_PROJECT
AND summary ~ "Max Attention"
AND summary ~ "<RELEASE>"
ORDER BY created DESC
```

**Query B — Sub-tasks with Max Attention in title (catches description-table stories like YOUR_JIRA_PROJECT-6349–6356):**
```jql
project = YOUR_JIRA_PROJECT
AND issuetype = "Sub-Task"
AND summary ~ "Max Attention"
ORDER BY created DESC
```

Fields to fetch: `summary, status, issuetype, description`
Limit: 50 per query. Paginate if `total > 50`.

Deduplicate results by JIRA key (Query B may overlap with A).

Print: *"Found XX [Max Attention] JIRA records total."*

---

## Step 3 — Parse descriptions and match iFlows

For each JIRA record fetched, extract iFlow names from the description body.
Descriptions contain pipe-delimited tables in this format:
```
|Package|Iflow|
|SAP CPQ 2.0...|Check AR Block Status from CPQ2 to ERP|
```

Extract the second column of each `|...|...|` row as a candidate iFlow name.
Skip header rows (where the value is literally `Iflow` or `Package`).

For each iFlow from Step 1, find which stories mention it:

**Pass 1 — Exact match:** check if `iflow_name.lower()` appears anywhere in `description.lower()` (after normalising whitespace)

**Pass 2 — Keyword fallback:** if no exact match, extract significant words from the iFlow name (ignore stop words: from, to, in, the, for, sap, cpi, with, and, of, by, on, a, an, is, at, via, into, based, using, data, integration, interface, build, acn, ). Match if ≥2 significant words appear in the description.

Result per iFlow:
- `found_keys` = list of JIRA keys where this iFlow was found
- `found_statuses` = corresponding statuses
- `combined_ids` = deduplicated list of: existing JIRA IDs from Excel + found_keys

---

## Step 4 — Display summary in chat

Print a summary before generating the file:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
<RELEASE> Max Attention — iFlow JIRA Gap Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Excel tracker:      <EXCEL_PATH filename only>
JIRA records found: XX  (Sub-Tasks: XX | Stories: XX | Bugs: XX)

Total iFlows in tracker:          XX
✅ Found in story descriptions:   XX
⚠️  No match — gap:              XX
```

Then list the **gap iFlows** (those with no JIRA found) grouped by package, so the user can see what needs a new story.

---

## Step 5 — Generate Excel

Using Python + openpyxl, produce a timestamped Excel file:

**File path:** `output\<YYYYMMDD_HHMM>_<RELEASE>_MaxAttention_iFlow_Map.xlsx`

**Sheet 1: "iFlow to JIRA Mapping"** — all iFlows, one row each

| # | Package | iFlow Name | Existing JIRA (Excel) | Excluded? | Found in Story Desc? | JIRA Key(s) | Story Status(es) | Combined JIRA IDs |
|---|---|---|---|---|---|---|---|---|

Colour coding:
- `D5F5E3` (green) — Found in description (row background on cols 6–9)
- `FDEBD0` (orange) — Not found, not excluded (gap — needs action)
- `F2F3F4` (grey) — Not found but Excluded = Y (intentionally out of scope)
- Status cell colours: Done/Closed = green, Verification = yellow, In Progress/Dev Ready = blue, Blocked = red, Cancelled/Obsolete = grey

**Sheet 2: "MaxAttn Stories"** — each JIRA record found, with the iFlow list extracted from its description

| JIRA Key | Type | Status | Summary | iFlows Listed in Description |

**Sheet 3: "Summary"** — key counts (total, found, gap, stories searched, release)

After saving: print file path and sheet names. Delete the build script.

---

## What this command does NOT do

- Does **not** check CPI runtime status of the iFlows — use `@integration-detective` for that
- Does **not** compare environments — use `@gatekeeper-goofy` for that
- Does **not** modify the source Excel tracker — read-only
- Does **not** include the Cutover Sheet — run `/cutover-sheet <RELEASE>` for that separately
