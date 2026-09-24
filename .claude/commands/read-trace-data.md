---
description: Read step-by-step trace payloads from a SAP CPI iFlow run. Usage: /read-trace-data <iflow-id> [guid=<message-guid>]
---

Parse `$ARGUMENTS`:
- First token = iFlow ID (required)
- `guid=<value>` = specific MessageGuid (optional — defaults to most recent run)

Use `@archflow-trace` agent:
1. `mcp__sap-cpi__get_failed_messages(artifactName)` — find most recent MPL run if no guid provided
2. `mcp__sap-cpi__get_message_details(messageId)` — run steps with timing
3. `mcp__sap-cpi__get_trace_log(messageId)` — payload content per step

Example: `/read-trace-data IF_CPQ_S4HANA_QuoteCreate`
Example: `/read-trace-data IF_CPQ_S4HANA_QuoteCreate guid=4a5498afe2c443a845a092d4472ee50`

If LogLevel is not TRACE, output:
```
No payloads captured — iFlow is running at INFO level.
Use /set-trace-level <iflow-id> TRACE to enable payload capture.
```