---
description: Show agent audit logs — tool calls, PROD access events, and errors. Pass optional filter: /agent-audit prod, /agent-audit errors, /agent-audit today
---

Parse `$ARGUMENTS` for optional filter:
- `prod` — show PROD access log only
- `errors` — show tool error log only
- `today` — filter to today's entries
- (empty) — show summary of all logs

## What to do

1. Read the log files from `logs/` directory:
   - `logs/agent-audit.log` — all MCP tool calls
   - `logs/prod-access.log` — PROD-only access events
   - `logs/tool-errors.log` — 403/401/500 errors
   - `logs/sessions.log` — session start events

2. Parse each line as JSON and produce a summary table

3. Output format:

### Agent Audit Summary

**Period:** {earliest entry} → {latest entry}
**Total tool calls:** {n}
**PROD access events:** {n}
**Errors:** {n}
**Active users:** {list}

### Top Tools Called
| Tool | Count | Tenants |
|------|-------|---------|

### PROD Access Events
| Timestamp | User | Tool | Artifact |
|-----------|------|------|----------|

### Errors
| Timestamp | User | Tool | Error Code | Message |
|-----------|------|------|-----------|---------|

4. If log files don't exist yet, say: "No audit logs found. Logs will appear here after agents are invoked. Ensure hooks are configured in .claude/settings.json"
