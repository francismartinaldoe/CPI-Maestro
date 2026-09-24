---
description: Run a GUARDIAN health check on all iFlows in iflow-watchlist.json in a single environment. Usage: /guardian-batch [in <env>]
---

Run a GUARDIAN spot-check on every iFlow listed in `iflow-watchlist.json`.

Parse $ARGUMENTS for optional environment:
- "in DEV" → environment=DEV
- "in TEST" → environment=TEST
- "in PROD" → environment=PROD
- Default: DEV

Steps:
1. Read `iflow-watchlist.json` to get the iFlow list.
2. For each iFlow, call `spotcheck_iflow` with the parsed environment.
3. Show per-iFlow progress and result as each completes.
4. After all iFlows, show the batch summary table.

---

## Progress format (per iFlow)
```
⏳ [X/N] GUARDIAN checking <iFlow name> in <ENV>...
✅/⚠️/❌ [X/N] Done — PASS / WARN / FAIL
```

## Batch summary table
```
## 🏁 GUARDIAN Batch Complete — <ENV> | <date>

| iFlow | ✅ PASS | ⚠️ WARN | ❌ FAIL | Overall |
|-------|--------|--------|--------|---------|
```

Bottom line:
- `🟢 All <N> iFlows in <ENV> are go-live ready.`
- OR `🚨 Block go-live on: <list of FAIL iFlows>`
- OR `⚠️ Review before go-live: <list of WARN iFlows>`

Then show the end-of-run menu.

---

## MCP Tools used
- `spotcheck_iflow` — one call per iFlow
- `get_runtime_artifacts` — for activation status context
