# Story2Design AI — Onboarding Guide

Welcome! This guide gets you generating integration design documents in 2 minutes.

## What you need

- VS Code with Claude Code extension (already installed if you're reading this)
- Access to SAP JIRA via the `-JIRA` MCP server (configured in Claude Desktop)
- A JIRA story key for an integration requirement (e.g. `YOUR_JIRA_PROJECT-7490`)

## Generate your first design document

Open VS Code chat and type:

```
/generate-design-from-jira YOUR_JIRA_PROJECT-7490
```

That's it. The agent will:
1. Fetch the JIRA ticket automatically (no login prompt needed)
2. Analyse the requirements using AI
3. Output a complete 8-section design document in this chat

## Adding extra context

If the ticket is missing details, add them inline:

```
/generate-design-from-jira YOUR_JIRA_PROJECT-7490 extra="Target system uses SOAP, not REST. Auth is Basic Auth with credential alias ZZZ_CPQ_CRED"
```

## What you get

A full markdown document with:
- Document ownership table
- High Level Design with Mermaid flow diagram (SAP brand colours)
- Numbered integration steps
- Pre-requisites list
- Swimlane process flow table
- System information (endpoints, auth, payload samples)
- Field mappings table
- Open points and decisions table with standard items pre-filled

## After the document is generated

The agent offers 5 next actions:

| Option | What it does |
|--------|-------------|
| Save to file | Writes `YYYYMMDD_HHMM_{name}_DesignDoc.md` to the workspace |
| Generate iFlow | Creates the iFlow in SAP CPI via `@archflow-iflow` |
| Architecture review | Full Mermaid architecture + iFlow JSON via `@archflow-architecture` |
| Create JIRA sub-task | Logs a design review task in JIRA |
| Refine a section | Ask the agent to expand or update any section |

## Supported JIRA projects

Any project accessible via your-JIRA MCP connection:
- `YOUR_JIRA_PROJECT-XXXX` — team stories
- `YOUR_JIRA_PROJECT-XXXX` — ART features
- Any other project your JIRA user can read

## Troubleshooting

**"Could not find YOUR_JIRA_PROJECT-XXXX"**
Check the ticket key is correct and that you have read access in JIRA.

**"-JIRA MCP not available"**
The JIRA MCP server may need a fresh OAuth flow. Open `/setup/mcp-auth-guide.html`
and follow the SAP SSO instructions, then retry.

**The document is missing details**
Add them via the `extra=` parameter or ask the agent to refine a specific section after generation.

## Migrating from the old web app

The old `CPI-Story2Design-AI` React app has been retired. This agent produces the same
content with no server startup. The main difference: output is markdown (not PPTX/PDF).
Markdown pastes directly into JIRA descriptions, Confluence pages, and GitHub.
