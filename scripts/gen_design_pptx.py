"""
gen_design_pptx.py  --  Integration Design Document Generator

Architecture: 3-layer self-healing pipeline
  Layer 1  LayoutEngine   -- computes ALL sizes/positions from content + slide dimensions.
                             Zero hardcoded layout constants in any builder.
  Layer 2  SmartWrite     -- measures text before writing; shrinks font until it fits;
                             expands box if still needed; truncates only as last resort.
  Layer 3  HealPass       -- after every slide: spatial-index overlap scan, O(n log n);
                             push/shrink rules applied; re-scan until clean (max 4 passes).

Usage:
    python scripts/gen_design_pptx.py --data <json> [--out <folder>] [--cleanup]
"""

import argparse
import json
import math
import sys
from datetime import datetime
from pathlib import Path

try:
    from pptx import Presentation
    from pptx.util import Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.oxml.ns import qn
    from lxml import etree
except ImportError:
    print("ERROR: pip install python-pptx lxml")
    sys.exit(1)

# ---------------------------------------------------------------------------
# SAP brand palette  (no layout values here)
# ---------------------------------------------------------------------------
C_BLUE   = RGBColor(0x00, 0x70, 0xF2)
C_BLUE2  = RGBColor(0x07, 0x71, 0xF2)
C_DARK   = RGBColor(0x00, 0x14, 0x4A)
C_NAVY   = RGBColor(0x00, 0x20, 0x60)
C_GREEN  = RGBColor(0x0A, 0x4D, 0x28)
C_AMBER  = RGBColor(0xE0, 0x7B, 0x00)
C_RED    = RGBColor(0xCC, 0x00, 0x00)
C_ORANGE = RGBColor(0xE8, 0x6B, 0x00)   # Alert / Notification (distinct from Error red)
C_TEAL   = RGBColor(0x00, 0x7A, 0x87)   # Splitter / Gather (parallel flow)
C_GREY   = RGBColor(0x50, 0x60, 0x6E)
C_WHITE  = RGBColor(0xFF, 0xFF, 0xFF)
C_FOOT   = RGBColor(0x50, 0x50, 0x50)
C_DIV    = RGBColor(0xC0, 0xC8, 0xD5)
C_LBL    = RGBColor(0x00, 0x14, 0x4A)

EMU = 914400  # EMU per inch

TEMPLATE_PATH = (
    Path(__file__).parent.parent
    / "docs/cpi/assets/templates/Design_Doc_Template.pptx"
)

# ---------------------------------------------------------------------------
# Layer 1 — LayoutEngine
# Computes ALL layout values dynamically from slide dimensions + content.
# Builders call lx.* methods instead of hardcoding numbers.
# ---------------------------------------------------------------------------

# Text measurement constants  (calibrated to Calibri/Arial proportional fonts)
CHAR_W_PER_PT  = 0.0075   # avg char width — calibrated wider to prevent over-shrinking
LINE_H_PER_PT  = 1.45 / 72  # line height factor (slightly taller for readability)
MIN_FONT_PT    = 7.0       # never go below this
DEFAULT_FONT   = 10.0      # default starting font
MARGIN_FRAC    = 0.012     # internal padding fraction


class LayoutEngine:
    """
    Computes dynamic layout for a slide from its pixel dimensions and content.
    All values are in inches.  No caller should embed numeric literals.
    """

    def __init__(self, slide_w: float, slide_h: float):
        self.W = slide_w   # slide width  (inches)
        self.H = slide_h   # slide height (inches)

    # ---- Text measurement ------------------------------------------------

    def char_w(self, pt: float) -> float:
        return pt * CHAR_W_PER_PT

    def line_h(self, pt: float) -> float:
        return pt * LINE_H_PER_PT

    def measure_lines(self, text: str, box_w: float, pt: float) -> int:
        """Estimate visual line count for text at given pt inside box_w inches."""
        cpw = max(1, int(box_w / self.char_w(pt)))
        lines = 0
        for para in text.split("\n"):
            lines += max(1, math.ceil(len(para) / cpw)) if para.strip() else 1
        return lines

    def text_h(self, text: str, box_w: float, pt: float) -> float:
        """Estimated height in inches needed for text at pt in box_w."""
        return self.measure_lines(text, box_w, pt) * self.line_h(pt) + box_w * MARGIN_FRAC

    def fit_font(self, text: str, box_w: float, box_h: float,
                 start_pt: float = DEFAULT_FONT) -> float:
        """Largest font (pt) that fits text in box. Never below MIN_FONT_PT."""
        pt = float(start_pt)
        while pt > MIN_FONT_PT and self.text_h(text, box_w, pt) > box_h:
            pt -= 0.5
        return max(pt, MIN_FONT_PT)

    # ---- Slide zones -------------------------------------------------------

    def top_bar_h(self) -> float:
        """Height of the thin top colour bar (proportional to slide height)."""
        return self.H * 0.0092          # ~0.069in on 7.5in slide

    def footer_y(self) -> float:
        """Y position of footer text (INTERNAL label)."""
        return self.H * 0.963           # ~7.222in on 7.5in slide

    def content_margin(self) -> float:
        """Standard left/right margin."""
        return self.W * 0.042           # ~0.556in on 13.33in slide

    def safe_bottom(self) -> float:
        """Lowest Y a content shape should reach (above footer)."""
        return self.footer_y() - self.line_h(DEFAULT_FONT) * 2

    # ---- HLD diagram (Slide 3) -------------------------------------------

    def hld_layout(self, n_nodes: int):
        """
        Returns dict with all HLD diagram layout values for n_nodes columns.
        All derived from slide dimensions — no magic numbers.
        """
        m     = self.content_margin()
        top   = self.H * 0.167          # below title band
        bot   = self.safe_bottom()
        h     = bot - top
        avail = self.W - 2 * m
        # gap between nodes = 28% of node width (template ratio: gap/node = 2.083/2.639)
        GAP_RATIO = 0.79
        node_w = avail / (n_nodes + (n_nodes - 1) * GAP_RATIO)
        gap    = node_w * GAP_RATIO
        xs     = [m + i * (node_w + gap) for i in range(n_nodes)]

        # Inner layout of each node box (proportional to node size)
        label_h   = h * 0.063           # centred label height
        sub_h     = h * 0.038           # sub-label height
        step_h    = h * 0.032           # each step line height (1 row)
        step_gap  = step_h * 1.18       # step row pitch
        sub_y     = top + h * 0.032     # sub-label y offset from box top
        step_y0   = sub_y + sub_h + h * 0.010
        label_y   = top + h * 0.5 - label_h * 0.5   # vertically centred

        # Arrow zone: mid-height of node
        arrow_y   = top + h * 0.5

        # Connector label: fits in the gap, sized to gap width
        lbl_w     = max(gap * 0.85, self.W * 0.06)
        lbl_h     = h * 0.045

        return {
            "top": top, "h": h, "node_w": node_w, "gap": gap, "xs": xs,
            "label_y": label_y, "label_h": label_h,
            "sub_y": sub_y, "sub_h": sub_h,
            "step_y0": step_y0, "step_h": step_h, "step_gap": step_gap,
            "arrow_y": arrow_y,
            "lbl_w": lbl_w, "lbl_h": lbl_h,
        }

    # ---- Swimlane (Slide 8) -----------------------------------------------

    def swimlane_layout(self, lanes: list, steps: list):
        """
        Returns dict with all swimlane layout values.
        Lane widths are proportional to step count in each lane.
        """
        hdr_top  = self.H * 0.0704       # header top (~0.528in)
        hdr_h    = self.H * 0.0444       # header height (~0.333in)
        cont_top = hdr_top + hdr_h
        cont_h   = self.safe_bottom() - cont_top - self.H * 0.035  # leave footer gap

        # Count steps per lane for proportional widths
        counts = {l: 0 for l in lanes}
        for s in steps:
            counts[s.get("lane", lanes[0])] = counts.get(s.get("lane", lanes[0]), 0) + 1

        total_steps = sum(counts.values()) or 1
        # Min lane fraction = 15% (so very empty lanes are still readable)
        MIN_FRAC = 0.15
        raw_fracs = {l: max(counts[l] / total_steps, MIN_FRAC) for l in lanes}
        total_f   = sum(raw_fracs.values())
        fracs     = {l: raw_fracs[l] / total_f for l in lanes}

        lane_widths = [fracs[l] * self.W for l in lanes]
        lane_xs     = [sum(lane_widths[:i]) for i in range(len(lanes))]

        # Box sizing: fit max_rows rows in cont_h with 28% padding
        max_rows = max(counts.values()) if counts else 1
        box_h    = min(cont_h / (max_rows * 1.28), cont_h * 0.18)
        row_h    = box_h * 1.28
        # Box width = 85% of narrowest lane width (so it fits even in small lanes)
        box_w    = min(lane_widths) * 0.85

        return {
            "hdr_top": hdr_top, "hdr_h": hdr_h,
            "cont_top": cont_top, "cont_h": cont_h,
            "lane_widths": lane_widths, "lane_xs": lane_xs,
            "box_w": box_w, "box_h": box_h, "row_h": row_h,
        }

    # ---- Text box fitting -------------------------------------------------

    def fit_box(self, shape, lines: list, start_pt: float = DEFAULT_FONT,
                critical: bool = False):
        """
        Write lines into shape with 3-strategy auto-fit:
          1. Shrink font to MIN_FONT_PT
          2. Expand box downward (critical = can reach slide bottom, else safe_bottom)
          3. Truncate (only if not critical AND still overflows after expand)
        """
        from pptx.oxml.ns import qn as _qn
        from lxml import etree as _et

        if not shape or not shape.has_text_frame:
            return

        box_w = shape.width / EMU
        box_h = shape.height / EMU
        box_t = shape.top / EMU
        text  = "\n".join(str(l) for l in lines)

        # Strategy 1: shrink font until it fits or hits MIN_FONT_PT
        pt = self.fit_font(text, box_w, box_h, start_pt)

        # Strategy 2: expand box
        req_h = self.text_h(text, box_w, pt)
        if req_h > box_h:
            cap   = (self.H - box_t - 0.05) if critical else (self.safe_bottom() - box_t)
            new_h = min(req_h + 0.05, max(cap, box_h))
            shape.height = int(new_h * EMU)
            box_h = shape.height / EMU

        # Strategy 3: truncate ONLY if not critical
        final = list(lines)
        if not critical and self.text_h("\n".join(str(l) for l in final), box_w, pt) > box_h:
            while len(final) > 1 and self.text_h("\n".join(str(l) for l in final), box_w, pt) > box_h:
                final.pop()
            if final:
                last = str(final[-1])
                if len(last) > 12:
                    final[-1] = last[:max(10, len(last)-4)] + "..."

        # Write — wipe XML then rebuild
        tf = shape.text_frame
        tf.word_wrap = True
        txBody = tf._txBody
        for p in txBody.findall(_qn('a:p')):
            txBody.remove(p)
        for line in final:
            p_el = _et.SubElement(txBody, _qn('a:p'))
            r_el = _et.SubElement(p_el, _qn('a:r'))
            rPr  = _et.SubElement(r_el, _qn('a:rPr'),
                                  attrib={'lang': 'en-US', 'dirty': '0',
                                          'sz': str(int(pt * 100))})
            t_el = _et.SubElement(r_el, _qn('a:t'))
            t_el.text = _clean(str(line) if line else "")


