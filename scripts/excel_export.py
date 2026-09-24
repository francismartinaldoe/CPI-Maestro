"""
excel_export.py  -  Shared SAP CPI Excel Report Engine
=====================================================
Architecture (3-step clean separation):
  Step 1 (agent-owned): Agent fetches data + writes data_dict to temp JSON
  Step 2 (this script):  Reads JSON → builds openpyxl Workbook → saves file
  Step 3 (this script):  Prints file path to stdout → agent reports to user

Usage:
  python scripts/excel_export.py --mode mirror     --data <json_path> [--out <dir>]
  python scripts/excel_export.py --mode cert        --data <json_path> [--out <dir>]
  python scripts/excel_export.py --mode governance  --data <json_path> [--out <dir>] [--cleanup]

Data contracts (what the agent must put in the JSON):

  mirror mode:
    {
      "src": "DEV",
      "tgt": "TEST",
      "iflow_id": "My_iFlow_ID",
      "iflow_name": "My iFlow Display Name",
      "src_snap": {
        "name": "...", "status": "STARTED", "version": "1.0.5",
        "deployedOn": "2026-06-29", "deployedBy": "YOUR-USER-ID",
        "packageId": "MyPackage", "logLevel": "INFO",
        "params": {"key1": "value1", "key2": "value2"}
      },
      "tgt_snap": null,   <- null if not deployed in target
      "src_errors": 5,
      "tgt_errors": 0
    }

  cert mode:
    {
      "findings": [
        {
          "alias": "ci_c4cv2_apiuser",
          "keyType": "RSA",
          "tenant": "DEV",
          "expiry": "2026-07-15",
          "days": 16,
          "status": "CRITICAL",
          "usage": "C4C v2 / SCV2"
        }
      ],
      "checked": ["DEV", "TEST"],
      "skipped": ["PROD"],
      "ts": "2026-06-29 10:00 UTC"
    }

Design rules enforced always:
  - Data rows: dark text #12171C regardless of background fill colour
  - Header rows (dark bg 0F2D4A / 1A73C7): white text FFFFFF
  - Status fills: MATCH=green EDFBF2, DRIFT=amber FFF8ED,
                  MISSING=pink FFEAF4, EXTRA=blue EEF4FF
"""

import argparse, json, os, sys
from datetime import datetime, timezone
from pathlib import Path

try:
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install -r scripts/requirements.txt")
    sys.exit(1)

# ── Colour palette (SAP Morning 2026) ─────────────────────────────────────────
C_HEADER  = "0F2D4A"
C_TITLE   = "1A73C7"
C_MATCH   = "EDFBF2"
C_DRIFT   = "FFF8ED"
C_MISSING = "FFEAF4"
C_EXTRA   = "EEF4FF"
C_GREY    = "F5F6F7"
C_WHITE   = "FFFFFF"
C_DARK    = "12171C"

STATUS_FILL = {
    "MATCH":      PatternFill("solid", fgColor=C_MATCH),
    "DRIFT":      PatternFill("solid", fgColor=C_DRIFT),
    "MISSING":    PatternFill("solid", fgColor=C_MISSING),
    "EXTRA":      PatternFill("solid", fgColor=C_EXTRA),
    "IN SYNC":    PatternFill("solid", fgColor=C_MATCH),
    "INCOMPLETE": PatternFill("solid", fgColor=C_MISSING),
    "EXPIRED":    PatternFill("solid", fgColor=C_MISSING),
    "CRITICAL":   PatternFill("solid", fgColor=C_DRIFT),
    "WARNING":    PatternFill("solid", fgColor="FFFDE0"),
}

# ── Shared cell utilities ─────────────────────────────────────────────────────

def _border():
    s = Side(style="thin", color="D0D5DD")
    return Border(left=s, right=s, top=s, bottom=s)

def _header_font(bold=True):
    return Font(name="Arial", bold=bold, color=C_WHITE, size=10)

def _data_font(bold=False):
    """Always dark text on data rows  -  never white on light backgrounds."""
    return Font(name="Arial", bold=bold, color=C_DARK, size=10)

def _title_font(size=12):
    return Font(name="Arial", bold=True, color=C_WHITE, size=size)

