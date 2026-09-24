# Story2Design AI — Source Preservation

This folder preserves the documentation for the original `CPI-Story2Design-AI` web application.

## What the original app did

`CPI-Story2Design-AI` was a React + Express web application that generated professional SAP CPI
integration design documents (PowerPoint and PDF) from JIRA tickets in approximately 20 seconds.

**Original capabilities:**
- JIRA import via Claude Code MCP OAuth (SAP SSO — no manual token needed)
- Two-pass AI generation: structure extraction (Pass 1) then 5 parallel section prompts (Pass 2)
- Export as `.pptx` (filling the team's YOUR_JIRA_PROJECT-1165 template) or PDF via jsPDF
- Manual form entry mode (no JIRA ticket required)
- Template upload mode (user uploads custom .pptx/.docx/.pdf template)

**Original stack:** React 18 · Express 5 · `@anthropic-ai/sdk` · JSZip (PPTX filling) · jsPDF

## Why it was merged

The web app required starting two processes (backend port 3002, frontend port 3000) before use,
which slowed the team down. Claude Code agents in VS Code chat offer the same AI generation
capability with zero startup overhead, native JIRA MCP access, and output that can be directly
pasted into JIRA / Confluence.

## How to use it now

The web app has been retired. Use the native Claude Code agent instead:

```
# In VS Code chat or CLI
/generate-design-from-jira YOUR_JIRA_PROJECT-7490

# With additional context
/generate-design-from-jira YOUR_JIRA_PROJECT-7490 extra="Target uses OAuth 2.0 client credentials"

# Or address the agent directly
@-story2design generate design doc for YOUR_JIRA_PROJECT-7490
```

The agent:
1. Fetches the JIRA ticket via `-JIRA` MCP (same OAuth as the original app)
2. Runs two-pass AI analysis (same prompts as the original backend)
3. Outputs a full 8-section markdown document with Mermaid flow diagram
4. Offers to save as `.md`, create the iFlow in SAP CPI, or log a JIRA sub-task

## What was intentionally not ported

| Dropped | Reason |
|---------|--------|
| React frontend | VS Code chat is the UI |
| Express backend | No server needed — Claude calls JIRA MCP directly |
| PPTX filling engine (`pptxFiller.js`) | Replaced by Mermaid diagrams in markdown |
| PDF export (`exportPdf.js`) | Markdown is more portable for team use |
| Template storage (`backend/templates/`) | No file persistence needed in agent mode |
| Settings modal / `config.json` | Credentials managed by MCP server config |

## Original source code

The original full source (`backend/`, `frontend/`) lives in the team's GitHub repository:
`https://github.<YOUR-DOMAIN>/YOUR-ORG/CPI-Story2Design-AI`

Do not copy the backend or frontend source into this CPIMAESTRO workspace — it is intentionally
excluded to keep the workspace clean. This documentation folder is the only artefact needed.
