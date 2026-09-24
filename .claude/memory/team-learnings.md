# Maestro Team Learnings

This file captures lessons learned from real usage. Every entry here is a rule
Claude follows in every session for every team member.

Add new lessons with: `/learn <your lesson>`

---

## Agent Discoverability

- **The VS Code agent panel is cosmetic — all agents in `.claude/agents/` are auto-discovered and accessible via `@name` regardless of what the panel shows.** The panel surfaces only recently used agents. All 19+ agents are fully functional — team members just need to type `@agent-name`. Never diagnose a "missing agent" from the panel view alone.
- **Teach the team one word first: `@maestro`.** Nobody needs to memorise 19 agent names. Maestro routes automatically. Only introduce specialist agents when someone hits a specific use case they want to own directly.
- **`/agents` is the canonical in-chat discovery command.** Team members can type `/agents` to see the full fleet, `/agents cpi` for CPI specialists only, `/agents ` for program agents only. Use it on day one — no documentation needed.
- **ONBOARDING.md is the team's agent directory** — full fleet split into CPI Specialists and Program Agents, each with role description and 2–3 copy-paste example prompts. When adding a new agent, always update ONBOARDING.md and `/agents` skill in the same commit.
- **Agent discoverability strategy has three layers:** (1) `@maestro` as the single entry point everyone knows; (2) `ONBOARDING.md` as the written reference with examples; (3) `/agents` skill for in-chat lookup. All three must stay in sync when agents are added or renamed.

## Agent Invocation

- **Never spawn `@flowlens`, `@detective`, `@gatekeeper`, `@story2design`, `@archflow`, `@c3` or ANY named agent via the `Agent` tool (`subagent_type`) for any reason.** Always invoke them directly in the conversation by tagging them. The MCP is already connected in-session — subagent spawning adds latency, breaks MCP tool access, and violates this rule. This applies to ALL request types without exception. If in doubt: tag the agent name in response text, never call the `Agent` tool.
- **iFlow generation ("create an iFlow", "generate an iFlow", "build an iFlow from this design doc") must be routed to `@archflow` — never build BPMN, ZIP, or Groovy scripts in the main session.** `@archflow` owns the full generation workflow: package confirmation, iFlow ID proposal, user approval gate, ZIP build, and CPI upload. Bypassing it causes delays and skips the mandatory confirmation gate.
- **When user asks for failed flows + RCA, always invoke `/rca-investigation` skill** — never run `get_failed_messages` + manual parsing as a substitute. `/rca-investigation` is the skill built for exactly this. Only use raw MCP tools if the skill is explicitly not applicable.
- **iFlow search requests (show iFlows with X, list iFlows for Y, which iFlows use Z) must be routed to `@flowlens` CATALOG mode.** Never answer iFlow discovery queries with raw Python scripts. `@flowlens` owns all iFlow discovery, listing, and catalog queries.
- **iFlow build guidance requests ("I need to add X", "where do I add logic", "how do I add error handling", "what is missing in this iFlow") must be routed to `@flowlens` BUILD ASSISTANT mode.** Never answer CPI build placement questions without reading the live BPMN first. `@flowlens` reads the actual iFlow, picks the exact insertion point from the real step sequence, generates the code, and gives click-by-click CPI Designer instructions.
- **Message mapping requests ("generate a mapping", "I need to map these fields", "I found a .mmap file") must be routed to `@flowlens` MAPPING GENERATOR mode.** FlowLens reads source+target fields or pasted payloads, decides Groovy vs XSLT, and generates the full artefact with real field names. Never produce a generic mapping without running the field diff analysis first.
- **Mapping view requests ("show mapping in X", "view mapping X", "show me the field mapping table", "what does mapping Y do") must be routed to `@flowlens` MAPPING VIEW mode.** FlowLens lists all transformation resources numbered, user picks one, FlowLens produces a 5-column table: Source | Logic | Target | Explanation | Confidence. Groovy/XSLT rows are ✅ CONFIRMED (parsed from code). .mmap rows are 🟡 INFERRED. Never describe a mapping in bullet points — the table IS the explanation.
- **Section 5 of every IFLOW EXPLORER must produce field mapping tables for every resource, not bullet lists.** Every Groovy script, XSLT, and .mmap gets: purpose sentence + BPMN step + 5-column mapping table + standards check. This is non-negotiable.
- **Payload transformation requests ("transform source to target", "diff these payloads", paste source+target JSON/XML) must be routed to `@flowlens` GROOVY STUDIO → Payload Diff sub-mode.** Always state the Groovy vs XSLT decision with reason before generating code.
- **Value mapping requests ("lookup table", "how do I call value mapping from Groovy") must produce BOTH the artifact definition AND the Groovy call pattern.** Never give one without the other.
- **`@flowlens` Session Context Store is built after every IFLOW EXPLORER** — field names, headers, aliases, endpoint patterns are held in memory and injected automatically into every script/mapping generated in the session. If no iFlow has been analysed, tell the user to run `@flowlens explain {iflow_id}` first to get real names injected.
- **`@flowlens` Build Health Check runs automatically after every IFLOW EXPLORER** — 7-check structural audit (error subprocess, logging, empty params, retry, duplicate check, payload validation, alert on failure). Never skip. Surfaces gaps with recommended fixes pointing to BUILD ASSISTANT.
- **iFlow explain/design requests ("what does X do", "how is X built", "explain X iFlow") must be routed to `@flowlens` IFLOW EXPLORER mode.** Never explain iFlow design using raw MCP tool calls. `@flowlens` owns all design-time iFlow analysis — even when `get_artifact` returns 501, it falls back to Parameters-Only Analysis using `get_iflow_configurations`. The user should NEVER have to type `@flowlens` — Maestro detects the intent and routes silently.
- **Maestro must route silently — users should never need to type agent names.** "Explain X iFlow" → `@flowlens`. "Spot check X" → `@gatekeeper`. "Why did X fail" → `/rca-investigation`. "Compare X DEV vs TEST" → `@gatekeeper`. "List iFlows for X / find X iFlows" → `@flowlens` CATALOG. Maestro's job is to detect intent and invoke the right agent. Bypassing agents with raw MCP calls is always wrong, even if the output looks similar.
- **Groovy and XSLT script requests for iFlows must be routed to `@flowlens`.** "Write a Groovy script", "generate an XSLT", "should I use XSLT or Groovy", "modify this script" → `@flowlens`. It enforces 6 SAP CPI Groovy standards and 10 XSLT 2.0 standards (Saxon HE). Never generate scripts with raw output or general-purpose agents.
- **`get_iflow_content` MCP tool now returns `scriptStepMap`** — a `{ "filename.groovy": "Step Name" }` object parsed from the BPMN XML inside the ZIP. FlowLens uses this to populate the confirmed BPMN Step column (✅) in the Resource Map. If `scriptStepMap` is absent or has no entry for a file, show `—` — never guess or infer step names from name similarity.
- **BPMN step column was historically always wrong** — before this fix, `get_iflow_content` returned scripts and bpmnSteps as two completely separate flat lists with zero linkage. Every BPMN step assignment shown was a name-similarity guess, not a fact. The root cause: the BPMN XML (which contains `<bpmn2:scriptTask><bpmn2:resource>filename.groovy</bpmn2:resource>`) was not parsed by the MCP. Fixed by adding BPMN XML parsing to `CPIMAESTRO/mcp/src/tools/content.ts`. All Groovy and XSLT generation is done by Claude's own intelligence using iFlow context read from `get_iflow_content` and `get_iflow_configurations`. Never reference, call, or document tools that do not exist in the CPI MCP server.
- **`@flowlens` BUILD HEALTH CHECK is a named mode, not just a background step.** Users can explicitly trigger it with "health check this iFlow", "what gaps does this iFlow have", "run build health check on X". It runs the 7-check structural audit (error subprocess, logging, empty params, retry, duplicate check, payload validation, alert on failure) and returns a full gap table with recommended fixes. It also runs automatically after every IFLOW EXPLORER — but exposing it as an addressable mode means users can run it standalone without a full analysis.
- **iFlow resource file inspection ("show me SetHeaders.groovy", "open file 2", "inspect this script") must be routed to `@flowlens` FILE INSPECTOR mode.** It applies a security gate (blocks credential-pattern files), runs automatic standards checks on display, and enables inline edit/enhance with complete file output and CPI Designer paste-back instructions.
- **JIRA context for iFlows ("why was this iFlow built", "what JIRA story covers this", "find the feature behind X", "JIRA deep dive") must be routed to `@flowlens` JIRA EXPLORER mode.** It runs a 3-pass search across YOUR_JIRA_PROJECT + YOUR_JIRA_PROJECT, fetches every matching Feature and linked Stories in full, and synthesises a Business Capability Explanation and per-story "Why this development was needed". Never do a raw JIRA search as a substitute.
- **iFlow HTML report requests ("generate HTML report for X iFlow") must be routed to `@flowlens`.** The user triggers it via option 7 in the End-of-Analysis Menu or by saying "generate HTML / save as HTML". `@flowlens` produces a SAP Morning 2026 self-contained HTML file saved to `output/flowlens/` with Resource Explorer accordion cards and (if JIRA Explorer ran) a JIRA Context section.
- **`/cpi-story-format-check` is the canonical story quality gate** — 24 gates based on YOUR_JIRA_PROJECT-7383 template: 8 MUST-HAVE attribute gates (IF_Type_CPI, RICEFW, Interface_Build, INT-CPI labels, Priority, Version/Delivery, Sprint, Status=Development Ready) + 16 section gates (01 Functional Background through CPI Developer Section). Scoring: ✅=1pt · ⚠️NA=0.5pt · ❌=0pt. Bands: ≥90% GREEN · 70-89% AMBER · <70% RED. Works for single story (`YOUR_JIRA_PROJECT-XXXX`), release (`RD08`), or stream (`stream=DE&R`). Section must have real content beyond template placeholders `<...>` to pass — empty template = ❌. — use the right one for the job:
  - `/cpi-governance-features [release]` — fast (~30s) — CPI ART list, status, owner, hierarchy gaps. No story fetch.
  - `/cpi-governance-stories [release]` — slow (~90s) — 15-gate story compliance check, RAG matrix by stream.
  - `/cpi-governance-workbook [release]` — full (~2min) — combines both into 16-sheet Excel. Use for weekly reporting.
  - `/cpi-story-check YOUR_JIRA_PROJECT-XXXX` — single story scorecard.
  All 4 skills live under `@governance`. Never trigger the full workbook when the user only needs a feature list.


