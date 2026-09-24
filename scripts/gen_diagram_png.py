"""
gen_diagram_png.py  — Render a process flow diagram PNG from design JSON.
Driven entirely by JSON data — nothing hardcoded except visual constants.

Usage:
    python scripts/gen_diagram_png.py --data <json_path> [--out <png_path>]

Outputs:
    <out>.png  — high-res raster (2x, 3308x1120px ~ 150dpi on 22"x7.5" canvas)
"""
import argparse, json, math, os, sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("ERROR: pip install Pillow")
    sys.exit(1)

# ── Palette ─────────────────────────────────────────────────────────────────
C_NAVY   = (0x0F, 0x2D, 0x4A)
C_BLUE   = (0x1A, 0x73, 0xC7)
C_GREEN  = (0x0A, 0x4D, 0x28)
C_ORANGE = (0xE8, 0x6B, 0x00)
C_PURPLE = (0x6B, 0x3F, 0xA0)
C_TEAL   = (0x00, 0x7A, 0x87)
C_GREY   = (0x50, 0x60, 0x6E)
C_RED    = (0xCC, 0x00, 0x00)
C_OLIVE  = (0x80, 0x80, 0x50)
C_WHITE  = (0xFF, 0xFF, 0xFF)
C_DARK   = (0x12, 0x17, 0x1C)
C_LGREY  = (0xF0, 0xF4, 0xFF)
C_BG_SRC = (0xE8, 0xF4, 0xFF)
C_BG_CPI = (0xF0, 0xF4, 0xFF)
C_BG_TGT = (0xE8, 0xFF, 0xF0)
C_BG_BOT = (0xF5, 0xF7, 0xFF)
C_DIVIDER= (0xC0, 0xC8, 0xD5)


def _classify(label: str):
    """Return (shape_type, fill_colour) from label prefix."""
    l = label.lower()
    if any(k in l for k in ("timer:", "start:")):
        return "oval", C_GREEN
    if any(k in l for k in ("end:", "return response")):
        return "oval", C_NAVY
    if any(k in l for k in ("exception", "error:", "fault:", "dlq")):
        return "rrect", C_RED
    if label.rstrip().endswith("?") or any(k in l for k in ("router:", "filter:")):
        return "diamond", C_ORANGE
    if any(k in l for k in ("groovy:", "script:")):
        return "rrect", C_PURPLE
    if any(k in l for k in ("splitter:", "gather:", "multicast:")):
        return "rrect", C_TEAL
    if any(k in l for k in ("write:", "read:", "store:", "data store", "jms")):
        return "para", C_GREY
    if any(k in l for k in ("mpl log:", "audit log:")):
        return "rrect", C_OLIVE
    if any(k in l for k in ("alert:", "notify:")):
        return "rrect", (0xE8, 0xA0, 0x00)
    return "rrect", C_BLUE


def _lane_of(s: str) -> str:
    l = s.lower()
    if any(k in l for k in ("source","bdc","erp source","sftp source")):
        return "SOURCE"
    if any(k in l for k in ("target","scv2","c4c","sales cloud","som","brim","cpq")):
        return "TARGET"
    return "CPI"


def _is_exc(label: str) -> bool:
    return any(k in label.lower() for k in ("exception","error:","fault:","dlq"))


def _short_label(label: str, seq: int) -> str:
    """3-line label: seq / palette function / short purpose (word-wrapped)."""
    # Handle newline-delimited labels (CMP-001\nHTTPS Sender\nPurpose)
    if "\n" in label:
        parts_nl = [p.strip() for p in label.split("\n") if p.strip()]
        # Skip leading component-ID token (e.g. "CMP-001")
        fn = parts_nl[1] if len(parts_nl) > 1 else parts_nl[0]
        pu = parts_nl[2] if len(parts_nl) > 2 else ""
    else:
        parts = label.split(":", 1)
        fn = parts[0].strip() if len(parts) > 1 else label[:18]
        pu = parts[1].strip() if len(parts) > 1 else ""
    # Wrap fn at 18 chars on word boundary
    if len(fn) > 18:
        words = fn.split()
        line1 = ""; line2 = ""
        for w in words:
            if len(line1) + len(w) + 1 <= 18:
                line1 = (line1 + " " + w).strip()
            else:
                line2 = (line2 + " " + w).strip()
        fn = (line1 + "\n" + line2).strip() if line2 else line1
    # Wrap pu at 22 chars
    if len(pu) > 22:
        words = pu.split()
        l1 = ""; l2 = ""
        for w in words:
            if len(l1) + len(w) + 1 <= 22:
                l1 = (l1 + " " + w).strip()
            else:
                l2 = (l2 + " " + w).strip()
        pu = (l1 + "\n" + l2).strip() if l2 else l1
    lines = [str(seq + 1), fn]
    if pu:
        lines.append(pu)
    return "\n".join(lines)


