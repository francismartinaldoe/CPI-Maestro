---
description: Enable or disable TRACE log level on a SAP CPI iFlow to capture step payloads. Usage: /set-trace-level <iflow-id> <TRACE|INFO|ERROR>
---

Parse `$ARGUMENTS`:
- First token = iFlow ID (required, partial match accepted)
- Second token = log level: `TRACE`, `INFO`, `DEBUG`, `WARN`, or `ERROR` (required)

Call `mcp__sap-cpi__set_iflow_log_level` with the iFlow ID and level.

Example: `/set-trace-level IF_CPQ_S4HANA_QuoteCreate TRACE`
Example: `/set-trace-level IF_CPQ_S4HANA_QuoteCreate INFO`

If API returns 403 (CPI OAuth client lacks WorkspacePackagesConfigure):
```
API permission denied — set manually in CPI Monitor:
Steps: Manage Integration Content → <iflowId> → Log Configuration → set to TRACE
```

On success:
```
Log level set to TRACE for <iflowId>
Next: trigger the iFlow, then use /read-trace-data <iflowId> to see payloads.
Remember: switch back to INFO after debugging to avoid large log storage.
```