---
description: >
  Full RCA investigation across all tenants for a named iFlow or topic area.
  Pulls failed messages from DEV + TEST + PROD, analyses burst patterns,
  compares cross-tenant, and outputs the structured RCA grid.
  Usage: /rca-investigation <iflow-name-or-topic>
  Example: /rca-investigation Outreach
  Example: /rca-investigation Activity_based_Outreach_lead_creation_V1
---

Run a full RCA investigation for: **$ARGUMENTS**

You are `@integration-detective`. Execute the following steps in order.

---

## Step 1 — Collect failed messages across all tenants

Call `get_failed_messages` on **all 3 tenants** in parallel:
- `CPI-DEV` — `fromDate` = 5 days ago, `top=50`, filter by `$ARGUMENTS` if it looks like an iFlow name
- `CPI-TEST` — same
- `CPI-PROD` — same (if credentials configured; note if unavailable)

---

## Step 2 — Runtime status check

Call `get_runtime_artifacts` on DEV and TEST to check if the iFlow is STARTED / STOPPED / ERROR.

---

## Step 3 — Deep-dive on top failures

For the tenant with the most failures, pick the **5 most recent distinct failed MessageGuids** (different ApplicationMessageIds where possible).

For each, call `get_message_details(messageId)` and extract:
- Exact error text (verbatim — never truncate)
- Step name where failure occurred
- HTTP status code if visible
- ApplicationMessageId
- logStart / logEnd timestamps and duration

---

## Step 4 — Pattern analysis

From the collected data, analyse:

1. **Burst vs steady:** Did all failures happen in a tight time window (< 60 sec)? Or spread over hours/days?
2. **ApplicationMessageId pattern:** Same ID retrying = payload-specific issue. All different IDs = deterministic defect (every message fails).
3. **Duration pattern:** < 3 sec = fast fail (auth/mapping/script). > 30 sec = timeout (connectivity/firewall).
4. **Cross-tenant pattern:** DEV clean + TEST failing = config drift. Both failing = iFlow defect. Only PROD failing = prod-specific config.
5. **Shared infra check:** Did any OTHER iFlow fail in the same time window? If yes = possible shared infra issue. If no = iFlow-specific.

---

## Step 5 — Output the RCA grid

Produce this table — one row per iFlow that had failures, plus rows for zero-failure flows in the same family:

| iFlow Name | Total Failures (per tenant) | Source | Target | Issue Type | RCA (Evidence from Logs) | Probable RCA (Ranked) |
|---|---|---|---|---|---|---|

**RCA (Evidence from Logs)** must include:
- Burst window (start time, end time, duration)
- Message count and whether IDs are distinct or repeating
- Failure duration per message
- Cross-tenant comparison result
- Shared infra ruling
- Any access blockers (403 on trace = state this explicitly)

**Probable RCA (Ranked)** must use:
- 🔴 High — credential expiry / auth failure (fast fail 1–2s = HTTP 401/403)
- 🟠 Medium-High — Groovy NPE on missing field (same record retrying)
- 🟠 Medium — value mapping gap (lookup table missing entry)
- 🟡 Lower — mandatory field missing in mapping (HTTP 400 structural)
- 🟡 Lower — recent redeployment regression

---

## Step 6 — State blockers and fastest confirmation path

Always end with:
1. **What cannot be confirmed and why** (e.g. trace returns 403 = MCP service key lacks `AuthGroup.IntegrationDeveloper` in BTP)
2. **Fastest manual path to confirm** (e.g. CPI Monitor → failed GUID → Run Steps tab — 2 min, no permission changes)

---

## Step 7 — Empowerment Note

End every investigation with:

> **Empowerment Note:**
> ✅ Tier 1 — [what agent .md rule applies / was updated]
> 🔧 Tier 2 — [skill suggestion if this sequence would benefit from automation]
> 🔑 Tier 3 — [any human action needed: exact BTP permission, exact person, exact fix]
