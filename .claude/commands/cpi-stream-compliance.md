---
description: >
  Batch compliance audit for all INT_CPI YOUR_JIRA_PROJECT stories across streams.
  Checks all 22 mandatory gates (metadata + 14 description sections) for every story
  linked to a CPI ART. Groups results by stream with RAG status per story.
  Produces console summary table + Excel compliance matrix.
  Usage: /cpi-stream-compliance
         /cpi-stream-compliance RD08.2026    ← filter to one release
         /cpi-stream-compliance cache=true   ← reuse cached governance data if < 4h old
---

Run a **CPI Stream Compliance Audit** — check all INT_CPI stories against the mandatory 13-section template.

---

## STEP 0 — Parse arguments

From `$ARGUMENTS`:
- `RELEASE_FILTER` — if a release code like `RD08.2026` is found, filter to that release only
- `cache=true` — reuse last `_jira_data.json` if < 4h old (skip JIRA fetch)

---

## STEP 1 — Authentication check

```bash
python scripts/jira_auth_helper.py
```
Proceed on success. On failure: stop and show error.

---

## STEP 2 — Timestamps

```bash
date '+%Y%m%d_%H%M'
```
→ `TIMESTAMP`

```bash
python -c "import os; print(os.environ.get('USERNAME', os.environ.get('USER','unknown')))"
```
→ `USERNAME`

Output dir: `C:\Users\{USERNAME}\Downloads\governance_report`

---

## STEP 3 — Fetch JIRA data (or use cache)

**If `cache=true`:** check `{out}\_jira_data.json` age — if < 4h old, load it and skip to STEP 4.

### Query A — CPI ARTs (INT-CPI features)
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Feature AND labels = INT-CPI AND status not in (Obsolete) ORDER BY key ASC
fields: summary,status,assignee,fixVersions,labels,components,issuelinks
limit: 50 → paginate fully
```

### Query B — Interface_Build stories with description
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND labels = Interface_Build AND resolution = Unresolved ORDER BY key ASC
fields: summary,status,assignee,labels,components,priority,fix_versions,customfield_12740,description,issuelinks
limit: 50 → paginate fully
```

Note: `description` field is required — without it, section detection cannot run.

---

## STEP 4 — Build compliance data

For each story from Query B:

**A. Metadata gate (8 checks):**
```python
labels = story["labels"] or []
m1 = "IF_Type_CPI" in labels
m2 = "RICEFW" in labels
m3 = "Interface_Build" in labels
m4 = bool(story.get("priority"))
fv = story.get("fix_versions") or story.get("fixVersions") or []
m5 = len(fv) > 0
sprint_raw = story.get("customfield_12740")
sprint = extract_sprint(sprint_raw)  # same logic as governance script
m6 = bool(sprint)
m7 = (story.get("status", {}).get("name", "")).lower() == "development ready"
comps = story.get("components") or []
m8 = len(comps) > 0
```

**B. Section gate (14 checks) — pattern search on description:**

```python
desc = story.get("description") or ""
desc_lower = desc.lower()

def has_section(marker1, marker2):
    i1 = desc_lower.find(marker1.lower())
    if i1 < 0:
        return "missing"
    i2 = desc_lower.find(marker2.lower(), i1, i1 + 300)
    if i2 < 0:
        return "missing"
    # check for N/A content
    snippet = desc_lower[i2: i2 + 400]
    if all(x in snippet[:100] for x in ["n/a", "na", "tbd", "<"]):
        return "na"
    return "present"

sections = {
    "S01": has_section("01", "functional background"),
    "S02": has_section("02", "why sap cpi"),
    "S03": has_section("03", "integration pattern"),
    "S04": has_section("04", "direction"),
    "S05": has_section("05", "communication mode"),
    "S06": has_section("06", "sample payload"),
    "S07": has_section("07", "contact"),
    "S09": has_section("09", "api spec"),
    "S10": has_section("10", "authentication"),
    "S11": has_section("11", "error handling"),
    "S12": has_section("12", "retry"),
    "S13": has_section("13d", "depend"),
    "DoD": has_section("definition of done", ""),
    "AC":  has_section("acceptance criteria", ""),
}
```

For `DoD` and `AC`: use single-marker search (second arg blank = just find the first marker).

**C. Score:**
```python
metadata = [m1,m2,m3,m4,m5,m6,m7,m8]
meta_pass = sum(1 for x in metadata if x)
sec_pass = sum(1 for v in sections.values() if v == "present")
sec_na   = sum(1 for v in sections.values() if v == "na")
score_pct = (meta_pass + sec_pass + sec_na * 0.5) / 22 * 100
rag = "Green" if score_pct >= 90 else "Amber" if score_pct >= 70 else "Red"
```

---

## STEP 5 — Link stories to CPI ARTs → streams

For each CPI ART from Query A, collect linked story keys via issuelinks (parent/child relationship where story.parent = CPI ART key).

Build lookup: `story_key → {cpi_art_key, stream_component, release}`

Apply `RELEASE_FILTER` if set — skip stories whose CPI ART has no matching fix version.

---

## STEP 6 — Print console summary

```
CPI Story Compliance Audit — <TIMESTAMP>
<RELEASE_FILTER note or "All releases">
─────────────────────────────────────────────────────────────────────────────────
 Stream                    │ Stories │ ✅ Green │ 🟠 Amber │ 🔴 Red │ % Compliant
─────────────────────────────────────────────────────────────────────────────────
 DE&R                      │   12    │    4     │    5     │    3   │    33%
 Order-to-Cash             │    8    │    5     │    2     │    1   │    63%
 DemandGen                 │    4    │    4     │    0     │    0   │   100%
 (No Stream)               │    3    │    0     │    1     │    2   │     0%
─────────────────────────────────────────────────────────────────────────────────
 TOTAL                     │   27    │   13     │    8     │    6   │    48%

Top missing sections across all stories:
  1. S06 SAMPLE PAYLOAD         — missing in 14/27 stories
  2. AC  ACCEPTANCE CRITERIA    — missing in 11/27 stories
  3. S10 AUTHENTICATION         — missing in  8/27 stories
  4. M7  Status Dev Ready       — missing in  7/27 stories
  5. S03 INTEGRATION PATTERN    — missing in  5/27 stories
```

---

## STEP 7 — Generate Excel compliance matrix

Save compliance data as JSON, then call:
```bash
python "{SCRIPTS_DIR}\excel_export.py" \
  --mode story-compliance \
  --data "{out}\_compliance_data.json" \
  --out  "{out}" \
  --name "{TIMESTAMP}_CPI_Story_Compliance.xlsx" \
  --cleanup
```

The Excel has two sheets:
1. **Compliance Matrix** — one row per story, columns: Story Key | Summary | Stream | CPI ART | Status | Sprint | Version | M1–M8 | S01–S13 | DoD | AC | Score % | RAG
2. **Stream Summary** — one row per stream with totals and top gaps

Print the output file path.

---

## STEP 8 — Empowerment note

End with:
> **Next step:** For stories that are ❌ Red or 🟠 Amber, run `/cpi-story-check <KEY>` to get the exact action list for that story.
> To include compliance data in the full governance workbook, run `/cpi-governance`.
