---
description: Run a MIRROR comparison for all iFlows in iflow-watchlist.json and generate a combined HTML + Excel report. Usage: /batch-compare [from <env>] [to <env>]
---

Run a batch MIRROR comparison for all iFlows listed in `iflow-watchlist.json`.

Parse $ARGUMENTS for optional environment overrides:
- "from DEV" → sourceEnv=DEV
- "to TEST" → targetEnv=TEST
- "from TEST to PROD" → sourceEnv=TEST, targetEnv=PROD
- Defaults come from the watchlist file itself (defaultSource / defaultTarget)

Call the `batch_compare` tool with any parsed env values.

---

## Progress output (per iFlow)
```
⏳ [X/N] Comparing `<iFlow name>`...
🟢/🟡/🔴 [X/N] <verdict> — N diff(s)
```

## Batch summary table
```
## 🏁 Batch Complete — <SRC> ↔ <TGT>

| iFlow | ✅ Match | ⚠️ Drift | ❌ Missing | ➕ Extra | Verdict |
|-------|---------|---------|----------|---------|---------|
```

Promotion readiness block:
- `🟢 Ready to promote: <iFlow list>`
- `🟡 Promote with caution: <iFlow list> — review drift items`
- `🔴 Block promotion: <iFlow list> — missing artifacts`

After the table, confirm:
- `🌐 HTML Report: <path>` (opened automatically on Windows)
- `📊 Excel Report: <path>` (opened automatically on Windows)

Then show the end-of-run menu.

---

## Watchlist format
To add iFlows, edit `iflow-watchlist.json` in the project root:
```json
{
  "defaultSource": "DEV",
  "defaultTarget": "TEST",
  "iflows": [
    { "id": "Artifact_ID", "name": "Display Name", "package": "PackageId", "notes": "optional" }
  ]
}
```

---

## MCP Tools used
- `batch_compare` — watchlist comparison loop + HTML/Excel report generation
