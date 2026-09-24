---
description: >
  Generate the CPI ART Governance Workbook — 18-sheet Excel with Dashboard,
  MASTER_REPORT, Incompleteness Check, ART-YOUR_JIRA_PROJECT Mapping, per-release sheets,
  Story Compliance Matrix, Hierarchy Tree (Stream ART → CPI ART → YOUR_JIRA_PROJECT),
  Intelligence Signals, Stream Action Register, Raw Data, and Orphan CPI Stories.
  Fetches live data from SAP Jira via MCP and calls the pre-built Python script to build
  the Excel — no code generation at runtime, no timeout.
  Usage: /cpi-governance
         /cpi-governance out=C:\Users\<you>\Desktop
         /cpi-governance cache=true          ← skip JIRA fetch, reuse last run's data (< 4h old)
         /cpi-governance out=C:\... cache=true
---

Generate the **CPI ART Governance Workbook** by following every step below exactly.

---

## STEP 0 — PRE-FLIGHT CHECK

Run all checks before doing anything else. **Check 0 runs first — it is the most common cause of JIRA auth failure.**

### Check 0 — Corporate gateway detection (ALWAYS CHECK FIRST)
```bash
python -c "import json,os; d=json.load(open(os.path.expanduser('~/.claude/settings.json'))); url=d.get('env',{}).get('ANTHROPIC_BASE_URL',''); print('GATEWAY' if url and 'localhost' in url else 'DIRECT')"
```
- ✅ Prints `DIRECT` → standard OAuth flow will work, continue to Check 3 normally
- ⚠️ Prints `GATEWAY` → **corporate proxy detected. `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` will be auto-set by Claude Code on every session. Do NOT remove it — it is required by the proxy.** Instead, use `jira_auth_helper.py` for JIRA auth (Check 3 below handles this automatically).

### Check 1 — Python openpyxl installed
```bash
python -c "import openpyxl; print('openpyxl ok')"
```
- ✅ Prints `openpyxl ok` → continue
- ❌ ImportError → **STOP.** Tell the user:
  > `pip install -r scripts/requirements.txt`
  > Then re-run `/cpi-governance`

### Check 2 — Build script exists
```bash
python -c "import os; print(os.path.exists('scripts/build_cpi_governance.py'))"
```
- ✅ Prints `True` → continue
- ❌ Prints `False` → **STOP.** Tell the user:
  > `git pull` — you are missing `scripts/build_cpi_governance.py`

### Check 3 — JIRA authentication
**If corporate gateway detected (Check 0 = GATEWAY):** always use `jira_auth_helper.py` — the MCP OAuth browser flow is disabled by the proxy. Run:
```bash
python scripts/jira_auth_helper.py
```
- Token still valid → prints "Token still valid (Ns remaining)" → continue immediately, no browser needed
- Token expired → silently refreshes using refresh token → no browser needed
- First time or refresh token expired → opens browser for SAP SSO → complete login → continue

**If direct connection (Check 0 = DIRECT):** call the JIRA MCP `jira_search` tool:
```
jql: project = YOUR_JIRA_PROJECT AND issuetype = Feature ORDER BY key ASC
fields: summary
limit: 1
start_at: 0
```
- ✅ Returns result → authenticated, continue
- ❌ "Needs authentication" → run `python scripts/jira_auth_helper.py` → continue

### Check 4 — Output directory writable
```bash
python -c "import os; p=os.path.expanduser('~'); print('writable' if os.access(p, os.W_OK) else 'not writable')"
```
- ✅ Prints `writable` → continue
- ❌ Prints `not writable` → warn user to specify a writable `out=` path

### Pre-flight summary
If all checks pass, print:
```
✅ Pre-flight checks passed
   openpyxl    ✅
   build script ✅
   JIRA MCP    ✅
   output dir  ✅
Proceeding to fetch JIRA data...
```

---

## STEP 1 — SETUP



```bash
date '+%Y%m%d_%H%M'
```
→ capture as **TIMESTAMP**

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
```
→ capture as **TODAY_ISO**

```bash
python -c "import os; print(os.environ.get('USERNAME', os.environ.get('USER','unknown')))"
```
→ capture as **USERNAME**

```bash
python -c "import os; print(os.path.abspath('scripts'))"
```
→ capture as **SCRIPTS_DIR** (absolute path to the scripts/ folder — works for any user on any machine)

Parse optional arguments from `$ARGUMENTS`:

| Argument | Default | Description |
|----------|---------|-------------|
| `out=`   | `C:\Users\{USERNAME}\Downloads\governance_report` | Output folder |
| `cache=true` | (off) | Skip JIRA fetch — reuse last `_jira_data.json` if < 4h old |

**If `cache=true`:** skip Steps 1 and 2 entirely. Go straight to Step 3.

**Output file:** `{out}\{TIMESTAMP}_CPI_ART_Governance_Workbook.xlsx`

**Data temp file:** `{out}\_jira_data.json` (deleted automatically by the build script)

---

## STEP 2 — FETCH JIRA DATA (via JIRA MCP)

Authentication is handled automatically by the `sap-jira` MCP server already connected in this session.

Run all four queries using the JIRA MCP `jira_search` tool. Paginate each fully using `start_at` and `limit: 50`.

### Query 1 — CPI ARTs
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Feature AND labels = INT-CPI AND status not in (Obsolete) ORDER BY assignee ASC, fixVersion ASC, key ASC
fields: summary,status,assignee,reporter,fixVersions,labels,components,creator,issuelinks,customfield_12740,customfield_10253,comment
limit: 50
start_at: 0 → paginate until no more results
```
→ collect all results as **cpi_arts**

