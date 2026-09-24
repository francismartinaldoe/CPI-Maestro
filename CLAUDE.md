# CPI Maestro — Claude Code Workspace

---

## ⚠️ BEFORE YOU START — Required Configuration

**This workspace will not work until you provide CPI credentials. Complete this before doing anything else.**

### Step 1 — Copy the credential template

This repo contains `mcp-credentials.example` — copy it 3 times into the `mcp/` folder:

```bash
cp mcp-credentials.example mcp/.env.dev
cp mcp-credentials.example mcp/.env.test
cp mcp-credentials.example mcp/.env.prod
```

### Step 2 — Fill in your credentials

Open each `.env.*` file and fill in all values from:
**SAP BTP Cockpit → Service Instances → Process Integration Runtime → Service Keys → View Key**

| BTP Service Key field | → | Env var |
|----------------------|---|---------|
| `url` | → | `CPI_TENANT_URL` |
| `tokenurl` | → | `CPI_TOKEN_URL` |
| `clientid` | → | `CPI_CLIENT_ID` |
| `clientsecret` | → | `CPI_CLIENT_SECRET` |

Get `SAP_HUB_API_KEY` from your CPIT Lead.

### What breaks without credentials

| Missing | Agents that stop working |
|---------|------------------------|
| `.env.dev` | `@flowlens`, `@archflow`, `@detective` (DEV), `@gatekeeper`, `@c3` |
| `.env.test` | `@detective` (TEST), `@gatekeeper` (DEV↔TEST comparison) |
| `.env.prod` | `@detective` (PROD), `@gatekeeper` (PROD comparisons) |
| JIRA SSO not done | `@c3`, `@story2design`, all program agents |

### Full setup guide → [ONBOARDING.md](ONBOARDING.md)

---

## Contributing to Maestro

Everyone on the team can help Maestro grow. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**Quickest way:** `/learn <lesson>` — captures a lesson, raises a PR automatically.

### File Protection Tiers

| Tier | Files | Who can change |
|------|-------|---------------|
| 🟢 Free | `team-learnings.md`, `.claude/commands/`, `ONBOARDING.md`, `docs/` | Anyone via PR |
| 🟡 Review | `.claude/agents/`, `scripts/` | Anyone via PR — describe impact |
| 🔴 Restricted | `CLAUDE.md`, `.claude/hooks/`, `.claude/settings.json`, `mcp/`, `.githooks/` | Repo owner only |

---

## CRITICAL: Team Learnings — Always Apply

The file `.claude/memory/team-learnings.md` contains lessons learned from real usage by the team. **Read and apply every rule in that file in every session.** These rules take precedence over default behaviour.

To add a new lesson: `/learn <your lesson in plain English>`
Claude will capture it, commit it, and push it — your whole team gets it on next `git pull`.

---

## CRITICAL: Agent Invocation Rules

**CPI agents must be invoked directly in-session — never as background subprocesses.**

When a user asks for iFlows, packages, runtime status, health checks, or any CPI data:
- ✅ Invoke `@flowlens`, `@detective`, `@gatekeeper` directly in the conversation
- ❌ Never use the Agent tool to spawn them as background subprocesses

**Why:** The CPI MCP servers (`CPI-DEV/TEST/PROD`) are already connected in the session. Spawning a background agent starts a new subprocess with no MCP connection, causing 30-60s delays and frequent blocks. Direct invocation uses the live connection and responds immediately.

**Same rule applies to JIRA agents** — invoke `@story2design`, `@c3` directly.

---

## What this is

This workspace is the **SAP CPI Intelligence Hub** — a fleet of 15+ Claude Code
agents that connect directly to SAP CPI tenants and JIRA via MCP servers. No UI, no
Express server needed. Everything is driven through VS Code Claude chat.

**Start with `@maestro` for everything.** It routes to the right agent automatically —
you never need to know which specialist handles your request.

---

## The agents

### Entry point — use this first

| Agent | Invoke with | What it does |
|-------|------------|--------------|
| **Maestro** | `@maestro` | **Single entry point for everything.** Decomposes your request, runs the right agents in parallel/sequential/conditional order, returns one unified answer. You never need to know which specialist to use — just describe what you need. |

### CPI specialists (invoked by Maestro, or directly if you prefer)

