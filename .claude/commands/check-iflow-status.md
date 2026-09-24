---
description: Check deployment status and recent execution health of a SAP CPI iFlow. Usage: /check-iflow-status <iflow-id>
---

Parse `$ARGUMENTS` as an iFlow ID (partial match accepted).

Use `@archflow-trace` agent with these MCP tool calls:
1. `mcp__sap-cpi__get_runtime_artifacts` — get deployment status, version, deployed by/on
2. `mcp__sap-cpi__get_failed_messages(artifactName)` — last 10 runs, count COMPLETED vs FAILED
3. `mcp__sap-cpi__get_message_details` — error details for any FAILED runs

Example: `/check-iflow-status IF_CPQ_S4HANA_QuoteCreate`

Output format:

### Deployment
| Field | Value |
|-------|-------|
| Status | STARTED / STOPPED / ERROR |
| Version | — |
| Deployed By | — |
| Deployed On | — |

### Execution Health (last 10 runs)
| Status | Count |
|--------|-------|
| COMPLETED | — |
| FAILED | — |

### Errors (if any)
Full error messages — never truncate.

### Verdict
`Healthy` / `Review needed` / `Failing`