# ---------------------------------------------------------------------------
# Layer 3 — Fast Accurate HealPass  (spatial index, O(n log n))
# ---------------------------------------------------------------------------

def heal_slide(slide, slide_num: int, max_passes: int = 4) -> int:
    """
    Scan all text shapes for overlaps; resolve; repeat until clean.
    Returns number of passes needed.
    Uses a simple interval-sweep for speed: sort by top, sweep downward.
    """
    TITLE_NAMES = {"Title", "PLACEHOLDER"}
    GAP = 0.01  # minimum clear gap between shapes (inches)

    def is_title(s):
        return "Title" in s.name or s.shape_type == 14

    def bbox(s):
        t = s.top / EMU;  l = s.left / EMU
        return l, t, l + s.width / EMU, t + s.height / EMU

    def text_shapes():
        return [s for s in slide.shapes
                if s.has_text_frame and s.text_frame.text.strip()
                and s.shape_type != 9    # exclude connectors
                and (s.width or 0) / EMU < 4.0]  # exclude full-width lane bands

    def do_overlap(s1, s2):
        l1,t1,r1,b1 = bbox(s1); l2,t2,r2,b2 = bbox(s2)
        return not (r1 <= l2+GAP or r2 <= l1+GAP or b1 <= t2+GAP or b2 <= t1+GAP)

    for pass_num in range(1, max_passes + 1):
        shapes  = text_shapes()
        # Sort by top for cache-friendly sweep
        shapes.sort(key=lambda s: s.top)
        changed = False

        for i in range(len(shapes)):
            for j in range(i + 1, len(shapes)):
                s1, s2 = shapes[i], shapes[j]
                l1,t1,r1,b1 = bbox(s1)
                l2,t2,r2,b2 = bbox(s2)
                # Early exit: s2 is fully below s1 + some slack — no more overlaps possible
                if t2 > b1 + 0.5:
                    break
                if not do_overlap(s1, s2):
                    continue
                changed = True

                # Resolution rules (in priority order)
                # R1: title overlaps content below → shrink title bottom
                if is_title(s1) and not is_title(s2) and t1 <= t2:
                    new_h = max(s1.height / EMU * 0.5, t2 - t1 - GAP)
                    s1.height = int(new_h * EMU)

                # R2: content overlaps content vertically → push lower down
                # GUARD: skip if shapes are in different intentional Y zones
                # (e.g. main flow row vs exception row — both intentional, not errors)
                elif abs(l1 - l2) < 1.5 and t1 <= t2:
                    # Only push if both shapes are in the same Y zone (within 0.20in of each other)
                    cy1 = (t1 + b1) / 2; cy2 = (t2 + b2) / 2
                    if abs(cy2 - cy1) < 0.30:  # same zone — safe to push
                        s2.top = int((b1 + GAP) * EMU)
                    # else: different intentional rows — leave alone

                # R3: content overlaps content horizontally → shrink right edge of left shape
                elif r1 > l2 and t1 < b2 and t2 < b1:
                    if l1 < l2:
                        new_w = max(s1.width / EMU * 0.5, l2 - l1 - GAP)
                        s1.width = int(new_w * EMU)
                    else:
                        new_w = max(s2.width / EMU * 0.5, r1 - l2 - GAP)
                        s2.left  = int((r1 + GAP) * EMU)
                        s2.width = int(new_w * EMU)

        if not changed:
            return pass_num  # converged

    # Report unresolved
    shapes = text_shapes()
    for i in range(len(shapes)):
        for j in range(i+1, len(shapes)):
            if do_overlap(shapes[i], shapes[j]):
                print(f"  WARN slide {slide_num}: unresolved [{shapes[i].name}] x [{shapes[j].name}]")
    return max_passes


# ---------------------------------------------------------------------------
# Shape helpers  (all sizes passed in — no constants inside)
# ---------------------------------------------------------------------------

def _clean(s: str) -> str:
    s = s.replace("→", "->").replace("←", "<-").replace("—", "-")
    # Strip characters outside BMP (emoji, etc.) that pptx can't encode
    s = "".join(c if ord(c) < 0x10000 else "?" for c in s)
    return s

def _emu(v: float) -> int:
    return int(v * EMU)


def _write_shape_text(shape, text: str, pt: float,
                      bold: bool = False, color: RGBColor = C_WHITE,
                      align: PP_ALIGN = PP_ALIGN.LEFT):
    """Write a single text run into a shape, overriding all paragraphs."""
    from pptx.oxml.ns import qn as _qn
    from lxml import etree as _et
    tf = shape.text_frame
    tf.word_wrap = True
    txBody = tf._txBody
    for p in txBody.findall(_qn('a:p')):
        txBody.remove(p)
    p_el = _et.SubElement(txBody, _qn('a:p'))
    pPr  = _et.SubElement(p_el, _qn('a:pPr'))
    pPr.set('algn', {PP_ALIGN.CENTER: 'ctr', PP_ALIGN.RIGHT: 'r'}.get(align, 'l'))
    r_el = _et.SubElement(p_el, _qn('a:r'))
    rPr  = _et.SubElement(r_el, _qn('a:rPr'),
                           attrib={'lang': 'en-US', 'dirty': '0',
                                   'sz': str(int(pt * 100)),
                                   'b':  '1' if bold else '0'})
    solidFill = _et.SubElement(rPr, _qn('a:solidFill'))
    srgbClr   = _et.SubElement(solidFill, _qn('a:srgbClr'))
    srgbClr.set('val', str(color))
    t_el = _et.SubElement(r_el, _qn('a:t'))
    t_el.text = _clean(text)


def add_shape(slide, shape_id: int,
              l: float, t: float, w: float, h: float,
              fill: RGBColor = C_BLUE,
              text: str = None, pt: float = DEFAULT_FONT,
              bold: bool = True, color: RGBColor = C_WHITE,
              align: PP_ALIGN = PP_ALIGN.CENTER,
              line_color: RGBColor = None) -> object:
    """
    Generic shape factory. shape_id:
      1=rect, 2=parallelogram, 4=diamond, 5=rounded-rect, 9=oval
    All sizes in inches — computed by caller (LayoutEngine).
    If text is given, font is auto-fit to the box before writing.
    """
    lx = LayoutEngine(l + w, t + h)   # use shape bounds as local slide context
    shape = slide.shapes.add_shape(shape_id, _emu(l), _emu(t), _emu(w), _emu(h))
    if shape_id == 5:
        shape.adjustments[0] = 0.1
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line_color:
        shape.line.color.rgb = line_color
        shape.line.width = Pt(0.75)
    else:
        shape.line.fill.background()

    if text:
        fitted_pt = lx.fit_font(_clean(text), w, h, pt)
        _write_shape_text(shape, _clean(text), fitted_pt, bold, color, align)
    return shape


def add_tb(slide, text: str,
           l: float, t: float, w: float, h: float,
           pt: float = DEFAULT_FONT, bold: bool = False,
           color: RGBColor = C_FOOT,
           align: PP_ALIGN = PP_ALIGN.LEFT) -> object:
    """Plain textbox with auto-fit font."""
    lx = LayoutEngine(l + w, t + h)
    fitted_pt = lx.fit_font(_clean(text), w, h, pt)
    tb = slide.shapes.add_textbox(_emu(l), _emu(t), _emu(w), _emu(h))
    tb.text_frame.word_wrap = True
    _write_shape_text(tb, _clean(text), fitted_pt, bold, color, align)
    return tb


def add_arrow(slide, x1: float, y1: float, x2: float, y2: float,
              color: RGBColor = C_NAVY, width_pt: float = 1.5,
              dashed: bool = False) -> object:
    conn = slide.shapes.add_connector(1, _emu(x1), _emu(y1), _emu(x2), _emu(y2))
    conn.line.color.rgb = color
    conn.line.width = Pt(width_pt)
    ln = conn.line._ln
    if dashed:
        # OOXML dash style for error / async connectors
        prstDash = etree.SubElement(ln, qn('a:prstDash'))
        prstDash.set('val', 'dash')
    for tag in ('a:tailEnd', 'a:headEnd'):
        for el in ln.findall(tag, ln.nsmap):
            ln.remove(el)
    tail = etree.SubElement(ln, qn('a:tailEnd')); tail.set('type', 'none')
    head = etree.SubElement(ln, qn('a:headEnd'))
    head.set('type', 'arrow'); head.set('w', 'med'); head.set('len', 'med')
    return conn


# Snapped connector ID counter — incremented per slide build
_CONN_ID_BASE = 500