- **CPI ART release hierarchy queries are fully dynamic** — when user asks for any release view ("RD08 CPI ARTs", "show me RD10 integrations", "what iFlows are in RD11"), extract the release code from the user's message (e.g. `RD08` → filter `fixVersions` containing `RD08`; `RD10` → filter containing `RD10`). Never hardcode a release. The query pattern is always: (1) fetch all CPI ARTs with `labels = INT-CPI`, (2) filter client-side by `fixVersions` matching the requested release, (3) extract hierarchy via `issuelinks`: SP- prefix = SP Capability, YOUR_JIRA_PROJECT- ≠ own key = Stream ART, YOUR_JIRA_PROJECT- = story. Render as SP → Stream ART → CPI ART → YOUR_JIRA_PROJECT hierarchy in chat with status icons: ✅ Done · 🔨 In Development · 📋 Ready for Dev · 🔍 Analysis · 🔴 Blocked · ⬜ To Do. If no release specified, ask: "Which release? (e.g. RD08.2026, RD10.2026)"
- **iFlow runtime stats, processing time, failed messages, and MPL queries must be handled by `@detective`.** Never answer monitoring or health check queries with raw Python. `@detective` owns all MPL, runtime status, failed message, and health check queries.
- **Spot check / GUARDIAN / health check requests must be routed to `@gatekeeper`** — never handled by `@detective` directly. Goofy runs the 8-check GUARDIAN pass and automatically generates the Excel report via `scripts/excel_export.py --mode mirror` without being asked.
- **After every MIRROR comparison and every GUARDIAN spot check, `@gatekeeper` must automatically run `python scripts/excel_export.py` and print the file path** — no asking, no offering, just do it and print: `Excel report: {path}`. The user should never have to request the Excel separately.
- **For JIRA queries** — call the JIRA MCP tools directly in-session (jira_search etc.), not via subagent.
- **When user says "design document", "design doc", "design", "prepare design", "create design" or any similar phrase requesting a design document — always invoke `@story2design` directly in-session.** Never use the `Agent` tool or `general-purpose` agent for this. `@story2design` uses the live JIRA MCP connection already established in the session and responds immediately. Using a background subagent adds 30-60s startup overhead and breaks MCP access.
- **Every agent MUST run MCP pre-flight checks before any work and print a ━━━ banner.** Hard stop = print what broke + why it matters + numbered fix steps. Soft warn = continue but print what is degraded + fix command inline. This behaviour must never be removed, weakened, or shortened. Fix steps must be explicit — never just "see CLAUDE.md" or "run /setup-mcp" alone.
- **Hard stop messages always contain three things: (1) what broke — which MCP/server, (2) why it matters — what the agent cannot do without it, (3) numbered fix steps.** A hard stop that only says "not connected" is useless. The user must be able to fix it without reading any other document.
- **story2design Step 5 — output the full doc in chat. Generate PPTX only when the user explicitly asks for it.** When asked, run `python scripts/gen_design_pptx.py --data <json>` and report the file path. Never save a .md. Never auto-generate PPTX without being asked.
- **`@flowlens` 501 fallback** — when `get_artifact` or `get_iflow_content` returns 501 (MCP service key lacks `WorkspacePackagesRead`), `@flowlens` must NOT stop. It falls back to Parameters-Only Analysis: call `get_iflow_configurations` + `get_runtime_artifacts`, infer source/target/behaviour from parameter keys, produce all 6 sections with inferred data. Fix: add `AuthGroup.IntegrationDeveloper` to BTP service key.

## Cutover Sheet

- **Cutover sheet generation is always `python scripts/cutover_sheet.py --release RD<MM>.26` — never a release-specific script.** The generic script accepts any release code: `RD08.26`, `RD10.26`, `RD11.26`, `RD08`, `RD08.2026` (all normalised automatically). Never create `rd08_final.py`, `rd10_final.py`, or any release-named script. When C3 or any agent generates a cutover sheet for any release, it calls `cutover_sheet.py --release <RD>` and that is the only script that should exist for this purpose. The output filename auto-increments (`v1`, `v2` …) from whatever is already in Downloads.



- **Credential template files (`.env.example`, `mcp-credentials.example`) must use pure empty placeholders only.** No pre-filled URLs, no pre-filled API keys, no pre-filled hostnames. Every field must be blank — user fills all values from their BTP Service Key.
- **`SAP_HUB_API_KEY` is a credential** — never hardcode or pre-fill it anywhere in committed files.
- **`mcp/.env.dev/.env.test/.env.prod` are machine-local** — gitignored at two levels (submodule + parent). Never commit them.
- **`claude_desktop_config.json` contains only paths** — no credentials. Credentials stay in `mcp/.env.*`.

## Git Behaviour

