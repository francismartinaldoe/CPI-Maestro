---
description: Run MIRROR cross-tenant comparison on a named iFlow. Usage: /compare <iflow-name> [from <env>] [to <env>]
---

Parse $ARGUMENTS for:
- **iFlow name** (required) — may be partial; confirm full name before running
- **sourceEnv** (optional) — DEV, TEST, or PROD (default: DEV)
- **targetEnv** (optional) — DEV, TEST, or PROD (default: TEST)

Then run a full MIRROR comparison of that iFlow between the two tenants.

---

## Steps

1. Call `get_runtime_artifacts` on both MCP servers in parallel to find the iFlow
2. Call `get_iflow_content` on both MCP servers in parallel
3. Call `get_iflow_configurations` on both MCP servers in parallel
4. Call `get_artifact` on both MCP servers for version/package metadata
5. Call `get_failed_messages` on both MCP servers
6. Diff all results field by field
7. Produce 4-section report

---

## Output Format — MANDATORY 5-column tables

### Header

```
## 🔄 MIRROR Comparison — {iFlow Name}
**Source:** {SRC} | **Target:** {TGT} | **Run:** {datetime}
**Overall Verdict:** 🟢 IN SYNC / 🟡 DRIFT / 🔴 INCOMPLETE
```

---

### Section 1 — iFlow Identity & Runtime

| Field | Parameter Key | {SRC} Value | {TGT} Value | Status |
|-------|---------------|-------------|-------------|--------|
| iFlow Name | `(fixed value)` | … | … | ✅ MATCH |
| Bundle Version | `(fixed value)` | … | … | … |
| Runtime Status | `(fixed value)` | … | … | … |
| Package | `(fixed value)` | … | … | … |
| Deployed On | `(fixed value)` | … | … | … |
| Deployed By | `(fixed value)` | … | … | … |
| Failed Messages (recent) | `(fixed value)` | … | … | … |

---

### Section 2 — Adapter Channels

One subsection per adapter. Use `#### 2a — {Type} ({Direction})` headers.

| Field | Parameter Key | {SRC} Value | {TGT} Value | Status |
|-------|---------------|-------------|-------------|--------|
| Adapter Type | `(fixed value)` | … | … | … |
| Host / Address | `host` | … | … | … |
| Queue / Topic | `{QueueName` | … | … | … |
| Message VPN | `MessageVPN` | … | … | … |
| Auth Method | `Authentication` | … | … | … |
| Keystore Alias | `KeystoreAlias` | … | … | … |
| (all other properties) | `key_name` | … | … | … |

---

### Section 3 — Externalized Parameters

ALL parameters from `get_iflow_configurations` — every key.

| Field | Parameter Key | {SRC} Value | {TGT} Value | Status |
|-------|---------------|-------------|-------------|--------|

**Bold the entire row if Status is ⚠️ DRIFT, ❌ MISSING, or ➕ EXTRA.**

---

### Section 4 — Summary

```
| Metric | Count |
|--------|-------|
| ✅ MATCH | N |
| ⚠️ DRIFT | N |
| ❌ MISSING | N |
| ➕ EXTRA | N |

**Overall: 🟢 IN SYNC / 🟡 DRIFT / 🔴 INCOMPLETE**

**Action items:**
- ⚠️ {field}: {SRC value} → {TGT value} — update {TGT} to match {SRC}
- ❌ {field}: present in {SRC}, missing in {TGT} — add missing parameter

**Warnings (same value, potentially wrong for environment):**
- ⚠️ {field} = `{value}` on both tenants — verify this is intentional for {TGT}
```

Then show the end-of-run menu.

---

## Column Rules (strictly enforced)

- **Parameter Key** — `` `key_name` `` if from `get_iflow_configurations`, `` `(fixed value)` `` if from BPMN2 adapter XML
- **Never write "same"** — repeat the full actual value in both columns
- **Never truncate** URLs, hostnames, GUIDs, parameter values
- **Never invent** — unavailable value = `—`
- **Multi-key fields** — first key on Field row, additional keys on `↳` rows

---

## Examples

- `/compare Involved Parties Determination in Sales Cloud v2` → DEV vs TEST
- `/compare Involved Parties Determination in Sales Cloud v2 from DEV to TEST`
- `/compare UpdateOpportunity from TEST to PROD`

---

## MCP Tools used

- `get_runtime_artifacts` — activation status + version (called on both tenants)
- `get_iflow_content` — BPMN2 adapters + design-time content (called on both tenants)
- `get_iflow_configurations` — externalized parameters (called on both tenants)
- `get_artifact` — metadata: version, package, description (called on both tenants)
- `get_failed_messages` — recent error count (called on both tenants)
