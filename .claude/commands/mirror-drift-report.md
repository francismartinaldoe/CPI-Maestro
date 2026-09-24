---
description: Show promotion readiness drift report for all watchlist iFlows. Usage: /drift-report [from <env>] [to <env>]
---

Parse $ARGUMENTS for optional environment overrides:
- **sourceEnv** (default: DEV)
- **targetEnv** (default: TEST)

Run MIRROR comparison for all watchlist iFlows and aggregate a promotion readiness report.

**Watchlist iFlows:**
- Involved Parties Determination in Sales Cloud v2 (YOUR_PACKAGE_ID)
- Update Inv Party in SAP CPQ 2 Quote from C4C V2 Opportunity (YOUR_PACKAGE_ID_2)
- Send Employee Data from AEM to C4Cv2 (YOUR_PACKAGE_ID)

---

## Steps

1. Run MIRROR comparison for each watchlist iFlow
2. Aggregate results — focus on drift and missing items
3. Classify each iFlow into: Ready / Caution / Blocked
4. Show aggregated drift report

---

## Output Format

```
## 📊 Drift Report — {SRC} → {TGT}  ({date})

### Promotion Readiness Summary

| iFlow | Verdict | Drift Items | Blocking? |
|-------|---------|-------------|-----------|
| Involved Parties Determination in Sales Cloud v2 | 🟡 DRIFT | Host, MessageVPN | No |
| Update Inv Party in SAP CPQ 2 Quote | 🟢 IN SYNC | — | — |
| Send Employee Data from AEM to C4Cv2 | 🔴 INCOMPLETE | C4CAddress missing | Yes |

---

### Drift Details

#### Involved Parties Determination in Sales Cloud v2 — 🟡 DRIFT
| Field | Parameter Key | {SRC} | {TGT} | Status |
|-------|--------------|-------|-------|--------|
| **AEM Host** | **`Host`** | **tcps://<YOUR-AEM-DEV-HOST>:55443** | **tcps://<YOUR-AEM-DEV-HOST>:55443** | **⚠️ DRIFT** |

**Action:** Update `Host` in {TGT} to `tcps://<YOUR-AEM-TEST-HOST>:55443`

---

### Overall Verdict

🟢 Ready to promote: {list}
🟡 Promote with caution: {list}
🔴 Block promotion: {list}

**N iFlows are promotion-ready. N require attention before promoting.**
```

Then show the end-of-run menu.

---

## MCP Tools used

- `get_runtime_artifacts` — activation status (both tenants)
- `get_iflow_content` — adapters (both tenants)
- `get_iflow_configurations` — parameters (both tenants)
- `get_artifact` — version metadata (both tenants)
- `get_failed_messages` — error counts (both tenants)