---
description: >
  Check all keystore certificates across DEV, TEST, and PROD for expiry.
  Flags EXPIRED, CRITICAL (≤30 days), and WARNING (≤90 days) entries in a table.
  Shows which integration the certificate is likely used in.
  Usage: /cert-expiry-check
  Example: /cert-expiry-check
---

Run a full certificate expiry audit across all CPI tenants.

You are `@integration-detective`. Execute the following steps.

---

## Step 1 — Collect keystores from all tenants in parallel

Call `list_keystores` on:
- `CPI-DEV`
- `CPI-TEST`
- `CPI-PROD` (note if unavailable)

---

## Step 2 — Parse and classify expiry dates

Today's date is available from the system. For each certificate, convert `validNotAfter` from epoch milliseconds to a human-readable date and calculate days remaining:

```
days_left = (validNotAfter_epoch_ms - today_epoch_ms) / 86400000
```

Classify each entry:

| Days Left | Status |
|---|---|
| < 0 | 🔴 EXPIRED |
| 0 – 30 | 🔴 CRITICAL |
| 31 – 90 | 🟡 WARNING |
| > 90 | ✅ OK |

**Only include EXPIRED, CRITICAL, and WARNING entries in the output table.** Skip OK entries unless the user asks for all.

---

## Step 3 — Infer likely usage from alias name

Use alias naming patterns to infer which integration the cert belongs to:

| Alias pattern | Likely used in |
|---|---|
| `ci_c4cv2_*`, `c4cv2_*` | C4C v2 / SCV2 integration |
| `ci_aem*` | AEM integration |
| `_cpq*`, `cpq*` | CPQ 2.0 integration |
| `ci_cpq*` | CPQ integration |
| `snc.*` | SNC (Secure Network Communication) |
| `outreach*`, `c4cv2_outreach*` | Outreach integration |
| `concur*` | Concur integration |
| `gts*`, `_gts*` | GTS (Global Trade Services) |
| `eic*`, `api-eic*` | EIC integration |
| `ems*` | EMS (Entitlement Management) |
| `sftp*`, `delos_sftp*` | SFTP connections |
| `i5d*`, `i5t*` | I5D/I5T system integration |
| `sap_*` | SAP root/intermediate CA — low risk, SAP-managed |
| `ws_isf` | ISF / Web Services |
| `service_certificate_c4ctocpi` | C4C → CPI inbound auth |
| `palm*` | PALM integration |

---

## Step 4 — Output the table

```
## Certificate Expiry Audit — [date]
Tenants checked: DEV ✅ | TEST ✅ | PROD ⚠️ (not configured)
```

| Alias | Type | Tenant | Expiry Date | Days Left | Status | Likely Used In |
|---|---|---|---|---|---|---|

Sort by days left ascending (most urgent first).

Then output a summary line:
```
🔴 N EXPIRED  🔴 N CRITICAL  🟡 N WARNING  (PROD not checked)
```

---

## Step 5 — Recommendations

For each EXPIRED or CRITICAL entry, add one line:
> `• <alias> (<tenant>) — renew immediately. Contact: Tenant Administrator via SAP CPI Security Material UI.`

---

## Step 6 — Empowerment Note

End with:
> **Empowerment Note:**
> ✅ Tier 1 — `@integration-detective` cert expiry audit complete.
> 🔑 Tier 3 — Any entries marked EXPIRED on active iFlows will be causing silent auth failures. Cross-reference with `/rca-investigation` if you see unexplained failures.