def write_title(ws, cell_ref, text, merge_to=None, size=12):
    if merge_to:
        ws.merge_cells(f"{cell_ref}:{merge_to}")
    c = ws[cell_ref]
    c.value = text
    c.fill = PatternFill("solid", fgColor=C_TITLE)
    c.font = _title_font(size)
    c.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[int(''.join(filter(str.isdigit, cell_ref)))].height = 28

def write_header_row(ws, row, values):
    for col, val in enumerate(values, 1):
        c = ws.cell(row=row, column=col, value=val)
        c.fill = PatternFill("solid", fgColor=C_HEADER)
        c.font = _header_font()
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        c.border = _border()
    ws.row_dimensions[row].height = 18

def write_data_row(ws, row, values, verdict=None, bold_cols=None):
    """Write a data row. Always dark text regardless of background fill."""
    fill = STATUS_FILL.get(verdict or "")
    for col, val in enumerate(values, 1):
        c = ws.cell(row=row, column=col, value=str(val) if val is not None else " - ")
        if fill:
            c.fill = fill
        c.font = _data_font(bold=bool(bold_cols and col in bold_cols))
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        c.border = _border()

def write_kv_row(ws, row, label, value, label_color=C_HEADER):
    lc = ws.cell(row=row, column=1, value=label)
    lc.fill = PatternFill("solid", fgColor=C_GREY)
    lc.font = Font(name="Arial", bold=True, color=label_color, size=10)
    lc.border = _border()
    vc = ws.cell(row=row, column=2, value=value)
    vc.font = _data_font()
    vc.border = _border()

def set_col_widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

def add_legend_sheet(wb, mode="mirror"):
    ws = wb.create_sheet("Legend")
    write_title(ws, "A1", "Legend  -  Colour Coding", merge_to="C1")
    write_header_row(ws, 2, ["Status", "Meaning", "Colour"])
    set_col_widths(ws, [18, 65, 12])
    rows = [
        ("MATCH",      "Values identical in both environments",              C_MATCH),
        ("DRIFT",      "Values differ  -  review before go-live",              C_DRIFT),
        ("MISSING",    "Present in source, absent in target  -  blocks promotion", C_MISSING),
        ("EXTRA",      "Present in target only  -  may be intentional",        C_EXTRA),
        ("IN SYNC",    "Overall: all parameters and identity match",         C_MATCH),
        ("INCOMPLETE", "Overall: target not deployed or missing items",      C_MISSING),
    ] if mode == "mirror" else [
        ("EXPIRED",    "Certificate has already expired",                    C_MISSING),
        ("CRITICAL",   "Expires within 30 days  -  renew before go-live",      C_DRIFT),
        ("WARNING",    "Expires within 90 days  -  schedule renewal",          "FFFDE0"),
        ("OK",         "More than 90 days remaining  -  no action needed",     C_MATCH),
    ]
    for i, (status, meaning, colour) in enumerate(rows, 1):
        r = i + 2
        for col, val in enumerate([status, meaning, ""], 1):
            c = ws.cell(row=r, column=col, value=val)
            c.fill = PatternFill("solid", fgColor=colour)
            c.font = _data_font()
            c.border = _border()
            c.alignment = Alignment(horizontal="left", vertical="center")

# ── Shared compare utility ────────────────────────────────────────────────────

def compare(a, b):
    if a is None and b is None: return "MATCH"
    if a is None: return "MISSING"
    if b is None: return "EXTRA"
    return "MATCH" if str(a) == str(b) else "DRIFT"

# ── Step 2: Workbook builders (no data fetching, no file I/O) ─────────────────

