# CPI Maestro — Team Onboarding Guide

> Welcome to the SAP CPI Intelligence Hub. This guide gets you connected and productive in under 15 minutes.

---

## Quick Start — One Command

```bash
git clone --recurse-submodules https://github.<YOUR-DOMAIN>/YOUR-ORG/CPIMAESTRO.git
cd CPIMAESTRO
```

Then open the folder in VS Code and in the Claude chat type:

```
/setup-mcp
```

This detects exactly what is missing and tells you step by step what to run. Nothing more, nothing less. If MCP is not configured, the hook will also remind you automatically on your first prompt.

---

## Step 1 — Prerequisites

| Requirement | How to Check | Where to Get It |
|-------------|-------------|----------------|
| **Git** | `git --version` | IT Service Desk |
| **VS Code** | Open VS Code | [code.visualstudio.com](https://code.visualstudio.com) |
| **Claude Code extension** | Search "Claude Code" in VS Code Extensions | VS Code Marketplace |
| **Node.js 18+** | `node --version` | [nodejs.org](https://nodejs.org) |
| **Python 3.10+** | `python --version` | [python.org](https://python.org) |
| **SAP BTP access** | Can log into BTP Cockpit | SAP Basis / project lead |

---

## Step 2 — Clone

```bash
git clone --recurse-submodules https://github.<YOUR-DOMAIN>/YOUR-ORG/CPIMAESTRO.git
cd CPIMAESTRO
```

> ⚠️ `--recurse-submodules` is required — it clones the CPI MCP server into `mcp/`. Without it all CPI agents fail.

When VS Code asks "Do you trust the authors?" — click **Yes**.

---

## Step 3 — Install Python dependencies

```bash
pip install -r scripts/requirements.txt
```

This installs `requests`, `openpyxl`, and `pywin32` — required for `/cpi-governance` and the cert monitor.

---

## Step 4 — Configure CPI credentials

Fill in your BTP Service Key credentials for each tenant:

```bash
# DEV (required)
# Edit mcp/.env.dev and fill in all 4 values

# TEST (optional)
# Edit mcp/.env.test

# PROD (optional)
# Edit mcp/.env.prod
```

**Get credentials from:** SAP BTP Cockpit → Services → Service Instances → Process Integration Runtime → Service Keys → View Key

| BTP Service Key field | → | Env var |
|----------------------|---|---------|
| `url` | → | `CPI_TENANT_URL` |
| `tokenurl` | → | `CPI_TOKEN_URL` |
| `clientid` | → | `CPI_CLIENT_ID` |
| `clientsecret` | → | `CPI_CLIENT_SECRET` |

---

## Step 5 — Build the MCP server

```bash
cd mcp && npm install && npm run build && cd ..
```

---

## Step 6 — Register CPI MCP servers in your user settings

The CPI MCP servers must be registered in **your personal** `~/.claude/settings.json` — NOT in the project `.claude/settings.json`. This is per-machine because paths contain your username.

Run these 3 commands (replace `<YOUR-USERNAME>` with your Windows username):

```bash
claude mcp add --scope user CPI-DEV --command node -- \
  --env-file=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/.env.dev \
  C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/dist/index.js

claude mcp add --scope user CPI-TEST --command node -- \
  --env-file=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/.env.test \
  C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/dist/index.js

claude mcp add --scope user CPI-PROD --command node -- \
  --env-file=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/.env.prod \
  C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/dist/index.js
```

> **Why user settings, not project settings?** Paths contain your username — they are per-machine. The project `.claude/settings.json` must NOT have `mcpServers` — if it does, it shadows your user-level servers and CPI agents stop working.

---

## Step 7 — Restart VS Code

Close and reopen VS Code. The CPI MCP servers start automatically:

- `CPI-DEV` ← from `mcp/.env.dev`
- `CPI-TEST` ← from `mcp/.env.test`
- `CPI-PROD` ← from `mcp/.env.prod`

Verify with:
```
@integration-detective list packages in DEV
```

---

## Step 8 — Authenticate JIRA MCP

Run the JIRA auth helper — opens your browser for SAP SSO automatically:

```bash
python scripts/jira_auth_helper.py
```

Token lasts 15 minutes. Re-run when it expires. The `/cpi-governance` pre-flight check will also detect and fix auth issues automatically.

> **On corporate proxy (SAP network/VPN):** `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` will be auto-set by Claude Code — do NOT remove it, it is required by the proxy. The `jira_auth_helper.py` PKCE flow works regardless of this flag.

---

## Step 9 — Playwright MCP (Browser Automation)

Playwright MCP enables Claude to control Microsoft Edge — taking screenshots, navigating CPI UI, setting log levels, and reading trace payloads directly from the browser.

**No setup needed** — already configured in `~/.claude/settings.json`:

```json
"playwright": {
  "command": "npx",
  "args": ["-y", "@playwright/mcp@latest", "--browser=msedge"]
}
```

**Verify it works** — type this in Claude chat:
```
take a screenshot of https://google.com
```
If Edge opens and a screenshot appears → ✅ working.

If it fails → `Ctrl+Shift+P` → `Developer: Reload Window` → retry.

> **Note:** Playwright creates a `.playwright-mcp/` folder for temp logs — this is gitignored automatically. You can safely delete it at any time.

---

## Step 10 — CPI Governance Workbook (first run)

```bash
/cpi-governance
```

The pre-flight check validates everything automatically:
- ✅ `openpyxl` installed
- ✅ Build script exists
- ✅ JIRA MCP authenticated
- ✅ Output directory writable

If anything fails it tells you exactly what to fix. Output goes to `Downloads/governance_report/`.

---

## Step 9 — Certificate Expiry Monitor (optional but recommended)

Emails the team every Monday if any CPI certificate is expiring.

```bash
# Copy and fill config
cp scripts/cert_monitor_config.example.json scripts/cert_monitor_config.json
# Edit scripts/cert_monitor_config.json:
#   - Add your email to email_recipients
#   - Fill in CPI_CLIENT_ID and CPI_CLIENT_SECRET for DEV and TEST

# Test it
python scripts/cert_expiry_monitor.py
```

**Set up Task Scheduler (runs every Monday 8am automatically):**
1. Windows key → search "Task Scheduler" → open
2. Create Basic Task → Name: `CPI Cert Monitor`
3. Trigger: Weekly → Monday → 8:00 AM
4. Action: Start a program → `scripts\run_cert_monitor.bat`
5. Finish

> Requires Outlook installed and logged in (uses your existing Outlook session to send email — no SMTP password needed).

---

## What You Now Have

### The Golden Rule — Start Here

> **You only need to know one agent: `@maestro`**
> Describe what you need in plain English. Maestro routes to the right specialist automatically.
> You never need to choose an agent — but the full fleet is available when you want to go direct.

```
@maestro why did IF_CPQ_QuoteCreate fail today?
@maestro is CPQ ready to promote to TEST?
@maestro generate design doc from YOUR_JIRA_PROJECT-7490
@maestro full go-live readiness for RD08
@maestro PI status and any blocked capabilities
```

---

### CPI Specialist Agents

> Your peer team for everything integration. Four roles covered.

| Agent | Invoke | Role | Example Prompts |
|-------|--------|------|----------------|
| **Maestro** | `@maestro` | Single entry point — routes everything | `@maestro why did X fail?` / `@maestro is X ready for TEST?` |
| **Story2Design** | `@-story2design` | **Architect** — JIRA story → full integration design doc in 30s | `@-story2design generate design doc from YOUR_JIRA_PROJECT-7490` |
| **ArchFlow** | `@archflow` | **Builder** — design architecture, generate + deploy iFlows from design doc | `@archflow design an integration from S/4HANA to CPQ via REST` |
| **FlowLens AI** | `@flowlens-ai` | **Developer Peer** — explain iFlows, write/review/simulate Groovy, guide where to add logic | `@flowlens-ai explain IF_CPQ_QuoteCreate` / `@flowlens-ai write a Groovy script that reads JSON and builds an OData filter` / `@flowlens-ai review what I just built in IF_BP_Sync` |
| **Gatekeeper Goofy** | `@gatekeeper-goofy` | **Reviewer** — DEV vs TEST vs PROD drift, config review, GO/NO-GO verdict | `@gatekeeper-goofy compare IF_CPQ_QuoteCreate between DEV and TEST` / `@gatekeeper-goofy is IF_BP_Sync ready to promote?` |
| **Integration Detective** | `@integration-detective` | **Operations** — health checks, failed messages, trace/debug, security audit, cert expiry | `@integration-detective why did IF_CPQ fail today?` / `@integration-detective run health check on IF_BP_Sync` |
| **C3 Cutover** | `@c3-cutover-command-center` | **Go-Live** — cutover readiness, JIRA + CPI correlation, auth matrix, go/no-go | `@c3-cutover-command-center full readiness report for RD08` |
| **CPI Governance** | `@cpi-governance` | **Governance** — story compliance, ART governance workbook, hierarchy tree | `@cpi-governance audit INT_CPI stories for RD08` |
| **CI Scenario Doc** | `@ci-scenario-doc` | **Documentation** — add iFlow to SAP CI Scenario Word document, all 12 sections, diagrams, screenshots | `@ci-scenario-doc iflow=AEM_Gateway_Topic_Determination doc=C:\...\doc.docx` |

---

### Program Agents

> Your peer team for program management, delivery, and governance.

| Agent | Invoke | Role | Example Prompts |
|-------|--------|------|----------------|
| **Solution Manager** | `@-solution-manager` | Capability backlog, quality gates, DoR gap analysis | `@-solution-manager which capabilities are ready for PI26/3?` |
| **STE** | `@-ste` | JIRA quality, DoR validation, feature freeze coordination | `@-ste check DoR for YOUR_JIRA_PROJECT-1234` |
| **Delivery Lead** | `@-delivery-lead` | PI health, delivery status, cross-workstream reporting | `@-delivery-lead PI26/2 delivery status` |
| **Program Manager** | `@-program-manager` | Status reports, PI objectives, SteerCo preparation | `@-program-manager draft weekly status update` |
| **Risk Manager** | `@-risk-manager` | RAID register, blockers, ROAM framework, escalations | `@-risk-manager what is blocked this week?` |
| **Workstream Lead** | `@-workstream-lead` | Workstream planning, feature flow, activity backlog | `@-workstream-lead DE&R workstream status` |
| **CPIT Lead** | `@-cpit-lead` | IT portfolio, DevIT items, RICEFW scope | `@-cpit-lead open DevIT items for CPQ` |
| **Solution Architect** | `@-solution-architect` | Architecture assessments, KDD, SDD, DAB submissions | `@-solution-architect review KDD for YOUR_JIRA_PROJECT-1234` |
| **Testing** | `@-testing` | Test plans, execution, bug management, BAT/E2E BAT | `@-testing test coverage for RD08 CPQ features` |
| **DevIT** | `@-devit` | DevIT request status, PDD slips across all products | `@-devit DevIT delivery health for BRIM` |
| **HTML Report** | `@-html-report` | HTML report generation in SAP Morning design system | `@-html-report generate Feature Test Execution Report for RD08` |

### Skills (slash commands)

| Command | What It Does |
|---------|-------------|
| `/rca-investigation <iflow>` | Cross-tenant RCA grid — burst analysis, ranked causes |
| `/cert-expiry-check` | On-demand cert expiry audit across all tenants |
| `/weekly-cert-check` | Monday morning cert health report |
| `/debug-failed-message <iflow>` | Full debug on the most recent failed message |
| `/check-iflow-status <iflow>` | Quick status check on a named iFlow |
| `/set-trace-level <iflow>` | Enable TRACE/DEBUG on an iFlow (DEV/TEST only) |
| `/cpi-governance` | Generate 16-sheet CPI ART Governance Workbook |
| `/cpi-governance cache=true` | Regenerate Excel without re-fetching JIRA |
| `/-status` | Live program snapshot |
| `/-capability-check SP-XXXX` | DoR completeness check |
| `/-feature-check YOUR_JIRA_PROJECT-XXXX` | Feature DoR check |
| `/-bug-query` | Standard bug JQL for active release |
| `/-test-report` | Generate Feature Test Execution Report HTML |
| `/learn <lesson>` | Capture a team lesson → raises PR for review |
| `/ci-scenario-doc iflow=X doc=<path>` | Add iFlow to SAP CI Scenario Word document — all 12 sections, diagrams, screenshots |

---

## Keeping Up to Date

Claude Code auto-pulls on every session start:

```
-GIT-SYNC: Auto-pulled N commit(s) from origin/main. Workspace is now current.
```

To manually update:
```bash
git pull origin main
cd mcp && npm run build && cd ..
```

---

## Troubleshooting

### CPI MCP not connecting — check these 5 in order

| # | Symptom | Root Cause | Fix |
|---|---------|-----------|-----|
| 1 | `mcp__CPI-DEV__*` tools missing | `mcp/dist/` not built | `cd mcp && npm install && npm run build` → reload VS Code |
| 2 | 401 / credentials error | `.env.dev` missing or empty | `cp mcp/.env.example mcp/.env.dev` → fill from BTP Service Keys → reload VS Code |
| 3 | `mcp/` folder empty | Cloned without `--recurse-submodules` | `git submodule update --init --recursive` → `cd mcp && npm install && npm run build` → reload |
| 4 | Tools not found despite dist/ existing | CPI servers not in `~/.claude/settings.json` | Run the 3 `claude mcp add --scope user` commands from Step 6 above → reload |
| 5 | CPI servers registered but still ignored | Project `.claude/settings.json` had `mcpServers` block — **fixed in repo** | `git pull` → reload VS Code — the project file no longer shadows user settings |

**Verify fix:** type `@integration-detective list packages in DEV` in Claude chat.

### Other issues

| Problem | Fix |
|---------|-----|
| JIRA "Needs authentication" | `python scripts/jira_auth_helper.py` |
| JIRA browser never opens | `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` is set by your corporate proxy — **do NOT remove it**. Run `python scripts/jira_auth_helper.py` instead — it bypasses the flag. |
| `/cpi-governance` fails | Pre-flight will tell you exactly what's wrong. Manual check: `python -c "import openpyxl; print('ok')"` and `python scripts/jira_auth_helper.py` |
| `list_keystores` 400 error | Already fixed — run `cd mcp && npm run build` to get the latest fix |
| MCP server fails to start | `cd mcp && npm install && npm run build` → reload VS Code |
| Cert monitor not sending email | Confirm Outlook is open and logged in on your machine |

---

## Credential Security Rules

| Rule | Detail |
|------|--------|
| `mcp/.env.*` stays on your machine | Gitignored — never commit |
| `cert_monitor_config.json` stays on your machine | Gitignored — never commit |
| Never paste credentials in Claude chat | Claude will never ask for them |
| JIRA auth is per-person | `jira_auth_helper.py` gets your own token |
| Rotate if exposed | Contact SAP BTP admin to rotate Service Keys |

---

## Getting Help

| Topic | Contact |
|-------|---------|
| Maestro workspace issues | Repository owner (see CONTRIBUTING.md) |
| CPI tenant access / credentials | Your project lead or SAP Basis |
| program questions | `@maestro` in Claude Code |
| Feature request | `/_tech-request` in Claude Code |
| JIRA access | IT Service Desk |
