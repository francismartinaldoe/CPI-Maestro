# /agents — Maestro Agent Fleet Directory

Display the full Maestro agent fleet. Accepts an optional filter: `cpi`, ``, or an agent name keyword.

## Instructions

Parse `$ARGUMENTS` for an optional filter keyword (case-insensitive). Default: show all agents.

Print the following output exactly, applying the filter if provided.

---

## Output

**Filter logic:**
- No argument → print both sections
- `cpi` → print CPI Specialists section only
- `` → print Program Agents section only
- Any other keyword → filter rows where agent name or role contains that keyword

---

Print this response:

---

## Maestro Agent Fleet

> **Start with `@maestro` — describe what you need, it routes automatically.**
> Use specialist agents directly when you know exactly what you want.

---

### CPI Specialist Agents

| Agent | Invoke | Role |
|-------|--------|------|
| **Maestro** | `@maestro` | Single entry point — routes everything automatically |
| **Story2Design** | `@-story2design` | Architect — JIRA story → full integration design doc in 30 seconds |
| **ArchFlow** | `@archflow` | Builder — design architecture, generate and deploy iFlows from design doc |
| **FlowLens AI** | `@flowlens-ai` | Developer Peer — explain iFlows, write/review/simulate Groovy, guide where to add logic |
| **Gatekeeper Goofy** | `@gatekeeper-goofy` | Reviewer — DEV vs TEST vs PROD drift, config review, GO/NO-GO verdict |
| **Integration Detective** | `@integration-detective` | Operations — health checks, failed messages, trace/debug, security audit |
| **C3 Cutover** | `@c3-cutover-command-center` | Go-Live — cutover readiness, JIRA + CPI correlation, auth matrix |
| **CPI Governance** | `@cpi-governance` | Governance — story compliance, ART governance workbook, hierarchy tree |

**Example prompts:**
```
@maestro why did IF_CPQ_QuoteCreate fail today?
@-story2design generate design doc from YOUR_JIRA_PROJECT-7490
@archflow design an integration from S/4HANA to CPQ via REST
@flowlens-ai explain IF_CPQ_QuoteCreate
@flowlens-ai write a Groovy script that reads JSON and builds an OData filter
@flowlens-ai review what I built in IF_BP_Sync
@gatekeeper-goofy compare IF_CPQ between DEV and TEST
@integration-detective run health check on IF_BP_Sync
@c3-cutover-command-center full readiness report for RD08
```

---

### Program Agents

| Agent | Invoke | Role |
|-------|--------|------|
| **Solution Manager** | `@-solution-manager` | Capability backlog, quality gates, DoR gap analysis |
| **STE** | `@-ste` | JIRA quality, DoR validation, feature freeze coordination |
| **Delivery Lead** | `@-delivery-lead` | PI health, delivery status, cross-workstream reporting |
| **Program Manager** | `@-program-manager` | Status reports, PI objectives, SteerCo preparation |
| **Risk Manager** | `@-risk-manager` | RAID register, blockers, ROAM framework, escalations |
| **Workstream Lead** | `@-workstream-lead` | Workstream planning, feature flow, activity backlog |
| **CPIT Lead** | `@-cpit-lead` | IT portfolio, DevIT items, RICEFW scope |
| **Solution Architect** | `@-solution-architect` | Architecture assessments, KDD, SDD, DAB submissions |
| **Testing** | `@-testing` | Test plans, execution, bug management, BAT/E2E BAT |
| **DevIT** | `@-devit` | DevIT request status, PDD slips across all products |
| **HTML Report** | `@-html-report` | HTML report generation in SAP Morning design system |

**Example prompts:**
```
@-solution-manager which capabilities are ready for next PI?
@-delivery-lead PI26/2 delivery status
@-risk-manager what is blocked this week?
@-program-manager draft weekly status update
@-testing test coverage for RD08 CPQ features
@-devit open DevIT items for BRIM
```

---

### Quick Filter Tips

```
/agents          ← full fleet
/agents cpi      ← CPI specialists only
/agents      ← program agents only
/agents groovy   ← agents relevant to Groovy scripting
/agents testing  ← agents relevant to testing
```

> **19 specialists. One entry point. You just describe what you need.**