| Agent | Invoke with | What it does |
|-------|------------|--------------|
| **Gatekeeper Goofy** | `@gatekeeper` | Cross-tenant drift comparison (MIRROR) — DEV vs TEST vs PROD, promotion readiness |
| **FlowLens AI** | `@flowlens` | iFlow design analysis, adapter/script explanation, Groovy generate/modify/simulate, field mapping tables, HTML reports |
| **Integration Detective** | `@detective` | iFlow health checks (8-check GUARDIAN pass), message monitoring, trace/debug, security, runtime status |
| **ArchFlow** | `@archflow` | Design integration architecture + generate and deploy iFlows to CPI |
| **C3 — Cutover Command Center** | `@c3` | Cutover readiness tracking — JIRA stories, CPI iFlow catalog, dependency map, auth matrix, go/no-go |
| **Story2Design** | `@story2design` | Generate integration design docs from JIRA stories — 8-section markdown, Mermaid diagram |
| **CPI Governance** | `@governance` | CPI ART governance workbook, story compliance checks, hierarchy tree |

---

## Tenant MCP servers

| MCP Server | Tenant | Status |
|------------|--------|--------|
| `CPI-DEV` | SAP CPI Development | ✅ Configured |
| `CPI-TEST` | SAP CPI Test | ⚠️ Fill in credentials |
| `CPI-PROD` | SAP CPI Production | ⚠️ Fill in credentials |
| `-JIRA` | JIRA | ⚠️ Fill in credentials |

**To add or update credentials:** edit `%APPDATA%\Claude\claude_desktop_config.json`
then restart Claude Desktop / VS Code.

---

## Quick examples

```
@maestro why did IF_CPQ_QuoteCreate fail today?
@maestro is IF_CPQ ready to promote to TEST?
@maestro generate design doc from YOUR_JIRA_PROJECT-7490 then create the iFlow
@maestro full go-live readiness for RD<MM> CPQ integrations
@maestro PI status and any blocked capabilities
```

Or invoke specialists directly if you know what you need:

```
@gatekeeper compare UpdateOpportunity from DEV to TEST
@flowlens explain the UpdateInvPartyInSAPCPQ iFlow
@flowlens generate a Groovy script that reads a JSON body and builds an OData filter
@detective list all failed messages in DEV today
@detective run a security audit on PROD
@archflow design an integration from S/4HANA to Salesforce via REST
@c3 give me a full cutover readiness report
@story2design generate design doc from YOUR_JIRA_PROJECT-7490
```

---

## Which agent to use

**Default: just use `@maestro` — it routes silently to the right specialist.**

If you prefer to route directly:

| Request | Agent |
|---------|-------|
| **Anything** | `@maestro` (recommended — routes automatically) |
| Compare DEV vs TEST / drift / MIRROR | `@gatekeeper` |
| Health check / spot-check / verify iFlow | `@gatekeeper` |
| Explain how an iFlow is built | `@flowlens` |
| Generate or modify a Groovy script | `@flowlens` |
| Design a new integration architecture | `@archflow` |
| Generate and deploy a new iFlow | `@archflow` |
| Failed messages / trace / debug | `@detective` |
| Certificates / keystores / security audit | `@detective` |
| JMS queues / data stores / variables | `@detective` |
| List packages / artifacts / runtime status | `@detective` |
| Deploy / undeploy an iFlow | `@detective` |
| Cutover readiness / go/no-go | `@c3` |
| JIRA story tracking / board | `@c3` |
| Auth matrix / security gaps pre-cutover | `@c3` |
| Generate integration design doc from JIRA story | `@story2design` |
| CPI ART governance workbook / story compliance | `@governance` |

---

## Credentials management

| MCP | Auth model | Where credentials live |
|-----|-----------|----------------------|
| `CPI-DEV/TEST/PROD` | OAuth2 client credentials | `%APPDATA%\Claude\claude_desktop_config.json` — per machine, never in git |
| `sap-jira` | User SSO (OAuth browser) | Claude Code manages automatically — no credentials needed |

**CPI credentials live only in `%APPDATA%\Claude\claude_desktop_config.json`** — one `env` block per tenant. Never in code, never committed to git.

---

## New Team Member Setup

**Step 1 — Clone both repos**
```bash
mkdir C:/Users/%USERNAME%/repos && cd C:/Users/%USERNAME%/repos
git clone https://github.<YOUR-DOMAIN>/YOUR-ORG/CPIMAESTRO.git
git clone https://github.<YOUR-DOMAIN>/YOUR-ORG/CPI_MCP.git
cd CPI_MCP && npm install && npm run build
```

**Step 2 — Create credential files for each tenant**
```bash
cd C:/Users/%USERNAME%/repos/CPI_MCP
cp .env.example .env.dev   # fill CPI_CLIENT_ID + CPI_CLIENT_SECRET for DEV
cp .env.example .env.test  # fill CPI_CLIENT_ID + CPI_CLIENT_SECRET for TEST
cp .env.example .env.prod  # optional — only if you have PROD access
```
Get `CLIENT_ID` and `CLIENT_SECRET` from: **SAP BTP Cockpit → Service Instances → Process Integration Runtime → Service Keys → View Key**

