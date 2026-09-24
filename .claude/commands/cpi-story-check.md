---
description: >
  Deep compliance check for a single YOUR_JIRA_PROJECT INT_CPI story.
  Checks all 15 mandatory gates: metadata labels, Jira fields, and all 13 description
  sections. Outputs a RAG scorecard with specific actions required.
  Usage: /cpi-story-check YOUR_JIRA_PROJECT-7383
---

Run a **CPI Story Compliance Check** for the story key in `$ARGUMENTS`.

---

## STEP 0 — Parse input

Extract the story key from `$ARGUMENTS`.
- If blank or not matching `YOUR_JIRA_PROJECT-\d+` → respond: `Usage: /cpi-story-check <YOUR_JIRA_PROJECT-KEY>`

Set `STORY_KEY = <extracted key>`

---

## STEP 1 — Fetch story from JIRA

Call `jira_get_issue`:
```
issue_key: <STORY_KEY>
fields: summary,status,assignee,labels,components,priority,fix_versions,customfield_12740,description,comment,issuelinks
```

If JIRA auth fails → run `python scripts/jira_auth_helper.py` then retry once.

Extract from the response:
- `summary`
- `status.name` → `STATUS`
- `assignee.display_name` or `assignee.displayName` → `ASSIGNEE`
- `labels` → `LABELS` (array)
- `components[0].name` or first component → `COMPONENT`
- `priority.name` → `PRIORITY`
- `fix_versions` → `FIX_VERSIONS` (array of strings or dicts)
- `customfield_12740` → `SPRINT` (apply `extract_sprint` logic: last element, parse name= if string)
- `description` → `DESCRIPTION` (full text)
- `issuelinks` → for parent YOUR_JIRA_PROJECT key

---

## STEP 2 — Metadata Gate (8 checks)

Check Jira fields — not description text:

| Gate | Check | Pass condition |
|------|-------|---------------|
| M1 | Label: IF_Type_CPI | `IF_Type_CPI` in LABELS |
| M2 | Label: RICEFW | `RICEFW` in LABELS |
| M3 | Label: Interface_Build | `Interface_Build` in LABELS |
| M4 | Priority set | PRIORITY is not null/empty |
| M5 | Version/Delivery set | FIX_VERSIONS not empty |
| M6 | Sprint assigned | SPRINT not empty |
| M7 | Status: Development Ready | STATUS == "Development Ready" (exact match) |
| M8 | Component set | COMPONENT not empty |

For M5: extract version name — if dict, use `.name`, if string use as-is. Show the value in the output.
For M6: show the sprint name. If not set → note "must be set before Development Ready".
For M7: if not Development Ready, show current status and note "story cannot be picked for build until status = Development Ready".

---

## STEP 3 — Section Gate (15 checks from description)

Search `DESCRIPTION` (case-insensitive) for each section marker.

**Detection logic per section:**
- ✅ **Present** — the header pattern is found AND the section has content beyond just "NA" / "N/A" / placeholder angle-bracket text
- ⚠️ **Marked N/A** — the header is found but the section body contains only `N/A`, `NA`, `<NA>`, `TBD`, or is blank
- ❌ **Missing** — the header pattern is not found at all

| Gate | Pattern to search (case-insensitive) | Section name |
|------|---------------------------------------|-------------|
| S01 | `01` + `FUNCTIONAL BACKGROUND` | Functional Background |
| S02 | `02` + `WHY SAP CPI` | Why SAP CPI Is Needed |
| S03 | `03` + `INTEGRATION PATTERN` | Integration Pattern |
| S04 | `04` + `DIRECTION` | Direction & Systems Involved |
| S05 | `05` + `COMMUNICATION MODE` | Communication Mode |
| S06 | `06` + `SAMPLE PAYLOAD` | Sample Payload & Test Data |
| S07 | `07` + `CONTACT` | Contact List |
| S09 | `09` + `API SPEC` | API Specification |
| S10 | `10` + `AUTHENTICATION` | Authentication & Security |
| S11 | `11` + `ERROR HANDLING` | Error Handling Mechanism |
| S12 | `12` + `RETRY` | Retry Mechanism |
| S13 | `13D` + `DEPEND` | Dependencies & Blockers |
| DoD | `DEFINITION OF DONE` | Definition of Done |
| AC  | `ACCEPTANCE CRITERIA` | Acceptance Criteria |

