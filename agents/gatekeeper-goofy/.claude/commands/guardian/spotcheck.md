---
description: Run a GUARDIAN spot-check on an iFlow in a single CPI environment. Usage: /spotcheck <iflow-name> [in <env>]
---

Run a GUARDIAN spot-check for the iFlow named in $ARGUMENTS.

Parse $ARGUMENTS to extract:
- iFlow name (required — everything before "in" keyword)
- environment (optional — word after "in", default: DEV)

Examples:
- `/spotcheck Duplicate Opportunity Forecast Exclusion` → check in DEV
- `/spotcheck Update Inv Party in SAP CPQ 2 Quote in TEST`
- `/spotcheck Validate Contact in PROD`

Call the `spotcheck_iflow` tool with the parsed values.

---

## Output Format

### Header
```
## 🛡️ <iFlow Name> — GUARDIAN Spot-Check [<ENV>]
**Run ID:** … | **Checked:** … | **Overall:** 🟢 PASS / 🟡 WARN / 🔴 FAIL
```

### Check Table
| # | Check | Status | Detail | Auto-Fix? | Escalation |
|---|-------|--------|--------|-----------|------------|

Show **all 8 checks** — never skip or truncate any row.
Status: `✅ PASS` / `⚠️ WARN` / `❌ FAIL` / `⏭️ SKIP`

### Summary line
`✅ N PASS  ⚠️ N WARN  ❌ N FAIL  ⏭️ N SKIP`

### Go-live verdict
- FAIL present → `🚨 Block go-live:` + list of failing checks with escalation detail
- WARN only → `⚠️ Review before go-live:` + list of warnings
- All PASS → `🟢 <ENV> deployment is healthy — <iFlow> is go-live ready.`

Then show the end-of-run menu.

---

## MCP Tools used
- `spotcheck_iflow` — primary runner
- `get_failed_messages` — called automatically for error count context