- **Always ask before pushing to git.** Never push automatically without explicit user confirmation.
- **Never rewrite git history without explicit user instruction.** `git filter-repo --force` is destructive — only run when user explicitly says to.

## MCP Setup

- **CPI MCP servers use `--env-file`** — `node --env-file=mcp/.env.dev mcp/dist/index.js`. No wrapper scripts needed.
- **Register CPI MCP servers in `~/.claude.json` via `claude mcp add`** so they load without VS Code restart.
- **After git clone — always run `/setup-mcp` first.** The skill detects exactly what is missing (submodule not init, dist not built, .env missing, servers not registered) and prints only the steps needed. The `git-sync-check.sh` hook also fires automatically on first prompt if MCP is not configured, showing `MCP-SETUP-REQUIRED` with specific missing items and a prompt to run `/setup-mcp`.
- **CPI MCP not connecting — 4 root causes to check in order:**
  1. **`mcp/dist/` missing** — team member forgot `cd mcp && npm run build`. Fix: `cd mcp && npm install && npm run build` then reload VS Code.
  2. **`.env.dev` missing or empty** — team member forgot to copy from `.env.example` and fill BTP credentials. Fix: `cp mcp/.env.example mcp/.env.dev` then fill from BTP Cockpit → Service Keys.
  3. **`--recurse-submodules` forgotten on clone** — `mcp/` folder exists but is empty. Fix: `git submodule update --init --recursive` then `cd mcp && npm install && npm run build`.
  4. **CPI servers not registered in `~/.claude/settings.json`** — run `claude mcp add --scope user CPI-DEV --command node ...` for all 3 tenants (see ONBOARDING.md Step 6).
- **CRITICAL: project `.claude/settings.json` must NEVER have a `mcpServers` block.** If it does, it completely shadows the user's `~/.claude/settings.json` MCP entries — all CPI agents stop working for every team member. The fix is to remove `mcpServers` from `.claude/settings.json`. Architecture rule: project file owns behaviour (permissions, hooks, deny rules); each user's `~/.claude/settings.json` owns connections (MCP servers). This was the root cause of team-wide CPI MCP connectivity failures.
- **After any MCP fix — always reload VS Code** (`Ctrl+Shift+P` → Developer: Reload Window). MCP servers only start on VS Code load — fixes to `.env` or `dist/` don't take effect until reload.
- **Verify CPI MCP is working:** in Claude chat type `@detective list packages in DEV` — if it returns packages, MCP is connected. If it returns an error, go through the 4 root causes above.
- **JIRA MCP uses Claude Code native OAuth SSO** — no credentials to configure. **When JIRA MCP returns "Needs authentication" or any 401, run `python scripts/jira_auth_helper.py` — this works on both corporate gateway and direct setups. Never rely on the MCP browser OAuth flow alone — it is disabled when a corporate proxy is detected.**
- **`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` is automatically set by Claude Code when a corporate proxy is in use (`ANTHROPIC_BASE_URL=http://localhost:...`) — do NOT remove it.** It is required by the proxy to prevent 400 errors on beta headers, and Claude Code restores it on every session start. The correct fix for JIRA auth is `python scripts/jira_auth_helper.py` (PKCE flow) which works regardless of this flag. Removing the flag only breaks the proxy.
- **FIRST thing for JIRA auth: `python scripts/jira_auth_helper.py`** — if token valid, exits silently in <1s. If expired, refreshes silently via refresh token. Only opens browser on first login or refresh token expiry. Works on gateway and direct. Never waste time on flag debugging first.
- **JIRA MCP pre-flight failure → ALWAYS auto-refresh silently first, NEVER show a hard stop immediately.** Run `python scripts/jira_auth_helper.py --silent` the moment JIRA MCP fails. Then retry `jira_search`. Only show the hard stop error to the user if the refresh itself fails. Silent auto-refresh is mandatory on every agent — never skip it, never ask the user first.
- **When any MCP or tool fails — read CLAUDE.md documented fixes FIRST before trying anything else.** CLAUDE.md contains root causes from real incidents. Ignoring them and experimenting wastes the user's time. Sequence: (1) read CLAUDE.md, (2) apply documented fix, (3) only then try alternatives.
- **Never ask the user to do something Claude can do itself.** If a fix requires running a command, run it. Only escalate to the user when explicitly blocked by a security rule after exhausting all self-fix paths.
- **JIRA MCP OAuth token expires every 15 minutes** — use `python scripts/jira_auth_helper.py` for silent refresh. The PKCE endpoint details: register at `https://mcp.jira.<YOUR-DOMAIN>/register`, auth at `https://mcp.jira.<YOUR-DOMAIN>/authorize`, token at `https://mcp.jira.<YOUR-DOMAIN>/token`. Use Bearer token against `https://mcp.jira.<YOUR-DOMAIN>/mcp` with `Accept: application/json, text/event-stream`.
- **When JIRA MCP SSO fails, always include the direct clickable SSO link `https://mcp.jira.<YOUR-DOMAIN>/authorize`** — this is the OAuth2 authorize endpoint that opens the SAP SSO login page. `/mcp` is the API endpoint and does NOT trigger SSO. Never give a fix without this link. Every JIRA MCP hard stop message must contain it.
- **JIRA MCP response format is `{total, start_at, max_results, issues:[...]}` not a flat list.** Always extract `.issues` from the response before processing. Paginate using `start_at` incrementing by `limit` until `len(all_issues) >= total`.

## Investigation & RCA

- **When investigating failed iFlows, always produce a structured grid** with columns: `iFlow Name | Total Failures (per tenant) | Source | Target | Issue Type | RCA (Evidence from Logs) | Probable RCA (Ranked)`. Never return a prose-only failure report.

- **RCA (Evidence from Logs) column must include:** burst pattern analysis (timing, duration, window); cross-tenant comparison (DEV vs TEST vs PROD); ApplicationMessageId analysis (same ID retrying = payload-specific issue, all different IDs = deterministic defect triggered by every message); shared infrastructure ruling (did other flows fail in the same time window? — if no, infra is ruled out); access blockers (e.g. trace returns 403 = MCP OAuth service key lacks `MonitoringDataRead` / `AuthGroup.IntegrationDeveloper` scope).

- **Probable RCA column must rank causes by confidence using:** 🔴 High — credential expiry (fast fail 1–2s = HTTP 401/403 signature); 🟠 Medium-High — Groovy NPE on missing source field (same record retrying repeatedly); 🟠 Medium — value mapping gap (lookup table missing an activity type/status); 🟡 Lower — mandatory field missing in target mapping (HTTP 400 for all messages, structural not data); 🟡 Lower — recent redeployment regression (check git log / CPI deploy history).

- **Always state what cannot be confirmed and why**, e.g. "trace 403 = MCP lacks `MonitoringDataRead` scope — step-level error text not accessible". Then always give the fastest manual path to confirm: "CPI Monitor browser → failed GUID → Run Steps tab — 2 min, no permission changes needed."

## Agent Empowerment

- **After every non-trivial investigation, always end with a proactive Empowerment Note — never wait to be asked.** Cover all 3 tiers: ✅ Tier 1 — state which agent `.md` was updated and why; 🔧 Tier 2 — if the investigation sequence was run manually more than once, propose a `/skill` and offer to draft it; 🔑 Tier 3 — if the agent was blind to data (403, missing scope, missing endpoint), name the exact fix, the exact permission/config change, and who owns it.

- **When capturing a lesson (`/learn`), always also update the relevant agent `.md` file** — not just `team-learnings.md`. `team-learnings.md` is context for future sessions; the agent `.md` is the agent's system prompt — only changes there change agent behaviour.