def build_mirror_workbook(data: dict) -> Workbook:
    """
    Build a MIRROR comparison workbook from pre-fetched data.
    data contract: see module docstring.
    Returns: openpyxl Workbook (not saved).
    """
    src_label  = data["src"]
    tgt_label  = data["tgt"]
    iflow_id   = data["iflow_id"]
    iflow_name = data.get("iflow_name", iflow_id)
    src_snap   = data.get("src_snap")
    tgt_snap   = data.get("tgt_snap")
    src_errors = data.get("src_errors", "N/A")
    tgt_errors = data.get("tgt_errors", "N/A")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Compute overall verdict
    if not src_snap or not tgt_snap:
        overall = "INCOMPLETE"
    else:
        all_keys = set(list(src_snap.get("params", {}).keys()) +
                       list(tgt_snap.get("params", {}).keys()))
        verdicts = [compare(src_snap.get("params", {}).get(k),
                            tgt_snap.get("params", {}).get(k)) for k in all_keys]
        for f in ["status", "version", "packageId", "logLevel"]:
            verdicts.append(compare(src_snap.get(f), tgt_snap.get(f)))
        if "MISSING" in verdicts:   overall = "INCOMPLETE"
        elif "DRIFT" in verdicts or "EXTRA" in verdicts: overall = "DRIFT"
        else: overall = "IN SYNC"

    wb = Workbook()

    # Sheet 1  -  Summary
    ws1 = wb.active
    ws1.title = "Summary"
    write_title(ws1, "A1",
        f"MIRROR Report  |  {iflow_id}  |  {src_label} vs {tgt_label}  |  {ts}",
        merge_to="E1", size=11)
    set_col_widths(ws1, [28, 50, 40, 40, 15])
    row = 2
    write_header_row(ws1, row, ["Field", "Value"])
    verdict_label = {
        "IN SYNC":    "IN SYNC - no drift",
        "DRIFT":      "DRIFT - review before go-live",
        "INCOMPLETE": "INCOMPLETE - target not deployed",
    }.get(overall, overall)
    for label, val in [
        ("iFlow ID",       iflow_id),
        ("iFlow Name",     iflow_name),
        ("Source",         src_label),
        ("Target",         tgt_label),
        ("Generated",      ts),
        ("Overall Verdict", verdict_label),
        ("Source Status",  src_snap["status"] if src_snap else "NOT DEPLOYED"),
        ("Target Status",  tgt_snap["status"] if tgt_snap else "NOT DEPLOYED"),
        ("Source Version", src_snap["version"] if src_snap else " - "),
        ("Target Version", tgt_snap["version"] if tgt_snap else " - "),
        ("Source Errors",  str(src_errors)),
        ("Target Errors",  str(tgt_errors)),
    ]:
        row += 1
        write_kv_row(ws1, row, label, val)

    row += 2
    ws1.cell(row=row, column=1, value="Promotion Blockers / Drift Items").font = \
        Font(name="Arial", bold=True, color=C_HEADER, size=11)
    row += 1
    write_header_row(ws1, row,
        ["#", "Parameter", f"{src_label} Value", f"{tgt_label} Value", "Verdict"])
    if src_snap and tgt_snap:
        pa, pb = src_snap.get("params", {}), tgt_snap.get("params", {})
        idx = 1
        for k in sorted(set(list(pa.keys()) + list(pb.keys()))):
            v = compare(pa.get(k), pb.get(k))
            if v != "MATCH":
                row += 1
                write_data_row(ws1, row,
                    [idx, k, pa.get(k, "_(absent)_"), pb.get(k, "_(absent)_"), v],
                    verdict=v, bold_cols=[2])
                idx += 1
        if idx == 1:
            row += 1
            ws1.cell(row=row, column=1,
                value="No drift detected  -  all parameters match.").font = _data_font()
    else:
        row += 1
        ws1.cell(row=row, column=1,
            value="One or both environments not deployed.").font = _data_font(bold=True)

    # Sheet 2  -  Identity
    ws2 = wb.create_sheet("Identity")
    write_title(ws2, "A1",
        f"iFlow Identity & Runtime  |  {src_label} vs {tgt_label}", merge_to="E1")
    write_header_row(ws2, 2, ["#", "Field", src_label, tgt_label, "Verdict"])
    set_col_widths(ws2, [5, 30, 40, 40, 15])
    for i, (label, key) in enumerate([
        ("iFlow Name",   "name"),   ("Version",    "version"),
        ("Status",       "status"), ("Package",    "packageId"),
        ("Deployed On",  "deployedOn"), ("Deployed By", "deployedBy"),
        ("Log Level",    "logLevel"), ("Recent Errors", None),
    ], 1):
        va = (src_snap[key] if key else str(src_errors)) if src_snap else "NOT DEPLOYED"
        vb = (tgt_snap[key] if key else str(tgt_errors)) if tgt_snap else "NOT DEPLOYED"
        v  = compare(va, vb) if (src_snap and tgt_snap) else "MISSING"
        write_data_row(ws2, i + 2, [i, label, va, vb, v], verdict=v)

    # Sheet 3  -  Parameters
    ws3 = wb.create_sheet("Parameters")
    write_title(ws3, "A1",
        f"Externalized Parameters  |  {src_label} vs {tgt_label}", merge_to="E1")
    write_header_row(ws3, 2,
        ["#", "Parameter Key", f"{src_label} Value", f"{tgt_label} Value", "Verdict"])
    set_col_widths(ws3, [5, 45, 35, 35, 15])
    if src_snap and tgt_snap:
        pa, pb = src_snap.get("params", {}), tgt_snap.get("params", {})
        for i, k in enumerate(sorted(set(list(pa.keys()) + list(pb.keys()))), 1):
            v = compare(pa.get(k), pb.get(k))
            write_data_row(ws3, i + 2,
                [i, k, pa.get(k, "_(absent)_"), pb.get(k, "_(absent)_"), v],
                verdict=v, bold_cols=[2] if v != "MATCH" else None)
    elif src_snap:
        ws3.cell(row=3, column=1,
            value=f"Not deployed in {tgt_label}  -  {src_label} parameters shown as reference"
        ).font = Font(name="Arial", bold=True, color="AA0808", size=10)
        ws3.cell(row=3, column=1).fill = PatternFill("solid", fgColor=C_MISSING)
        for i, k in enumerate(sorted(src_snap.get("params", {}).keys()), 1):
            write_data_row(ws3, i + 3,
                [i, k, src_snap["params"].get(k, ""), f"NOT DEPLOYED in {tgt_label}", "MISSING"],
                verdict="MISSING", bold_cols=[2])
    else:
        ws3.cell(row=3, column=1,
            value="Both environments not deployed.").font = _data_font()

    # Sheet 4  -  Scripts (optional)
    scripts = data.get("scripts")
    if scripts:
        ws4 = wb.create_sheet("Scripts")
        write_title(ws4, "A1",
            f"Groovy Script Comparison  |  {src_label} vs {tgt_label}", merge_to="F1")
        write_header_row(ws4, 2,
            ["#", "Script File", f"{src_label} Present", f"{tgt_label} Present", "Content Match", "Notes"])
        set_col_widths(ws4, [5, 45, 14, 14, 16, 70])
        for i, s in enumerate(scripts, 1):
            verdict = s.get("verdict", "MATCH")
            write_data_row(ws4, i + 2, [
                i,
                s.get("name", ""),
                s.get("src_present", "YES"),
                s.get("tgt_present", "YES"),
                s.get("content_match", "IDENTICAL"),
                s.get("notes", ""),
            ], verdict=verdict if verdict != "MATCH" else None, bold_cols=[2])

    # Sheet 5  -  BPMN Steps (optional)
    bpmn_steps = data.get("bpmn_steps")
    if bpmn_steps:
        ws5 = wb.create_sheet("BPMN Steps")
        write_title(ws5, "A1",
            f"BPMN Flow Steps  |  {src_label} vs {tgt_label}", merge_to="F1")
        write_header_row(ws5, 2,
            ["#", "Step Name", f"{src_label} Present", f"{tgt_label} Present", "Match", "Notes"])
        set_col_widths(ws5, [5, 50, 14, 14, 12, 40])
        for i, step in enumerate(bpmn_steps, 1):
            verdict = step.get("verdict", "MATCH")
            write_data_row(ws5, i + 2, [
                i,
                step.get("name", ""),
                step.get("src_present", "YES"),
                step.get("tgt_present", "YES"),
                step.get("match", "YES"),
                step.get("notes", ""),
            ], verdict=verdict if verdict != "MATCH" else None)

    # Sheet 6  -  Metadata Diff (optional)
    metadata_diff = data.get("metadata_diff")
    if metadata_diff:
        ws6 = wb.create_sheet("Metadata")
        write_title(ws6, "A1",
            f"Metadata Comparison  |  {src_label} vs {tgt_label}", merge_to="E1")
        write_header_row(ws6, 2,
            ["#", "Field", f"{src_label} Value", f"{tgt_label} Value", "Functional Impact"])
        set_col_widths(ws6, [5, 28, 45, 45, 40])
        for i, m in enumerate(metadata_diff, 1):
            verdict = m.get("verdict", "MATCH")
            write_data_row(ws6, i + 2, [
                i,
                m.get("field", ""),
                m.get("src_value", ""),
                m.get("tgt_value", ""),
                m.get("impact", "None"),
            ], verdict=verdict if verdict != "MATCH" else None)

    add_legend_sheet(wb, mode="mirror")
    return wb


