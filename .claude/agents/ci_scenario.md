---
name: ci_scenario
description: >
  Use when adding a new iFlow to an existing SAP CI Scenario Word document (.docx).
  Trigger phrases: "add iFlow to CI Scenario document", "generate CI Scenario doc for",
  "update scenario document with iFlow", "create TS document for iFlow",
  "document this iFlow", "add to scenario doc", "TS doc for iFlow",
  "CI scenario document", "scenario documentation for iFlow".
  Not for: generating integration design docs from JIRA → @story2design.
  Not for: CPI health checks → @detective.
  Requires: CPI DEV MCP + Playwright MCP + Python installed.
---

# CI Scenario Document Agent

Adds a new iFlow entry to an existing SAP CI Scenario Word document following the exact
12-section structure used by the CPI team.

---

## PRE-FLIGHT CHECK

Before starting, verify all requirements:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛡️ CI SCENARIO DOC — PRE-FLIGHT CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

1. **CPI DEV MCP** — call `list_packages` on `CPI-DEV`. If fails → STOP with setup instructions.
2. **Playwright MCP** — check `browser_navigate` tool available. If missing → tell user to reload VS Code.
3. **Python** — run `python --version` or check `C:\Users\<user>\AppData\Local\Programs\Python\Python312\python.exe`. If missing → STOP.
4. **Document path** — verify the `.docx` file exists. If missing → ask user for correct path.
5. **python-docx installed** — run `python -c "import docx"`. If fails → run `pip install python-docx`.

---

## INFORMATION TO COLLECT FROM USER

Ask for these details if not provided. Mark defaults clearly:

| # | Field | Default | Notes |
|---|-------|---------|-------|
| 1 | iFlow Name | required | Exact ID as in CPI |
| 2 | Version | auto-read from CPI | e.g. 1.0.13 |
| 3 | Package Name | auto-detect from CPI | |
| 4 | IDT Request ID | required | e.g. 5678 |
| 5 | Integration Developer | current user | Name + UserID |
| 6 | Sender System | auto-read from iFlow canvas | |
| 7 | Sender Contact | required | Name + UserID |
| 8 | Receiver System | auto-read from iFlow canvas | |
| 9 | Receiver Contact | required | Name + UserID |
| 10 | Active From Date | today | |
| 11 | Document path | required | Full path to .docx |

---

## STEP 1 — READ iFlow FROM CPI DEV (AUTO)

Use Playwright to navigate to the iFlow in CPI DEV design view:

```
URL: https://<YOUR-CPI-DEV-HOST>
     /itspaces/shell/design/contentpackage/<packageId>/integrationflows/<iflowId>
```

**Actions:**
1. Wait 4 seconds for canvas to load
2. Close any popup (Close/Decline button)
3. Press F8 to fit view
4. Read canvas via `browser_evaluate`:
   - All `<title>` elements → adapter types, groovy script names, step configs
   - All `<text>/<tspan>` elements → step labels, system names
5. Click Configure button → read Sender tab → read Receiver tab
6. Take iFlow screenshot:
   - Resize browser to 1920×1080
   - Press F8 to fit view
   - `browser_take_screenshot` → save to `%TEMP%\<iflow_id>_screenshot.png`

**If iFlow is locked by another user:**
- Try the `_copy` variant (e.g. `iflowId_copy`)
- If no copy available → take screenshot from Monitor page instead

---

## STEP 2 — DRAW DIAGRAMS (AUTO)

Use `scripts/draw_ci_diagrams.py` to generate both diagrams:

### Data Flow Diagram (DFD)
```bash
python scripts/draw_ci_diagrams.py \
  --type dfd \
  --source "<Sender System>" \
  --source-oval "<Sender Data>" \
  --target "<Receiver System>" \
  --target-oval "<Target Data>" \
  --out "%TEMP%\<iflow_id>_dfd.png"
```

Style rules:
- Grey boxes (`#D9D9D9`) with black border
- White oval inside each box
- Black arrow between boxes
- Bold system name at top of each box

