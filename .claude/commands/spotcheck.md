---
description: Run GUARDIAN 8-check health spot-check on a named iFlow. Usage: /spotcheck <iflow-name> [in <env>]
---

Parse $ARGUMENTS for:
- **iFlow name** (required) — may be partial; search for the full name before running
- **environment** (optional) — DEV, TEST, or PROD (default: DEV)

Then run a full GUARDIAN spot-check on that iFlow.

---

## Steps

1. Call `get_runtime_artifacts` to find the iFlow (partial name match OK — confirm full name if ambiguous)
2. Call `get_iflow_content` to inspect adapter channels and parameters
3. Call `get_iflow_configurations` to get externalized parameters
4. Call `list_keystores` + `list_credentials` + `list_oauth_credentials` for credential health
5. Call `get_failed_messages` filtered to this iFlow for error count
6. Call `list_service_endpoints` to check endpoint reachability
7. Run all 8 checks, assemble report

---

## Output Format

```
## 🛡️ {iFlow Name} — GUARDIAN Spot-Check [{ENV}]
**Run ID:** SC-{timestamp} | **Checked:** {datetime} | **Overall:** {badge}

---

### Check Results

| # | Check | Status | Detail | Auto-Fix? |
|---|-------|--------|--------|-----------|
| 1 | iFlow Activation Status | ✅ PASS | Status: STARTED — deployed 2026-06-18 | ✘ Manual |
| 2 | Endpoint URL Reachability | ✅ PASS | HTTP 200 — endpoint reachable | ✘ Manual |
| 3 | Credential / Keystore Health | ✅ PASS | ci_aem ✔  ci_c4cv2_apiuser ✔ | ✘ Manual |
| 4 | Value Mapping Completeness | ✅ PASS | 3 value mappings deployed | ✘ Manual |
| 5 | Smoke Test — Synthetic Message | ⏭️ SKIP | 403 returned — auth required by caller | — |
| 6 | Config vs Baseline Parity | ⏭️ SKIP | No baseline saved for this iFlow | — |
| 7 | Security Artifact Replication | ✅ PASS | Keystores: 4 ✔  Credentials: 6 ✔ | ✘ Manual |
| 8 | Log Level Check | ✅ PASS | Log level: INFO | ✘ Manual |

**✅ 6 PASS  ⚠️ 0 WARN  ❌ 0 FAIL  ⏭️ 2 SKIP**

---

### Go-Live Verdict

🟢 DEV deployment is healthy.
```

Then show the end-of-run menu.

---

## Examples

- `/spotcheck Involved Parties Determination in Sales Cloud v2` → check in DEV
- `/spotcheck Involved Parties Determination in Sales Cloud v2 in TEST` → check in TEST
- `/spotcheck UpdateOpportunity in PROD` → check in PROD

---

## MCP Tools used

- `get_runtime_artifacts` — activation status + version
- `get_iflow_content` — design-time adapter + parameter inspection
- `get_iflow_configurations` — externalized parameter values
- `list_keystores` — certificate expiry
- `list_credentials` — credential alias existence
- `list_oauth_credentials` — OAuth alias health
- `get_failed_messages` — error count last 7 days
- `list_service_endpoints` — endpoint reachability