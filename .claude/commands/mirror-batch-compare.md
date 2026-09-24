---
description: Run MIRROR comparison for all watchlist iFlows. Usage: /batch-compare [from <env>] [to <env>]
---

Parse $ARGUMENTS for optional environment overrides:
- **sourceEnv** (default: DEV)
- **targetEnv** (default: TEST)

Run MIRROR comparison for every iFlow in the watchlist.

**Watchlist iFlows:**
- Involved Parties Determination in Sales Cloud v2 (YOUR_PACKAGE_ID)
- Update Inv Party in SAP CPQ 2 Quote from C4C V2 Opportunity (YOUR_PACKAGE_ID_2)
- Send Employee Data from AEM to C4Cv2 (YOUR_PACKAGE_ID)

---

## Steps

1. Show: `🟣 MIRROR Batch — comparing N iFlows ({SRC} → {TGT})...`
2. For each iFlow, run the full MIRROR comparison and show progress:
   ```
   ⏳ [X/N] Comparing `{iFlow name}`...
   🟢/🟡/🔴 [X/N] {verdict} — N diff(s)
   ```
3. After all comparisons complete, show the batch summary

---

## Output Format — Batch Summary

```
## 🏁 Batch MIRROR Complete — {SRC} ↔ {TGT}

| iFlow | ✅ Match | ⚠️ Drift | ❌ Missing | ➕ Extra | Verdict |
|-------|---------|---------|----------|---------|---------|
| Involved Parties Determination in Sales Cloud v2 | 24 | 2 | 0 | 0 | 🟡 DRIFT |
| Update Inv Party in SAP CPQ 2 Quote | 20 | 0 | 0 | 0 | 🟢 IN SYNC |
| Send Employee Data from AEM to C4Cv2 | 18 | 0 | 2 | 0 | 🔴 INCOMPLETE |

---

**Promotion readiness: {SRC} → {TGT}**
🟢 Ready to promote: {iFlow list}
🟡 Promote with caution: {iFlow list} — review drift items before promoting
🔴 Block promotion: {iFlow list} — missing artifacts must be resolved first
```

Then show the end-of-run menu.

---

## MCP Tools used

- `get_runtime_artifacts` — activation status + version (both tenants)
- `get_iflow_content` — BPMN2 adapters (both tenants)
- `get_iflow_configurations` — externalized parameters (both tenants)
- `get_artifact` — version + package metadata (both tenants)
- `get_failed_messages` — recent error counts (both tenants)
