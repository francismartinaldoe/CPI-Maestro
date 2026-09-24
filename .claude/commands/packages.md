---
description: List packages or iFlows within a package. Usage: /packages [<package-id>] [in <env>]
---

Parse $ARGUMENTS for:
- **package-id** (optional) — if provided, list artifacts in that specific package
- **environment** (optional) — DEV, TEST, or PROD (default: DEV)

---

## Steps

**If no package-id given:**
1. Call `list_packages` on the target MCP server
2. Show table of all packages

**If package-id given:**
1. Call `list_artifacts(packageId)` on the target MCP server
2. Show table of all artifacts in that package

---

## Output Format

### All packages (no package-id argument)

```
## 📦 Integration Packages — {ENV}

| # | Package ID | Name | Description | Artifacts |
|---|-----------|------|-------------|-----------|
| 1 | YOUR_PACKAGE_ID | SAP Sales Cloud V2 Custom Flows | … | N |
| 2 | YOUR_PACKAGE_ID_2 | SAP CPQ 2.0 Custom Flows | … | N |
```

### Artifacts in a specific package

```
## 📦 {Package Name} — {ENV}

| # | Artifact ID | Name | Type | Version |
|---|------------|------|------|---------|
| 1 | Involved_Parties_Determination_in_Sales_Cloud_v2 | Involved Parties Determination in Sales Cloud v2 | IntegrationFlow | 1.0.9 |
```

Then show the end-of-run menu.

---

## Examples

- `/packages` → list all packages in DEV
- `/packages YOUR_PACKAGE_ID` → list all iFlows in that package
- `/packages YOUR_PACKAGE_ID in TEST` → same in TEST tenant

---

## MCP Tools used

- `list_packages` — all packages in tenant
- `list_artifacts` — artifacts within a specific package