### Query 2 — Stories
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND labels = Interface_Build AND resolution = Unresolved ORDER BY key ASC
fields: summary,status,assignee,reporter,fixVersions,labels,components,issuelinks,customfield_12740,customfield_10253,comment,description,priority
limit: 50
start_at: 0 → paginate until no more results
```
→ collect all results as **stories**

> ℹ️ `description` and `priority` are required for the **Story Compliance** and **Hierarchy Tree** sheets. They add ~2–5s to the fetch for large story sets.

### Query 3 — Stream ARTs (derived from cpi_arts)
After Query 1 completes:
- Collect unique YOUR_JIRA_PROJECT keys from `issuelinks` where link type contains "split" or "relation" (case-insensitive)
- Use `inward_issue`/`outward_issue` (snake_case — the MCP returns snake_case keys)
- Linked key must start with `YOUR_JIRA_PROJECT-` and differ from the CPI ART's own key
- If keys found:
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND key in (<collected keys>)
fields: summary,status,assignee,fixVersions,labels,components,issuelinks,customfield_12740,customfield_10253,comment
limit: 50
```
- If no keys found → use `[]`
→ collect all results as **stream_arts**

### Query 4 — Orphan Candidates
```
tool: jira_search
jql: project = YOUR_JIRA_PROJECT AND issuetype = Story AND resolution = Unresolved AND labels in (RICEFW, "INT-CPI", YOUR-TEAM-LABEL, Interface_Build, IF_Type_CPI) ORDER BY created DESC
fields: summary,status,assignee,reporter,fixVersions,labels,components,issuelinks,customfield_12740,customfield_10253,comment
limit: 50
start_at: 0 → paginate until no more results
```
→ collect all results as **orphan_candidates**

---

## STEP 3 — SAVE JIRA DATA TO JSON

```python
import json, os
os.makedirs(r"{out}", exist_ok=True)
data = {
    "timestamp": "<YYYY-MM-DD HH:MM from TIMESTAMP>",
    "today_iso": "<TODAY_ISO>",
    "cpi_arts": [...],
    "stories": [...],
    "stream_arts": [...],
    "orphan_candidates": [...]
}
with open(r"{out}\_jira_data.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"Saved: cpi_arts={len(data['cpi_arts'])}, stories={len(data['stories'])}, streams={len(data['stream_arts'])}, orphans={len(data['orphan_candidates'])}")
```

---

## STEP 4 — BUILD WORKBOOK

```bash
# Normal run — via unified excel_export.py entry point:
python "{SCRIPTS_DIR}\excel_export.py" \
  --mode governance \
  --data "{out}\_jira_data.json" \
  --out  "{out}" \
  --name "{TIMESTAMP}_CPI_ART_Governance_Workbook.xlsx" \
  --cleanup

# Cache run (cache=true):
python "{SCRIPTS_DIR}\excel_export.py" \
  --mode governance \
  --data "{out}\_jira_data.json" \
  --out  "{out}" \
  --name "{TIMESTAMP}_CPI_ART_Governance_Workbook.xlsx"
```

> `excel_export.py --mode governance` delegates to `build_cpi_governance.py` internally — same output, unified entry point.

Print the script's output verbatim. If it errors, show the full traceback.

---

## STEP 5 — CONFIRM OUTPUT

```bash
ls "{out}" 2>/dev/null || dir "{out}"
```

Report the output file name and size to the user.

---

## WHAT THIS COMMAND DOES NOT DO

- Does **not** need `jira_mcp_auth.py` — authentication is handled by the `sap-jira` MCP server
- Does **not** share tokens between users — each user's MCP session is their own
- Does **not** write any Excel code at runtime — build script is permanent at `scripts/build_cpi_governance.py`
- Does **not** check CPI runtime status — use `@integration-detective`
- Does **not** use hardcoded paths — `SCRIPTS_DIR` is resolved dynamically at runtime