def add_snapped_connector(slide, sp_from, idx_from, sp_to, idx_to,
                           color: RGBColor = None,
                           width_pt: float = 1.4,
                           dashed: bool = False,
                           connector_type: str = "straight") -> object:
    """
    Add a native PowerPoint connector snapped to shape connection points.
    PowerPoint routes it automatically — stays attached when shapes are moved manually.

    idx (MSO standard connection point index):
      0 = top-mid   1 = right-mid   2 = bottom-mid   3 = left-mid

    connector_type: "straight" | "elbow" (bentConnector3) | "curved"

    The connector is injected as a <p:cxnSp> element with stCxn/endCxn snap refs.
    All routing is delegated to PowerPoint's engine — no coordinate math needed.
    """
    global _CONN_ID_BASE
    _CONN_ID_BASE += 1
    conn_id = _CONN_ID_BASE

    col = color or C_NAVY

    def _get_sp_id(sp):
        return sp._element.find('.//' + qn('p:cNvPr')).get('id')

    def _cx_pt(sp, idx):
        """Compute absolute EMU coords of connection point idx on shape sp."""
        l = sp.left; t = sp.top; w = sp.width; h = sp.height
        pts = [(l + w//2, t), (l + w, t + h//2),
               (l + w//2, t + h), (l, t + h//2)]
        return pts[idx]

    id_from = _get_sp_id(sp_from)
    id_to   = _get_sp_id(sp_to)
    x1, y1  = _cx_pt(sp_from, idx_from)
    x2, y2  = _cx_pt(sp_to,   idx_to)

    geom_map = {
        "straight": "line",
        "elbow":    "bentConnector3",
        "curved":   "curvedConnector3",
    }
    prst = geom_map.get(connector_type, "bentConnector3")

    cxnSp = etree.SubElement(slide.shapes._spTree, qn('p:cxnSp'))

    # nvCxnSpPr
    nvCxnSpPr = etree.SubElement(cxnSp, qn('p:nvCxnSpPr'))
    cNvPr = etree.SubElement(nvCxnSpPr, qn('p:cNvPr'))
    cNvPr.set('id', str(conn_id))
    cNvPr.set('name', f'Connector {conn_id}')
    cNvCxnSpPr = etree.SubElement(nvCxnSpPr, qn('p:cNvCxnSpPr'))
    stCxn = etree.SubElement(cNvCxnSpPr, qn('a:stCxn'))
    stCxn.set('id', str(id_from)); stCxn.set('idx', str(idx_from))
    endCxn = etree.SubElement(cNvCxnSpPr, qn('a:endCxn'))
    endCxn.set('id', str(id_to));  endCxn.set('idx', str(idx_to))
    etree.SubElement(nvCxnSpPr, qn('p:nvPr'))

    # spPr — bounding box of connector
    spPr = etree.SubElement(cxnSp, qn('p:spPr'))
    xfrm = etree.SubElement(spPr, qn('a:xfrm'))
    # Handle flipped connectors
    if x2 < x1:
        xfrm.set('flipH', '1')
    if y2 < y1:
        xfrm.set('flipV', '1')
    off = etree.SubElement(xfrm, qn('a:off'))
    off.set('x', str(min(x1, x2))); off.set('y', str(min(y1, y2)))
    ext = etree.SubElement(xfrm, qn('a:ext'))
    ext.set('cx', str(max(abs(x2 - x1), 1)))
    ext.set('cy', str(max(abs(y2 - y1), 1)))

    prstGeom = etree.SubElement(spPr, qn('a:prstGeom'))
    prstGeom.set('prst', prst)
    etree.SubElement(prstGeom, qn('a:avLst'))

    etree.SubElement(spPr, qn('a:noFill'))

    # Line style
    ln = etree.SubElement(spPr, qn('a:ln'))
    ln.set('w', str(int(width_pt * 12700)))
    sf = etree.SubElement(ln, qn('a:solidFill'))
    sc = etree.SubElement(sf, qn('a:srgbClr'))
    sc.set('val', '{:02X}{:02X}{:02X}'.format(col[0], col[1], col[2]))
    if dashed:
        pd = etree.SubElement(ln, qn('a:prstDash')); pd.set('val', 'dash')
    etree.SubElement(ln, qn('a:tailEnd')).set('type', 'none')
    hd = etree.SubElement(ln, qn('a:headEnd'))
    hd.set('type', 'arrow'); hd.set('w', 'med'); hd.set('len', 'med')

    return cxnSp


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Step classifier  (keyword → shape type + fill)
# ---------------------------------------------------------------------------
# CPI Component Notation Standard:
#   shape_id 1  = Process Rectangle      (blue)    — Adapter, Content Modifier, Mapping, Request Reply
#   shape_id 2  = Cylinder/Parallelogram  (grey)    — Data Store, JMS Queue, Value Mapping
#   shape_id 4  = Diamond                (amber)   — Router, Filter (true branching only — NOT validate)
#   shape_id 5  = Rounded Rectangle      (red)     — Exception Subprocess, Error, Fault, DLQ
#   shape_id 6  = Predefined Process     (blue)    — Groovy Script, Custom Script
#   shape_id 7  = Rounded Rectangle      (orange)  — Alert, Notification (distinct from error)
#   shape_id 9  = Oval / Circle          (green)   — Start, Timer Event
#   shape_id 9  = Oval / Circle          (navy)    — End Event
#   shape_id 10 = Subprocess             (navy)    — Local Integration Process, Process Call
#   shape_id 11 = Parallelogram          (teal)    — Splitter (fan-out)
#   shape_id 12 = Parallelogram          (teal)    — Gather / Join (fan-in)
#   shape_id 13 = Document shape         (grey)    — MPL Logging

_START_KW      = {"timer", "start", "fires", "begin", "trigger", "kick", "initial"}
_END_KW        = {"end:", "complete:", "completion:", "done:", "return response", "send ack", "end event"}
_ERROR_KW      = {"exception", "error", "failure", "fail", "dead letter", "dlq", "fault"}
_ALERT_KW      = {"alert", "notify", "notification", "send email", "send alert", "webhook alert"}
_STORE_VERB    = {"write", "store", "persist", "audit", "read", "fetch"}   # first word
_STORE_KW      = {"data store", "database", "message store", "jms", "queue",
                  "value mapping", "value map", "lookup"}
# Router / Filter = true flow-branching steps only (label ends in ? or starts with Router:/Filter:)
# Validate / Check = process step (Rectangle) — NOT diamond
_DECISION_KW   = {"router:", "filter:", "route?", "filter?", "condition?", "decision?", "dedup?", "if?"}
_DECISION_END  = "?"   # any label ending in ? is a diamond
_SUBPROCESS_KW = {"subprocess", "process call", "local integration", "reusable",
                  "call process", "invoke"}
_GROOVY_KW     = {"groovy", "custom script", "custom logic"}
_SPLITTER_KW   = {"splitter", "split message", "multicast", "fan-out", "fanout"}
_GATHER_KW     = {"gather", "join", "aggregate", "fan-in", "fanin", "merge messages"}
_LOG_KW        = {"mpl log", "mpl logging", "log step", "audit log", "message log"}


def _classify(label: str):
    lw = label.lower().strip()
    first = lw.split()[0] if lw.split() else ""

    # Start / Timer → oval (green)
    if any(k in lw for k in _START_KW):
        return 9, C_GREEN

    # End Event — only triggered by explicit end labels (e.g. "End:", "Return response", "Send ACK")
    if any(k in lw for k in _END_KW):
        return 9, C_NAVY

    # Exception Subprocess / Error / Fault / DLQ → rounded rect (red)
    if any(k in lw for k in _ERROR_KW):
        return 5, C_RED

    # Alert / Notification → rounded rect (orange — visually distinct from error)
    if any(k in lw for k in _ALERT_KW):
        return 7, C_ORANGE

    # Subprocess / Process Call → navy rect
    if any(k in lw for k in _SUBPROCESS_KW):
        return 10, C_NAVY

    # Groovy / Custom Script → blue rect (signals predefined process)
    if any(k in lw for k in _GROOVY_KW):
        return 6, C_BLUE

    # Splitter / Multicast → teal parallelogram (fan-out)
    if any(k in lw for k in _SPLITTER_KW):
        return 11, C_TEAL

    # Gather / Join / Aggregate → teal parallelogram (fan-in)
    if any(k in lw for k in _GATHER_KW):
        return 12, C_TEAL

    # MPL Logging → grey rect (document)
    if any(k in lw for k in _LOG_KW):
        return 13, C_GREY

    # Router / Filter: explicit prefix OR label ends in ? → diamond (amber)
    if any(k in lw for k in _DECISION_KW) or lw.endswith(_DECISION_END):
        return 4, C_AMBER

    # Store verb at START of label → cylinder (grey)
    if first in _STORE_VERB:
        return 2, C_GREY

    # Data Store / JMS / Value Mapping anywhere → cylinder (grey)
    if any(k in lw for k in _STORE_KW):
        return 2, C_GREY

    # Default → Process Rectangle (blue)
    return 1, C_BLUE


# ---------------------------------------------------------------------------
# Buildability validator  (design-only node detection)
# ---------------------------------------------------------------------------

# CPI-buildable keyword signals — labels containing these map to real CPI components
_BUILDABLE_KW = {
    "timer", "start", "end", "sender adapter", "receiver adapter",
    "http", "odata", "sftp", "soap", "idoc", "jms", "processdirect",
    "content modifier", "request reply", "message mapping", "groovy",
    "script", "xslt", "router", "filter", "splitter", "gather",
    "validator", "value mapping", "data store", "write:", "read:", "store:",
    "fetch:", "local integration", "process call", "exception", "error",
    "mpl log", "audit log", "alert", "notify", "duplicate", "dedup",
    "multicast", "idempotent", "retry", "queue", "jms queue",
    "return response", "send ack", "validate", "map to", "receive",
    "send to", "post", "get ", "patch", "delete", "lookup",
}

# Design-only abstractions → suggested CPI implementation
_DESIGN_ONLY = {
    "api gateway":          "HTTP Sender Adapter with path-based routing",
    "api proxy":            "HTTP Sender Adapter with path-based routing",
    "rule engine":          "Groovy Script step (or BRFplus via RFC)",
    "business logic":       "Groovy Script step",
    "orchestration":        "Local Integration Process + Process Call",
    "transformation engine":"Message Mapping step",
    "event bus":            "JMS Queue or SAP Advanced Event Mesh adapter",
    "event broker":         "JMS Queue or SAP Advanced Event Mesh adapter",
    "message broker":       "JMS Queue or SAP Advanced Event Mesh adapter",
    "database":             "JDBC Receiver Adapter or Data Store step",
    "sql":                  "JDBC Receiver Adapter",
    "cache":                "Data Store (write + read pattern)",
    "queue manager":        "JMS Queue",
    "esb":                  "Model as iFlow steps — CPI is the integration layer",
    "service bus":          "Model as iFlow steps — CPI is the integration layer",
    "microservice":         "HTTP Receiver Adapter (REST endpoint)",
    "btp service":          "HTTP Receiver Adapter + OAuth2 credential alias",
    "ai model":             "HTTP Receiver Adapter to AI Core endpoint",
    "machine learning":     "HTTP Receiver Adapter to BTP AI endpoint",
    "middleware":           "Model as iFlow steps",
    "integration platform": "Model as iFlow steps",
    "message queue":        "JMS Queue or Advanced Event Mesh adapter",
    "pub/sub":              "JMS Queue or Advanced Event Mesh adapter",
    "kafka":                "Kafka Sender/Receiver Adapter",
    "webhook trigger":      "HTTP Sender Adapter",
    "rest api":             "HTTP Sender or Receiver Adapter",
}


def validate_buildability(steps: list) -> dict:
    """
    Validate every flow_step label against the CPI component catalogue.

    Returns:
      {
        "buildable":    [(idx, label, cpi_component), ...],
        "design_only":  [(idx, label, suggested_impl), ...],
        "unknown":      [(idx, label), ...],
      }
    """
    buildable = []
    design_only = []
    unknown = []

    for idx, step in enumerate(steps):
        label = step.get("label", "").lower().strip()

        # Check design-only first (more specific)
        matched_do = None
        for kw, suggestion in _DESIGN_ONLY.items():
            if kw in label:
                matched_do = suggestion
                break

        if matched_do:
            design_only.append((idx, step.get("label", ""), matched_do))
            continue

        # Check buildable
        if any(k in label for k in _BUILDABLE_KW):
            # Derive CPI component name from classifier
            sid, _ = _classify(step.get("label", ""))
            _SID_NAME = {
                1: "Process step (Rectangle)",
                2: "Data Store / JMS / Value Mapping",
                4: "Router / Filter (Diamond)",
                5: "Exception Subprocess",
                6: "Groovy Script",
                7: "Alert / Notification",
                9: "Start / End Event",
                10: "Local Integration Process",
                11: "Splitter / Multicast",
                12: "Gather / Join",
                13: "MPL Logging",
            }
            buildable.append((idx, step.get("label", ""), _SID_NAME.get(sid, "CPI Step")))
            continue

        # Cannot map
        unknown.append((idx, step.get("label", "")))

    return {"buildable": buildable, "design_only": design_only, "unknown": unknown}


def apply_buildability_warnings(slide, lx: LayoutEngine, pos: dict,
                                 design_only_idxs: set, unknown_idxs: set):
    """
    Overlay a warning badge on design-only and unknown steps in the PPTX diagram.
    Design-only → orange striped border label "⚠ Design-Only"
    Unknown      → red label "❓ Unknown"
    """
    for idx, (bl, bt, bw, bh) in pos.items():
        if idx in design_only_idxs:
            badge = "⚠ Design-Only"
            col   = C_ORANGE
        elif idx in unknown_idxs:
            badge = "? Unknown"
            col   = C_RED
        else:
            continue
        bw_badge = min(bw * 0.85, 1.1)
        bh_badge = lx.H * 0.030
        bx_badge = bl + (bw - bw_badge) / 2
        by_badge = bt - bh_badge - lx.H * 0.004
        add_shape(slide, 5, bx_badge, by_badge, bw_badge, bh_badge,
                  fill=col, text=badge,
                  pt=lx.fit_font(badge, bw_badge, bh_badge, 7.0),
                  bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)


def draw_step(slide, lx: LayoutEngine, label: str,
              cx: float, cy: float, w: float, h: float) -> tuple:
    """
    Draw the right shape for a step, fully auto-fit.
    Returns actual bounding box (l, t, w, h).

    Shape ID mapping (CPI notation standard):
      1  = Process Rectangle       — Adapter, Content Modifier, Mapping, Validate (process step)
      2  = Cylinder/Parallelogram  — Data Store, JMS Queue, Value Mapping
      4  = Diamond                 — Router, Filter (true branching: label ends in ? or Router:/Filter: prefix)
      5  = Rounded Rectangle (red) — Exception Subprocess, Error, Fault, DLQ
      6  = Rect (blue)             — Groovy Script, Custom Script
      7  = Rounded Rect (orange)   — Alert, Notification (distinct from error)
      9  = Oval (green)            — Start / Timer Event
      9  = Oval (navy)             — End Event
      10 = Rect (navy)             — Subprocess, Process Call, Local Integration Process
      11 = Parallelogram (teal)    — Splitter / Multicast (fan-out)
      12 = Parallelogram (teal)    — Gather / Join / Aggregate (fan-in)
      13 = Rect (grey)             — MPL Logging, Audit Log
    """
    shape_id, fill = _classify(label)

    # Map logical IDs to PPTX shape IDs
    # 1=rect, 2=parallelogram, 4=diamond, 5=rounded-rect, 9=oval
    _PPTX_MAP = {
        1: 1,   # rectangle
        2: 2,   # parallelogram (cylinder approximation)
        4: 4,   # diamond
        5: 5,   # rounded rect (error)
        6: 1,   # groovy → rect (blue, distinguished by colour)
        7: 5,   # alert → rounded rect (orange, distinguished by colour)
        9: 9,   # oval
        10: 1,  # subprocess → rect (navy)
        11: 2,  # splitter → parallelogram (teal)
        12: 2,  # gather → parallelogram (teal)
        13: 1,  # mpl log → rect (grey)
    }
    pptx_id = _PPTX_MAP.get(shape_id, 1)

    if shape_id == 4:   # diamond — inflate for visual balance
        w, h = w * 1.10, h * 1.20
    l, t = cx - w / 2, cy - h / 2
    lnc = C_WHITE if shape_id == 4 else None
    add_shape(slide, pptx_id, l, t, w, h,
              fill=fill, text=label, pt=lx.fit_font(label, w, h),
              bold=True, color=C_WHITE, align=PP_ALIGN.CENTER,
              line_color=lnc)
    return l, t, w, h


# ---------------------------------------------------------------------------
# Template shape helpers
# ---------------------------------------------------------------------------

def _find(slide, name: str):
    for s in slide.shapes:
        if s.name == name:
            return s
    return None


def _find_table(slide, name: str):
    s = _find(slide, name)
    return s.table if (s and s.shape_type == 19) else None


def _delete_dynamic(slide, keep: set):
    sp = slide.shapes._spTree
    for s in list(slide.shapes):
        if s.name not in keep:
            sp.remove(s._element)


def _set_cell(cell, text: str, lx: LayoutEngine):
    """Write cell text with font auto-fit."""
    try:
        col_w = cell._tc.getparent().getparent()[0].w / EMU
    except Exception:
        col_w = 2.0
    try:
        r0 = cell.text_frame.paragraphs[0].runs[0]
        start_pt = r0.font.size / 12700 if r0.font.size else DEFAULT_FONT
    except Exception:
        start_pt = DEFAULT_FONT
    pt = lx.fit_font(_clean(text), col_w, 0.4, start_pt)
    tf = cell.text_frame
    for p in tf.paragraphs:
        for r in p.runs:
            r.text = ""
    p0 = tf.paragraphs[0]
    run = p0.runs[0] if p0.runs else p0.add_run()
    run.text = _clean(text)
    if pt < start_pt:
        run.font.size = Pt(pt)


# ---------------------------------------------------------------------------
# Slide builders
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Speaker notes helper
# ---------------------------------------------------------------------------

def add_speaker_notes(slide, text: str):
    """
    Write text into the slide notes placeholder.
    Creates the notes slide if it does not exist yet.
    """
    if not text or not text.strip():
        return
    try:
        notes_slide = slide.notes_slide
        tf = notes_slide.notes_text_frame
        tf.clear()
        from pptx.util import Pt as _Pt
        # tf.clear() may leave zero paragraphs — ensure one exists
        if not tf.paragraphs:
            from pptx.oxml.ns import qn
            from lxml import etree
            txBody = tf._txBody
            txBody.append(etree.SubElement(txBody, qn("a:p")))
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = _clean(text)
        run.font.size = _Pt(10)
        run.font.color.rgb = RGBColor(0x12, 0x17, 0x1C)
    except Exception as e:
        import sys
        print(f"  [notes warning] {e}", file=sys.stderr)


def _notes_for_oqs(oqs: list, tag: str) -> str:
    """Return formatted open questions block filtered by tag keyword."""
    relevant = [q for q in oqs if tag.lower() in q.get("tags","").lower()
                or tag.lower() in q.get("impact","").lower()]
    if not relevant:
        relevant = oqs   # fallback: show all if none tagged
    lines = []
    for q in relevant:
        impact = q.get("impact","")
        marker = "🔴" if "BLOCK" in impact.upper() else "🟡" if "delay" in impact.lower() else "⚪"
        lines.append(f"{marker} [{q.get('id','?')}] {q.get('question','?')}")
        lines.append(f"     Owner: {q.get('owner','?')} | Impact: {impact}")
    return "\n".join(lines)


def _notes_for_assumptions(assum: list) -> str:
    lines = []
    for a in assum:
        lines.append(f"🟡 [{a.get('id','?')}] {a.get('assumption','?')}")
        lines.append(f"     Risk if wrong: {a.get('risk','?')} | Confirm: {a.get('owner','?')}")
    return "\n".join(lines)


def build_slide1(slide, data: dict, lx: LayoutEngine):
    title = _find(slide, "Title 3")
    if title:
        text = f"[CPI Build]: {data.get('summary','TBD')} - {data.get('key','')}"
        lx.fit_box(title, [text], start_pt=DEFAULT_FONT, critical=True)
    # Speaker notes — cover slide: pattern, mode, top blocker
    oqs   = data.get("open_questions", [])
    assum = data.get("assumptions", [])
    notes = []
    notes.append(f"iFlow: {data.get('iflow_name','TBD')}")
    notes.append(f"Pattern: {data.get('pattern','TBD')} | Mode: {data.get('communication_mode','TBD')}")
    blockers = [q for q in oqs if "BLOCK" in q.get("impact","").upper()]
    if blockers:
        notes.append("")
        notes.append("⚠️  BLOCKERS:")
        for b in blockers:
            notes.append(f"  [{b.get('id','?')}] {b.get('question','?')} — Owner: {b.get('owner','?')}")
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 1)


def build_slide2(slide, data: dict, lx: LayoutEngine):
    tbl = _find_table(slide, "Table 2")
    if tbl and len(tbl.rows) >= 3:
        _set_cell(tbl.rows[1].cells[1], data.get("author", "TBD"), lx)
        _set_cell(tbl.rows[1].cells[2], "Author", lx)
        _set_cell(tbl.rows[1].cells[3], data.get("date", "TBD"), lx)
        _set_cell(tbl.rows[2].cells[1], data.get("reviewer", "TBD"), lx)
        _set_cell(tbl.rows[2].cells[2], "Reviewer", lx)
        _set_cell(tbl.rows[2].cells[3], "", lx)
    tbl2 = _find_table(slide, "Table 3")
    if tbl2 and len(tbl2.rows) >= 5:
        _set_cell(tbl2.rows[1].cells[2], data.get("parent_feature", "TBD"), lx)
        _set_cell(tbl2.rows[2].cells[2], data.get("key", "TBD"), lx)
        _set_cell(tbl2.rows[3].cells[2], data.get("key", "TBD"), lx)
        _set_cell(tbl2.rows[4].cells[2], "TBD", lx)
    # Speaker notes — contacts + open questions about ownership
    oqs   = data.get("open_questions", [])
    assum = data.get("assumptions", [])
    notes = ["DOCUMENT OWNERSHIP NOTES", ""]
    contacts = data.get("contacts", [])
    for c in contacts:
        notes.append(f"  {c[0]}: {c[1]}")
    oq_block = _notes_for_oqs(oqs, "owner")
    if oq_block:
        notes += ["", "OPEN QUESTIONS — Ownership / Contacts:", oq_block]
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 2)


def build_slide3(slide, data: dict, lx: LayoutEngine):
    keep = {"TextBox 2", "TextBox 3", "TextBox 4", "Rectangle 1"}
    _delete_dynamic(slide, keep)

    nodes = data.get("hld_nodes", [])
    edges = data.get("hld_edges", [])
    if not nodes:
        return

    lo = lx.hld_layout(len(nodes))
    node_pos = {}   # id -> (x, top, w, h)

    for i, node in enumerate(nodes):
        x     = lo["xs"][i]
        nid   = node["id"]
        label = node.get("label", "").replace("\n", " ")
        sub   = node.get("sub", "")
        steps = node.get("steps", [])

        # Main box
        add_shape(slide, 1, x, lo["top"], lo["node_w"], lo["h"], fill=C_BLUE)

        # System label — vertically centred, auto-fit
        add_tb(slide, label,
               x, lo["label_y"], lo["node_w"], lo["label_h"],
               pt=lx.fit_font(label, lo["node_w"], lo["label_h"], 15.0),
               bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)

        # Sub-label
        if sub:
            inner_w = lo["node_w"] * 0.86
            add_tb(slide, sub,
                   x + lo["node_w"] * 0.07, lo["sub_y"],
                   inner_w, lo["sub_h"],
                   pt=lx.fit_font(sub, inner_w, lo["sub_h"]),
                   bold=False, color=C_WHITE, align=PP_ALIGN.LEFT)

        # Step items — stack from step_y0, clip at box bottom
        inner_w = lo["node_w"] * 0.86
        for si, step in enumerate(steps):
            sy = lo["step_y0"] + si * lo["step_gap"]
            if sy + lo["step_h"] > lo["top"] + lo["h"] - lo["step_h"]:
                break
            add_tb(slide, step,
                   x + lo["node_w"] * 0.07, sy,
                   inner_w, lo["step_h"],
                   pt=lx.fit_font(step, inner_w, lo["step_h"]),
                   bold=False, color=C_WHITE, align=PP_ALIGN.LEFT)

        node_pos[nid] = (x, lo["top"], lo["node_w"], lo["h"])

    # Arrows — group bidirectional pairs, stagger Y
    pair_cnt = {}
    for e in edges:
        k = tuple(sorted([e.get("from",""), e.get("to","")]))
        pair_cnt[k] = pair_cnt.get(k, 0) + 1

    pair_drawn = {}
    for e in edges:
        src = e.get("from"); tgt = e.get("to")
        lbl = e.get("label", "")
        if src not in node_pos or tgt not in node_pos:
            continue
        sx, sy, sw, sh = node_pos[src]
        tx, ty, tw, th = node_pos[tgt]
        k     = tuple(sorted([src, tgt]))
        drawn = pair_drawn.get(k, 0)
        pair_drawn[k] = drawn + 1
        total = pair_cnt[k]

        # Stagger bidirectional arrows
        stagger = 0.0 if total == 1 else (drawn - (total-1)/2) * lo["h"] * 0.09
        ay = lo["arrow_y"] + stagger

        going_right = tx > sx
        x1 = sx + sw if going_right else sx
        x2 = tx      if going_right else tx + tw
        add_arrow(slide, x1, ay, x2, ay)

        if lbl:
            gap_l = min(x1, x2); gap_r = max(x1, x2)
            lbl_w = lo["lbl_w"]
            mid_x = (gap_l + gap_r) / 2
            # Place label below arrow, stagger for each edge, clamp to diagram bottom
            lbl_y = ay + lo["lbl_h"] * 0.1 + drawn * lo["lbl_h"] * 1.1
            lbl_y = min(lbl_y, lo["top"] + lo["h"] - lo["lbl_h"] * 1.5)
            add_tb(slide, lbl,
                   mid_x - lbl_w/2, lbl_y, lbl_w, lo["lbl_h"],
                   pt=lx.fit_font(lbl, lbl_w, lo["lbl_h"]),
                   bold=False, color=C_LBL, align=PP_ALIGN.CENTER)

    # Speaker notes — HLD: architecture questions
    oqs   = data.get("open_questions", [])
    assum = data.get("assumptions", [])
    notes = ["HLD ARCHITECTURE NOTES", ""]
    notes.append(f"Source: {data.get('source_system','TBD')} | Protocol: {data.get('source_protocol','TBD')} | Auth: {data.get('source_auth','TBD')}")
    notes.append(f"Target: {data.get('target_system','TBD')} | Protocol: {data.get('target_protocol','TBD')} | Auth: {data.get('target_auth','TBD')}")
    if assum:
        notes += ["", "ASSUMPTIONS (must confirm before build):"]
        notes.append(_notes_for_assumptions(assum))
    oq_block = _notes_for_oqs(oqs, "arch")
    if oq_block:
        notes += ["", "OPEN QUESTIONS — Architecture:", oq_block]
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 3)


