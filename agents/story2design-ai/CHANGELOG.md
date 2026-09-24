# Story2Design AI — Changelog

## v2.0 — 2026-06-25 — Merged into CPIMAESTRO as native Claude Code agent

**Breaking change:** The React + Express web application has been retired.

**Migration path:** Use `/generate-design-from-jira <KEY>` or `@-story2design` in VS Code chat.

**What changed:**
- Entire frontend (React 18, Vite, Tailwind) removed — VS Code chat is the new UI
- Express backend removed — no server to start
- PPTX filling engine (`pptxFiller.js`) replaced by Mermaid diagrams in markdown output
- PDF export replaced by markdown (paste directly into JIRA / Confluence)
- JIRA OAuth handled natively by `-JIRA` MCP server — no manual token refresh
- Template storage (`backend/templates/`) removed — no file system persistence needed
- Output format: 8-section structured markdown document (previously 8/12-slide PPTX or PDF)
- New slash command: `/generate-design-from-jira`
- New agent: `@-story2design` in `.claude/agents/-story2design.md`

**What stayed the same:**
- Two-pass AI generation logic (structure extraction → section content)
- Same 5 content sections: High Level Design, Pre-requisites, Process Flow, System Info, Open Points
- Same JIRA MCP integration (`jira_get_issue` with same field list)
- Same AI prompts for each section (ported verbatim, adapted for markdown output)
- Same SAP brand colours in diagrams (#0F2D4A source, #1A73C7 CPI, #0A4D28 target)

---

## v1.3 — 2026-06-01 — Push to JIRA feature removed

- Removed "Push design doc to JIRA" button — too risky in shared JIRA projects
- Read-only mode (`?mode=readonly`) kept but now default behaviour
- Fixed OAuth token refresh race condition on simultaneous requests

## v1.2 — 2026-05-15 — Template upload mode

- Added PPTX/DOCX/PDF template upload (fills user's own template structure)
- Added slide-by-slide content mapping (12-slide YOUR_JIRA_PROJECT-1165 template)
- Fixed XML byte-position shifting bug in PPTX filler when text contains &, <, >

## v1.1 — 2026-05-01 — Parallel generation

- Pass 2 now runs 5 Claude calls in parallel via `Promise.all()` (was sequential)
- Generation time reduced from ~45s to ~12s
- Added inline AI suggestions (per-field "suggest" button)

## v1.0 — 2026-04-20 — Initial release

- JIRA import via Claude Code MCP OAuth (SAP SSO)
- Two-pass AI generation: structure (Pass 1) + 5 sections (Pass 2)
- Export as PDF via jsPDF
- Manual form entry mode
- 11-section default SAP CPI design template