- **Decide the empowerment tier proactively:** output format / workflow / decision logic → Tier 1 (agent `.md`); repeated multi-step manual sequence → Tier 2 (skill); agent blind to data it needs → Tier 3 (MCP scope / tool fix, human required).

- **`@flowlens` auto-learns after every IFLOW EXPLORER, MAPPING VIEW, BUILD ASSISTANT, and BUILD HEALTH CHECK** — at the end of each response it silently checks for new reusable knowledge (confirmed .mmap field structures, new custom field patterns, new ProcessDirect dependencies, confirmed adapter config). If found, it surfaces an **Auto-Learn Candidate** block and waits for `learn it` reply before committing. Never auto-commits without user approval. Only ✅ CONFIRMED findings are surfaced — never 🟡 INFERRED. Maximum 3 candidates per response.

## Governance Report

- **`/cpi-governance` pre-flight Check 3 (JIRA MCP)** — if JIRA MCP is not authenticated, do not stop and instruct the user. Run `claude mcp add --transport http --scope user sap-jira https://mcp.jira.<YOUR-DOMAIN>/mcp` immediately to trigger browser SSO, then retry the pre-flight check automatically.
- **JIRA MCP `jira_search` uses `start_at` and `limit` params** (not `startAt`/`maxResults`).
- **CPI ART issuelinks use snake_case** — `inward_issue`/`outward_issue` (not camelCase `inwardIssue`/`outwardIssue`).
- **`@governance` owns all CPI story quality and hierarchy work** — "check story compliance", "does story follow template", "hierarchy tree", "parent child structure", "batch compliance", "which stories are missing sections" → always route to `@governance`. Never answer these with raw JIRA queries. Skills: `/cpi-story-check <KEY>` (single story scorecard) and `/cpi-stream-compliance` (batch audit + Excel).
- **`/cpi-governance` Query 2 now fetches `description` and `priority`** — required for Story Compliance and Hierarchy Tree sheets. The governance workbook now has 18 sheets: two new ones are **Story Compliance Matrix** (22-gate RAG per story) and **Hierarchy Tree** (Stream ART → CPI ART → YOUR_JIRA_PROJECT, indented, grouped by release).
- **Story compliance detection uses exact section number + keyword pair** — e.g. `"01"` + `"functional background"` within 300 chars in description. Both markers must be present. N/A content (first 80 chars contains n/a, na, tbd) → ⚠️ status, not ❌. Score = (meta_pass + sec_pass + sec_na*0.5) / 22 * 100.

## Excel Reports

- **Never write one-shot build scripts to `scripts/`** — cutover sheets, Excel reports, and any dynamically generated Python are one-shot artefacts. Always write to `%TEMP%`, run, then delete. `scripts/` is for permanent reusable team tools only. This applies to all skill-driven generation: `/cutover-sheet`, `/cpi-governance`, any ad-hoc Excel build.
- **Always use dark text on data rows** — in any Excel report script (`excel_export.py`, `cert_expiry_monitor.py`, `build_cpi_governance.py`, or any future report), set `Font(color="12171C")` on all data rows regardless of background fill. **Never use white text (`FFFFFF`) on light-coloured status backgrounds** (pink `FFEAF4`, amber `FFF8ED`, green `EDFBF2`, blue `EEF4FF`). Header rows with dark backgrounds (`0F2D4A`, `1A73C7`) keep white text. The `_data_font()` function enforces this — never bypass it.

## PPTX / gen_design_pptx.py

- **`_clean()` must strip non-BMP characters (emoji) before writing to ANY pptx text frame.** Emoji characters (🔴 🟡 ✅ etc.) are outside the Unicode BMP (U+10000+) and cause a silent `charmap` encoding error when python-pptx tries to write them. The `except Exception: pass` in `add_speaker_notes` was hiding this — speaker notes appeared blank on all slides after the first emoji hit. Fix is in `_clean()`: `"".join(c if ord(c) < 0x10000 else "?" for c in s)`. Apply this rule to every text-writing function in `gen_design_pptx.py` — not just notes.
- **`except Exception: pass` is banned in `add_speaker_notes` and all pptx write helpers.** Silent swallowing hid blank speaker notes for every session until the user complained. Always log: `print(f"[notes warning] {e}", file=sys.stderr)`.
- **After `tf.clear()` on a notes text frame, always guard `tf.paragraphs` before accessing `[0]`.** `tf.clear()` can remove all paragraphs — `tf.paragraphs[0]` raises `IndexError`. Fix: append a new `<a:p>` via lxml if empty.

## PPTX Slide 8 — Diagram Pipeline (gen_diagram_png.py + gen_design_pptx.py)

- **Every `pptx` generation now auto-produces 3 files**: `_DesignDoc.pptx` (all slides), `_Diagram.png` (high-res diagram image), `_ProcessFlow.drawio` (editable draw.io file). All named with the same `YYYYMMDD_HHMM_KEY` prefix. Never generate PPTX alone — always run all three.
- **Diagram pipeline architecture**: `gen_diagram_png.py` renders the PIL image from JSON data → saved as PNG. `gen_design_pptx.py` imports `gen_diagram_png` dynamically at runtime, embeds the PNG into slide 8 via `slide.shapes.add_picture()`. No hardcoded diagram content in PPTX builder.
- **`gen_diagram_png.py` is the single source of truth for the diagram image** — all rendering logic lives there. `gen_design_pptx.py` only calls it and embeds the result.
- **SAP CPI lane must be 55% of diagram height** — not equal thirds. It needs room for: main flow row + routing gap + "No" branch lane + error bus lane + exception box. Equal thirds gives GAP=1px between shape bottoms and exception top, causing routing lines to clip through shapes.
- **Two separate routing lanes below main shapes**: `NO_ROUTE_Y = SHAPE_BOT_Y + GAP//3` for No-branch connectors; `BUS_Y = SHAPE_BOT_Y + GAP*2//3` for error bus. Computed from `SHAPE_BOT_Y = CPI_CY + SH_H//2 + DIA_EXT + 8` and `EXC_TOP_Y = EXC_CY - EXC_H//2`. GAP must be at least 60px for clean routing — if GAP < 60, increase `LN_CPI_H`.
- **Error bus pattern**: each error source drops a vertical dashed red line to `BUS_Y` only (no horizontal). After the loop, draw ONE horizontal bus from `min(err_source_xs)` to `max(err_source_xs, exc_cx)`, then one vertical drop into exception top. Never draw per-source horizontals — creates overlapping lines.
- **Lambda closure bug in bottom strip**: never use lambdas inside a loop to build body text functions — all lambdas capture the loop variable by reference and all produce the same output. Always define named functions (`_notes_text()`, `_adapter_text()`, `_abbr_text()`) outside the loop.
- **`direction="ttb"` requires libraqm** — not available on most Windows installs. For vertical lane tab text: render horizontally on a small `Image.new("RGBA")` banner, call `.rotate(90, expand=True)`, paste centred in the tab. Never use `direction="ttb"` with PIL.
- **Diagnostic loop for diagram PNG** — after every render, check: all main step Y centres within 2px of each other (exclude exception), no shapes outside canvas bounds, routing lines not crossing shapes. Use PIL to read back pixel values at routing Y to verify clear lane.