**Pattern match rule:** both parts of the pattern must appear within 200 characters of each other in the description.

**N/A is acceptable** for sections S06, S12 (retry may not apply), and S04 reverse flow sub-sections — flag as ⚠️ with a note, not ❌ failure. All other sections marked N/A are ⚠️ and still require functional team confirmation.

---

## STEP 4 — Score and output

Count:
- PASS = ✅ present (metadata gate passes, section gate = Present)
- PARTIAL = ⚠️ (N/A sections count as 0.5 towards pass)
- FAIL = ❌

Total gates = 8 (metadata) + 14 (sections) = 22

Score = (pass_count + partial_count * 0.5) / 22 * 100

RAG:
- 🟢 GREEN: score >= 90%
- 🟠 AMBER: score >= 70%
- 🔴 RED: score < 70%

**Print the full scorecard:**

```
═══════════════════════════════════════════════════════════════
  CPI Story Compliance Scorecard — <STORY_KEY>
═══════════════════════════════════════════════════════════════
  Summary:   <summary>
  Status:    <STATUS>
  Assignee:  <ASSIGNEE>
  Component: <COMPONENT>
  Sprint:    <SPRINT or "— not set">
  Version:   <FIX_VERSIONS or "— not set">
  Parent ART: <YOUR_JIRA_PROJECT key or "— not linked">
───────────────────────────────────────────────────────────────
  METADATA GATE
  <M1 result>  Label: IF_Type_CPI
  <M2 result>  Label: RICEFW
  <M3 result>  Label: Interface_Build
  <M4 result>  Priority: <value or "not set">
  <M5 result>  Version/Delivery: <value or "not set">
  <M6 result>  Sprint: <value or "not set">
  <M7 result>  Status: <STATUS>
  <M8 result>  Component: <value or "not set">
───────────────────────────────────────────────────────────────
  SECTION GATE (description analysis)
  <S01 result>  01 FUNCTIONAL BACKGROUND
  <S02 result>  02 WHY SAP CPI IS NEEDED
  <S03 result>  03 INTEGRATION PATTERN
  <S04 result>  04 DIRECTION & SYSTEMS INVOLVED
  <S05 result>  05 COMMUNICATION MODE
  <S06 result>  06 SAMPLE PAYLOAD & TEST DATA
  <S07 result>  07 CONTACT LIST
  <S09 result>  09 API SPECIFICATION
  <S10 result>  10 AUTHENTICATION & SECURITY
  <S11 result>  11 ERROR HANDLING MECHANISM
  <S12 result>  12 RETRY MECHANISM
  <S13 result>  13D DEPENDENCIES & BLOCKERS
  <DoD result>  DEFINITION OF DONE
  <AC result>   ACCEPTANCE CRITERIA
───────────────────────────────────────────────────────────────
  COMPLIANCE SCORE:  <X> / 22 gates  (<Y>%)  <RAG emoji>
───────────────────────────────────────────────────────────────
  ACTION REQUIRED:
  <list only failing/partial gates with specific action — skip if all pass>

  STORY IS READY FOR DEVELOPMENT: <YES / NO — only YES if M7 status=Dev Ready AND score>=90%>
═══════════════════════════════════════════════════════════════
```

If score = 100%, print: `✅ Story is fully compliant and ready for development.`

---

## STEP 5 — Empowerment note

End with one-line note:
> **Tip:** Run `/cpi-stream-compliance` to check all INT_CPI stories across streams at once.
