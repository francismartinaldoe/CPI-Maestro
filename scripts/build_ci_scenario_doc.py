"""
build_ci_scenario_doc.py — Generalised CI Scenario document builder
Adds a new iFlow entry to an existing SAP CI Scenario Word document (.docx)
following the exact 12-section structure used by the CPI team.

Usage:
  python scripts/build_ci_scenario_doc.py \\
    --doc "C:\\...\\doc.docx" \\
    --iflow "Validate_Contact_and_Duplicate_Check_in_C4C2" \\
    --version "1.0.13" --idt "5678" \\
    --developer "<DEVELOPER-NAME>" \\
    --sender "<SENDER-SYSTEM>" \\
    --sender-contact "<SENDER-CONTACT>" \\
    --receiver "<RECEIVER-SYSTEM>" \\
    --receiver-contact "<RECEIVER-CONTACT>" \\
    --date "16.07.2026" \\
    --dfd "C:\\...\\dfd.png" \\
    --tid "C:\\...\\tid.png" \\
    --screenshot "C:\\...\\screenshot.png" \\
    --abstract "The iFlow validates..." \\
    --bullets "HTTPS Sender: receives...|Groovy Script: checks...|HTTP Receiver: calls..."
    --ext-params "Sender|Address|/http/path|/http/path|/http/path;Receiver|Host|dev.host|test.host|prod.host"
"""
import argparse
import copy
import os
import sys
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph
from docx.shared import Inches, Pt


def get_txt(el):
    return ''.join(t.text or '' for t in el.findall('.//' + qn('w:t')))


def get_sid(el):
    s = el.find('.//' + qn('w:pStyle'))
    return s.get(qn('w:val'), '').lower().replace(' ', '') if s is not None else ''


def make_heading(doc, text, level):
    p_el = OxmlElement('w:p')
    para = Paragraph(p_el, doc)
    try:
        para.style = doc.styles[f'Heading {level}']
    except Exception:
        pass
    r = para.add_run(text)
    r.font.name = 'Calibri'
    return p_el


def make_toc(doc, text, style):
    p_el = OxmlElement('w:p')
    para = Paragraph(p_el, doc)
    try:
        para.style = doc.styles[style]
    except Exception:
        pass
    r = para.add_run(text)
    r.font.name = 'Calibri'
    r.font.size = Pt(9)
    return p_el


def add_img_para(doc, img_path, width=5.5):
    p_el = OxmlElement('w:p')
    para = Paragraph(p_el, doc)
    run = para.add_run()
    run.add_picture(img_path, width=Inches(width))
    return p_el


def find_table_by_header(doc, header_keyword):
    """Find a table by keyword in first row second cell."""
    for tbl in doc.tables:
        if len(tbl.rows) > 0 and header_keyword in tbl.rows[0].cells[1].text:
            return tbl
    return None


def find_last_in_section(children, section_text, section_heading_level, entry_style):
    """Find last paragraph of entry_style within a section."""
    result = None
    in_section = False
    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        if section_text in txt and f'heading{section_heading_level}' in sid:
            in_section = True
        if in_section and f'heading{section_heading_level}' in sid and section_text not in txt:
            break
        if in_section and 'heading1' in sid and section_text not in txt:
            break
        if in_section and entry_style in sid:
            result = child
    return result