- **ALL main CPI shapes must use a single pinned height `pin_h = SH_H`, never the shape's own `sh` from `_classify()`.** Different shape types (diamond, parallelogram, oval) return different heights. Using `t = cy - sh/2` with varying `sh` makes shapes stagger vertically even when `cy = Y_CPI` is constant. Fix: after `_classify()`, set `pin_h = SH_H` for all non-exception steps; use `t = cy - pin_h/2`; store `sh = pin_h` in `pos[]`. Confirmed: this eliminated 0.56" Y drift across all main flow shapes.
- **NEVER call `heal_slide()` on slide 8 (or any deterministic diagram slide).** `heal_slide()` R2 pushes shapes down when two shapes share similar X — it treats the overlap between lane background rectangles and process steps as an error and moves steps by exactly `LANE_H/3 = 0.56"`. This destroys the Y alignment. Comment it out: `# heal_slide(slide, 8)`.
- **Exclude full-width shapes (width > 4 inches) from `heal_slide` text shape scan.** Lane backgrounds have text and pass the `has_text_frame` filter — they trigger R2 against narrow step shapes. Fix: `and (s.width or 0) / EMU < 4.0` in `text_shapes()`.
- **Zone-guard on heal R2: only push if both shapes have centres within 0.30" of each other.** Without this, heal pushes main-flow shapes that "overlap" with exception boxes (intentionally at different Y). Fix: `if abs(cy2 - cy1) < 0.30: s2.top = ...`.
- **Connectors must use STORED bounding box midpoints from `pos[]`, never raw Y constants.** Use `_cx(pos[i])`, `_cy(pos[i])`, `_lft()`, `_rgt()`, `_top()`, `_bot()` helpers. Since `pin_h` is uniform, all main `_cy()` values are identical and connectors are perfectly horizontal.
- **Use native OOXML snapped connectors (`<p:cxnSp>` with `stCxn`/`endCxn`) instead of `add_connector()` plain lines.** `add_connector()` creates dumb lines — they float free of shapes when you move them in PowerPoint. `<p:cxnSp>` snapped connectors stay attached, let PowerPoint route them, and make the diagram fully editable. Every shape needs a unique stable ID set before being referenced. Store shape objects in `sp_map[i]` alongside `pos[i]`. Connection point idx: 0=top 1=right 2=bottom 3=left. connector_type: "straight" for main flow, "elbow" (bentConnector3) for branches and error paths.
- **Never write build_slide8 replacement inside a Python triple-quoted string in a script.** `"\n".join(...)` inside triple-quoted strings becomes a literal newline → `SyntaxError: unterminated string literal`. Always write the replacement to a separate `.py` file with the Write tool and splice with a Python script.
- **Run the diagnostic loop before declaring any diagram render done.** Check: `drift = max(ys) - min(ys)` on main shapes (exclude exception) < 0.005, `oob = 0`, no content overlaps. Zero drift + zero OOB = correct. Exception box at `Y_EXC` is intentionally offset — exclude from drift check.
- **Bottom strip must be anchored upward from `safe_bottom()`, not downward from `DIAG_BOT`.** Use `LEG_Y = SB - LEGEND_H - 0.02; BTM_Y = LEG_Y - BOTTOM_H` to guarantee strip stays within slide bounds.
- **`except Exception: pass` is banned in `add_speaker_notes` and all pptx write helpers.** Silent swallowing of errors hid missing speaker notes for every session until the user complained. Always print a warning to stderr at minimum: `print(f"[notes warning] {e}", file=sys.stderr)` — never swallow silently.
- **After `tf.clear()` on a notes text frame, always check `tf.paragraphs` is non-empty before accessing `[0]`.** `tf.clear()` can remove all paragraphs. If `tf.paragraphs` is empty, append a new `<a:p>` element via lxml before adding a run. Failing to do this causes an `IndexError` which was also silently swallowed.

- **3-step Excel architecture — always follow this separation:**
  - **Step 1 (agent-owned):** Agent fetches data + writes pre-defined JSON to temp file — agent owns the data contract and format decisions
  - **Step 2 (shared engine):** `python scripts/excel_export.py --mode {mode} --data {tmp_json}` — reads JSON, builds Workbook, saves file
  - **Step 3 (shared engine):** Engine prints path → agent reports `Excel report: {path}` → agent deletes temp JSON
  - Never mix data fetching into `excel_export.py`. Never mix Excel building into agent data fetch code.

- **`scripts/excel_export.py` is a pure build+save engine** — it only accepts pre-fetched data via `--data <json_path>`. It owns: shared utilities (`write_data_row`, `write_header_row`, `_data_font`, `write_title`, `add_legend_sheet`), workbook builders (`build_mirror_workbook`, `build_cert_workbook`), and `save_workbook`. It does NOT fetch data from CPI or JIRA.

- **Data contracts (JSON shapes agents must produce):**
  - **mirror:** `{src, tgt, iflow_id, iflow_name, src_snap:{name,status,version,deployedOn,deployedBy,packageId,logLevel,params:{}}, tgt_snap:null_or_same, src_errors, tgt_errors}`
  - **cert:** `{findings:[{alias,keyType,tenant,expiry,days,status,usage}], checked:[], skipped:[], ts}`

- **`/create-excel` is the single shared skill** — invokes `excel_export.py`. Output always goes to `Downloads/excel_reports/`. Never create mode-specific or agent-specific Excel scripts.

- **`build_cpi_governance.py` stays separate** — 16-sheet governance workbook with complex JIRA logic. Not part of `excel_export.py`.

## Story2Design Framework

- **story2design pipeline is: PREREQUISITE → INTELLIGENCE LAYER (INT-1 to INT-5) → PHASE 1 → PHASE 2 → PHASE 3 → PHASE 4 → PHASE 5 → PHASE 6 → PHASE 7 → PHASE 8.** Never skip any phase. Never reorder. The Runtime Execution Model (Phase 2) is the source of truth — everything else derives from it.

- **Intelligence Layer runs BEFORE Phase 1, all 5 checks in parallel:**
  - INT-1: 13-section story template compliance — missing sections pre-mark Phase 1 fields 🔴 TBD
  - INT-2: `list_artifacts` + `get_iflow_content` on CPI DEV — finds similar iFlow, promotes adapter/auth from 🟡 INFERRED to ✅ CONFIRMED
  - INT-3: `list_credentials` + `list_oauth_credentials` on CPI DEV — confirms credential aliases exist; missing ones added to Open Questions with BTP Cockpit path
  - INT-4: PII/GDPR field scan — pre-populates Section 12 Security if PII detected
  - INT-5: 10 KDD trigger patterns — if triggered, blocks build start and requires DAB approval

- **Phase 1 extracts 14 business requirement dimensions:** Business Objective · Business Process · Trigger · Source System · Target System · Interfaces (src→CPI + CPI→tgt protocol/method/endpoint) · Authentication (src→CPI + CPI→tgt auth type) · Business Rules (BR-N) · Validation Rules (VR-N) · Mapping Requirements (source field → target field → transform) · Error Scenarios (ES-N) · Success Criteria (SC-N) · Missing Information (owner + impact) · Actors (Functional Lead, SMEs, Testing Coordinator)

- **Phase 2 runtime step spec (mandatory fields per step):** Step ID (S1–S11, E1–E2) · Runtime Responsibility · Business Purpose · Input (body + headers) · Output (body + headers) · Headers (SAP_*) · Exchange Properties · Variables · Business Rule · Configuration · Security (credential/cert alias) · Monitoring (MPL header) · Success Path · Failure Path · Dependencies

- **Phase 4 28-question completeness check tiers:**
  - CRITICAL (9Q — stops dev if wrong): Q1 topology · Q4 direction · Q7 trigger · Q8 trigger system · Q10 format · Q11 adapter · Q12 auth · Q13 network · Q17 sync/async
  - IMPORTANT (11Q — design decisions): Q6 load type · Q9 sequence · Q14 mapping · Q15 payload size · Q18 error strategy · Q19 retry · Q21 enrichment · Q22 batch · Q25 dedup · Q26 trigger mode · Q28 persistence
  - QUALITY (8Q — governance): Q2 contacts · Q3 scope · Q5 data type · Q16 limits · Q20 encryption · Q23 monitoring · Q24 reuse · Q27 compliance

