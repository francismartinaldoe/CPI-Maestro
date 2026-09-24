---
description: Show CPI system status and today's deployments across DEV and TEST tenants. Usage: /status
---

Generate a CPI system status snapshot for the current tenant.

No arguments needed. Runs three calls in sequence.

---

## Step 1 — System health
Call `get_system_status` and show:
```
## 🛡️ CPI System Status — <today's date>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tenant: <YOUR-CPI-SUBDOMAIN>-<env>  (<ENV>)
🟢 Started: N  |  🔴 Error: N  |  🟡 Stopped: N  |  📦 Total: N
```

If Error > 0: add `⚠️ <N> artifact(s) in ERROR state — investigate before deploying.`

## Step 2 — Today's deployments
Call `get_todays_deployments` and show:
```
### Today's Deployments
N iFlow(s) deployed today

| # | iFlow Name | Status | Deployed At | Version |
|---|-----------|--------|-------------|---------|
```
If none: `📭 No iFlows deployed today.`

## Step 3 — Recent failures
Call `get_failed_messages` with top=10 and show:
```
### Recent Failures (last 10)
| Message ID | iFlow | Started | Error |
|------------|-------|---------|-------|
```
If none: `✅ No failed messages found.`

## Bottom line
Flag any iFlow that appears in both "ERROR status" AND "recent failures" as:
`🚨 <iFlow name> — ERROR runtime status + recent failures. Run /spotcheck <name> to investigate.`

---

## MCP Tools used
- `get_system_status`
- `get_todays_deployments`
- `get_failed_messages`