def build_document(args):
    doc = Document(args.doc)
    body = doc.element.body
    children = list(body)
    iflow = args.iflow

    print(f'Adding {iflow} to document...')

    # ── 1. CHANGE HISTORY ────────────────────────────────────────────
    print('  1. Change History...')
    ch_tbl = doc.tables[0]
    new_tr = copy.deepcopy(ch_tbl.rows[-1]._tr)
    vals = [args.date, args.developer, f'Added {iflow}', 'n/a', '']
    for tc, val in zip(new_tr.findall('.//' + qn('w:tc')), vals):
        for t in tc.findall('.//' + qn('w:t')):
            t.text = val
            break
    ch_tbl._tbl.append(new_tr)

    # ── 2. SCENARIO OVERVIEW ─────────────────────────────────────────
    print('  2. Scenario Overview...')
    ov_tbl = doc.tables[1]
    for row in ov_tbl.rows:
        if 'Integration Flow' in row.cells[0].text and 'version' in row.cells[0].text.lower():
            row.cells[1].text = row.cells[1].text + f'\n{iflow} {args.version}'
        if 'IDT' in row.cells[0].text:
            row.cells[1].text = row.cells[1].text + f'\n{args.idt} — {iflow}'

    # ── 3. TOC ENTRIES ───────────────────────────────────────────────
    print('  3. TOC entries...')
    last_t4_dfd = last_t4_tid = last_t2_ext = last_t3_abs = last_t3_det = None
    in_tid = in_ext = in_abs = in_det = False

    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
        if tag != 'p':
            continue
        if 'Technical Integration Diagram' in txt and 'toc3' in sid:
            in_tid = True
        if in_tid and 'toc1' in sid and 'Technical' not in txt:
            in_tid = False
        if 'CPI Configuration' in txt and 'toc1' in sid:
            in_ext = True
        if in_ext and 'toc1' in sid and 'CPI' not in txt:
            in_ext = False
        if 'Flow Abstracts' in txt and 'toc2' in sid:
            in_abs = True
        if in_abs and 'toc2' in sid and 'Flow Abstracts' not in txt:
            in_abs = False
        if 'Flow Details' in txt and 'toc2' in sid:
            in_det = True
        if in_det and 'toc1' in sid:
            in_det = False
        if 'toc4' in sid and not in_tid:
            last_t4_dfd = child
        if 'toc4' in sid and in_tid:
            last_t4_tid = child
        if 'toc2' in sid and in_ext:
            last_t2_ext = child
        if 'toc3' in sid and in_abs:
            last_t3_abs = child
        if 'toc3' in sid and in_det:
            last_t3_det = child

    # Count existing Heading2 in CPI Config section for correct numbering
    ext_count = sum(1 for child in children
                    if 'heading2' in get_sid(child) and
                    any('CPI Configuration' in get_txt(c) and 'heading1' in get_sid(c)
                        for c in children[:children.index(child)]))
    ext_num = ext_count + 1

    # Count existing Heading3 in Flow Abstracts/Details for correct numbering
    abs_count = sum(1 for child in children
                    if 'heading3' in get_sid(child) and
                    any('Flow Abstracts' in get_txt(c) for c in children[:children.index(child)]))
    abs_num = abs_count + 1

    if last_t4_dfd is not None:
        last_t4_dfd.addnext(make_toc(doc, f'2.1.1.{abs_num}\t{iflow}', 'toc 4'))
    if last_t4_tid is not None:
        last_t4_tid.addnext(make_toc(doc, f'2.1.2.{abs_num}\t{iflow}', 'toc 4'))
    if last_t2_ext is not None:
        last_t2_ext.addnext(make_toc(doc, f'4.{ext_num}\tFlow Name: {iflow}', 'toc 2'))
    if last_t3_abs is not None:
        last_t3_abs.addnext(make_toc(doc, f'7.1.{abs_num}\tFlow Name: {iflow}', 'toc 3'))
    if last_t3_det is not None:
        last_t3_det.addnext(make_toc(doc, f'7.2.{abs_num}\tFlow Name: {iflow}', 'toc 3'))

    # ── 4. DATA FLOW DIAGRAM ─────────────────────────────────────────
    print('  4. Data Flow Diagram...')
    last_h4_dfd = None
    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        if 'Technical Integration Diagram' in txt and 'heading' in sid and 'toc' not in sid:
            break
        if 'heading4' in sid:
            last_h4_dfd = child

    if last_h4_dfd is not None and args.dfd and os.path.exists(args.dfd):
        h4_el = make_heading(doc, f'Flow Name: {iflow}', 4)
        empty_el = OxmlElement('w:p')
        img_el = add_img_para(doc, args.dfd)
        last_h4_dfd.addnext(h4_el)
        h4_el.addnext(empty_el)
        empty_el.addnext(img_el)

    # ── 5. TECHNICAL INTEGRATION DIAGRAM ────────────────────────────
    print('  5. Technical Integration Diagram...')
    last_h4_tid = None
    in_tid2 = False
    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        if 'Technical Integration Diagram' in txt and 'heading' in sid and 'toc' not in sid:
            in_tid2 = True
        if in_tid2 and 'heading1' in sid and 'Technical' not in txt:
            break
        if in_tid2 and 'heading4' in sid:
            last_h4_tid = child

    if last_h4_tid is not None and args.tid and os.path.exists(args.tid):
        h4_el = make_heading(doc, f'Flow Name: {iflow}', 4)
        empty_el = OxmlElement('w:p')
        img_el = add_img_para(doc, args.tid)
        last_h4_tid.addnext(h4_el)
        h4_el.addnext(empty_el)
        empty_el.addnext(img_el)

    # ── 6. INBOUND ENDPOINTS ─────────────────────────────────────────
    print('  6. Inbound Endpoints...')
    ep_tbl = doc.tables[2]
    src_row = ep_tbl.rows[1]
    new_tr = copy.deepcopy(src_row._tr)
    ep_vals = [iflow, args.inbound_path or f'/http/{iflow}', args.inbound_auth or 'Client Certificate with User-Role',
               args.inbound_cert or '']
    for tc, val in zip(new_tr.findall('.//' + qn('w:tc')), ep_vals):
        for t in tc.findall('.//' + qn('w:t')):
            t.text = val
            break
    ep_tbl._tbl.append(new_tr)

    # ── 7. EXTERNALIZED PARAMETERS ───────────────────────────────────
    print('  7. Externalized Parameters...')
    last_section_el = None
    in_cpi = False
    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        tag = child.tag.split('}')[1] if '}' in child.tag else child.tag
        if 'CPI Configuration' in txt and 'heading1' in sid:
            in_cpi = True
        if in_cpi and 'heading1' in sid and 'CPI' not in txt:
            break
        if in_cpi:
            last_section_el = child

    if last_section_el is not None:
        h2_el = make_heading(doc, f'Flow Name: {iflow}', 2)
        last_section_el.addnext(h2_el)

        # Build ext params table by cloning structure from first ext params table
        src_tbl = doc.tables[3]
        new_tbl_el = copy.deepcopy(src_tbl._tbl)
        trs = new_tbl_el.findall('.//' + qn('w:tr'))
        for tr in trs[1:]:
            tr.getparent().remove(tr)

        # Parse ext params from args: "Tab|Param|Dev|Test|Prod;Tab|Param|Dev|Test|Prod"
        ext_rows = []
        if args.ext_params:
            for row_str in args.ext_params.split(';'):
                parts = row_str.split('|')
                if len(parts) >= 5:
                    ext_rows.append(tuple(parts[:5]))

        # Default rows if none provided
        if not ext_rows:
            sender_addr = args.inbound_path or f'/http/{iflow}'
            ext_rows = [
                ('Sender', 'Address', sender_addr, sender_addr, sender_addr),
                ('Sender', 'Authorization', 'User Role', 'User Role', 'User Role'),
                ('Sender', 'User Role', 'ESBMessaging.send.YOUR_PACKAGE_ID',
                 'ESBMessaging.send.YOUR_PACKAGE_ID', 'ESBMessaging.send.YOUR_PACKAGE_ID'),
                ('Receiver', 'Address', 'TBD_DEV', 'TBD_TEST', 'TBD_PROD'),
                ('Receiver', 'Authentication', 'Client Certificate', 'Client Certificate', 'Client Certificate'),
                ('Receiver', 'Credential Name', '', '', ''),
            ]

        src_data_row = src_tbl.rows[1]._tr
        for row_data in ext_rows:
            new_tr = copy.deepcopy(src_data_row)
            tcs = new_tr.findall('.//' + qn('w:tc'))
            for tc, val in zip(tcs, row_data):
                for t in tc.findall('.//' + qn('w:t')):
                    t.text = str(val)
                    break
            new_tbl_el.append(new_tr)
        h2_el.addnext(new_tbl_el)

    # ── 8. CREDENTIALS ────────────────────────────────────────────────
    print('  8. Credentials...')
    cred_tbl = find_table_by_header(doc, 'Credential Name')
    if cred_tbl:
        new_tr = copy.deepcopy(cred_tbl.rows[1]._tr)
        tcs = new_tr.findall('.//' + qn('w:tc'))
        for i, tc in enumerate(tcs):
            for t in tc.findall('.//' + qn('w:t')):
                t.text = iflow if i == 0 else ''
                break
        cred_tbl._tbl.append(new_tr)

    # ── 9. VOLUMES ────────────────────────────────────────────────────
    print('  9. Volumes...')
    vol_tbl = find_table_by_header(doc, 'Volume')
    if vol_tbl:
        new_tr = copy.deepcopy(vol_tbl.rows[1]._tr)
        vol_vals = [iflow, args.volume or 'On Demand', args.avg_time or '< 2 sec',
                    'On Demand (event-driven)', '', '']
        for tc, val in zip(new_tr.findall('.//' + qn('w:tc')), vol_vals):
            for t in tc.findall('.//' + qn('w:t')):
                t.text = val
                break
        vol_tbl._tbl.append(new_tr)

    # ── 10. OPERATIONS ────────────────────────────────────────────────
    print('  10. Operations...')
    ops_tbl = find_table_by_header(doc, 'Error Handling')
    if ops_tbl and len(ops_tbl.rows) > 2:
        new_tr = copy.deepcopy(ops_tbl.rows[2]._tr)
        ops_vals = [
            iflow,
            args.error_handling or 'Sync Interface. In case of failures, error response sent back to sender. Check CPI logs.',
            '',
            f'{args.sender}: {args.sender_contact}\n{args.receiver}: {args.receiver_contact}\nCPI: {args.developer}',
            'No', 'Yes', '', 'No', 'No'
        ]
        for tc, val in zip(new_tr.findall('.//' + qn('w:tc')), ops_vals):
            for t in tc.findall('.//' + qn('w:t')):
                t.text = val
                break
        ops_tbl._tbl.append(new_tr)

    # ── 11. FLOW ABSTRACT ─────────────────────────────────────────────
    print('  11. Flow Abstract...')
    last_abs_el = None
    in_abs3 = False
    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        if 'Flow Abstracts' in txt and 'heading2' in sid:
            in_abs3 = True
        if in_abs3 and 'heading2' in sid and 'Flow Abstracts' not in txt:
            break
        if in_abs3:
            last_abs_el = child

    if last_abs_el is not None:
        abstract_text = args.abstract or (
            f'The {iflow.replace("_", " ")} iFlow receives a request from {args.sender} via HTTPS. '
            f'It processes the request and calls {args.receiver} for validation/processing. '
            f'In case of any error, the Exception Subprocess captures and formats the error response.'
        )
        desc_el = OxmlElement('w:p')
        desc_para = Paragraph(desc_el, doc)
        desc_para.style = doc.styles['Normal']
        r = desc_para.add_run(abstract_text)
        r.font.size = Pt(9)
        r.font.name = 'Calibri'
        h3_el = make_heading(doc, f'Flow Name: {iflow}', 3)
        last_abs_el.addnext(h3_el)
        h3_el.addnext(desc_el)

    # ── 12. FLOW DETAILS ──────────────────────────────────────────────
    print('  12. Flow Details...')
    last_det_el = None
    in_det3 = False
    for child in children:
        sid = get_sid(child)
        txt = get_txt(child)
        if 'Flow Details' in txt and 'heading2' in sid:
            in_det3 = True
        if in_det3 and 'heading1' in sid:
            break
        if in_det3:
            last_det_el = child

    if last_det_el is not None:
        bullets = args.bullets.split('|') if args.bullets else [
            f'HTTPS Sender Adapter: Receives request from {args.sender}.',
            f'Processing steps: validation and transformation logic.',
            f'Receiver Adapter: Calls {args.receiver} for processing.',
            'Exception Subprocess: Captures errors and formats error response.',
        ]

        h3_el = make_heading(doc, f'Flow Name: {iflow}', 3)
        empty_el = OxmlElement('w:p')
        last_det_el.addnext(h3_el)
        last_inserted = h3_el

        if args.screenshot and os.path.exists(args.screenshot):
            img_el = add_img_para(doc, args.screenshot, width=5.5)
            h3_el.addnext(empty_el)
            empty_el.addnext(img_el)
            last_inserted = img_el
        else:
            h3_el.addnext(empty_el)
            last_inserted = empty_el

        for bullet in bullets:
            b_el = OxmlElement('w:p')
            b_para = Paragraph(b_el, doc)
            b_para.style = doc.styles['List Paragraph']
            r = b_para.add_run(bullet.strip())
            r.font.size = Pt(9)
            r.font.name = 'Calibri'
            last_inserted.addnext(b_el)
            last_inserted = b_el

    # ── MAKE iFlow NAME BOLD ──────────────────────────────────────────
    count = 0
    for p in doc.paragraphs:
        if iflow in p.text:
            for run in p.runs:
                if iflow in run.text:
                    run.bold = True
                    count += 1
    print(f'  iFlow name bold in {count} places.')

    # ── SAVE ──────────────────────────────────────────────────────────
    doc.save(args.doc)
    size = os.path.getsize(args.doc) // 1024
    print(f'\n{"="*55}')
    print(f'File : {args.doc}')
    print(f'Size : {size} KB')
    print(f'ALL 12 SECTIONS ADDED for {iflow}')
    print(f'{"="*55}')