- **Phase 6 Component Specification has 19 fields per component:** Component ID · Component Name · Palette Function · SAP CPI Component · Category · Shape · Colour · Icon · Purpose · Configuration · Input · Output · Headers · Properties · Variables · Security · Dependencies · Successor · Failure Route

- **Phase 7 Build Manifest has 20 fields per palette object:** Sequence · Component ID · Palette Function · SAP CPI Palette Object · Category · Shape · Colour · Configuration Object · Adapter · Endpoint · Headers · Properties · Expressions · Groovy Script · Message Mapping · Security Material · Connection From · Connection To · Exception Route · Deployment Dependency

- **Phase 8 produces 17-section document:** 1 Executive Summary · 2 Business Overview · 3 Integration Overview · 4 Architecture · 5 Runtime Execution Model · 6 Component Mapping · 7 Process Flow Diagram · 8 Architecture Validation · 9 Data Mapping · 10 Exception Handling · 11 Monitoring · 12 Security · 13 Component Specification · 14 iFlow Build Manifest · 15 Risks · 16 Assumptions · 17 Open Questions

- **story2design always shows the Decision Gate before generating (Phase 4)** — shows: sources loaded, confirmed fields, WRONG box (inferred critical fields), TBD gaps, completeness fractions, proceed/don't criteria, and 4 options. Never skip it.

- **WRONG is worse than TBD** — an inferred field on a critical question (Q1/4/7/8/10/11/12/13/17) will produce incorrect adapter config. Always list these in the WRONG box at the gate. TBD fields are blank — harmless. WRONG fields mislead developers and cause rebuilds.

- **story2design parses free-text context before fetching JIRA** — Step 0 runs signal extraction over all pasted content (MoM, email, field mappings, JSON payloads) before any JIRA call. Runtime context with "agreed/confirmed/decided" overrides JIRA. JIRA overrides inference.

- **story2design fetches in parallel** — story + parent feature + anyKDD keys found are fetched simultaneously in Step 1. Never fetch sequentially.

- **story2design always generates TWO Mermaid diagrams** — `flowchart LR` (HLD architecture) and `sequenceDiagram` (process flow). These appear in the in-chat doc. PPTX is a separate step generated only when the user explicitly asks.

- **story2design source column is mandatory on every table** — every field carries a confidence badge: ✅ CONFIRMED / 🔵 FROM JIRA / 🟡 INFERRED / 🔴 TBD. Reviewers use this to know what to trust and what to chase.

- **story2design completeness is fractions not points** — Critical: X/9, Important: X/11, Quality: X/8. No point arithmetic. Band is determined by Critical score only.

- **story2design 4 options at Decision Gate** — (1) Proceed / (2) Answer questions (re-score) / (3) Questions only (punch list) / (4) Test cases forTEST. No "partial doc" option.

- **28-question reference** — full question table with who-to-ask mapping lives at `docs/cpi/references/28-questions-cpi-interface.md`. Used by the agent in Phase 4 gap analysis.

- **system-pair defaults** — only used when nothing else found, always tagged 🟡 INFERRED. C4C→S4: HTTP REST OAuth2 CC → OData Basic Auth. Never infer Q13 (network restrictions) — always TBD.

- **Palette Dictionary is the single source of truth for all visual properties** — 32 entries. Every Phase 2 step maps to exactly one Palette Function. Shape · Colour · Icon · CPI Component all derive from the dictionary. Never choose visual properties manually. UNKNOWN Palette Function = hard stop before Phase 4.

- **Phase 3 hard stop and Phase 4 gate are separate** — Phase 3 stops if any runtime step has no Palette Function match. Phase 4 runs 7 invariants (V1–V7) independently. Both must clear before Phase 5.

## Cutover Tracking

- **Cutover generation is fully dynamic — never hardcode any release.** The release code is always passed in as an argument (e.g. `RD08`, `RD10`, `RD11`). Every part of the build — tracker base file, JIRA filter, PDD date, colour coding, output filename — is derived from that argument at runtime.

- **Base tracker = latest version in Downloads.** Always scan `<YOUR-DOWNLOADS-FOLDER>/` for the highest version number matching `RD{MM}.26 Cutover v*.xlsx` for the requested release. Never hardcode a specific version. Use this as the base: it carries Stream ART, JIRA Story, and manual team data. Enrich it with fresh JIRA + CPI data.

- **Release scope filter — 4-priority chain (in order):**
  1. Tracker base col 5 (Expected Release) or col 4 (Release) — any `RD\d+` value, normalised via `normalise_release()`: `RD08.26` → `RD08.2026`, `RD08` → `RD08.2026`
  2. `Version / Delivery:` in JIRA description — regex `RD\d+\.\d{2,4}` (2-digit OR 4-digit year)
  3. TGLRD/BGLRD label — `TGLRD08.26` → `RD08.2026`
  4. Plain release label — `RD08` → `RD08.2026`
  Never use `fixVersion` JQL — it always returns zero. Never use `Target Release` field — also returns zero.

- **JIRA version field for cutover scope**: `fixVersions` are NOT exposed by the JIRA MCP — `fixVersion = "RD08.26"` always returns zero. Always filter RD08 scope by labels instead: `labels in ("TGLRD08.26","BGLRD08.26")`. Safety net: also check for label `RD08` on features lacking proper TGLRD/BGLRD labels. Never use `fixVersion` or `"Target Release"` — both return zero.
- **Never pass `fields` param to `jira_search`** — it silently returns zero results. The JIRA MCP ignores the `fields` argument and the response contains no issues. Always call `jira_search` with only `jql`, `start_at`, and `limit`.
- **Reuse cached CPI runtime artifacts within the same session** — never call `get_runtime_artifacts` again if it was already called earlier in the session. The result is large (250KB+) and the data doesn't change during a session. Check if a tool-results file from this session already has the runtime list before calling again.
- **Always write Python to a `.py` file before running on Windows — never use `python -c` with multi-line strings.** Multi-line `python -c` on Windows causes cp1252 codec `UnicodeEncodeError` on any non-ASCII character (arrows, emoji, special chars) and `unexpected EOF` on long strings. Pattern: Write tool → `python scripts/myfile.py` → delete after. This is faster and always works.

- **iFlow Information tab — 4 required columns + supporting:** `iFlow Name | Source System | Target System | Existing/New`. Supporting: iFlow ID, Release, DEV Status, Version. No CPI ART column. Always deduplicate by iFlow ID (fallback: name lowercase). Sort: RD08 first, RD07 second, alphabetical within release.

- **Existing/New logic — based on DEV + TEST runtime:** `Existing` = iFlow found in BOTH DEV and TEST runtime. `New (DEV only)` = found in DEV only. `Not Deployed` = not found in either. Always check TEST runtime in addition to DEV — never determine Existing/New from DEV alone.

- **Source/Target inference — name-pattern rules (ordered specific-first):**
  - Push/Pull Termination BTP↔CPQ: `push+termination+btp+cpq` → BTP→CPQ; `pull+termination+cpq+btp` → CPQ→BTP
  - Replicate/New Replicate Quote CPQ→S4: `(replicate|new replicate)+quote+cpq+s4` → CPQ 2.0→S/4HANA
  - Subscription contract from BRIM: `replicate+subscription+contract` → BRIM→CPQ 2.0
  - Replicate master data from S4: `replicate+from+(s4hana|s4)` → S/4HANA→Sales Cloud V2
  - Set Product Identifier: `set product identifier` → S/4HANA→Sales Cloud V2
  - GTS Compliance: `gts+cpq` or `from+gts` → GTS→CPQ 2.0
  - CCS email from SCV2: `email+template+ccs` or `in+ccs+from+(c4c|scv2)` → Sales Cloud V2→CCS
  - DCCE case from SCV2: `dcce` → Sales Cloud V2→DCCE
  - Outreach integrations: `from+outreach` or `outreach` → Outreach→Sales Cloud V2
  - Involved Parties / Phase Progression (SCV2 internal): → Sales Cloud V2→Sales Cloud V2
  - AEM queue: `from+(aem|queue)` → AEM→CPI
  - Generic fallbacks: CPQ→S4, SCV2→CPQ, SCV2→CPI