def build_slide4(slide, data: dict, lx: LayoutEngine):
    tb = _find(slide, "TextBox 2")
    if tb:
        lx.fit_box(tb, [data.get("hld_description", "TBD")], critical=True)
    # Speaker notes — HLD desc: all assumptions
    assum = data.get("assumptions", [])
    oqs   = data.get("open_questions", [])
    notes = ["INTEGRATION OVERVIEW NOTES", ""]
    notes.append(f"Pattern: {data.get('pattern','TBD')} | Mode: {data.get('communication_mode','TBD')}")
    notes.append(f"iFlow: {data.get('iflow_name','TBD')} | Package: TBD")
    if assum:
        notes += ["", "ALL ASSUMPTIONS — confirm before development:"]
        notes.append(_notes_for_assumptions(assum))
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 4)


def build_slide6(slide, data: dict, lx: LayoutEngine):
    tb = _find(slide, "TextBox 1")
    if not tb:
        return
    prereqs = data.get("prerequisites", ["TBD"])

    # Position: start just below title bottom, fill to safe_bottom
    title  = _find(slide, "Title 5")
    top    = (title.top + title.height) / EMU + lx.H * 0.01 if title else lx.H * 0.24
    left   = tb.left / EMU
    width  = tb.width / EMU
    height = lx.safe_bottom() - top - lx.H * 0.01
    tb.top    = _emu(top)
    tb.height = _emu(height)

    lines = [f"{i+1}.  {_clean(item)}" for i, item in enumerate(prereqs)]
    start_pt = lx.fit_font("\n".join(lines), width, height)
    lx.fit_box(tb, lines, start_pt=start_pt, critical=False)
    # Speaker notes — prerequisites: all open questions
    oqs   = data.get("open_questions", [])
    assum = data.get("assumptions", [])
    notes = ["PRE-REQUISITES — OPEN QUESTIONS & ACTIONS", ""]
    if oqs:
        for q in oqs:
            impact = q.get("impact","")
            marker = "🔴" if "BLOCK" in impact.upper() else "🟡"
            notes.append(f"{marker} [{q.get('id','?')}] {q.get('question','?')}")
            notes.append(f"     Owner: {q.get('owner','?')} | Impact: {impact}")
    else:
        notes.append("No open questions recorded.")
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 6)


