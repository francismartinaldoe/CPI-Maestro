---
description: Generate a promotion readiness drift report across all iFlows in iflow-watchlist.json. Usage: /drift-report [from <env>] [to <env>]
---

Generate a **promotion readiness drift report** for all iFlows in `iflow-watchlist.json`.

Parse $ARGUMENTS for optional environment overrides:
- "from DEV to TEST" → sourceEnv=DEV, targetEnv=TEST
- "from TEST to PROD" → sourceEnv=TEST, targetEnv=PROD
- Defaults: from watchlist `defaultSource` / `defaultTarget`

Call the `batch_compare` tool, then synthesise the output into a promotion-focused report.

---

## Output format

### Header
```
## 🧭 Promotion Readiness Report — <SRC> → <TGT>
<date> | <N> iFlows assessed
```

### Readiness summary (top-level, before detail)
```
| Status | Count | iFlows |
|--------|-------|--------|
| 🟢 Ready to promote | N | iFlow1, iFlow2 |
| 🟡 Promote with caution | N | iFlow3 |
| 🔴 Blocked | N | iFlow4 |
```

### Detail table
```
| iFlow | Drift Items | Blockers | Recommendation |
|-------|-------------|----------|----------------|
```

For each drifted/blocked iFlow, list:
- The specific drifted parameters (e.g. `host_C4C`, `communicationsystemid`)
- Whether drift is **expected** (env-specific URLs, GUIDs) or **unexpected** (logic flags, event type conditions)
- Recommended action: Promote / Review / Block

### Expected vs Unexpected drift classification
- **Expected drift** (env URLs, tenant IDs, GUIDs, queue names) → note as acceptable, still promote
- **Unexpected drift** (event type conditions, skip flags, logic parameters) → flag as `🔴 Investigate before promoting`

### Bottom line
One sentence: overall promotion readiness verdict for this batch.

Then show the end-of-run menu.

---

## MCP Tools used
- `batch_compare` — drives the comparison data
- `compare_iflow` — called per-iFlow for detail if needed
