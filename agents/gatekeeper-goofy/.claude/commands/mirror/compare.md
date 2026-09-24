---
description: Compare an iFlow configuration between two CPI environments and generate a full MIRROR report. Usage: /compare <iflow-name> [from <env>] [to <env>]
---

Run a full MIRROR comparison report for the iFlow named in $ARGUMENTS.

Parse $ARGUMENTS to extract:
- iFlow name (required — everything before "from" or "to" keywords)
- sourceEnv (optional — word after "from", default: DEV)
- targetEnv (optional — word after "to", default: TEST)

Examples:
- `/compare Update Inv Party in SAP CPQ` → DEV vs TEST
- `/compare Duplicate Opportunity Forecast Exclusion from DEV to TEST`
- `/compare Validate Contact from TEST to PROD`
- `/compare Send Employee Data from AEM to C4Cv2 from TEST to PROD`

Call the `compare_iflow` tool with the parsed values.

---

## MANDATORY TABLE FORMAT — every comparison table, no exceptions

| Field | Parameter Key | {SRC} Value | {TGT} Value | Status |
|-------|---------------|-------------|-------------|--------|

**Rules:**
- **Parameter Key** — `` `key_name` `` if externalized, `` `(fixed value)` `` if hardcoded
- **Value columns** — resolved actual value, never `{{placeholder}}` strings
- **Never write "same"** — always repeat the full value in both columns
- **Multi-key fields** — first `{{key}}` on Field row, each additional key on a `↳` row
- **Missing key** — `⚠️ \`key_name\` not configured in <ENV>` → status `❌ MISSING`

---

## Output section order — never change

### Section 1 — iFlow Identity & Runtime
Table: `# | Criteria | {SRC} Value | {TGT} Value | Status`
Rows: iFlow Name, Version, Runtime Status, Package, Deployment Timestamp, Log Level, Error Count (7d), Last Successful Run

### Section 2 — Adapter Channels
One subsection per adapter channel (2a, 2b, 2c…)
Label: `2x — Direction: Type (ChannelName)`
Show every field: Type, Direction, Host, Address, Protocol, Credential, and ALL extra props.
Use 5-column format for every row.

### Section 3 — Externalized Parameters
Table: `# | Parameter Name | {SRC} Value | {TGT} Value | Status`
List ALL parameters. Bold the name for DRIFT / MISSING / EXTRA rows.

### Section 4 — Summary
Counts table (MATCH / DRIFT / MISSING / EXTRA) + overall verdict emoji + specific action items per drift item.

Then show the 5-option end-of-run menu.

---

## MCP Tools used
- `compare_iflow` — primary comparison engine
- `get_iflow_content` — BPMN2 adapter details
- `get_iflow_configurations` — externalized parameters