def build_cert_workbook(data: dict) -> Workbook:
    """
    Build a certificate expiry workbook from pre-fetched data.
    data contract: see module docstring.
    Returns: openpyxl Workbook (not saved).
    """
    findings = data.get("findings", [])
    checked  = data.get("checked", [])
    skipped  = data.get("skipped", [])
    ts       = data.get("ts", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))

    expired  = [f for f in findings if f["status"] == "EXPIRED"]
    critical = [f for f in findings if f["status"] == "CRITICAL"]
    warning  = [f for f in findings if f["status"] == "WARNING"]

    tenant_status = " | ".join(
        [f"{t} checked" for t in checked] + [f"{t} skipped" for t in skipped]
    )

    wb = Workbook()

    # Sheet 1  -  Summary
    ws1 = wb.active
    ws1.title = "Summary"
    write_title(ws1, "A1",
        f"Certificate Expiry Report  |  {ts}  |  {tenant_status}",
        merge_to="G1", size=11)
    set_col_widths(ws1, [28, 50])
    row = 2
    write_header_row(ws1, row, ["Metric", "Count"])
    for label, val in [
        ("Tenants checked",           ", ".join(checked) or "None"),
        ("Tenants skipped",           ", ".join(skipped) or "None"),
        ("EXPIRED certificates",      str(len(expired))),
        ("CRITICAL (<=30 days)",      str(len(critical))),
        ("WARNING (<=90 days)",       str(len(warning))),
        ("Total requiring attention", str(len(findings))),
    ]:
        row += 1
        write_kv_row(ws1, row, label, val)

    # Sheet 2  -  All findings
    ws2 = wb.create_sheet("Certificates")
    write_title(ws2, "A1", f"Certificate Expiry Details  |  {ts}", merge_to="G1")
    write_header_row(ws2, 2,
        ["#", "Alias", "Type", "Tenant", "Expiry Date", "Days Left", "Status", "Likely Used In"])
    set_col_widths(ws2, [5, 45, 8, 8, 14, 12, 12, 35])
    if findings:
        for i, f in enumerate(findings, 1):
            write_data_row(ws2, i + 2,
                [i, f["alias"], f["keyType"], f["tenant"], f["expiry"],
                 f["days"], f["status"], f["usage"]],
                verdict=f["status"], bold_cols=[2])
    else:
        ws2.cell(row=3, column=1,
            value="All certificates are healthy  -  nothing expiring within 90 days."
        ).font = _data_font()

    # Sheet 3  -  Action Items (EXPIRED + CRITICAL only)
    ws3 = wb.create_sheet("Action Items")
    write_title(ws3, "A1",
        "Action Items  -  EXPIRED and CRITICAL certificates", merge_to="G1")
    write_header_row(ws3, 2,
        ["#", "Alias", "Tenant", "Expiry", "Days", "Likely Used In", "Action"])
    set_col_widths(ws3, [5, 45, 8, 14, 10, 35, 50])
    urgent = expired + critical
    if urgent:
        for i, f in enumerate(urgent, 1):
            action = (f"EXPIRED {abs(f['days'])}d ago  -  renew immediately"
                      if f["status"] == "EXPIRED"
                      else f"Expires in {f['days']}d  -  renew before next go-live")
            write_data_row(ws3, i + 2,
                [i, f["alias"], f["tenant"], f["expiry"], f["days"],
                 f["usage"], action],
                verdict=f["status"], bold_cols=[2])
    else:
        ws3.cell(row=3, column=1,
            value="No EXPIRED or CRITICAL certificates.").font = _data_font()

    add_legend_sheet(wb, mode="cert")
    return wb

