---
description: Run GUARDIAN health check on all watchlist iFlows. Usage: /guardian-batch [in <env>]
---

Parse $ARGUMENTS for optional environment (default: DEV).

Run a GUARDIAN spot-check on every iFlow in the watchlist.

**Watchlist iFlows:**
- Involved Parties Determination in Sales Cloud v2 (YOUR_PACKAGE_ID)
- Update Inv Party in SAP CPQ 2 Quote from C4C V2 Opportunity (YOUR_PACKAGE_ID_2)
- Send Employee Data from AEM to C4Cv2 (YOUR_PACKAGE_ID)

---

## Steps

1. Show: `🔵 GUARDIAN Batch — checking N iFlows in {ENV}...`
2. For each iFlow, run the full 8-check spot-check:
   ```
   ⏳ [X/N] Checking {iFlow name}...
   🟢/🟡/🔴 [X/N] {verdict} — {iFlow name}
   ```
3. After all checks complete, show the batch summary

---

## Output Format — Batch Summary

```
## 🏁 GUARDIAN Batch Complete — {ENV}

| # | iFlow | ✅ | ⚠️ | ❌ | ⏭️ | Verdict |
|---|-------|---|---|---|---|---------|
| 1 | Involved Parties Determination in Sales Cloud v2 | 6 | 0 | 0 | 2 | 🟢 PASS |
| 2 | Update Inv Party in SAP CPQ 2 Quote | 5 | 1 | 0 | 2 | 🟡 WARN |
| 3 | Send Employee Data from AEM to C4Cv2 | 4 | 0 | 1 | 3 | 🔴 FAIL |

---

**Overall readiness for {ENV}:**
🟢 Ready to go live: {iFlow list}
🟡 Review before go-live: {iFlow list}
🔴 Block go-live: {iFlow list} — fix failures before deploying
```

Then show the end-of-run menu.

---

## MCP Tools used

- `get_runtime_artifacts` — activation status
- `get_iflow_content` — adapter + parameter inspection
- `get_iflow_configurations` — externalized parameters
- `list_keystores` / `list_credentials` / `list_oauth_credentials` — security
- `get_failed_messages` — error counts