**Step 3 — Set up Claude Desktop MCP config**
```bash
cp C:/Users/%USERNAME%/repos/CPIMAESTRO/claude-config-example.json "%APPDATA%\Claude\claude_desktop_config.json"
```
Open the file and replace `<YOUR-USERNAME>` with your Windows username. No credentials needed — they are in `.env.dev/.env.test/.env.prod`.

**Step 4 — Restart VS Code**

All 3 CPI MCP servers start automatically. JIRA SSO prompt appears on first use.

**Step 5 — Verify**
```
@detective list packages in DEV
@flowlens show BP iFlows
/-status
```

---

## Credential file locations

| File | Location | In git? | Purpose |
|------|----------|---------|---------|
| `claude-config-example.json` | CPIMAESTRO repo root | ✅ Yes | Template — copy to `%APPDATA%\Claude\`, replace username only |
| `claude_desktop_config.json` | `%APPDATA%\Claude\` | ❌ Never | Live MCP config — paths only, no credentials |
| `.env.example` | CPI_MCP repo | ✅ Yes | Credential template — pre-filled URLs, fill secrets only |
| `.env.dev/.env.test/.env.prod` | CPI_MCP/ | ❌ Never (gitignored) | Real credentials per tenant per machine |

---

## Adding a new tenant

```json
"-CPI-UAT": {
  "command": "node",
  "args": ["C:/Users/<YOUR-USERNAME>/repos/CPI_MCP/dist/index.js"],
  "env": {
    "CPI_TENANT_URL": "https://...",
    "CPI_TOKEN_URL": "https://...",
    "CPI_CLIENT_ID": "...",
    "CPI_CLIENT_SECRET": "...",
    "SAP_HUB_API_KEY": "***REMOVED***"
  }
}
```

No code changes needed — the agents automatically work with any configured server name.

---

## Project layout

```
.claude/agents/
  archflow.md                   ← Design architecture + generate/deploy iFlows
  flowlens-ai.md                ← iFlow analysis + Groovy Studio definition
  gatekeeper-goofy.md           ← GUARDIAN + MIRROR agent definition
  integration-detective.md      ← Operations + monitoring + trace/debug definition
  c3-cutover-command-center.md  ← Cutover readiness + JIRA tracking definition
.claude/commands/               ← Slash commands
  -status.md
  -capability-check.md
  -feature-check.md
  -bug-query.md
  -kdd-guidance.md
  -test-report.md
  _som-capability-gate.md
  _som-kdd-overview.md
  _tech-update.md
  _tech-request.md
  architecture/
    analyze-design-doc.md       ← /analyze-design-doc
    describe-integration.md     ← /describe-integration
  iflow/
    create-iflow.md             ← /create-iflow
    create-from-doc.md          ← /create-from-doc
    generate-design-from-jira.md ← /generate-design-from-jira
  trace/
    check-iflow-status.md       ← /check-iflow-status
    debug-failed-message.md     ← /debug-failed-message
    read-trace-data.md          ← /read-trace-data
    set-trace-level.md          ← /set-trace-level
  repository/
    search-iflows.md            ← /search-iflows
.claude/assets/
  ref_iflow_template.iflw       ← BPMN 2.0 base template for iFlow generation
  ci-api-config.json            ← CPI OData entity definitions (37 entitySets)
.claude/hooks/                  ← Git & file protection
  git-sync-check.sh
  protect-core-files.sh
  protect-git-push.sh
  check-destructive-bash.sh
  setup--public.sh
  sync-changelog-to-public.sh
docs/cpi/                      ← knowledge base, brand assets, templates
config/                         ← Runtime config (agent-rules.json, iflow-watchlist.json)
src/
  agents/                       ← Claude agent classes (GatekeeperAgent, FlowLensAgent, etc.)
  features/governance/          ← Governance report generation
  mcp/                          ← MCP servers (CPI_MCP, JIRA_MCP)
  orchestrator/                 ← Intent routing, context, Maestro
  services/                     ← Shared credential + JIRA services
  tools/                        ← Anthropic.Tool[] definitions (organised by category)
    cpi/                        ← guardianTools, monitoringTools, securityTools, etc.
    jira/                       ← jiraTools (shared)
    flowlens/                   ← flowlensTools
  transport/                    ← MCP + HTTP clients
agents/                      ← Runnable sub-agent apps (MCP servers, CLIs)
  gatekeeper-goofy/             ← MCP server + CLI (TypeScript, CommonJS)
  story2design-ai/              ← Source preservation (no server — merged as pure agent)
```

---

---


## Program Intelligence

For program context — PI timeline, JIRA projects, agents, contacts, capability DoR,
KDD process, DevIT tracking, quality gates — clone **/Claude** alongside this repo.

CPIMAESTRO focuses exclusively on SAP CPI integration operations.
