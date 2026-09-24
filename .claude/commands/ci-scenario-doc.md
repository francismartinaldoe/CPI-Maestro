---
description: >
  Add a new iFlow to an existing SAP CI Scenario Word document (.docx).
  Reads iFlow details from CPI DEV, draws diagrams, takes screenshot,
  and populates all 12 mandatory sections. Usage:
    /ci-scenario-doc iflow=<iFlowId> doc=<path_to_docx>
    /ci-scenario-doc iflow=AEM_Gateway_Topic_Determination doc=C:\Users\...\doc.docx idt=3614
    /ci-scenario-doc    ← will ask for required fields
---

Parse `$ARGUMENTS` for:
- `iflow=` — iFlow ID (required)
- `doc=` — full path to the .docx file (required)
- `idt=` — IDT Request ID (optional)
- `version=` — iFlow version (optional, auto-read from CPI if omitted)
- `package=` — package ID (optional, auto-detected from CPI if omitted)
- `developer=` — Integration Developer name + userID (optional, defaults to current user)
- `sender-contact=` — Sender system contact (optional)
- `receiver-contact=` — Receiver system contact (optional)
- `date=` — Active From date (optional, defaults to today)

If `iflow=` or `doc=` are missing, ask the user for them before proceeding.

Use the `@ci-scenario-doc` agent to execute all steps:

1. PRE-FLIGHT — verify CPI DEV MCP, Playwright, Python, document exists
2. Collect any missing information from user
3. Read iFlow from CPI DEV canvas (adapters, scripts, steps, screenshot)
4. Draw Data Flow Diagram + Technical Integration Diagram
5. Build document — add all 12 sections
6. Make iFlow name bold everywhere
7. Report: file path + size + sections added

The agent will handle all sub-steps automatically.
If any pre-flight check fails, stop and provide exact fix instructions.
