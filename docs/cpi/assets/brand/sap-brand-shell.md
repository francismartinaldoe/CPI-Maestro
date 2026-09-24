# SAP Brand — Shell & Report Chrome

Theme: **Morning**

---

## Shell Bar

Fixed top bar for standalone HTML reports. Provides product identity, report title, PI marker, and report date.

### Anatomy

| Element | Spec |
|---------|------|
| Height | `56px` |
| Background | Grey/1 `#f5f6f7` |
| Bottom border | `1px solid #e8eaed` (Grey/2) |
| Inner max-width | `1200px`, padding `0 40px` |
| Position | `fixed; top: 0; z-index: 100` |
| Body offset | `padding-top: 56px` on `<body>` |

```css
.top-bar {
  position: fixed; top: 0; left: 0; right: 0;
  z-index: 100; height: 56px; display: flex; align-items: center;
  background: #f5f6f7; border-bottom: 1px solid #e8eaed;
  transition: transform 220ms ease-in-out;
}
.top-bar__inner {
  width: 100%; max-width: 1200px; margin: 0 auto;
  padding: 0 40px; display: flex; align-items: center;
}
```

### Slots (left → right)

| Slot | Class | Spec |
|------|-------|------|
| SAP logo | `.top-bar__logo` | SVG, height `32px` |
| Divider | `.top-bar__divider` | `1×22px`, bg `#d5dadd` (Grey/3), margin `0 16px` |
| Product name | `.top-bar__product` | `17px`, `700`, `#12171c` |
| App name | `.top-bar__app` | `17px`, `400`, `#354a5f` (Grey/8), gap `14px` left |
| PI badge | `.top-bar__pi` | See below; `margin-left: 7px` |
| Date | `.top-bar__date` | `12px`, `#8ea4b8`, `margin-left: auto` |

### PI Badge

```css
.top-bar__pi {
  display: inline-block; font-size: 14px; font-weight: 700;
  color: #0040b0; background: #ebf8ff;       /* Blue/9 · Blue/1 */
  border: 1px solid #a6e0ff; border-radius: 4px; /* Blue/3 border */
  padding: 1px 6px; margin-left: 7px; vertical-align: middle;
}
```

Used to display the Program Increment (e.g., `PI26/2`).

### Scroll-Hide Behavior

Hides on scroll-down; reveals after 2 consecutive upscroll events; resets at top.

```js
let lastY = 0, upCount = 0;
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (y < 10)         { bar.style.transform = ''; upCount = 0; }
  else if (y < lastY) { if (++upCount >= 2) bar.style.transform = ''; }
  else                { bar.style.transform = 'translateY(-100%)'; upCount = 0; }
  lastY = y;
}, { passive: true });
```

---

## Section Card

Structural container for named report sections. No hover or interactive behavior.

### Anatomy

| # | Element | Value |
|---|---------|-------|
| 1 | Background | White |
| 2 | Border | `1px solid #d9dde0` (Grey/3) |
| 3 | Border radius | `12px` |
| 4 | Padding | `32px 40px` |
| 5 | Min-height | `180px` — use `0` for chart-heavy sections |
| 6 | Shadow | `0 1px 4px rgba(0,50,165,.06)` |

### Header

```css
.section-card__header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.section-card__icon   { width: 32px; height: 32px; display: block; }
.section-card__label  {
  font-size: 14px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #002a86; /* Blue/10 */
  margin-bottom: 20px; /* 0 when nested inside .section-card__header */
}
```

> Label uses **Blue/10 `#002a86`** — darker than brand Blue/7, anchoring the section above the accent bar labels within the card.

---

## Accent Bar Label

Used to title panels within a section (chart panels, table panels, info cards).

```css
.panel-label {                   /* report uses .kpi-l and .tes-chip */
  display: inline-flex; align-items: center; gap: 0.4rem;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.07em; text-transform: uppercase;
  color: #5b738b;                /* Grey/6 — muted below section label */
  margin-bottom: 0.65rem;        /* 0.75rem in KPI tile context */
}
.panel-label::before {
  content: ''; display: inline-block;
  width: 3px; height: 11px; border-radius: 2px;
  background: #002a86;           /* Blue/10 — echoes section card label */
  flex-shrink: 0;
}
```

**Rules:**
- Bar is **Blue/10 `#002a86`** — not `#0070f2` (Blue/7), which is reserved for interactive fills, buttons, and active states.
- Text is **Grey/6 `#5b738b`** — one step below section label in hierarchy.
- `margin-bottom: 0.75rem` in KPI tiles; `0.65rem` in chart and bug panels.