def main():
    parser = argparse.ArgumentParser(description='Add iFlow to CI Scenario document')
    parser.add_argument('--doc', required=True, help='Path to .docx file')
    parser.add_argument('--iflow', required=True, help='iFlow ID')
    parser.add_argument('--version', default='1.0.0', help='iFlow version')
    parser.add_argument('--idt', default='TBD', help='IDT Request ID')
    parser.add_argument('--developer', default='', help='Integration Developer name + UserID')
    parser.add_argument('--sender', default='', help='Sender system name')
    parser.add_argument('--sender-contact', dest='sender_contact', default='', help='Sender contact')
    parser.add_argument('--receiver', default='', help='Receiver system name')
    parser.add_argument('--receiver-contact', dest='receiver_contact', default='', help='Receiver contact')
    parser.add_argument('--date', default='', help='Active from date DD.MM.YYYY')
    parser.add_argument('--dfd', default='', help='Path to DFD image')
    parser.add_argument('--tid', default='', help='Path to TID image')
    parser.add_argument('--screenshot', default='', help='Path to iFlow screenshot')
    parser.add_argument('--abstract', default='', help='Flow abstract text (3 sentences)')
    parser.add_argument('--bullets', default='', help='Flow detail steps separated by |')
    parser.add_argument('--ext-params', dest='ext_params', default='',
                        help='Externalized params: Tab|Param|Dev|Test|Prod separated by ;')
    parser.add_argument('--inbound-path', dest='inbound_path', default='', help='HTTPS inbound path')
    parser.add_argument('--inbound-auth', dest='inbound_auth', default='Client Certificate with User-Role')
    parser.add_argument('--inbound-cert', dest='inbound_cert', default='')
    parser.add_argument('--volume', default='On Demand', help='Volume/messages per day')
    parser.add_argument('--avg-time', dest='avg_time', default='< 2 sec', help='Average processing time')
    parser.add_argument('--error-handling', dest='error_handling', default='', help='Error handling description')

    args = parser.parse_args()

    if not os.path.exists(args.doc):
        print(f'ERROR: Document not found: {args.doc}', file=sys.stderr)
        sys.exit(1)

    try:
        import docx  # noqa
    except ImportError:
        print('ERROR: python-docx not installed. Run: pip install python-docx', file=sys.stderr)
        sys.exit(1)

    build_document(args)


if __name__ == '__main__':
    main()
