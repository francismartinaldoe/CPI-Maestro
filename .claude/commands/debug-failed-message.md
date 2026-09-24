---
description: Debug a failed SAP CPI iFlow message with root cause analysis. Usage: /debug-failed-message <iflow-id> [guid=<message-guid>]
---

Parse `$ARGUMENTS`:
- First token = iFlow ID (required, partial match accepted)
- `guid=<value>` = specific failed MessageGuid (optional — defaults to most recent FAILED run)

Use `@archflow-trace` agent:
1. `mcp__sap-cpi__get_failed_messages(artifactName)` — find most recent FAILED run (or use provided guid)
2. `mcp__sap-cpi__get_message_details(messageId)` — full error text, last error step, HTTP status
3. `mcp__sap-cpi__get_trace_log(messageId)` — payload at failing step (if TRACE was active)

Example: `/debug-failed-message IF_CPQ_S4HANA_QuoteCreate`

Output:
- Full MessageGuid (never truncate)
- Failed step name
- Full exception message
- HTTP status code and endpoint URL
- Root cause diagnosis table (pattern → likely cause → fix)
- One concrete recommended fix