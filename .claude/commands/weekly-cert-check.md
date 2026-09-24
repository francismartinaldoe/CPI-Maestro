---
description: >
  Weekly certificate expiry health check across DEV, TEST, and PROD.
  Flags EXPIRED, CRITICAL (≤30 days), and WARNING (≤90 days) certificates sorted by urgency.
  Run every Monday morning or on demand before go-live.
  Usage: /weekly-cert-check
  Example: /weekly-cert-check
---

Run the weekly certificate expiry health check across all CPI tenants.

You are `@integration-detective`. Execute the following steps.

---

## Step 1 — Collect keystores from all tenants in parallel

Call `list_keystores` on:
- `CPI-DEV`
- `CPI-TEST`
- `CPI-PROD` (note if unavailable — credentials not configured)

---

## Step 2 — Calculate days remaining and classify

For each certificate, convert `validNotAfter` from epoch milliseconds:

```
days_left = (validNotAfter_epoch_ms - today_epoch_ms) / 86400000
```

| Days Left | Status | Action |
|---|---|---|
| < 0 | 🔴 EXPIRED | Renew immediately — integrations may already be failing |
| 0–30 | 🔴 CRITICAL | Renew before next go-live |
| 31–90 | 🟡 WARNING | Schedule renewal this sprint |
| > 90 | ✅ OK | No action needed |

---

## Step 3 — Infer integration usage from alias name

| Alias pattern | Likely used in |
|---|---|
| `ci_c4cv2_*`, `c4cv2_*` | C4C v2 / SCV2 integration |
| `ci_aem*` | AEM integration |
| `_cpq*`, `cpq*`, `cpq2*` | CPQ 2.0 integration |
| `ci_cpq*` | CPQ integration |
| `snc.*` | SNC / Secure Network Communication |
| `*outreach*` | Outreach integration |
| `concur*` | Concur integration |
| `gts*`, `_gts*` | GTS (Global Trade Services) |
| `eic*`, `api-eic*` | EIC integration |
| `ems*` | EMS (Entitlement Management) |
| `sftp*`, `delos_sftp*` | SFTP connections |
| `i5d*`, `i5t*`, `i4t*` | I5D/I5T/I4T system integration |
| `sap_*`, `sapnet*`, `sapglobal*` | SAP root/intermediate CA — SAP-managed, low risk |
| `ws_isf` | ISF / Web Services |
| `service_certificate_c4ctocpi` | C4C → CPI inbound authentication |
| `palm*` | PALM integration |
| `emsintegration*` | EMS integration technical user |
| `snib*` | SNIB processing |
| `*_hdl_cert` | HDL certificate |

---

## Step 4 — Output header

```
## 🔒 Weekly Certificate Health Check — {today's date}
Tenants: DEV ✅ | TEST ✅ | PROD ⚠️ not configured
```

---

## Step 5 — Output the expiry table (EXPIRED + CRITICAL + WARNING only)

Sort by days_left ascending (most urgent first). Skip ✅ OK entries.

| Alias | Type | Tenant | Expiry Date | Days Left | Status | Likely Used In |
|---|---|---|---|---|---|---|

If no certificates are expiring within 90 days:
> `✅ All certificates are healthy — nothing expiring within 90 days.`

---

## Step 6 — Summary line

```
🔴 N EXPIRED  🔴 N CRITICAL (≤30d)  🟡 N WARNING (≤90d)
```

---

## Step 7 — Action items

For every EXPIRED or CRITICAL entry output:
> `• Renew <alias> on <TENANT> immediately — expires <date> (<N> days overdue/remaining). Owner: Tenant Administrator → SAP CPI Monitor → Security Material → Keystore.`

---

## Step 8 — Cross-reference with active Outreach failures

If any EXPIRED or CRITICAL certificate alias matches an Outreach-related pattern (`*outreach*`, `c4cv2_outreach*`), add:
> `⚠️ WARNING: <alias> is used by Outreach integrations and is EXPIRED/CRITICAL. This is likely causing the active failures on Activity_based_Outreach_lead_creation_V1. Renew immediately.`

---

## Step 9 — Empowerment Note

End with:
> **Weekly Cert Check complete.**
> 🔑 Tier 3 — Any EXPIRED cert on an active iFlow = silent auth failures. Run `/rca-investigation <iflow>` if you see unexplained 401/403 failures — expired cert is the #1 probable RCA.
> 🔑 Tier 3 — PROD not checked. Fill `CPI_TENANT_URL` in `.env.prod` to include PROD in this check.