# ── Step 3: Save + report path ────────────────────────────────────────────────

def save_workbook(wb: Workbook, filename: str, out_dir: str) -> str:
    """Save workbook to disk. Returns full path."""
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, filename)
    wb.save(path)
    return path

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SAP CPI Excel Report Engine  -  build workbook from pre-fetched data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
The calling agent is responsible for fetching data and writing it as JSON.
This script reads the JSON, builds the workbook, saves it, and prints the path.

Modes:
  mirror   -  iFlow cross-environment comparison
  cert     -  Certificate expiry audit

Examples:
  python scripts/excel_export.py --mode mirror --data /tmp/mirror_data.json
  python scripts/excel_export.py --mode cert   --data /tmp/cert_data.json
  python scripts/excel_export.py --mode mirror --data /tmp/data.json --out C:\\Users\\you\\Desktop
        """
    )
    parser.add_argument("--mode",  required=True, choices=["mirror", "cert", "governance"])
    parser.add_argument("--data",  required=True, help="Path to JSON data file from calling agent")
    parser.add_argument("--out",   default=None,  help="Output folder (default: ~/Downloads/excel_reports)")
    parser.add_argument("--name",  default=None,  help="Override output filename")
    parser.add_argument("--cleanup", action="store_true", help="Delete --data file after build (governance mode)")
    args = parser.parse_args()

    out_dir = args.out or str(Path.home() / "Downloads" / "excel_reports")
    ts_file = datetime.now().strftime("%Y%m%d_%H%M")

    # Read agent-provided data
    if not os.path.exists(args.data):
        print(f"ERROR: Data file not found: {args.data}")
        sys.exit(1)
    with open(args.data, encoding="utf-8") as f:
        data = json.load(f)

    if args.mode == "mirror":
        wb = build_mirror_workbook(data)
        safe_id = data.get("iflow_id", "iflow").replace("/", "_").replace(" ", "_")[:50]
        src = data.get("src", "SRC")
        tgt = data.get("tgt", "TGT")
        filename = args.name or f"{ts_file}_MIRROR_{src}_vs_{tgt}_{safe_id}.xlsx"
        path = save_workbook(wb, filename, out_dir)
        size_kb = Path(path).stat().st_size // 1024
        print(f"Report: {path}  ({size_kb} KB)")
        print(f"iFlow:  {data.get('iflow_name', data.get('iflow_id', ''))}")
        verdict = data.get("verdict") or ("INCOMPLETE" if not data.get("tgt_snap") else "")
        if verdict:
            print(f"Verdict: {verdict}")
        print("Sheets: Summary | Identity | Parameters | Legend")

    elif args.mode == "cert":
        wb = build_cert_workbook(data)
        filename = args.name or f"{ts_file}_CERT_EXPIRY_REPORT.xlsx"
        path = save_workbook(wb, filename, out_dir)
        size_kb = Path(path).stat().st_size // 1024
        findings = data.get("findings", [])
        expired  = sum(1 for f in findings if f["status"] == "EXPIRED")
        critical = sum(1 for f in findings if f["status"] == "CRITICAL")
        warning  = sum(1 for f in findings if f["status"] == "WARNING")
        print(f"Report: {path}  ({size_kb} KB)")
        print(f"EXPIRED={expired}  CRITICAL={critical}  WARNING={warning}")
        print("Sheets: Summary | Certificates | Action Items | Legend")

    elif args.mode == "governance":
        # Delegate to build_cpi_governance.py  -  it owns the 16-sheet format
        import subprocess
        governance_script = str(Path(__file__).parent / "build_cpi_governance.py")
        out_dir_gov = args.out or str(Path.home() / "Downloads" / "governance_report")
        filename = args.name or f"{ts_file}_CPI_ART_Governance_Workbook.xlsx"
        out_path = os.path.join(out_dir_gov, filename)
        os.makedirs(out_dir_gov, exist_ok=True)
        cmd = [sys.executable, governance_script, "--data", args.data, "--out", out_path]
        if args.cleanup:
            cmd.append("--cleanup")
        result = subprocess.run(cmd, capture_output=False, text=True)
        if result.returncode != 0:
            sys.exit(result.returncode)

if __name__ == "__main__":
    main()
