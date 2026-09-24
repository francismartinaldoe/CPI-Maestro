---
description: Run GUARDIAN spot-checks on all iFlows deployed today. Usage: /guardian-today [in <env>]
---

Run a GUARDIAN spot-check on every iFlow deployed today in the specified environment.

Parse $ARGUMENTS for optional environment:
- "in DEV" → environment=DEV
- "in TEST" → environment=TEST
- "in PROD" → environment=PROD
- Default: uses the environment configured in `.env` (SPOT_CHECK_ENV)

Steps:
1. Call `get_todays_deployments` to fetch today's iFlow list.
2. Show the deployment table — confirm count with the user.
3. Call `run_todays_spot_checks` to execute checks on all discovered iFlows.
4. Show results per iFlow then the batch summary.

---

## Deployment discovery table
```
## 🔍 Today's Deployments — <date>

| # | iFlow Name | Status | Deployed At | Version |
|---|-----------|--------|-------------|---------|
```

If no deployments found: `📭 No iFlows deployed today (<date>) in <ENV>.`

## Progress (one line per iFlow)
```
⏳ [X/N] GUARDIAN checking <iFlow>...
✅/⚠️/❌ [X/N] Done — PASS / WARN / FAIL
```

## Batch summary (same format as /guardian-batch)

Then show the end-of-run menu.

---

## MCP Tools used
- `get_todays_deployments` — scope discovery
- `run_todays_spot_checks` — batch execution
- `get_system_status` — optional tenant health context