def build_slide8(slide, data: dict, lx: LayoutEngine):
    """
    Enterprise 3-lane process flow — SOURCE / SAP CPI / TARGET.
    Exception Subprocess inside SAP CPI below main flow.

    Key invariants:
      - All main CPI shapes pinned to exact same cy=Y_CPI (not cy - actual_sh/2)
      - Connectors use STORED bounding box midpoints, never Y_CPI directly
      - Rendering order: lane bands FIRST, then shapes, then connectors
      - No shape exceeds slide bounds
      - Bottom strip stays within safe area
    """
    # ── Slide geometry ────────────────────────────────────────────────────
    ML = 0.18;  MR = 0.18
    DW = lx.W - ML - MR
    SB = lx.safe_bottom()          # ~7.22 in

    TITLE_H  = 0.68
    LEGEND_H = 0.28
    BOTTOM_H = 1.30                # process notes strip height
    DIAG_TOP = TITLE_H
    DIAG_BOT = SB - LEGEND_H - BOTTOM_H - 0.06
    DIAG_H   = DIAG_BOT - DIAG_TOP

    LANE_H    = DIAG_H / 3
    HDR_W     = 0.42               # vertical lane label
    DRAW_X    = ML + HDR_W
    DRAW_W    = DW - HDR_W

    LANE_TOPS = [DIAG_TOP + i * LANE_H for i in range(3)]
    LANE_NAMES   = ["SOURCE", "SAP CPI", "TARGET"]
    LANE_BG      = [RGBColor(0xE8, 0xF4, 0xFF),
                    RGBColor(0xF0, 0xF4, 0xFF),
                    RGBColor(0xE8, 0xFF, 0xF0)]
    LANE_HDR_COL = [RGBColor(0x0F, 0x2D, 0x4A),
                    RGBColor(0x1A, 0x73, 0xC7),
                    RGBColor(0x0A, 0x4D, 0x28)]

    # Fixed row Y centres
    Y_SRC  = LANE_TOPS[0] + LANE_H * 0.55
    Y_CPI  = LANE_TOPS[1] + LANE_H * 0.42
    Y_TGT  = LANE_TOPS[2] + LANE_H * 0.50
    Y_EXC  = LANE_TOPS[1] + LANE_H * 0.82
    Y_LOOP = Y_EXC - (Y_EXC - Y_CPI) * 0.30   # No-branch routing line
    Y_BUS  = (Y_CPI + Y_EXC) * 0.52            # error bus

    # UNIFIED shape height — ALL main shapes same height so same cy → same t
    SH_H  = max(0.55, min(LANE_H * 0.34, 0.72))
    SH_W  = max(1.10, min(LANE_H * 0.78, 1.35))
    # Diamonds use same SH_H so top aligns — inflate width only
    DIA_W = SH_H * 1.22;  DIA_H = SH_H   # SAME height as rect
    OVL_W = SH_H * 1.10;  OVL_H = SH_H   # SAME height as rect
    EXC_W = 1.80;          EXC_H = SH_H * 0.90
    CARD_W = 1.72;         CARD_H = LANE_H * 0.65

    FONT_SH  = 7.5
    FONT_HDR = 8.5
    FONT_CARD = 7.0

    # ── Helpers ───────────────────────────────────────────────────────────
    def _lane_of(s):
        l = s.lower()
        if any(k in l for k in ("source", "bdc", "erp source", "sftp source")):
            return "SOURCE"
        if any(k in l for k in ("target", "scv2", "c4c", "sales cloud", "som", "brim", "cpq")):
            return "TARGET"
        return "SAP CPI"

    def _is_exc(label):
        return any(k in label.lower() for k in ("exception", "error:", "fault:", "dlq"))

    def _classify(label):
        """Return (pptx_id, fill, w, h) — h is ALWAYS SH_H for main steps."""
        l = label.lower()
        if any(k in l for k in ("timer:", "start:")):
            return 9, RGBColor(0x0A, 0x4D, 0x28), OVL_W, OVL_H
        if any(k in l for k in ("end:", "return response", "send ack:")):
            return 9, RGBColor(0x0F, 0x2D, 0x4A), OVL_W, OVL_H
        if _is_exc(label):
            return 5, RGBColor(0xCC, 0x00, 0x00), EXC_W, EXC_H
        if label.rstrip().endswith("?") or any(k in l for k in ("router:", "filter:")):
            return 4, RGBColor(0xE8, 0x6B, 0x00), DIA_W, DIA_H
        if any(k in l for k in ("groovy:", "script:")):
            return 5, RGBColor(0x6B, 0x3F, 0xA0), SH_W, SH_H
        if any(k in l for k in ("splitter:", "gather:", "multicast:")):
            return 5, RGBColor(0x00, 0x7A, 0x87), SH_W, SH_H
        if any(k in l for k in ("write:", "read:", "store:", "data store", "jms")):
            return 2, RGBColor(0x50, 0x60, 0x6E), SH_W, SH_H
        if any(k in l for k in ("mpl log:", "audit log:")):
            return 5, RGBColor(0x80, 0x80, 0x50), SH_W, SH_H
        if any(k in l for k in ("alert:", "notify:")):
            return 5, RGBColor(0xE8, 0xA0, 0x00), SH_W, SH_H
        return 5, RGBColor(0x1A, 0x73, 0xC7), SH_W, SH_H

    # Strict horizontal / vertical connectors only
    def _h(x1, y, x2, col=None, w=1.4, d=False):
        if abs(x2 - x1) > 0.005:
            add_arrow(slide, x1, y, x2, y, color=col or C_NAVY, width_pt=w, dashed=d)

    def _v(x, y1, y2, col=None, w=1.4, d=False):
        if abs(y2 - y1) > 0.005:
            add_arrow(slide, x, y1, x, y2, color=col or C_NAVY, width_pt=w, dashed=d)

    def _dau(x1, y_top, y_mid, x2, y_bot, col=None, w=1.2, d=False):
        """down → across → up (3-segment elbow)"""
        c = col or C_NAVY
        _v(x1, y_top, y_mid, col=c, w=w, d=d)
        _h(x1, y_mid, x2, col=c, w=w, d=d)
        _v(x2, y_mid, y_bot, col=c, w=w, d=d)

    # Bounding box accessors
    def _cx(p): return p[0] + p[2] / 2
    def _cy(p): return p[1] + p[3] / 2
    def _lft(p): return p[0]
    def _rgt(p): return p[0] + p[2]
    def _top(p): return p[1]
    def _bot(p): return p[1] + p[3]

    # ── Parse ─────────────────────────────────────────────────────────────
    keep = {"Rectangle 1", "TextBox 2", "TextBox 53"}
    _delete_dynamic(slide, keep)
    tb2   = _find(slide, "TextBox 2")
    steps = data.get("flow_steps", [])
    conns = data.get("flow_connectors", [])
    hld_n = data.get("hld_nodes", [])
    oqs   = data.get("open_questions", [])

    if not steps:
        return

    if tb2:
        max_h = DIAG_TOP - tb2.top / EMU - 0.03
        if max_h > 0.10:
            tb2.height = _emu(max_h)

    step_lane = []
    for s in steps:
        ln = _lane_of(s.get("lane", "SAP CPI"))
        if _is_exc(s.get("label", "")):
            ln = "SAP CPI"
        step_lane.append(ln)

    exc_idxs = {i for i, s in enumerate(steps) if _is_exc(s.get("label", ""))}
    cpi_main = [i for i in range(len(steps))
                if step_lane[i] == "SAP CPI" and i not in exc_idxs]

    # CPI step X centres — evenly distributed
    n = len(cpi_main)
    avail = DRAW_W - 0.20
    sp = min(1.52, avail / max(n - 1, 1)) if n > 1 else 0
    span = sp * (n - 1)
    first_cx = DRAW_X + (DRAW_W - span) / 2

    step_cx = {}
    for seq, mi in enumerate(cpi_main):
        step_cx[mi] = first_cx + seq * sp

    # Exception centred in lane
    exc_list = sorted(exc_idxs)
    if exc_list:
        ne = len(exc_list)
        et = (EXC_W + 0.30) * (ne - 1)
        ef = DRAW_X + (DRAW_W - et) / 2
        for ei, mi in enumerate(exc_list):
            step_cx[mi] = ef + ei * (EXC_W + 0.30)

    # Which CPI step aligns with source / target cards
    src_kw = ("fetch:", "read:", "data store", "pull", "receive:", "https sender:")
    src_idx = next((mi for mi in cpi_main
                    if any(k in steps[mi].get("label","").lower() for k in src_kw)),
                   cpi_main[0] if cpi_main else None)

    tgt_kw = ("https sender:", "post", "create", "send to", "put:", "request reply:")
    tgt_idx = None
    for mi in reversed(cpi_main):
        if any(k in steps[mi].get("label","").lower() for k in tgt_kw):
            tgt_idx = mi
            break
    if tgt_idx is None and cpi_main:
        tgt_idx = cpi_main[-2] if len(cpi_main) > 1 else cpi_main[-1]

    # Card X aligned to their CPI step
    src_nodes = ([n for n in hld_n if n.get("id") == "src"] or
                 [n for n in hld_n if n.get("type") != "cpi"][:1])
    tgt_nodes = ([n for n in hld_n if n.get("id") == "tgt"] or
                 [n for n in hld_n if n.get("type") != "cpi"][1:2])
    src_cx = step_cx.get(src_idx, DRAW_X + DRAW_W * 0.2)
    tgt_cx = step_cx.get(tgt_idx, DRAW_X + DRAW_W * 0.8)

    # ── RENDER 1: Lane backgrounds (BEFORE shapes) ────────────────────────
    for i in range(3):
        add_shape(slide, 1, DRAW_X, LANE_TOPS[i], DRAW_W, LANE_H, fill=LANE_BG[i])

    # ── RENDER 2: Vertical lane tabs ──────────────────────────────────────
    for i, (name, col) in enumerate(zip(LANE_NAMES, LANE_HDR_COL)):
        add_shape(slide, 1, ML, LANE_TOPS[i], HDR_W, LANE_H,
                  fill=col, text=name, pt=FONT_HDR, bold=True,
                  color=C_WHITE, align=PP_ALIGN.CENTER)

    # ── RENDER 3: System cards ────────────────────────────────────────────
    _card_id_counter = [300]  # mutable counter for card shape IDs

    def _card(cx, cy, node):
        name = node.get("label", "System")
        sub  = node.get("sub", "")
        rows = node.get("steps", [])
        l = cx - CARD_W / 2
        t = cy - CARD_H / 2
        l = max(DRAW_X + 0.02, min(l, DRAW_X + DRAW_W - CARD_W - 0.02))
        # Background shape — this is the one connectors snap to
        bg = add_shape(slide, 1, l, t, CARD_W, CARD_H,
                       fill=RGBColor(0xFF, 0xFF, 0xFF),
                       line_color=RGBColor(0x1A, 0x73, 0xC7))
        # Assign stable ID for snapping
        _card_id_counter[0] += 1
        bg._element.find('.//' + qn('p:cNvPr')).set('id', str(_card_id_counter[0]))
        add_shape(slide, 1, l, t, CARD_W, 0.22,
                  fill=RGBColor(0x0F, 0x2D, 0x4A),
                  text=name, pt=7.5, bold=True, color=C_WHITE, align=PP_ALIGN.CENTER)
        bp = []
        if sub:
            bp.append("System: " + sub.split("(")[0].strip()[:28])
        for r in rows[:3]:
            bp.append(r[:32])
        body = "\n".join(bp[:4])
        add_tb(slide, body, l+0.07, t+0.26, CARD_W-0.14, CARD_H-0.30,
               pt=lx.fit_font(body, CARD_W-0.14, CARD_H-0.30, FONT_CARD),
               bold=False, color=RGBColor(0x12, 0x17, 0x1C), align=PP_ALIGN.LEFT)
        return l, t, CARD_W, CARD_H, bg  # return bg shape for snapping

    src_card = _card(src_cx, Y_SRC, src_nodes[0]) if src_nodes else None
    tgt_card = _card(tgt_cx, Y_TGT, tgt_nodes[0]) if tgt_nodes else None
    src_sp   = src_card[4] if src_card else None
    tgt_sp   = tgt_card[4] if tgt_card else None

    # ── RENDER 4: CPI shapes ──────────────────────────────────────────────
    pos    = {}   # idx -> (l, t, w, h) — bounding box for label placement
    sp_map = {}   # idx -> python-pptx shape — for snapped connectors

    for i, s in enumerate(steps):
        if step_lane[i] != "SAP CPI":
            continue
        label = s.get("label", "")
        pid, fill, sw, sh = _classify(label)
        cx = step_cx.get(i, DRAW_X + DRAW_W / 2)

        # PIN cy to exact fixed Y — ignore sh for Y so ALL main shapes share same row
        if i in exc_idxs:
            cy = Y_EXC
            pin_h = sh          # exception keeps its own height
        else:
            cy = Y_CPI          # ALL main shapes centred here
            pin_h = SH_H        # FORCE uniform height regardless of shape type

        # 3-line label
        parts   = label.split(":", 1)
        fn_part = parts[0].strip()[:22] if len(parts) > 1 else label[:20]
        pu_part = parts[1].strip()[:28] if len(parts) > 1 else ""
        txt = str(i+1) + "\n" + fn_part + ("\n" + pu_part if pu_part else "")

        # Clamp X to drawable area
        l = max(DRAW_X + 0.02, min(cx - sw/2, DRAW_X + DRAW_W - sw - 0.02))
        t = cy - pin_h / 2      # use pin_h so all main shapes have identical t
        sh = pin_h              # update sh so pos[] stores the actual rendered height

        sp = add_shape(slide, pid, l, t, sw, sh, fill=fill,
                       text=txt,
                       pt=lx.fit_font(txt, sw*0.84, sh*0.80, FONT_SH),
                       bold=False, color=C_WHITE, align=PP_ALIGN.CENTER)

        # Assign a stable unique ID so connectors can snap to this shape
        sp_id = 200 + i
        sp._element.find('.//' + qn('p:cNvPr')).set('id', str(sp_id))

        pos[i]  = (l, t, sw, sh)
        sp_map[i] = sp          # store shape object for snapped connectors

    # ── RENDER 5: Boundary connectors — snapped source→CPI and CPI→target ──
    edges     = data.get("hld_edges", [])
    edge0_lbl = edges[0].get("label", "") if edges else ""
    edge1_lbl = edges[1].get("label", "") if len(edges) > 1 else ""

    if src_sp and src_idx in sp_map:
        # Source card bottom-mid (idx 2) → first CPI step top-mid (idx 0)
        add_snapped_connector(slide, src_sp, 2, sp_map[src_idx], 0,
                              color=C_NAVY, width_pt=1.4, connector_type="elbow")
        c0 = edge0_lbl.replace("(Timer Pull)","").replace("(","").replace(")","").strip()
        if c0 and src_card:
            sl2, st2 = src_card[0], src_card[1]
            p = pos[src_idx]
            ly2 = (st2 + src_card[3] + _top(p)) / 2 - 0.12
            add_tb(slide, c0, sl2 + CARD_W + 0.04, ly2, 0.85, 0.22,
                   pt=7.0, bold=False, color=C_NAVY, align=PP_ALIGN.LEFT)

    if tgt_sp and tgt_idx in sp_map:
        # Last CPI step bottom-mid (idx 2) → target card top-mid (idx 0)
        add_snapped_connector(slide, sp_map[tgt_idx], 2, tgt_sp, 0,
                              color=C_NAVY, width_pt=1.4, connector_type="elbow")
        c1 = edge1_lbl.replace("(Basic Auth)","").replace("(","").replace(")","").strip()
        if c1 and tgt_card:
            p = pos[tgt_idx]
            lx2 = _cx(p) + 0.04
            ly2 = _bot(p) + 0.04
            add_tb(slide, c1, lx2, ly2, 0.85, 0.22,
                   pt=7.0, bold=False, color=C_NAVY, align=PP_ALIGN.LEFT)

    # Return ACK connector: last CPI step (end_idx) → SOURCE card (cross-lane, dashed teal)
    end_idx = max((i for i in sp_map if step_lane[i] == "SAP CPI"
                   and i not in exc_idxs), default=None)
    edge3_lbl = edges[3].get("label", "") if len(edges) > 3 else ""
    if end_idx is not None and src_sp and end_idx in sp_map:
        add_snapped_connector(slide, sp_map[end_idx], 0, src_sp, 2,
                              color=RGBColor(0x00, 0x7A, 0x87), width_pt=1.4,
                              connector_type="elbow")
        if edge3_lbl and src_card:
            p = pos[end_idx]
            add_tb(slide, edge3_lbl, _cx(p) - 0.60, _top(p) - 0.30, 1.20, 0.22,
                   pt=7.0, bold=False, color=RGBColor(0x00, 0x7A, 0x87),
                   align=PP_ALIGN.CENTER)

    # ── RENDER 6: Flow connectors — all snapped to shape connection points ───
    # Connection point index: 0=top 1=right 2=bottom 3=left
    for conn in conns:
        fi  = conn.get("from")
        ti  = conn.get("to")
        lbl = conn.get("label", "")
        if fi not in sp_map or ti not in sp_map:
            continue

        fi_exc = fi in exc_idxs
        ti_exc = ti in exc_idxs
        ll     = lbl.lower()
        is_err = any(k in ll for k in ("- - -", "on failure", "failure", "error"))
        is_no  = "--no--" in ll or ll.strip() == "no"

        sp_fi = sp_map[fi]
        sp_ti = sp_map[ti]

        if is_err and not fi_exc:
            # Error path: bottom of source step → top of exception (elbow)
            if exc_list and exc_list[0] in sp_map:
                add_snapped_connector(slide, sp_fi, 2, sp_map[exc_list[0]], 0,
                                      color=C_RED, width_pt=1.2, dashed=True,
                                      connector_type="elbow")

        elif is_no and not fi_exc and not ti_exc:
            # No-branch: bottom of router → top of target (elbow)
            add_snapped_connector(slide, sp_fi, 2, sp_ti, 0,
                                  color=C_NAVY, width_pt=1.2, dashed=True,
                                  connector_type="elbow")

        elif not fi_exc and not ti_exc and not is_err:
            # Main success path: right of source → left of target (straight)
            add_snapped_connector(slide, sp_fi, 1, sp_ti, 3,
                                  color=C_NAVY, width_pt=1.5,
                                  connector_type="straight")

    # ── RENDER 7: Connector labels ────────────────────────────────────────
    for conn in conns:
        fi  = conn.get("from")
        ti  = conn.get("to")
        lbl = conn.get("label", "")
        if not lbl or fi not in pos or ti not in pos:
            continue
        ll = lbl.lower()
        if any(k in ll for k in ("- - -", "failure", "error")):
            continue
        clean = (lbl.replace("--yes--", "Yes").replace("--no--", "No")
                    .replace("--HTTP--", "HTTPS").replace("--OData--", "OData")
                    .replace("--", "").replace("-", "").strip())
        if not clean:
            continue

        fp = pos[fi]; tp = pos[ti]
        is_no = "--no--" in ll or ll.strip() == "no"

        if is_no:
            # Place label to right of diamond, at the point where elbow starts down
            add_tb(slide, clean,
                   _cx(fp) + DIA_W * 0.52, _cy(fp) - 0.12, 0.40, 0.20,
                   pt=7.0, bold=False, color=C_NAVY, align=PP_ALIGN.LEFT)
        else:
            # Place label above the horizontal arrow, centred in the gap
            gap = _lft(tp) - _rgt(fp)
            if gap > 0.08:
                lw = min(gap - 0.04, 0.50)
                lh = 0.18
                lx_pos = _rgt(fp) + (gap - lw) / 2
                ly_pos = _cy(fp) - lh - 0.04
                if ly_pos > LANE_TOPS[1] + 0.10:
                    add_tb(slide, clean, lx_pos, ly_pos, lw, lh,
                           pt=7.0, bold=False, color=C_NAVY, align=PP_ALIGN.CENTER)

    # ── RENDER 8: Bottom strip — within safe bounds ───────────────────────
    LEG_Y = SB - LEGEND_H - 0.02
    BTM_Y = LEG_Y - BOTTOM_H
    BTM_H = BOTTOM_H - 0.06
    COL_W = DW / 3 - 0.04
    H_COL = RGBColor(0x0F, 0x2D, 0x4A)
    B_COL = RGBColor(0xF5, 0xF7, 0xFF)

    # Process Notes
    pn_x = ML
    add_shape(slide, 1, pn_x, BTM_Y,        COL_W, 0.20, fill=H_COL,
              text="PROCESS NOTES", pt=7.5, bold=True, color=C_WHITE, align=PP_ALIGN.LEFT)
    add_shape(slide, 1, pn_x, BTM_Y+0.20,   COL_W, BTM_H-0.20, fill=B_COL)
    nl = []
    if data.get("iflow_name"):         nl.append("iFlow: " + data["iflow_name"])
    if data.get("pattern"):            nl.append("Pattern: " + data["pattern"])
    if data.get("communication_mode"): nl.append("Mode: " + data["communication_mode"])
    if data.get("source_system"):      nl.append("Source: " + data["source_system"].split("(")[0].strip()[:38])
    if data.get("target_system"):      nl.append("Target: " + data["target_system"][:38])
    nt = "\n".join(nl[:5])
    body_h = BTM_H - 0.26
    add_tb(slide, nt, pn_x+0.06, BTM_Y+0.24, COL_W-0.12, body_h,
           pt=lx.fit_font(nt, COL_W-0.12, body_h, 7.0),
           bold=False, color=RGBColor(0x12, 0x17, 0x1C), align=PP_ALIGN.LEFT)

    # Adapter Details
    ad_x = ML + COL_W + 0.04
    add_shape(slide, 1, ad_x, BTM_Y,        COL_W, 0.20, fill=H_COL,
              text="ADAPTER DETAILS", pt=7.5, bold=True, color=C_WHITE, align=PP_ALIGN.LEFT)
    add_shape(slide, 1, ad_x, BTM_Y+0.20,   COL_W, BTM_H-0.20, fill=B_COL)
    adp_rows = ["Step  Adapter          Protocol  Op"]
    for mi in cpi_main:
        lb = steps[mi].get("label", "").lower()
        if any(k in lb for k in ("fetch:", "read:", "data store",
                                  "https sender", "post", "create",
                                  "request reply", "patch", "get subscription",
                                  "odata get")):
            is_post = any(k in lb for k in ("post", "sender", "create", "patch"))
            is_get  = any(k in lb for k in ("get subscription", "odata get", "read:"))
            proto   = "OData"  if ("odata" in lb or is_get) else "HTTPS"
            op      = "GET"    if is_get  else ("POST" if "post" in lb else
                      "PATCH"  if "patch" in lb else "POST")
            adpt    = "OData Recv"   if "odata"  in lb else \
                      "HTTPS Sender" if "sender"  in lb else "HTTP Recv"
            adp_rows.append(str(mi+1) + "  " + adpt.ljust(14) + "  " + proto.ljust(6) + "  " + op)
    adp_txt = "\n".join(adp_rows[:5])
    add_tb(slide, adp_txt, ad_x+0.06, BTM_Y+0.24, COL_W-0.12, body_h,
           pt=lx.fit_font(adp_txt, COL_W-0.12, body_h, 6.5),
           bold=False, color=RGBColor(0x12, 0x17, 0x1C), align=PP_ALIGN.LEFT)

    # Abbreviations
    ab_x = ad_x + COL_W + 0.04
    add_shape(slide, 1, ab_x, BTM_Y,        COL_W, 0.20, fill=H_COL,
              text="ABBREVIATIONS", pt=7.5, bold=True, color=C_WHITE, align=PP_ALIGN.LEFT)
    add_shape(slide, 1, ab_x, BTM_Y+0.20,   COL_W, BTM_H-0.20, fill=B_COL)
    ab_lines = []
    for nd in hld_n:
        nm = nd.get("label", ""); sub = nd.get("sub", "")
        if nm and sub:
            ab_lines.append(nm.split()[0][:6] + " - " + sub.split("(")[0].strip()[:30])
    ab_lines += ["CPI  - Cloud Platform Integration",
                 "MPL  - Message Processing Log",
                 "OData- Open Data Protocol"]
    ab_txt = "\n".join(ab_lines[:6])
    add_tb(slide, ab_txt, ab_x+0.06, BTM_Y+0.24, COL_W-0.12, body_h,
           pt=lx.fit_font(ab_txt, COL_W-0.12, body_h, 7.0),
           bold=False, color=RGBColor(0x12, 0x17, 0x1C), align=PP_ALIGN.LEFT)

    # ── RENDER 9: Legend ──────────────────────────────────────────────────
    add_shape(slide, 1, ML, LEG_Y, DW, LEGEND_H, fill=RGBColor(0x1A, 0x73, 0xC7))
    leg_items = [
        (RGBColor(0x0A, 0x4D, 0x28), "Start/End"),
        (RGBColor(0x1A, 0x73, 0xC7), "Process/Adapter"),
        (RGBColor(0xE8, 0x6B, 0x00), "Router/Decision"),
        (RGBColor(0x1A, 0x73, 0xC7), "Message Mapping"),
        (RGBColor(0x50, 0x60, 0x6E), "Data Store/JMS"),
        (RGBColor(0x00, 0x7A, 0x87), "Splitter/Gather"),
        (RGBColor(0xCC, 0x00, 0x00), "Exception"),
        (RGBColor(0x80, 0x80, 0x50), "Monitoring"),
    ]
    leg_line_items = [
        (C_NAVY, False, "Success Flow"),
        (C_NAVY, True,  "Branch Flow"),
        (C_RED,  True,  "Failure Flow"),
    ]
    sq = 0.13
    total = len(leg_items) + len(leg_line_items)
    iw = DW / total
    for i, (col, txt) in enumerate(leg_items):
        lp = ML + i * iw + iw * 0.04
        add_shape(slide, 1, lp, LEG_Y + (LEGEND_H-sq)/2, sq, sq, fill=col)
        add_tb(slide, txt, lp+sq+0.03, LEG_Y, iw*0.82, LEGEND_H,
               pt=6.5, bold=False, color=C_WHITE, align=PP_ALIGN.LEFT)
    for j, (col, dashed, txt) in enumerate(leg_line_items):
        lp = ML + (len(leg_items)+j) * iw + iw * 0.04
        ly = LEG_Y + LEGEND_H / 2
        c2 = slide.shapes.add_connector(1, _emu(lp), _emu(ly), _emu(lp+0.26), _emu(ly))
        c2.line.color.rgb = col; c2.line.width = Pt(1.5)
        if dashed:
            pd = etree.SubElement(c2.line._ln, qn("a:prstDash")); pd.set("val", "dash")
        hd = etree.SubElement(c2.line._ln, qn("a:headEnd"))
        hd.set("type", "arrow"); hd.set("w", "med"); hd.set("len", "med")
        add_tb(slide, txt, lp+0.30, LEG_Y, iw*0.75, LEGEND_H,
               pt=6.5, bold=False, color=C_WHITE, align=PP_ALIGN.LEFT)

    # ── Speaker notes ─────────────────────────────────────────────────────
    n_txt = ["PROCESS FLOW - DEVELOPER NOTES", "",
             "3 lanes: SOURCE / SAP CPI / TARGET",
             "Exception inside SAP CPI. Connectors strictly H/V.", "", "STEPS:"]
    for i, s in enumerate(steps):
        n_txt.append("  " + str(i+1) + ". " + s.get("label", "?") + " [" + step_lane[i] + "]")
    m_oqs = [q for q in oqs if any(k in q.get("question", "").lower()
             for k in ("mapping", "adapter", "auth", "endpoint", "field"))]
    if m_oqs:
        n_txt += ["", "OPEN QUESTIONS:"]
        for q in m_oqs:
            n_txt.append("  [" + q.get("id", "?") + "] " + q.get("question", "?"))
    add_speaker_notes(slide, "\n".join(n_txt))
    # Slide 8 uses deterministic fixed-Y layout — heal_slide would push shapes off their
    # intentional Y baselines. Skip it for this slide only.
    # heal_slide(slide, 8)