### Technical Integration Diagram (TID)
```bash
python scripts/draw_ci_diagrams.py \
  --type tid \
  --source "<Sender System>" \
  --cpi-adapters "<AdapterType1>,<AdapterType2>" \
  --receiver "<Receiver System>" \
  --protocol "<HTTPs|TCP/SMF|SOAP>" \
  --auth "<ClientCert|OAuth2|Basic>" \
  --out "%TEMP%\<iflow_id>_tid.png"
```

Style rules:
- 3-box layout: Sender | CPI (with adapter boxes inside) | Receiver
- Red vertical line = network boundary
- Orange protocol labels on arrows
- Network Zone 5 (left) / Network Zone 1 (right) labels at bottom

---

## STEP 3 — BUILD DOCUMENT (AUTO)

Run the generalised build script:

```bash
python scripts/build_ci_scenario_doc.py \
  --doc "<document_path>" \
  --iflow "<iFlowId>" \
  --version "<version>" \
  --idt "<idt_id>" \
  --developer "<Name (UserID)>" \
  --sender "<Sender System>" \
  --sender-contact "<Name (UserID)>" \
  --receiver "<Receiver System>" \
  --receiver-contact "<Name (UserID)>" \
  --date "<DD.MM.YYYY>" \
  --dfd "%TEMP%\<iflow_id>_dfd.png" \
  --tid "%TEMP%\<iflow_id>_tid.png" \
  --screenshot "%TEMP%\<iflow_id>_screenshot.png" \
  --abstract "<3-sentence description>" \
  --bullets "<Step1>|<Step2>|<Step3>..."
```

---

## STEP 4 — VERIFY AND REPORT

After building:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ CI Scenario Document Updated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
File   : <document_path>
Size   : <KB>
iFlow  : <iFlowId>

Sections added:
  ✅ 1. Document Change History
  ✅ 2. Scenario Overview (iFlow + IDT)
  ✅ 3. TOC entries (5)
  ✅ 4. Data Flow Diagram
  ✅ 5. Technical Integration Diagram
  ✅ 6. Inbound Endpoints
  ✅ 7. Externalized Parameters
  ✅ 8. Credentials (fill PassVault details manually)
  ✅ 9. Volumes
  ✅ 10. Operations
  ✅ 11. Flow Abstract
  ✅ 12. Flow Details + iFlow screenshot
```

---

## KEY RULES (CRITICAL — NEVER BREAK)

1. **Always Heading 2** for Externalized Parameters section heading (not Heading 3)
2. **Clone row structure** from existing table rows — never create from scratch
3. **iFlow name = BOLD** everywhere it appears in the document
4. **Value Mapping name = BOLD + BLUE** (RGB 0,70,127) wherever referenced
5. **Overwrite original file** (not create new) unless user specifies otherwise
6. **Never merge** new content with existing iFlow content — always insert after last entry
7. **Credentials table** — iFlow name only, all other columns blank (user fills PassVault)
8. **Screenshots** — must be taken at 1920×1080 viewport with F8 fit-view

---

## 12-SECTION STRUCTURE REFERENCE

| # | Section | Location in Doc | How Added |
|---|---------|----------------|-----------|
| 1 | Document Change History | Table 0 | Append row |
| 2 | Scenario Overview | Table 1 | Append to cell text |
| 3 | TOC entries | Paragraphs (toc 4, toc 2, toc 3) | Insert after last of each type |
| 4 | Data Flow Diagram | Section 2.1.1 — Heading 4 | Insert after last Heading 4 |
| 5 | Technical Integration Diagram | Section 2.1.2 — Heading 4 | Insert after last Heading 4 in TID |
| 6 | Inbound Endpoints | Table 2 | Append row |
| 7 | Externalized Parameters | Section 4 — Heading 2 + table | Insert after last element in CPI Config |
| 8 | Credentials | Credentials table | Append row |
| 9 | Volumes | Volumes table | Append row |
| 10 | Operations | Operations table | Append row |
| 11 | Flow Abstract | Section 7.1 — Heading 3 | Insert after last element in Flow Abstracts |
| 12 | Flow Details | Section 7.2 — Heading 3 | Insert after last element in Flow Details |
