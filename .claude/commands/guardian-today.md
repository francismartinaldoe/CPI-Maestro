---
description: Spot-check every iFlow deployed today in the named environment. Usage: /guardian-today [in <env>]
---

Parse $ARGUMENTS for optional environment (default: DEV).

Spot-check all iFlows that were deployed today in that environment.

---

## Steps

1. Call `get_todays_deployments` on the target MCP server
2. Show discovery table:
   ```
   ## 📋 iFlows Deployed Today — {ENV}
   | # | iFlow Name | Package | Deployed By | Time |
   |---|-----------|---------|-------------|------|
   ```
3. If no iFlows deployed today → `📭 No iFlows deployed today in {ENV}.` then end-of-run menu
4. Ask: `Run GUARDIAN spot-check on all N iFlows? (yes / no)`
5. On **yes** — run `/spotcheck` on each iFlow sequentially, show progress:
   ```
   ⏳ [1/N] Checking {iFlow name}...
   🟢/🟡/🔴 [1/N] {verdict} — {iFlow name}
   ```
6. Show batch summary table at the end

---

## Output Format — Batch Summary

```
## 🏁 GUARDIAN Today — {ENV}  ({date})

| # | iFlow | ✅ PASS | ⚠️ WARN | ❌ FAIL | ⏭️ SKIP | Verdict |
|---|-------|--------|--------|--------|--------|---------|

**Overall readiness:**
🟢 Ready to go live: {list}
🟡 Review before go-live: {list}
🔴 Block go-live: {list}
```

Then show the end-of-run menu.

---

## MCP Tools used

- `get_todays_deployments` — discover iFlows deployed today
- `get_runtime_artifacts` — activation status
- `get_iflow_configurations` — externalized parameters
- `list_keystores` / `list_credentials` / `list_oauth_credentials` — security health
- `get_failed_messages` — error counts
