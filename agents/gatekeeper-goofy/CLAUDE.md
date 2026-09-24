# Gatekeeper-Goofy — SAP CPI Deployment Intelligence Agent

## What this project is
Gatekeeper-Goofy is a standalone MCP server (Node.js / TypeScript) that connects to SAP CPI Integration Suite tenants and performs:
- **GUARDIAN MODE** — 8-check health spot-check on a single iFlow in one environment
- **MIRROR MODE** — Full configuration comparison of an iFlow across two environments

It exposes tools that Claude can call conversationally. The compiled server lives at `dist/mcpServer.js`.

---

## CRITICAL RULES

1. **Never commit `.env`** — it contains live OAuth credentials and is gitignored.
2. **Always run `npm run build` after editing any `.ts` file** — Claude Desktop loads `dist/`, not `src/`.
3. **DEV, TEST, and PROD are all active tenants** — all three have credentials in `.env`.
4. **The `_DEV`, `_TEST`, and `_PROD` env suffixes** are all recognised — see `config.ts`.
5. **Parser reads `<bpmn2:messageFlow>` blocks** — not `<bpmn2:participant>`. Real adapter channels live in messageFlow elements with `<key>/<value>` child properties.

---

## Tenant Reference

| Label | System | Tenant URL | Notes |
|-------|--------|------------|-------|
| DEV | <YOUR-CPI-SUBDOMAIN>-dev | `https://<YOUR-CPI-SUBDOMAIN>-dev.<YOUR-CPI-HOST>.cfapps.<YOUR-REGION>.hana.ondemand.com` | Active development tenant |
| TEST | <YOUR-CPI-SUBDOMAIN>-test | `https://<YOUR-CPI-SUBDOMAIN>-test.<YOUR-CPI-HOST>.cfapps.<YOUR-REGION>.hana.ondemand.com` | QA / pre-production tenant |
| PROD | <YOUR-CPI-SUBDOMAIN>-prod | `https://<YOUR-CPI-SUBDOMAIN>-prod.<YOUR-CPI-HOST>.cfapps.<YOUR-REGION>.hana.ondemand.com` | Production tenant |

Token URLs follow the pattern: `https://<tenant-subdomain>.authentication.eu10.hana.ondemand.com/oauth/token`

---

## Key Packages & iFlows

| Package ID | Package Name | Main iFlows |
|------------|-------------|-------------|
| `YOUR_PACKAGE_ID` | SAP Sales Cloud Version 2 Custom Flows | Duplicate Opportunity Forecast Exclusion, Validate Contact and Duplicate Check, Update Opportunity in C4C Post Hook |
| `YOUR_PACKAGE_ID_2` | SAP CPQ 2.0 Custom Flows | Update Inv Party in SAP CPQ 2 Quote from C4C V2 Opportunity |
| `CNSDevelopment` | SAP Sales Cloud and SAP Service Cloud Version 2 Integration with SAP S/4HANA | Master data replication iFlows |
| `SAPSalesCloudVersion2IntegrationwithSAPCPQ` | SAP Sales Cloud Version 2 Integration with SAP CPQ | Quote integration flows |

---

## MIRROR Comparison — 17 Criteria

The MIRROR mode compares iFlows across these criteria in order:

| # | Criteria | Field in snapshot |
|---|----------|-------------------|
| C1 | iFlow Name | `iflowName` |
| C2 | iFlow Version | `version` |
| C3 | Runtime Status | `activationStatus` |
| C4 | Deployment Timestamp | `deployedOn` |
| C5 | Credentials (alias list) | `credentialAliases` |
| C6 | Keystore Aliases | `keystoreAliases` |
| C7 | OAuth Configurations | `oauthConfigs` |
| C8 | Endpoint URL + Protocol | `endpointUrl`, `endpointProtocol` |
| C9 | Adapter Channels (per adapter: host, address, credential, protocol, extra props) | `adapters[]` |
| C10 | Value Mappings | `valueMappings` |
| C11 | Package Membership | `packageId` |
| C12 | Description / Metadata | `description` |
| C13 | Externalized Parameters (all key/value) | `externalizedParams` |
| C14 | Message Log Level | `logLevel` |
| C15 | Error Count (7 days) | `errorCount7d` |
| C16 | Last Successful Run | `lastSuccessfulRun` |
| C17 | Configurable Parameters | `configurableParams` |

Verdict hierarchy: `MISSING` > `EXTRA` > `DRIFT` > `MATCH`
Overall label: `INCOMPLETE` (any MISSING) → `DRIFT` (any DRIFT/EXTRA) → `IN SYNC`