class Renderer:
    # ── Canvas constants ────────────────────────────────────────────────────
    SCALE    = 2           # pixel scale factor (2 = retina quality)
    CW       = 1654        # logical width
    CH       = 940         # logical height — increased for breathing room
    MARGIN   = 18
    TAB_W    = 52          # vertical lane label tab

    TITLE_H  = 38
    LEGEND_H = 34
    BOTTOM_H = 96
    LANE_N   = 3           # SOURCE / CPI / TARGET

    # Shape sizes (logical pixels)
    SH_H     = 58          # uniform shape height (all main steps)
    SH_W     = 115
    DIA_EXT  = 32          # diamond extends beyond SH_H/2 on top/bottom
    OVL_RX   = 46
    OVL_RY   = 28
    EXC_W    = 190
    EXC_H    = 56
    CARD_W   = 172
    CARD_H   = 100

    def __init__(self, data: dict):
        self.data   = data
        self.steps  = data.get("flow_steps", [])
        self.conns  = data.get("flow_connectors", [])
        self.hld_n  = data.get("hld_nodes", [])
        self.oqs    = data.get("open_questions", [])

        S = self.SCALE
        self.W  = self.CW  * S
        self.H  = self.CH  * S
        self.img = Image.new("RGB", (self.W, self.H), C_WHITE)
        self.d   = ImageDraw.Draw(self.img)
        self._fonts = {}

    def _s(self, v):
        """Scale logical value to pixel value."""
        return int(v * self.SCALE)

    def _f(self, size: int):
        if size not in self._fonts:
            for name in ["arialbd.ttf","Arial Bold.ttf","arial.ttf","Arial.ttf",
                         "DejaVuSans-Bold.ttf","DejaVuSans.ttf","FreeSans.ttf"]:
                try:
                    self._fonts[size] = ImageFont.truetype(name, self._s(size))
                    break
                except:
                    pass
            else:
                self._fonts[size] = ImageFont.load_default()
        return self._fonts[size]

    def _tw(self, text: str, font) -> int:
        try:
            return int(self.d.textlength(text, font=font))
        except:
            return len(text) * self._s(6)

    # ── Drawing primitives ───────────────────────────────────────────────────
    def rect(self, x, y, w, h, fill, outline=None, r=0):
        S = self.SCALE
        if r > 0:
            self.d.rounded_rectangle(
                [self._s(x), self._s(y), self._s(x+w), self._s(y+h)],
                radius=self._s(r), fill=fill,
                outline=outline or fill, width=max(1, self._s(1)))
        else:
            self.d.rectangle(
                [self._s(x), self._s(y), self._s(x+w), self._s(y+h)],
                fill=fill, outline=outline or fill)

    def oval(self, cx, cy, rx, ry, fill, outline=None):
        self.d.ellipse(
            [self._s(cx-rx), self._s(cy-ry),
             self._s(cx+rx), self._s(cy+ry)],
            fill=fill, outline=outline or fill)

    def diamond(self, cx, cy, rx, ry, fill):
        pts = [(self._s(cx),    self._s(cy-ry)),
               (self._s(cx+rx), self._s(cy)),
               (self._s(cx),    self._s(cy+ry)),
               (self._s(cx-rx), self._s(cy))]
        self.d.polygon(pts, fill=fill)

    def para(self, x, y, w, h, fill, skew=10):
        pts = [(self._s(x+skew), self._s(y)),
               (self._s(x+w),    self._s(y)),
               (self._s(x+w-skew), self._s(y+h)),
               (self._s(x),      self._s(y+h))]
        self.d.polygon(pts, fill=fill)

    def text_c(self, txt, cx, cy, fill=C_WHITE, size=8):
        font = self._f(size)
        lines = txt.split("\n")
        lh = int(font.size * 1.3)
        total_h = len(lines) * lh
        ty = self._s(cy) - total_h // 2
        for line in lines:
            tw = self._tw(line, font)
            self.d.text((self._s(cx) - tw//2, ty), line, fill=fill, font=font)
            ty += lh

    def text_l(self, txt, x, y, w, h, fill=C_DARK, size=8):
        font = self._f(size)
        lines = txt.split("\n")
        lh = int(font.size * 1.35)
        ty = self._s(y) + self._s(3)
        for line in lines:
            if ty + lh > self._s(y + h):
                break
            self.d.text((self._s(x) + self._s(5), ty), line, fill=fill, font=font)
            ty += lh

    def _arrowhead(self, x2, y2, dx, dy, col, size=8):
        dist = math.sqrt(dx*dx + dy*dy)
        if dist < 1: return
        ux = dx/dist; uy = dy/dist
        s = self._s(size)
        ax1 = int(x2 - s*ux + s*0.4*uy)
        ay1 = int(y2 - s*uy - s*0.4*ux)
        ax2 = int(x2 - s*ux - s*0.4*uy)
        ay2 = int(y2 - s*uy + s*0.4*ux)
        self.d.polygon([(int(x2),int(y2)),(ax1,ay1),(ax2,ay2)], fill=col)

    def line(self, x1, y1, x2, y2, col, w=1.5, dashed=False):
        px1, py1 = self._s(x1), self._s(y1)
        px2, py2 = self._s(x2), self._s(y2)
        pw = max(1, self._s(w))
        if dashed:
            dx = px2-px1; dy = py2-py1
            dist = math.sqrt(dx*dx+dy*dy)
            n = max(int(dist/self._s(7)), 1)
            for i in range(n):
                if i % 2 == 0:
                    xa = int(px1+dx*i/n); ya = int(py1+dy*i/n)
                    xb = int(px1+dx*(i+1)/n); yb = int(py1+dy*(i+1)/n)
                    self.d.line([(xa,ya),(xb,yb)], fill=col, width=pw)
        else:
            self.d.line([(px1,py1),(px2,py2)], fill=col, width=pw)

    def arrow(self, x1, y1, x2, y2, col=None, w=1.5, dashed=False):
        c = col or C_NAVY
        self.line(x1, y1, x2, y2, c, w, dashed)
        self._arrowhead(self._s(x2), self._s(y2),
                        x2-x1, y2-y1, c, size=7)

    def h_arrow(self, x1, y, x2, col=None, w=1.5, dashed=False):
        self.arrow(x1, y, x2, y, col, w, dashed)

    def v_arrow(self, x, y1, y2, col=None, w=1.5, dashed=False):
        self.arrow(x, y1, x, y2, col, w, dashed)

    def elbow_right_down(self, x1, y1, x2, y2, col=None, w=1.5, dashed=False):
        """Horizontal then vertical (L-connector going right then down/up)."""
        c = col or C_NAVY
        self.line(x1, y1, x2, y1, c, w, dashed)
        self.arrow(x2, y1, x2, y2, c, w, dashed)

    def elbow_down_right(self, x1, y1, x2, y2, col=None, w=1.5, dashed=False):
        """Vertical then horizontal then vertical (Z-connector)."""
        c = col or C_NAVY
        self.line(x1, y1, x1, y2, c, w, dashed)
        self.arrow(x1, y2, x2, y2, c, w, dashed)

    def z_connector(self, x1, y1, xm, y2, col=None, w=1.5, dashed=False):
        """Down → across → (no final arrow on segment 1&2, arrow on end)."""
        c = col or C_NAVY
        self.line(x1, y1, x1, y2, c, w, dashed)
        self.line(x1, y2, xm, y2, c, w, dashed)
        self._arrowhead(self._s(xm), self._s(y2), xm-x1, 0, c, size=7)

    # ── Shape drawing with pos tracking ─────────────────────────────────────
    def draw_step(self, i, cx, cy, label, is_exc=False):
        shp, fill = _classify(label)
        SH = self.EXC_H if is_exc else self.SH_H
        SW = self.EXC_W if is_exc else self.SH_W
        short = _short_label(label, i)

        if shp == "oval":
            rx, ry = self.OVL_RX, self.OVL_RY
            self.oval(cx, cy, rx, ry, fill)
            hw, hh = rx, ry
        elif shp == "diamond":
            rx = int(SW * 0.52); ry = int(SH/2 + self.DIA_EXT*0.5)
            self.diamond(cx, cy, rx, ry, fill)
            hw, hh = rx, ry
        elif shp == "para":
            l = cx - SW//2; t = cy - SH//2
            self.para(l, t, SW, SH, fill)
            hw, hh = SW//2, SH//2
        else:
            l = cx - SW//2; t = cy - SH//2
            r = 10 if is_exc else 7
            self.rect(l, t, SW, SH, fill, r=r)
            hw, hh = SW//2, SH//2

        self.text_c(short, cx, cy, C_WHITE, size=7 if is_exc else 7)
        return (cx, cy, hw, hh)   # (cx, cy, half_w, half_h)

    def draw_sys_card(self, cx, cy, name, meta_lines, hdr_col):
        l = cx - self.CARD_W//2
        t = cy - self.CARD_H//2
        self.rect(l, t, self.CARD_W, self.CARD_H, C_WHITE,
                  outline=C_BLUE, r=4)
        self.rect(l, t, self.CARD_W, 22, hdr_col, r=4)
        self.rect(l, t+18, self.CARD_W, 4, hdr_col)
        cx_lbl = l + self.CARD_W//2
        self.text_c(name, cx_lbl, t+11, C_WHITE, size=8)
        self.text_l("\n".join(meta_lines[:4]),
                    l, t+24, self.CARD_W, self.CARD_H-26,
                    C_DARK, size=7)
        return l, t, self.CARD_W, self.CARD_H

    # ── Main render ──────────────────────────────────────────────────────────
    def render(self) -> Image.Image:
        steps  = self.steps
        conns  = self.conns
        data   = self.data

        DRAW_X = self.MARGIN + self.TAB_W
        DRAW_W = self.CW - 2*self.MARGIN - self.TAB_W

        DIAG_TOP = self.TITLE_H
        DIAG_H   = self.CH - self.TITLE_H - self.LEGEND_H - self.BOTTOM_H

        # Unequal lane heights: SAP CPI gets 55% of diagram height (needs room for
        # main flow + exception box + two routing lanes between them)
        LN_SRC_H = int(DIAG_H * 0.22)
        LN_CPI_H = int(DIAG_H * 0.55)
        LN_TGT_H = DIAG_H - LN_SRC_H - LN_CPI_H

        LN_SRC_Y = DIAG_TOP
        LN_CPI_Y = DIAG_TOP + LN_SRC_H
        LN_TGT_Y = DIAG_TOP + LN_SRC_H + LN_CPI_H
        LN_END_Y = DIAG_TOP + DIAG_H
        LEG_Y    = LN_END_Y
        BTM_Y    = LEG_Y + self.LEGEND_H

        # Row Y centres — main flow at 38% down CPI lane, exception at 78%
        CPI_CY  = LN_CPI_Y + int(LN_CPI_H * 0.38)
        EXC_CY  = LN_CPI_Y + int(LN_CPI_H * 0.78)
        SRC_CY  = LN_SRC_Y + LN_SRC_H // 2
        TGT_CY  = LN_TGT_Y + LN_TGT_H // 2

        # Error bus Y — placeholder, recalculated in STEP 9 after SHAPE_BOT_Y known
        BUS_Y   = CPI_CY + int((EXC_CY - CPI_CY) * 0.55)

        # ── STEP 1: Lane backgrounds ─────────────────────────────────────
        self.rect(self.MARGIN, LN_SRC_Y, self.CW-2*self.MARGIN, LN_SRC_H, C_BG_SRC)
        self.rect(self.MARGIN, LN_CPI_Y, self.CW-2*self.MARGIN, LN_CPI_H, C_BG_CPI)
        self.rect(self.MARGIN, LN_TGT_Y, self.CW-2*self.MARGIN, LN_TGT_H, C_BG_TGT)
        # Lane dividers
        for y in (LN_SRC_Y, LN_CPI_Y, LN_TGT_Y, LN_END_Y):
            self.line(self.MARGIN, y, self.CW-self.MARGIN, y, C_DIVIDER, 1)

        # ── STEP 2: Title ─────────────────────────────────────────────────
        self.rect(0, 0, self.CW, self.TITLE_H, C_NAVY)
        iflow = data.get("iflow_name","")
        key   = data.get("key","")
        pat   = data.get("pattern","")
        mode  = data.get("communication_mode","")
        title = f"Process Flow / Logic  —  {iflow}   |   {key}   |   {pat} · {mode}"
        self.text_c(title, self.CW//2, self.TITLE_H//2, C_WHITE, size=9)

        # ── STEP 3: Lane tabs ─────────────────────────────────────────────
        for lbl, y, lh, col in [("SOURCE", LN_SRC_Y, LN_SRC_H, C_NAVY),
                                 ("SAP CPI",LN_CPI_Y, LN_CPI_H, C_BLUE),
                                 ("TARGET", LN_TGT_Y, LN_TGT_H, C_GREEN)]:
            self.rect(self.MARGIN, y, self.TAB_W, lh, col)
            fv  = self._f(10)
            try:
                tw = int(self._tw(lbl, fv))
            except:
                tw = len(lbl) * self._s(7)
            th  = fv.size + 4
            banner_w = tw + self._s(6)
            banner_h = th + self._s(4)
            banner = Image.new("RGBA", (banner_w, banner_h), (0,0,0,0))
            db = ImageDraw.Draw(banner)
            db.text((self._s(3), self._s(2)), lbl, fill=(255,255,255,255), font=fv)
            rotated = banner.rotate(90, expand=True)
            rx = self._s(self.MARGIN) + (self._s(self.TAB_W) - rotated.width)//2
            ry = self._s(y) + (self._s(lh) - rotated.height)//2
            self.img.paste(rotated, (rx, ry), rotated)

        # ── STEP 4: Classify steps ────────────────────────────────────────
        step_lane = []
        for s in steps:
            ln = _lane_of(s.get("lane","CPI"))
            if _is_exc(s.get("label","")):
                ln = "CPI"
            step_lane.append(ln)

        exc_idxs = {i for i,s in enumerate(steps) if _is_exc(s.get("label",""))}
        cpi_main = [i for i in range(len(steps))
                    if step_lane[i]=="CPI" and i not in exc_idxs]
        n_main   = len(cpi_main)

        # ── STEP 5: X positions ───────────────────────────────────────────
        avail    = DRAW_W - 20
        sp       = min(avail//(max(n_main-1,1)), 130) if n_main > 1 else 0
        total_sp = sp * (n_main-1)
        first_cx = DRAW_X + (DRAW_W - total_sp)//2

        step_cx = {}
        for seq, mi in enumerate(cpi_main):
            step_cx[mi] = first_cx + seq*sp

        exc_list = sorted(exc_idxs)
        if exc_list:
            ne = len(exc_list)
            et = (self.EXC_W + 30) * (ne-1)
            ef = DRAW_X + (DRAW_W - et)//2
            for ei, mi in enumerate(exc_list):
                step_cx[mi] = ef + ei*(self.EXC_W+30)

        # Source / target facing CPI step
        src_kw = ("fetch:","read:","data store","pull","receive:","https sender:")
        src_idx = next((mi for mi in cpi_main
                        if any(k in steps[mi].get("label","").lower() for k in src_kw)),
                       cpi_main[0] if cpi_main else None)
        tgt_kw = ("https sender:","post","create","send to","put:","request reply:")
        tgt_idx = None
        for mi in reversed(cpi_main):
            if any(k in steps[mi].get("label","").lower() for k in tgt_kw):
                tgt_idx = mi; break
        if tgt_idx is None and cpi_main:
            tgt_idx = cpi_main[-1]

        # ── STEP 6: System cards ──────────────────────────────────────────
        src_nodes = ([n for n in self.hld_n if n.get("id")=="src"] or
                     [n for n in self.hld_n if n.get("type")!="cpi"][:1])
        tgt_nodes = ([n for n in self.hld_n if n.get("id")=="tgt"] or
                     [n for n in self.hld_n if n.get("type")!="cpi"][1:2])

        src_cx_card = step_cx.get(src_idx, DRAW_X + 100) if src_idx is not None else DRAW_X+100
        tgt_cx_card = step_cx.get(tgt_idx, DRAW_X+DRAW_W-100) if tgt_idx is not None else DRAW_X+DRAW_W-100

        src_card_pos = tgt_card_pos = None
        if src_nodes:
            n = src_nodes[0]
            meta = []
            if n.get("sub"): meta.append("System: " + n["sub"].split("(")[0][:22])
            meta += [r[:26] for r in n.get("steps",[])[:3]]
            sl,st,scw,sch = self.draw_sys_card(src_cx_card, SRC_CY, n.get("label","Source"), meta, C_NAVY)
            src_card_pos = (sl, st, scw, sch)

        if tgt_nodes:
            n = tgt_nodes[0]
            meta = []
            if n.get("sub"): meta.append("System: " + n["sub"].split("(")[0][:22])
            meta += [r[:26] for r in n.get("steps",[])[:3]]
            tl,tt,tcw,tch = self.draw_sys_card(tgt_cx_card, TGT_CY, n.get("label","Target"), meta, C_GREEN)
            tgt_card_pos = (tl, tt, tcw, tch)

        # ── STEP 7: CPI shapes ────────────────────────────────────────────
        pos = {}   # idx -> (cx, cy, hw, hh)

        for i, s in enumerate(steps):
            if step_lane[i] != "CPI": continue
            label = s.get("label","")
            is_exc = i in exc_idxs
            cx = step_cx.get(i, DRAW_X + DRAW_W//2)
            cy = EXC_CY if is_exc else CPI_CY
            pos[i] = self.draw_step(i, cx, cy, label, is_exc)

        # ── STEP 8: Boundary connectors ───────────────────────────────────
        edges     = data.get("hld_edges",[])
        edge0_lbl = edges[0].get("label","") if edges else ""
        edge1_lbl = edges[1].get("label","") if len(edges)>1 else ""

        if src_card_pos and src_idx in pos:
            sl,st,scw,sch = src_card_pos
            card_bot  = st + sch
            card_cx_v = sl + scw//2
            pcpi = pos[src_idx]
            step_top  = pcpi[1] - pcpi[3]
            step_cx_v = pcpi[0]
            lane_bdy  = LN_CPI_Y + 6
            # Card bottom → down to CPI lane boundary → across to step → down to step top
            self.v_arrow(card_cx_v, card_bot, lane_bdy, col=C_NAVY, w=1.5)
            self.line(card_cx_v, lane_bdy, step_cx_v, lane_bdy, C_NAVY, 1.5)
            self.v_arrow(step_cx_v, lane_bdy, step_top, col=C_NAVY, w=1.5)
            lbl0 = edge0_lbl.replace("(Timer Pull)","").replace("(","").replace(")","").strip()
            if lbl0:
                font = self._f(8)
                self.d.text((self._s(card_cx_v)+self._s(3), self._s(card_bot)+self._s(3)),
                            lbl0, fill=C_NAVY, font=font)

        if tgt_card_pos and tgt_idx in pos:
            tl,tt,tcw,tch = tgt_card_pos
            card_top  = tt
            card_cx_v = tl + tcw//2
            pcpi = pos[tgt_idx]
            step_bot  = pcpi[1] + pcpi[3]
            step_cx_v = pcpi[0]
            lane_bdy  = LN_TGT_Y + 6
            self.v_arrow(step_cx_v, step_bot, lane_bdy, col=C_NAVY, w=1.5)
            self.line(step_cx_v, lane_bdy, card_cx_v, lane_bdy, C_NAVY, 1.5)
            self.v_arrow(card_cx_v, lane_bdy, card_top, col=C_NAVY, w=1.5)
            lbl1 = edge1_lbl.replace("(Basic Auth)","").replace("(","").replace(")","").strip()
            if lbl1:
                font = self._f(8)
                x_lbl = max(step_cx_v, card_cx_v) + 5
                y_lbl = step_bot + (card_top - step_bot) * 0.4
                self.d.text((self._s(x_lbl), self._s(y_lbl)), lbl1, fill=C_NAVY, font=font)

        # Return ACK: last main CPI step → SOURCE card (teal dashed — synchronous response)
        end_main = max((i for i in pos if not _is_exc(steps[i].get("label",""))), default=None)
        edge3_lbl = edges[3].get("label","") if len(edges) > 3 else ""
        if end_main is not None and src_card_pos:
            sl, st, scw, sch = src_card_pos
            card_mid_y = st + sch // 2
            pe = pos[end_main]
            step_cx_e  = pe[0]
            step_top_e = pe[1] - pe[3]
            lane_bdy_s = LN_CPI_Y + 6
            C_TEAL_ACK = (0, 122, 135)
            self.v_arrow(step_cx_e, step_top_e, lane_bdy_s, col=C_TEAL_ACK, w=1.5, dashed=True)
            self.line(step_cx_e, lane_bdy_s, sl + scw//2, lane_bdy_s, C_TEAL_ACK, 1.5, dashed=True)
            self.v_arrow(sl + scw//2, lane_bdy_s, card_mid_y, col=C_TEAL_ACK, w=1.5, dashed=True)
            if edge3_lbl:
                font = self._f(7)
                self.d.text((self._s(step_cx_e + 4), self._s(step_top_e - 14)),
                            edge3_lbl[:40], fill=C_TEAL_ACK, font=font)

        # ── STEP 9: Flow connectors ───────────────────────────────────────
        # Pre-collect error source X positions for shared bus
        err_source_xs = []
        for conn in conns:
            fi = conn.get("from"); lbl = conn.get("label","")
            if fi in pos and not fi in exc_idxs:
                ll = lbl.lower()
                if any(k in ll for k in ("- - -","on failure","failure","error")):
                    err_source_xs.append(pos[fi][0])

        # No-branch routing Y: between shape bottoms and exception box top
        SHAPE_BOT_Y = CPI_CY + self.SH_H//2 + self.DIA_EXT + 8
        EXC_TOP_Y   = EXC_CY - self.EXC_H//2
        GAP         = max(EXC_TOP_Y - SHAPE_BOT_Y, 20)
        NO_ROUTE_Y  = SHAPE_BOT_Y + GAP // 3         # upper third of gap
        BUS_Y       = SHAPE_BOT_Y + GAP * 2 // 3     # lower two-thirds — error bus

        for conn in conns:
            fi  = conn.get("from")
            ti  = conn.get("to")
            lbl = conn.get("label","")
            if fi not in pos or ti not in pos: continue

            fi_exc = fi in exc_idxs
            ti_exc = ti in exc_idxs
            ll     = lbl.lower()
            is_err = any(k in ll for k in ("- - -","on failure","failure","error"))
            is_no  = "--no--" in ll or ll.strip() == "no"
            is_yes = "--yes--" in ll or ll.strip() == "yes"

            fpos = pos[fi]; tpos = pos[ti]
            fx, fy, fhw, fhh = fpos
            tx, ty, thw, thh = tpos

            if is_err and not fi_exc:
                # Drop vertically to BUS_Y — shared bus drawn after this loop
                self.line(fx, fy+fhh, fx, BUS_Y, C_RED, 1.2, dashed=True)

            elif is_no and not fi_exc and not ti_exc:
                # Route below all shapes via NO_ROUTE_Y
                self.line(fx, fy+fhh, fx, NO_ROUTE_Y, C_NAVY, 1.2, dashed=True)
                self.line(fx, NO_ROUTE_Y, tx, NO_ROUTE_Y, C_NAVY, 1.2, dashed=True)
                self.v_arrow(tx, NO_ROUTE_Y, ty-thh, col=C_NAVY, w=1.2, dashed=True)
                font = self._f(8)
                self.d.text((self._s(fx)+self._s(3), self._s(fy+fhh)+self._s(2)),
                            "No", fill=C_NAVY, font=font)

            elif not fi_exc and not ti_exc and not is_err:
                self.h_arrow(fx+fhw, fy, tx-thw, col=C_NAVY, w=1.8)
                if is_yes:
                    font = self._f(8)
                    gap  = (tx-thw) - (fx+fhw)
                    if gap > 5:
                        self.d.text((self._s(fx+fhw)+self._s(2), self._s(fy)-self._s(12)),
                                    "Yes", fill=C_NAVY, font=font)

        # Draw shared error bus: one horizontal segment, then single drop to exception
        if err_source_xs and exc_list and exc_list[0] in pos:
            ep = pos[exc_list[0]]
            ex_cx, ex_cy, ex_hw, ex_hh = ep
            bus_left  = min(min(err_source_xs), ex_cx)
            bus_right = max(max(err_source_xs), ex_cx)
            self.line(bus_left, BUS_Y, bus_right, BUS_Y, C_RED, 1.2, dashed=True)
            self.v_arrow(ex_cx, BUS_Y, ex_cy-ex_hh, col=C_RED, w=1.2, dashed=True)

        # ── STEP 10: Connector labels (HTTP, OData etc.) ──────────────────
        for conn in conns:
            fi = conn.get("from"); ti = conn.get("to")
            lbl = conn.get("label","")
            if not lbl or fi not in pos or ti not in pos: continue
            ll = lbl.lower()
            if any(k in ll for k in ("- - -","failure","error","--no--","--yes--")): continue
            clean = (lbl.replace("--HTTP--","HTTP").replace("--OData--","OData")
                       .replace("--","").replace("-","").strip())
            if not clean: continue
            fpos = pos[fi]; tpos = pos[ti]
            fx,fy,fhw,fhh = fpos; tx,ty,thw,thh = tpos
            gap = (tx-thw)-(fx+fhw)
            if gap > self._s(6):
                font = self._f(8)
                mx = fx+fhw + gap//2
                self.d.text((self._s(mx)-self._s(14), self._s(fy)-self._s(12)),
                            clean, fill=C_NAVY, font=font)

        # ── STEP 11: Legend ───────────────────────────────────────────────
        self.rect(self.MARGIN, LEG_Y, self.CW-2*self.MARGIN, self.LEGEND_H, C_BLUE)
        leg_items = [
            ("oval",   C_GREEN,  "Start/End"),
            ("rrect",  C_BLUE,   "Process/Adapter"),
            ("diamond",C_ORANGE, "Router"),
            ("rrect",  C_BLUE,   "Message Mapping"),
            ("para",   C_GREY,   "Data Store/JMS"),
            ("rrect",  C_TEAL,   "Splitter/Gather"),
            ("rrect",  C_RED,    "Exception"),
            ("rrect",  C_OLIVE,  "MPL Logging"),
        ]
        leg_line = [
            (C_NAVY, False, "Success"),
            (C_NAVY, True,  "Branch"),
            (C_RED,  True,  "Failure"),
        ]
        total = len(leg_items) + len(leg_line)
        iw    = (self.CW - 2*self.MARGIN) // total
        lx    = self.MARGIN + 6
        sq    = 13
        lcy   = LEG_Y + self.LEGEND_H//2
        for shp, col, lbl in leg_items:
            ly = lcy - sq//2
            if shp=="oval":     self.oval(lx+sq//2, lcy, sq//2, sq//2-2, col)
            elif shp=="diamond":self.diamond(lx+sq//2, lcy, sq//2, sq//2, col)
            elif shp=="para":   self.para(lx, ly, sq, sq, col, 3)
            else:               self.rect(lx, ly, sq, sq, col, r=2)
            font = self._f(8)
            self.d.text((self._s(lx+sq+3), self._s(lcy)-font.size//2),
                        lbl, fill=C_WHITE, font=font)
            try: tw = int(self.d.textlength(lbl, font=font))
            except: tw = len(lbl)*self._s(6)
            lx += sq + tw//self.SCALE + 12

        for col, dashed, lbl in leg_line:
            ly_c = lcy
            line_x1 = lx; line_x2 = lx + 26
            self.line(line_x1, ly_c, line_x2, ly_c, col, 1.5, dashed)
            self._arrowhead(self._s(line_x2), self._s(ly_c), 1, 0, col, 6)
            font = self._f(8)
            self.d.text((self._s(line_x2+3), self._s(ly_c)-font.size//2),
                        lbl, fill=C_WHITE, font=font)
            try: tw = int(self.d.textlength(lbl, font=font))
            except: tw = len(lbl)*self._s(6)
            lx += 32 + tw//self.SCALE + 8

        # ── STEP 12: Bottom strip ─────────────────────────────────────────
        col_w = (self.CW - 2*self.MARGIN) // 3
        HDR_H = 20

        def _notes_text():
            return "\n".join(filter(None, [
                "iFlow: " + data.get("iflow_name",""),
                "Pattern: " + data.get("pattern","") + "  |  Mode: " + data.get("communication_mode",""),
                "Source: " + data.get("source_system","")[:45],
                "Target: " + data.get("target_system","")[:45],
                "Auth (src): " + data.get("source_auth","TBD")[:35],
            ]))

        def _adapter_text():
            rows = ["Step  Adapter           Proto  Op"]
            for i in [j for j in range(len(steps))
                      if j not in exc_idxs and any(
                          k in steps[j]["label"].lower()
                          for k in ("fetch:","read:","store:","https sender",
                                    "post","create","request reply","patch",
                                    "get subscription","odata get"))][:4]:
                lb = steps[i]["label"].lower()
                is_get  = any(k in lb for k in ("get subscription","odata get","read:"))
                is_post = any(k in lb for k in ("post","sender","create"))
                is_patch= "patch" in lb
                proto   = "OData" if ("odata" in lb or is_get) else "HTTPS"
                op      = "GET"   if is_get else ("PATCH" if is_patch else "POST")
                adpt    = "OData Recv" if "odata" in lb else ("HTTPS Sender" if "sender" in lb else "HTTP Recv")
                rows.append(f"{i+1:<5} {adpt:<18} {proto:<6} {op}")
            return "\n".join(rows)

        def _abbr_text():
            lines = []
            for n in self.hld_n:
                nm  = n.get("label",""); sub = n.get("sub","")
                if nm and sub:
                    lines.append(nm.split()[0][:5] + " - " + sub.split("(")[0].strip()[:28])
            lines += ["CPI  - Cloud Platform Integration",
                      "MPL  - Message Processing Log",
                      "OData- Open Data Protocol"]
            return "\n".join(lines[:6])

        for xi, (header, body_fn) in enumerate([
            ("PROCESS NOTES",   _notes_text),
            ("ADAPTER DETAILS", _adapter_text),
            ("ABBREVIATIONS",   _abbr_text),
        ]):
            bx = self.MARGIN + xi*col_w
            self.rect(bx, BTM_Y, col_w, HDR_H, C_NAVY)
            font = self._f(8)
            self.d.text((self._s(bx+5), self._s(BTM_Y+3)),
                        header, fill=C_WHITE, font=font)
            self.rect(bx, BTM_Y+HDR_H, col_w, self.BOTTOM_H-HDR_H, C_BG_BOT,
                      outline=C_DIVIDER)
            self.text_l(body_fn(), bx, BTM_Y+HDR_H, col_w,
                        self.BOTTOM_H-HDR_H, C_DARK, size=7)

        return self.img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data",  required=True)
    ap.add_argument("--out",   default=None)
    ap.add_argument("--scale", type=int, default=2)
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as f:
        data = json.load(f)

    out_folder = Path(data.get("out_folder",
                               "output/design_docs/"))
    out_folder.mkdir(parents=True, exist_ok=True)

    from datetime import datetime
    ts  = datetime.now().strftime("%Y%m%d_%H%M")
    key = data.get("key","diagram")

    png_path   = args.out or str(out_folder / f"{ts}_{key}_Diagram.png")
    drawio_path = str(out_folder / f"{ts}_{key}_ProcessFlow.drawio")

    r = Renderer(data)
    r.SCALE = args.scale
    img = r.render()
    img.save(png_path, dpi=(150*args.scale, 150*args.scale))
    print(f"PNG:    {png_path}")

    # Also save the .drawio file alongside
    _save_drawio(data, drawio_path)
    print(f"DRAWIO: {drawio_path}")
    return png_path, drawio_path


def _save_drawio(data: dict, path: str):
    """Write a draw.io XML file from the design JSON."""
    steps  = data.get("flow_steps", [])
    conns  = data.get("flow_connectors", [])
    hld_n  = data.get("hld_nodes", [])
    hld_e  = data.get("hld_edges", [])
    key    = data.get("key","diagram")
    iflow  = data.get("iflow_name","iFlow")

    exc_idxs = {i for i,s in enumerate(steps) if _is_exc(s.get("label",""))}
    cpi_main = [i for i in range(len(steps))
                if _lane_of(steps[i].get("lane","CPI"))=="CPI" and i not in exc_idxs]
    n_main = len(cpi_main)

    sp  = 140
    sx0 = 100
    CPI_Y = 260
    EXC_Y = 380
    SRC_Y = 90
    TGT_Y = 420
    CARD_W = 160; CARD_H = 90

    SHAPE_STYLE = {
        "oval":    "ellipse;fillColor={c};strokeColor={c};fontColor=#ffffff;fontSize=9;fontStyle=1;",
        "rrect":   "rounded=1;arcSize=10;fillColor={c};strokeColor={c};fontColor=#ffffff;fontSize=9;",
        "diamond": "rhombus;fillColor={c};strokeColor={c};fontColor=#ffffff;fontSize=9;",
        "para":    "shape=parallelogram;fillColor={c};strokeColor={c};fontColor=#ffffff;fontSize=9;",
    }

    COLOR_HEX = {
        C_GREEN:  "#0A4D28", C_NAVY: "#0F2D4A", C_ORANGE: "#E86B00",
        C_PURPLE: "#6B3FA0", C_TEAL: "#007A87", C_GREY:   "#50606E",
        C_RED:    "#CC0000", C_OLIVE:"#808050", C_BLUE:   "#1A73C7",
        (0xE8,0xA0,0x00): "#E8A000",
    }

    cells = []
    cells.append('<mxCell id="0" />')
    cells.append('<mxCell id="1" parent="0" />')

    # Swimlane container
    total_w = sx0*2 + max(sp*(n_main-1) + 200, 800)
    cells.append(f'''<mxCell id="swim" value="{iflow}"
      style="shape=pool;startSize=28;horizontal=1;childLayout=stackLayout;horizontalStack=0;fillColor=#f0f4ff;strokeColor=#1A73C7;fontStyle=1;fontSize=11;"
      vertex="1" parent="1"><mxGeometry x="20" y="20" width="{total_w}" height="530" as="geometry"/></mxCell>''')

    # Lane cells
    for lid, lname, lcol, ly, lh in [
        ("lane_src","SOURCE","#0F2D4A",30,130),
        ("lane_cpi","SAP CPI","#1A73C7",160,260),
        ("lane_tgt","TARGET","#0A4D28",420,140),
    ]:
        cells.append(f'''<mxCell id="{lid}" value="{lname}"
          style="swimlane;startSize=28;horizontal=0;fillColor={lcol};strokeColor={lcol};fontStyle=1;fontSize=10;fontColor=#ffffff;swimlaneLine=1;align=center;"
          vertex="1" parent="swim"><mxGeometry x="0" y="{ly}" width="{total_w}" height="{lh}" as="geometry"/></mxCell>''')

    # Source card
    src_nodes = [n for n in hld_n if n.get("id")=="src"] or [n for n in hld_n if n.get("type")!="cpi"][:1]
    tgt_nodes = [n for n in hld_n if n.get("id")=="tgt"] or [n for n in hld_n if n.get("type")!="cpi"][1:2]

    src_kw = ("fetch:","read:","data store","pull","receive:")
    src_idx = next((mi for mi in cpi_main if any(k in steps[mi].get("label","").lower() for k in src_kw)),
                   cpi_main[0] if cpi_main else 0)
    tgt_kw = ("https sender:","post","create","send to","put:")
    tgt_idx = None
    for mi in reversed(cpi_main):
        if any(k in steps[mi].get("label","").lower() for k in tgt_kw):
            tgt_idx = mi; break
    if tgt_idx is None and cpi_main: tgt_idx = cpi_main[-1]

    scx = sx0 + (cpi_main.index(src_idx) if src_idx in cpi_main else 0)*sp if src_idx in cpi_main else sx0
    tcx = sx0 + (cpi_main.index(tgt_idx) if tgt_idx in cpi_main else n_main-1)*sp if tgt_idx in cpi_main else sx0+total_w-200

    if src_nodes:
        n = src_nodes[0]
        meta = (n.get("sub","") + "\n" + "\n".join(n.get("steps",[])[:3]))[:80]
        cells.append(f'''<mxCell id="src_card" value="&lt;b&gt;{n.get("label","Source")}&lt;/b&gt;&lt;br/&gt;&lt;font style=&quot;font-size:8px;&quot;&gt;{meta.replace(chr(10),"&lt;br/&gt;")}&lt;/font&gt;"
          style="rounded=1;arcSize=5;fillColor=#0F2D4A;strokeColor=#1A73C7;fontColor=#ffffff;fontSize=9;align=center;verticalAlign=top;"
          vertex="1" parent="lane_src"><mxGeometry x="{scx-CARD_W//2}" y="20" width="{CARD_W}" height="{CARD_H}" as="geometry"/></mxCell>''')

    if tgt_nodes:
        n = tgt_nodes[0]
        meta = (n.get("sub","") + "\n" + "\n".join(n.get("steps",[])[:3]))[:80]
        cells.append(f'''<mxCell id="tgt_card" value="&lt;b&gt;{n.get("label","Target")}&lt;/b&gt;&lt;br/&gt;&lt;font style=&quot;font-size:8px;&quot;&gt;{meta.replace(chr(10),"&lt;br/&gt;")}&lt;/font&gt;"
          style="rounded=1;arcSize=5;fillColor=#0A4D28;strokeColor=#1A73C7;fontColor=#ffffff;fontSize=9;align=center;verticalAlign=top;"
          vertex="1" parent="lane_tgt"><mxGeometry x="{tcx-CARD_W//2}" y="25" width="{CARD_W}" height="{CARD_H}" as="geometry"/></mxCell>''')

    # CPI step shapes
    step_x = {}
    for seq, mi in enumerate(cpi_main):
        step_x[mi] = sx0 + seq*sp

    exc_x = {}
    _exc_list = sorted(exc_idxs)
    if _exc_list:
        ne = len(_exc_list)
        et = 190*(ne-1)
        ef = (total_w - et)//2
        for ei,mi in enumerate(_exc_list):
            exc_x[mi] = ef + ei*190

    SW_d = 115; SH_d = 52
    for i, s in enumerate(steps):
        label = s.get("label","")
        shp, col = _classify(label)
        hex_col = COLOR_HEX.get(col, "#1A73C7")
        style = SHAPE_STYLE.get(shp,"rounded=1;").replace("{c}", hex_col)
        short = label.replace('"',"'")

        if i in exc_idxs:
            cx_d = exc_x.get(i, total_w//2)
            cells.append(f'''<mxCell id="s{i}" value="{i+1}&lt;br/&gt;{short}"
              style="{style}" vertex="1" parent="lane_cpi">
              <mxGeometry x="{cx_d-95}" y="{200}" width="190" height="50" as="geometry"/></mxCell>''')
        else:
            cx_d = step_x.get(i, sx0)
            sw = int(SW_d*1.3) if shp=="diamond" else SW_d
            sh = int(SH_d*1.2) if shp=="diamond" else SH_d
            cells.append(f'''<mxCell id="s{i}" value="{i+1}&lt;br/&gt;{short}"
              style="{style}" vertex="1" parent="lane_cpi">
              <mxGeometry x="{cx_d-sw//2}" y="{CPI_Y-160-sh//2}" width="{sw}" height="{sh}" as="geometry"/></mxCell>''')

    # Connectors
    CONN_STYLE   = "edgeStyle=orthogonalEdgeStyle;strokeColor=#002060;strokeWidth=2;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;"
    BRANCH_STYLE = "edgeStyle=orthogonalEdgeStyle;strokeColor=#002060;strokeWidth=1;dashed=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;"
    ERROR_STYLE  = "edgeStyle=orthogonalEdgeStyle;strokeColor=#CC0000;strokeWidth=1;dashed=1;exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;"

    for ci, conn in enumerate(conns):
        fi = conn.get("from"); ti = conn.get("to"); lbl = conn.get("label","")
        if fi is None or ti is None: continue
        ll = lbl.lower()
        is_err = any(k in ll for k in ("- - -","on failure","failure","error"))
        is_no  = "--no--" in ll or ll.strip()=="no"
        is_yes = "--yes--" in ll or ll.strip()=="yes"
        clean  = (lbl.replace("--yes--","Yes").replace("--no--","No")
                     .replace("--HTTP--","HTTP").replace("--OData--","OData")
                     .replace("--","").replace("-","").strip())
        if is_err:
            style = ERROR_STYLE.replace("exitX=0.5;exitY=1;","exitX=0.5;exitY=1;")
        elif is_no:
            style = BRANCH_STYLE
        else:
            style = CONN_STYLE
        cells.append(f'''<mxCell id="c{ci}" value="{clean}"
          style="{style}fontSize=9;fontStyle=1;" edge="1" source="s{fi}" target="s{ti}" parent="lane_cpi">
          <mxGeometry relative="1" as="geometry"/></mxCell>''')

    # Boundary connectors
    if src_nodes and cpi_main:
        e_lbl = hld_e[0].get("label","") if hld_e else ""
        cells.append(f'''<mxCell id="bnd_src" value="{e_lbl}"
          style="edgeStyle=orthogonalEdgeStyle;strokeColor=#002060;strokeWidth=2;fontSize=9;fontStyle=1;"
          edge="1" source="src_card" target="s{src_idx}" parent="swim">
          <mxGeometry relative="1" as="geometry"/></mxCell>''')
    if tgt_nodes and tgt_idx is not None:
        e_lbl = hld_e[1].get("label","") if len(hld_e)>1 else ""
        cells.append(f'''<mxCell id="bnd_tgt" value="{e_lbl}"
          style="edgeStyle=orthogonalEdgeStyle;strokeColor=#002060;strokeWidth=2;fontSize=9;fontStyle=1;"
          edge="1" source="s{tgt_idx}" target="tgt_card" parent="swim">
          <mxGeometry relative="1" as="geometry"/></mxCell>''')

    xml = f'''<mxfile host="Claude">
  <diagram name="{key}" id="{key.lower().replace("-","")}">
    <mxGraphModel dx="1422" dy="762" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="1654" pageHeight="931" math="0" shadow="0">
      <root>
        {"".join(cells)}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>'''

    with open(path, "w", encoding="utf-8") as f:
        f.write(xml)


if __name__ == "__main__":
    main()