def build_slide10(slide, data: dict, lx: LayoutEngine):
    # TextBox1: source description — 1-liner
    tb1 = _find(slide, "TextBox 1")
    if tb1:
        lx.fit_box(tb1, [
            f"{data.get('source_system','TBD')} : CPI calls "
            f"{data.get('source_method','TBD')} via {data.get('source_protocol','TBD')}."
        ], critical=True)

    # TextBox3: CPI iFlow + tenant + mode
    tb3 = _find(slide, "TextBox 3")
    if tb3:
        lx.fit_box(tb3, [
            f"CPI iFlow : {data.get('iflow_name','TBD')}",
            f"CPI Tenant URL : {data.get('cpi_tenant_url','TBD')}",
            f"Communication Mode : {data.get('communication_mode','TBD')}",
        ], critical=True)

    # TextBox2: endpoint + auth — expand to fit all fields
    tb2 = _find(slide, "TextBox 2")
    if tb2:
        lines = [
            f"Source Endpoint : {data.get('source_endpoint','TBD')}",
            f"Source Auth     : {data.get('source_auth','TBD')}",
            f"Target System   : {data.get('target_system','TBD')}",
            f"Target Auth     : {data.get('target_auth','TBD')}",
            f"Performance     : {data.get('performance_constraint','TBD')}",
        ]
        lx.fit_box(tb2, lines, critical=False)

    # Speaker notes — system info: auth/endpoint questions
    oqs   = data.get("open_questions", [])
    notes = ["SYSTEM INFORMATION — OPEN QUESTIONS", ""]
    notes.append(f"Source:  {data.get('source_system','TBD')} | {data.get('source_protocol','TBD')} | Auth: {data.get('source_auth','TBD')}")
    notes.append(f"Endpoint: {data.get('source_endpoint','TBD')}")
    notes.append("")
    notes.append(f"Target:  {data.get('target_system','TBD')} | {data.get('target_protocol','TBD')} | Auth: {data.get('target_auth','TBD')}")
    sys_oqs = [q for q in oqs if any(k in q.get("question","").lower()
               for k in ("auth","endpoint","credential","api","url","certificate","network","firewall","whitelist"))]
    if sys_oqs:
        notes += ["", "OPEN QUESTIONS — System / Security:"]
        for q in sys_oqs:
            marker = "🔴" if "BLOCK" in q.get("impact","").upper() else "🟡"
            notes.append(f"  {marker} [{q.get('id','?')}] {q.get('question','?')} — Owner: {q.get('owner','?')}")
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 10)