- **Always write temp Python to `%TEMP%`, run, then delete.** Never write to `scripts/`. Never use `python -c` with multi-line strings on Windows (cp1252 encoding errors). Pattern: Write → run → delete.

- **`jira_search` without `fields` param.** Never pass `fields` — it silently returns zero. Use only `jql`, `start_at`, `limit`.

- **Reuse cached CPI runtime from session.** Never call `get_runtime_artifacts` again if already called. Check session tool-results cache first.

- **Epic Link / parent queries return zero**: `"Epic Link" = YOUR_JIRA_PROJECT-XXXX` and `parent = YOUR_JIRA_PROJECT-XXXX` both return empty results in this JIRA instance. Do not attempt child story lookups via these fields. Use feature-level data only; leave JIRA Story column (Col 2) blank and note `"Epic Link returns zero in this instance"` in output.

- **CPI Developer Section — parse before calling CPI**: Each YOUR_JIRA_PROJECT feature description (sometimes child story) contains a structured block starting with `CPI Developer Section:`. Parse it first before calling any CPI tool. Fields to extract:
  - `IDT No` → Excel Col 45 (IDT Number)
  - `IDT Status` → Excel Col 46 (IDT Status)
  - `Package Name` → Excel Col 32 (Package Name)
  - `Iflow Name` → Excel Col 33 (IFlow Name)
  - `Version` → Excel Col 43 (Iflow Version)
  - `Consulting Status` → Excel Col 52 (Dev Consulting Status)
  - `Consulting Date(Dev)` → Excel Col 50 (Dev Consulting Dates CET)
  - `Consulting Date(Test)` → Excel Col 53 (Test Consulting Dates CET)
  - `Documentation Completion` → noted in remarks if NO
  - `Scenario Document Link` → Excel Col 72
  If the block is absent → Col 28 (Remarks) = `"⚠️ CPI Section not found"`. Never fabricate values.

- **AEM detection via `get_iflow_content`**: After extracting the IFlow Name from the CPI Developer Section, call `get_iflow_content` on `CPI-DEV`. Detect AEM usage if: `AEM_Host`, `Host`, or `QueueName` parameters contain `<YOUR-AEM-HOST>:55443`; OR an AMQP sender/receiver adapter is present in the BPMN. If AEM detected → Col 34 = `Yes`, extract queue name → Col 37 and Col 38 (DEV). If not → Col 34 = `No`. If iFlow not found in CPI → Col 42 (Existing/New) = `New`, Col 34 = `NA`.

- **Standard flow detection**: Col 57 (Standard flow) = `Y` if Package Name starts with `SAP ` (SAP-delivered standard content package). All custom packages → `N`.

- **77-column Excel — read headers from live RD05 Tracker**: Do NOT hardcode column headers. Read them from your team's configured tracker path (set in `CLAUDE.md`) → sheet `"RD05 Sheet"` → row 1 at start of each generation. This ensures the column order stays in sync with the team's working tracker. Rename Col 4 header to match the release (e.g. `"RD08\nRelevant"` for RD08, `"RD10\nRelevant"` for RD10).

- **Auto-fill columns from JIRA feature data**: Col 0 = feature key, Col 1 = feature key, Col 3 = feature summary, Col 4 = `"Yes"` (all rows pass the fixVersion filter), Col 5 = TGL/BGL labels (regex `TGLRD\d+\.\d+` / `BGLRD\d+\.\d+`), Col 7 = feature assignee display name, Col 8 = feature assignee display name, Col 13 = feature components, Col 25 = feature status, Col 30 = PDD from CLAUDE.md release schedule.

- **iFlow partial-name lookup**: Use `get_runtime_artifacts` and search by partial name match (case-insensitive). The artifact ID is in the runtime list as backtick-delimited. If a feature has multiple iFlows (e.g. Sales Org has 8 iFlows), create one Excel row per iFlow with the same feature metadata inherited, or list iFlow names as a newline-separated value in a single row — preference: one row per feature, newline-separated names in Col 33.

- **Build script pattern**: Generate the Python + openpyxl script inline, run via Bash, verify (print sheet names + row/column count), then delete the script. Follow the same pattern as `scripts/build_cpi_governance.py` — agent generates inline, not a stored file.

- **Output filename**: `output\<RELEASE> Tracker.xlsx` e.g. `RD08 Tracker.xlsx`, `RD10 Tracker.xlsx`. Sheet 2 tab name: `"<RELEASE> Sheet"` (e.g. `"RD08 Sheet"`).

---

## iFlow Content Fetching

- **When fetching iFlow content, always use the artifact ID already found in the cached runtime list — never search again.** Call `get_iflow_content` immediately with the ID. If it returns 404, stop and explain why — do NOT crawl packages or retry on other tenants.
- **`get_iflow_content` 404 on custom exit iFlows is a hard API limitation — no fix exists.** Custom exit iFlows built on SAP-delivered standard packages (e.g. `Replicate_Quote_2.0_from_SAP_CPQ_to_SAP_S4HANA_Post_Exit`) always return 404 regardless of tenant, service key roles, or permissions. SAP standard package content is not exposed via the OData design-time API. Do NOT suggest `AuthGroup.IntegrationDeveloper` or any role change as a fix — it will not help. The only way to see resources is **CPI Designer** → open the iFlow → Resources tab.
- **Route all iFlow content/resource/explain requests to `@flowlens`** — never handle inline or via skill. RCA/failed messages → `/rca-investigation` or `@detective`. iFlow internals (resources, scripts, mappings, steps, adapters) → `@flowlens`.

---

## iFlow Analysis — Always Show All Resources

- **When explaining or analysing an iFlow, always present ALL resource categories — never silently skip any.** After calling `get_iflow_content`, always surface every category the tool returns, even if some are empty:
  1. **Scripts** — list every `.groovy` / `.xslt` file with its purpose
  2. **Mappings** — list every `.mmap` file by name (offer to expand with `@flowlens` MAPPING VIEW)
  3. **Adapter configuration** — source adapter type, receiver URLs, auth aliases used per call (from BPMN `messageFlow` blocks or `get_artifact`)
  4. **Externalized parameters** — any `parameters.propdef` / `get_iflow_configurations` values: URLs, credential aliases, flags
  5. **BPMN step sequence** — full ordered step list with routing conditions and exception subprocesses
  - If a category is absent from the tool response, explicitly say so — e.g. "Adapter config not returned by MCP — use `@flowlens` to inspect the BPMN XML directly." Never present a partial analysis without flagging what is missing and how to get it.

---

## iFlow Domain Knowledge

