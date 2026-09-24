---
description: Show CPI system health snapshot — runtime status, today's deployments, recent failures. Usage: /status [in <env>]
---

Parse $ARGUMENTS for optional environment (default: DEV).

Show a full system health snapshot for the named CPI tenant.

---

## Steps

1. Call `get_system_status` on the target MCP server
2. Call `get_todays_deployments` on the target MCP server
3. Call `get_failed_messages` (top=10) on the target MCP server

---

## Output Format

```
## 🛡️ CPI System Status — {ENV}  ({date})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tenant: <YOUR-CPI-SUBDOMAIN>-{env}  ({ENV})
🟢 Started: N  |  🔴 Error: N  |  🟡 Stopped: N  |  📦 Total: N
```

If Error count > 0:
```
⚠️ {N} artifact(s) in ERROR state — investigate before deploying.
```

---

### Today's Deployments

If iFlows deployed today:
```
| # | iFlow | Package | Deployed By | Time |
|---|-------|---------|-------------|------|
```

If none:
```
📭 No iFlows deployed today in {ENV}.
```

---

### Recent Failed Messages (last 10)

If failures found:
```
| Message ID | iFlow | Started | Error |
|-----------|-------|---------|-------|
```

If none:
```
✅ No failed messages found.
```

---

### Bottom Line

Flag any iFlow that appears in **both** ERROR runtime status AND recent failures:
```
🚨 {iFlow name} — ERROR runtime status + recent message failures. Run /spotcheck {name} to investigate.
```

Then show the end-of-run menu.

---

## MCP Tools used

- `get_system_status` — tenant-wide health summary
- `get_todays_deployments` — iFlows deployed today
- `get_failed_messages` — recent message failures