def build_slide11(slide, data: dict, lx: LayoutEngine):
    """
    Payload slide — format source and target payloads as readable JSON-style blocks.
    Never truncates. Expands box to fit. Uses monospace-like layout.
    """
    def format_payload(raw: str) -> list:
        """Split a payload string into individual lines for readability."""
        if not raw or raw == "TBD":
            return ["TBD"]
        # Already has newlines — use them
        if "\n" in raw:
            return [l.rstrip() for l in raw.splitlines()]
        # JSON-like: split on commas keeping structure readable
        import re
        lines = []
        # Try to detect JSON
        raw = raw.strip()
        if raw.startswith("{") or raw.startswith("["):
            # Insert newlines after { [ , }  ]
            formatted = re.sub(r',\s*', ',\n  ', raw)
            formatted = re.sub(r'([{[])\s*', r'\1\n  ', formatted)
            formatted = re.sub(r'\s*([}\]])', r'\n\1', formatted)
            return [l for l in formatted.splitlines() if l.strip()]
        # Plain text — just return as-is, split at commas
        parts = re.split(r',\s*', raw)
        for part in parts:
            lines.append(part.strip())
        return lines

    tb1 = _find(slide, "TextBox 1")
    tb2 = _find(slide, "TextBox 2")

    if tb1:
        src_lines = ["Source Request Payload", ""] + format_payload(data.get("source_payload", "TBD"))
        box_w = tb1.width / EMU
        box_h = tb1.height / EMU
        # Start at largest font that fits, never truncate
        start_pt = lx.fit_font("\n".join(src_lines), box_w, box_h, 11.0)
        lx.fit_box(tb1, src_lines, start_pt=start_pt, critical=True)

    if tb2:
        tgt_lines = ["Target / Response Payload", ""] + format_payload(data.get("target_payload", "TBD"))
        box_w = tb2.width / EMU
        box_h = tb2.height / EMU
        start_pt = lx.fit_font("\n".join(tgt_lines), box_w, box_h, 11.0)
        lx.fit_box(tb2, tgt_lines, start_pt=start_pt, critical=True)

    # Speaker notes — error handling: retry/DLQ questions
    oqs   = data.get("open_questions", [])
    notes = ["ERROR HANDLING — OPEN QUESTIONS", ""]
    eh    = data.get("error_handling", [])
    for row in eh:
        notes.append(f"  [{row[0]}] {row[1]} → {row[2]}")
    err_oqs = [q for q in oqs if any(k in q.get("question","").lower()
               for k in ("retry","dlq","queue","error","alert","monitor","notification","jms","dead letter"))]
    if err_oqs:
        notes += ["", "OPEN QUESTIONS — Error Handling / Monitoring:"]
        for q in err_oqs:
            marker = "🔴" if "BLOCK" in q.get("impact","").upper() else "🟡"
            notes.append(f"  {marker} [{q.get('id','?')}] {q.get('question','?')} — Owner: {q.get('owner','?')}")
    add_speaker_notes(slide, "\n".join(notes))
    heal_slide(slide, 11)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _build_slide8_with_image(slide, data: dict, lx: LayoutEngine, png_path: str = None):
    """
    Slide 8: embed the diagram PNG full-width below the title.
    Falls back to build_slide8 (snapped-connector renderer) if PNG not available.
    """
    if not png_path or not Path(png_path).exists():
        build_slide8(slide, data, lx)
        return

    keep = {"Rectangle 1", "TextBox 2", "TextBox 53"}
    _delete_dynamic(slide, keep)

    tb2 = _find(slide, "TextBox 2")

    # Update slide title
    if tb2:
        tf = tb2.text_frame
        tf.clear()
        p = tf.paragraphs[0]
        run = p.add_run()
        run.text = "Process Flow / Logic"
        run.font.size  = Pt(18)
        run.font.bold  = True
        run.font.color.rgb = RGBColor(0x1A, 0x73, 0xC7)

    # Image placement: full width, below title
    TITLE_BOT = (tb2.top + tb2.height) / EMU if tb2 else 0.65
    IMG_L = 0.08
    IMG_T = TITLE_BOT + 0.04
    IMG_W = lx.W - 0.16
    IMG_H = lx.H - IMG_T - 0.12

    slide.shapes.add_picture(
        png_path,
        int(IMG_L * EMU), int(IMG_T * EMU),
        int(IMG_W * EMU), int(IMG_H * EMU)
    )

    # Speaker notes
    oqs = data.get("open_questions", [])
    notes = ["PROCESS FLOW - DEVELOPER NOTES", "",
             "Diagram rendered by gen_diagram_png.py from JSON data.",
             "Edit the .drawio file to modify, export PNG, re-run gen_design_pptx.py to update.", ""]
    notes.append("STEPS:")
    for i, s in enumerate(data.get("flow_steps", [])):
        notes.append(f"  {i+1}. {s.get('label','?')}")
    m_oqs = [q for q in oqs if any(k in q.get("question","").lower()
             for k in ("mapping","adapter","auth","endpoint","field"))]
    if m_oqs:
        notes += ["", "OPEN QUESTIONS:"]
        for q in m_oqs:
            notes.append(f"  [{q.get('id','?')}] {q.get('question','?')}")
    add_speaker_notes(slide, "\n".join(notes))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data",    required=True)
    parser.add_argument("--out",     default=None)
    parser.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()

    data_path = Path(args.data)
    if not data_path.exists():
        print(f"ERROR: {data_path} not found"); sys.exit(1)
    with open(data_path, encoding="utf-8") as f:
        data = json.load(f)
    if not TEMPLATE_PATH.exists():
        print(f"ERROR: template not found at {TEMPLATE_PATH}"); sys.exit(1)

    out_dir = Path(args.out) if args.out else Path(
        data.get("out_folder", str(Path.home() / "Downloads" / "design_docs")))
    out_dir.mkdir(parents=True, exist_ok=True)
    ts  = datetime.now().strftime("%Y%m%d_%H%M")
    key = data.get("key", "UNKNOWN").replace("/", "_")

    # ── Step 1: Generate diagram PNG + drawio via gen_diagram_png ────────────
    diag_png    = out_dir / f"{ts}_{key}_Diagram.png"
    diag_drawio = out_dir / f"{ts}_{key}_ProcessFlow.drawio"
    print(f"Generating diagram PNG...")
    try:
        import importlib.util, types
        diag_spec = importlib.util.spec_from_file_location(
            "gen_diagram_png",
            Path(__file__).parent / "gen_diagram_png.py"
        )
        diag_mod = importlib.util.module_from_spec(diag_spec)
        diag_spec.loader.exec_module(diag_mod)
        r = diag_mod.Renderer(data)
        img = r.render()
        img.save(str(diag_png), dpi=(300, 300))
        diag_mod._save_drawio(data, str(diag_drawio))
        print(f"  PNG:    {diag_png}")
        print(f"  DRAWIO: {diag_drawio}")
        png_ok = True
    except Exception as e:
        import traceback
        print(f"  WARNING: diagram PNG generation failed: {e}")
        traceback.print_exc()
        png_ok = False

    # ── Step 2: Build PPTX ────────────────────────────────────────────────────
    print(f"Loading template: {TEMPLATE_PATH}")
    prs  = Presentation(str(TEMPLATE_PATH))
    sw   = prs.slide_width  / EMU
    sh   = prs.slide_height / EMU
    lx   = LayoutEngine(sw, sh)
    print(f"Slide: {sw:.3f}in x {sh:.3f}in  (all layout computed dynamically)")

    builders = {
        0: build_slide1,
        1: build_slide2,
        2: build_slide3,
        3: build_slide4,
        5: build_slide6,
        9: build_slide10,
        10: build_slide11,
    }

    for idx, slide in enumerate(prs.slides):
        if idx == 7:
            # Slide 8: embed the diagram PNG if available, else fall back to python renderer
            print(f"  Slide 8 ...", end=" ", flush=True)
            try:
                _build_slide8_with_image(slide, data, lx, str(diag_png) if png_ok else None)
                print("OK")
            except Exception as e:
                import traceback
                print(f"ERROR: {e}")
                traceback.print_exc()
        elif idx in builders:
            print(f"  Slide {idx+1} ...", end=" ", flush=True)
            try:
                builders[idx](slide, data, lx)
                print("OK")
            except Exception as e:
                import traceback
                print(f"ERROR: {e}")
                traceback.print_exc()

    out_path = out_dir / f"{ts}_{key}_DesignDoc.pptx"
    prs.save(str(out_path))
    print(f"\nSAVED: {out_path}")
    if png_ok:
        print(f"PNG:   {diag_png}")
        print(f"DRAWIO:{diag_drawio}")

    if args.cleanup and data_path.exists():
        data_path.unlink()
        print(f"Cleaned up: {data_path}")


if __name__ == "__main__":
    main()