---

## GUARDIAN — 8 Health Checks

| # | Check | Rule Key | What it verifies |
|---|-------|----------|-----------------|
| 1 | iFlow Activation Status | `activationStatus` | Must be `STARTED` |
| 2 | Endpoint URL Reachability | `endpointReachability` | HTTP endpoint returns non-5xx |
| 3 | Credential / Keystore Health | `credentialHealth` | All aliases exist, no expired certs |
| 4 | Value Mapping Completeness | `valueMappingCompleteness` | Required VMs are deployed |
| 5 | Smoke Test — Synthetic Msg | `smokeTest` | POST to endpoint returns 200–202 (403 = skip) |
| 6 | Config vs Baseline Parity | `configParity` | Config params match saved baseline |
| 7 | Security Artifact Replication | `securityReplication` | Security artifacts present |
| 8 | Log Level Check | `logLevel` | Not running on TRACE/DEBUG in prod |

---

## Project Structure

```
src/
  mcpServer.ts          ← MCP server entry point (all tools + handlers)
  cpiClient.ts          ← All CPI API calls (OAuth, REST)
  config.ts             ← .env loading, loadConfigForEnv(), buildConfigFromCreds()
  types.ts              ← All TypeScript interfaces (AdapterConfig, ComparisonSnapshot…)
  spotCheckOrchestrator.ts ← Runs all 8 GUARDIAN checks
  modes/
    compassEngine.ts    ← MIRROR comparison engine (runCompass, runTriEnvCompass)
  report/
    compassExcelReporter.ts  ← MIRROR Excel (4 sheets)
    compassPptxReporter.ts   ← MIRROR PPTX (5 slides)
    excelReporter.ts         ← GUARDIAN Excel
    pptxReporter.ts          ← GUARDIAN PPTX
  utils/
    adapterParser.ts    ← BPMN2 ZIP → AdapterConfig[] (reads messageFlow elements)
    logger.ts
  checks/               ← One file per GUARDIAN check
  session/
    sessionStore.ts     ← In-memory wizard state (GUARDIAN + MIRROR steps)
dist/                   ← Compiled output — what Claude Desktop loads
agent-rules.json        ← Runtime config for checks (enable/disable, thresholds)
.env                    ← Credentials (gitignored, never commit)
```

---

## Common Commands

```bash
npm run build          # Compile TypeScript → dist/
npm install            # Install dependencies
node dist/mcpServer.js # Run the MCP server manually (for testing)
```

---

## Report Output Locations

| Report Type | Output Folder |
|-------------|--------------|
| GUARDIAN PPTX | `./reports/pptx/` — named `GUARDIAN_{ENV}_{iflow}_{YYYYMMDD}.pptx` |
| GUARDIAN Excel | `./reports/excel/` — named `GUARDIAN_{ENV}_{iflow}_{YYYYMMDD}.xlsx` |
| MIRROR PPTX | `./reports/compass/` — named `MIRROR_{src}_vs_{tgt}_{iflow}_{YYYYMMDD}.pptx` |
| MIRROR Excel | `./reports/compass/` — named `MIRROR_{src}_vs_{tgt}_{iflow}_{YYYYMMDD}.xlsx` |

---

## Known Adapter Types in this Landscape

| Adapter | Direction | System | Key properties |
|---------|-----------|--------|----------------|
| HTTPS | Sender | CPI inbound | `urlPath`, `senderAuthType`, `userRole` |
| HTTP | Receiver | C4C, CPQ, MDG | `httpAddressWithoutQuery`, `credentialName`, `httpMethod` |
| AdvancedEventMesh | Receiver | SAP AEM | `host` (broker URL), `destinationName` (queue), `messageVpn`, `keyStoreAlias` |
| HCIOData | Receiver | MDG | `address`, `credentialName`, `Location ID` |
| ProcessDirect | Both | Internal CPI | `address` (internal endpoint) |

AEM broker URLs follow: `tcps://<YOUR-AEM-HOST>:55443`
C4C tenant IDs: `<YOUR-C4C-DEV-TENANT>` (DEV), `<YOUR-C4C-TEST-TENANT>` (TEST)
CPQ hostnames: `<YOUR-CPQ-DEV-HOST>` (DEV), `<YOUR-CPQ-TEST-HOST>` (TEST)
MDG hostnames: `<YOUR-MDG-DEV-HOST>:443` (DEV), `<YOUR-MDG-TEST-HOST>:443` (TEST)

---

## Git User
- **Name:** <YOUR-NAME>
- **Email:** <YOUR-EMAIL>