- **`CPQ_S4_OnPrem_Quote20_01.mmap` — mapping inference guide.** When FlowLens infers this mapping (from `Process_Direct` or `New_Replicate_Quote_2.0_from_SAP_CPQ_to_SAP_S4HANA_1CMAT`), use these confirmed field patterns:
  - **Source:** CPQ Quote XML fields — `ExternalId`, `Name`, `Description`, `CurrencyCode`, `ValidUntilDate`, `Account.ExternalId`, `Contact.ExternalId`, `Owner.ExternalId`, `CustomFields[]` array
  - **Target:** S4 `A_BusinessSolutionQuotation` OData entity (Business Solution Quotation POST/PATCH)
  - **Partner IDs:** All CPQ `ExternalId` fields are zero-padded to 8 digits via `Appendzeros.groovy` before writing to S4 (e.g. `1234` → `00001234`)
  - **Description:** Truncated to 40 chars — prefers `Item.Description`, falls back to `ProductName` via `Utility.groovy`
  - **custom field — `QICF_SOM_Pricing`:** Pipe-delimited pricing conditions string `VariantCondition|ConditionType|ConditionRateValue|ConditionQuantity` — split by `ExtraactField.groovy` + `SomPricingDelimiter.groovy` into individual S4 condition record nodes
  - **custom field — `QICF_AddOns`:** `Key:Value|Key:Value` pipe-delimited add-ons — exploded by `MMM.groovy` → key by `CCVV.groovy` → value by `extractvalue.groovy` → always typed `CMAT_SGN_ADDON` via `UseOneAsMany.groovy`
  - **contract status:** `GetcontractStatus.groovy` — if `contractNumber` + `pcNumber` present → `ConfigChange`; if `contractNumber` only → `AddNewContract`; neither → suppress. Drives S4 SOM processing path.
  - **Custom field lookup pattern:** `getCustomFieldsValue.groovy` matches by `Name` field in CPQ `CustomFields[]` array and returns `Content`. `getCustFValue.groovy` is the duplicate-safe variant using HashMap. `SalesCustomField.groovy` additionally strips the prefix before `_` from the value.
  - **Mapping functions shared across both iFlows:** `SubString40` (40-char truncate), `removeSuppress` (filter nulls/suppressed), `getProperty` (read CPI exchange property inside mapping), `SomPricing` (lookup by field name match)

---

## Maestro Identity & Self-Positioning

- **When asked "who are you?", "what is Maestro?", "what do you do?" — always introduce as a peer, never as a tool or assistant.** Use this template: *"I'm Maestro — your AI integration peer for SAP Integration Suite. I work alongside you through the entire integration lifecycle: from turning a business requirement into a solution design, to building and reviewing iFlows, investigating failures, checking environment drift, and validating cutover readiness. Ask me anything in plain English — I'll give you expert guidance in seconds."* Never say "I am an AI assistant that helps with SAP CPI."
- **Maestro's core positioning is peer, not tool.** Peer implies active collaboration, shared ownership, and trust. Tool implies passive utility. This distinction must be reflected in every response, presentation, and introduction — no exceptions.
- **Maestro never replaces people — it amplifies them.** Always frame Maestro as giving every team member access to expert guidance, not as automating away human roles. This applies to presentations, demos, and any customer-facing communication.
- **Maestro's official tagline is: *"Your AI Integration Peer for SAP Integration Suite."*** The hero statement is: *"Always by your side. From design to deployment — and beyond."* Never use "Stop chasing logs. Start asking questions." as the primary hero message — it was replaced by the peer framing.
- **Maestro covers the complete SAP Integration lifecycle end-to-end:** Requirements → Solution Design (Story2Design) → iFlow Build (ArchFlow) → Development Guidance (FlowLens) → Operations & Monitoring (Integration Detective) → Environment Review (Gatekeeper Goofy) → Cutover Confidence (C3 Command Center). Always reference the full lifecycle when explaining what Maestro does — never present it as a single-purpose tool.
- **Maestro's six specialist agents each own one lifecycle stage** — Story2Design owns Design, ArchFlow owns Build, FlowLens owns Development, Integration Detective owns Operations, Gatekeeper Goofy owns Review, C3 Command Center owns Cutover. Every agent is a peer specialist, not a feature.

---
*Last updated: 2026-07-07 | Maintained by the Maestro team*

- **CPI tenant URL for this workspace is `CPI-DEV`** — credentials in `mcp/.env.dev`. The `CPI-DEV` MCP server is the live DEV tenant. Never upload to TEST or PROD without explicit user instruction.



## Cutover Sheet Generation — RD08 CPI ART Rules

- **Correct JQL for INT-CPI features uses `fixVersion="RD<MM>.26"` — NOT TGLRD/RD labels.** Most ARTs lack release labels entirely. Primary query: `project=YOUR_JIRA_PROJECT AND issuetype=Feature AND labels="INT-CPI" AND labels in ("YOUR-TEAM-LABEL") AND fixVersion="RD<MM>.26" AND status not in (Obsolete,Cancelled)`. Safety net for ARTs with no fixVersion: same but `AND fixVersion is EMPTY AND status not in (Obsolete,Cancelled,"Handed Over",Done)`.

- **`get_iflow_content` does NOT return adapter channel config — AEM (AdvancedEventMesh) cannot be auto-detected from scripts.** Set `has_aem_adapter: true` explicitly in the iFlow content cache (`scripts/rd08_iflow_content_cache.json`) when the iFlow uses an AEM inbound adapter. Update the cache when new iFlows are deployed or AEM adapters are added.

- **AEM column population rule:** AEM = Y only when `has_aem_adapter=true` in cache OR JMS/AMQP signals in scripts. SCV2 Autoflow = HTTP webhook — NOT AEM. When AEM confirmed: topic/queue = `"Check iFlow adapter config in CPI Designer"` (not accessible via API). Webhook col = `"N/A — AEM inbound (AdvancedEventMesh), not HTTP webhook"`. Source system = `"SAP Advanced Event Mesh (AEM)"`.

- **Multi-iFlow ARTs must use `[1]/[2]/[3]` numerical tagging** consistently across iFlow Name (col 10), iFlow ID (col 11), Standard/Custom (col 13), and Version (col 47) so each key-pair is identifiable across columns. Never put all iFlow names in one untagged block.

- **Source/Target derivation priority:** (1) Groovy `setHeader("SAP_Sender", ...)` / `SAP_Receiver`; (2) iFlow name pattern — `"from SAP S4HANA"` → S4HANA→SCV2, `"from C4Cv2"` / `"from_c4cv2"` → SCV2→target, `"in CCS"` / `"in_ccs"` → target=CCS; (3) AEM inbound override → source=SAP AEM. Always normalise via `_normalise_system()` — `"SAP C4C 2.0"` → `"SAP Sales Cloud V2 (SCV2)"`.

- **CPI ART Complete? has 3 states:** `✓ Complete` (Developer Section AND iFlow Name both found), `⚠ Partial — Developer Section found but iFlow Name missing`, `⚠ MISSING — fill CPI Developer Section in ART`. Check BOTH conditions — Dev Section with empty iFlow Name is Partial, not Complete.

- **If iFlow name not found in CPI Developer Section → cols 10 (iFlow Name) and 11 (iFlow ID) stay blank.** All CPI-derived columns (methodology, AEM, source, target, mapping, config params) also stay blank. Col 8 (Scenario) falls back to the ART JIRA summary text.

- **iFlow content cache lives at `scripts/rd08_iflow_content_cache.json`** — stores bpmnSteps, scripts, mappings, `has_aem_adapter` flag for all matched RD08 iFlows. Always update this file when iFlows change or AEM adapters are added. The cache is the only way to flag AEM adapter usage since the MCP tool does not expose channel config.

- **Cutover sheet col 7 = "Movement Needed?"** — populated from the ART's JIRA labels: if `CPI_No_Movement_Reqd` label is present → `No`; else → `Yes`. Auto-populated.

- **Cutover sheet col 8 = "Movement Till Test or Prod?"** — populated from JIRA labels: if `CPI_Movement_TillTest` label present → `Till Test`; else → `Till Prod`. Auto-populated.


