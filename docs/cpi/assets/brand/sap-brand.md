# SAP Brand Reference

For topic-specific tokens, read the relevant sub-file before implementing.

## Sub-files

| File | When to use |
|------|-------------|
| [sap-brand-typography.md](sap-brand-typography.md) | Font stacks, sizes, weights, responsive scale |
| [sap-brand-icons.md](sap-brand-icons.md) | Icon names (698), SVG paths |
| [sap-brand-assets.md](sap-brand-assets.md) | Pictograms (185), illustrations (25), Anvil (14) |
| [sap-brand-tables.md](sap-brand-tables.md) | Table variants, column types, density, states |
| [sap-brand-charts.md](sap-brand-charts.md) | Chart types, color sequences, axis tokens |
| [sap-brand-motion.md](sap-brand-motion.md) | CSS transitions, animation patterns, no-motion components |
| [sap-brand-tabs.md](sap-brand-tabs.md) | Tab types, anatomy, spacing, color tokens, overflow behavior |
| [sap-brand-shell.md](sap-brand-shell.md) | Shell bar, scroll-hide, section cards, accent bar label pattern |

---

## Colors

### Semantic Tokens

| Token | Hex | Role |
|-------|-----|------|
| Blue/7 | `#0070f2` | Brand primary |
| Blue/1 | `#ebf8ff` | Light background |
| Grey/1 | `#f5f6f7` | Page background |
| Grey/11 | `#12171c` | Dark text |
| Green/7 | `#188918` | Success |
| Red/7 | `#d20a0a` | Error |
| Red/8 | `#aa0808` | Error dark |
| Mango/5 | `#ffb300` | Warning |
| White | `#ffffff` | |
| Black | `#000000` | |

### Primary — Blue

| /1 | /2 | /3 | /4 | /5 | /6 | /7 | /8 | /9 | /10 | /11 |
|----|----|----|----|----|----|----|----|----|-----|-----|
| `#ebf8ff` | `#d1efff` | `#a6e0ff` | `#89d1ff` | `#4db1ff` | `#1b90ff` | `#0070f2` | `#0057d2` | `#0040b0` | `#002a86` | `#00144a` |

Best combinations (bg + accent): 11+6, 10+7, 7+4, 6+4, 4+2

### Secondary Palettes

**Green**
`/1:#f5fae5` `/2:#ebf5cb` `/3:#bde986` `/4:#97dd40` `/5:#5dc122` `/6:#36a41d` `/7:#188918` `/8:#256f3a` `/9:#1e592f` `/10:#164323` `/11:#0e2b16`

**Grey**
`/1:#f5f6f7` `/2:#eaecee` `/3:#d5dadd` `/4:#a9b4be` `/5:#8396a8` `/6:#5b738b` `/7:#475e75` `/8:#354a5f` `/9:#223548` `/10:#1a2733` `/11:#12171c`

**Indigo**
`/1:#f1ecff` `/2:#e2d8ff` `/3:#d3b6ff` `/4:#b894ff` `/5:#9b76ff` `/6:#7858ff` `/7:#5d36ff` `/8:#470ced` `/9:#2c13ad` `/10:#1c0c6e` `/11:#0e0637`

**Mango**
`/1:#fff8d6` `/2:#fff3b8` `/3:#ffdf72` `/4:#ffc933` `/5:#ffb300` `/6:#e76500` `/7:#c35500` `/8:#a93e00` `/9:#8d2a00` `/10:#6d1900` `/11:#450b00`

**Red**
`/1:#ffeaf4` `/2:#ffd5ea` `/3:#ffb2d2` `/4:#ff8cb2` `/5:#ff5c77` `/6:#ee3939` `/7:#d20a0a` `/8:#aa0808` `/9:#840606` `/10:#5a0404` `/11:#350000`

> Visual reference: [sap-colors-visual-reference.html](Colors/sap-colors-visual-reference.html)

### Contrast

Minimum contrast ratio **4.5:1** — at least **7 steps** apart on the color scale.  
Safe pairs (bg/fg from same or different palette): white+/7 · /1+/8 · /2+/9 · /3+/10 · /4+/11  
Reserve Green, Mango, Red for semantic use (alerts, status, actions) — not decorative text.

---

## Shadows

Shadows provide depth perception for container elements (tiles, menus, dialogs). Theme: **Morning**.

| Level | CSS `box-shadow` | Opacity | Offset-y | Blur |
|-------|-----------------|---------|----------|------|
| Shadow/S  | `0 2px 4px rgba(34,53,72,.20)`   | 20% | 2px  | 4px  |
| Shadow/M  | `0 2px 8px rgba(34,53,72,.30)`   | 30% | 2px  | 8px  |
| Shadow/L  | `0 10px 30px rgba(34,53,72,.30)` | 30% | 10px | 30px |
| Shadow/XL | `0 20px 80px rgba(34,53,72,.25)` | 25% | 20px | 80px |

Color: Grey-9 `#223548`. All levels: offset-x 0px · spread 0px. Drop shadow-2 is transparent (White 0%) in all levels.

---

## Blurs

| Level | Background Blur | Spread radius |
|-------|----------------|---------------|
| Blur  | `15`           | 0px           |

CSS: `backdrop-filter: blur(15px)`

---

## Spacing

Base unit: **4px**. Two conventions coexist — `Spacer/N` (multiplier × 4px, newer components) and `Spacing/N` (N = px value, tables/tabs):

| Spacer token | Spacing token | px | rem |
|---|---|---|---|
| Spacer/1 | Spacing/4 | 4 | 0.25 |
| Spacer/2 | Spacing/8 | 8 | 0.5 |
| Spacer/3 | Spacing/12 | 12 | 0.75 |
| Spacer/4 | Spacing/16 | 16 | 1 |
| Spacer/5 | — | 20 | 1.25 |
| Spacer/6 | Spacing/24 | 24 | 1.5 |
| Spacer/7 | — | 28 | 1.75 |
| Spacer/8 | Spacing/32 | 32 | 2 |
| — | Spacing/40 | 40 | 2.5 |

---

## Typography

**Font family:** `'72Brand', '72', '72full', Arial, Helvetica, sans-serif`  
Variable font — weight axis Thin (100) → Black (900). Recommended body: Body/S (16px).  
Full spec → [sap-brand-typography.md](sap-brand-typography.md)

---

## Icons

698 icons. SVG path: `Icons/SVG Icons/{name}-icon.svg`  
Full list + visual reference → [sap-brand-icons.md](sap-brand-icons.md)

---

## Pictograms, Illustrations, Anvil

185 pictograms · 25 illustrations · 14 Anvil SVGs.  
Full lists, SVG paths, visual references → [sap-brand-assets.md](sap-brand-assets.md)

---

> All component specs below use Theme: **Morning**.

## Dividers

A Divider is a 1px horizontal (or vertical) rule used to visually separate content into distinct groups or sections.

### Anatomy

| Element | Size |
|---------|------|
| Container height | `5px` (0.313 rem) |
| Divider line | `1px` (0.0625 rem) |

### Spacing

`Spacer/2` on both sides of the divider.

### Color

| Variant | Color | Token |
|---------|-------|-------|
| Default | Grey/3 | `Core/DividerDefault` |
| Dark | Grey/7 | `Core/DividerHigher` |

### Usage

**Do:** Use to separate and organize content sections, group form fields, separate list items, or distinguish cards in card layouts.  
**Don't:** Use when whitespace already provides separation; don't use decoratively without a structural purpose; don't overuse (clutters hierarchy).

---

## Progress Bar

Visually communicates task progress. Two types: **Regular** (neutral, no semantic meaning) and **Semantic** (predefined color per state).

**Semantic states:** Error (Red) · Success (Green) · Warning (Mango) · Information (Blue)

**Behavior:** Fills with smooth animation as the task advances. At 0% only the track and start/end points render (no progress line); the line appears at ≥1%. Not interactive — no hover, down, or focused states. Hide or replace with an end-state element on completion.

### Anatomy

| # | Element | Size | Token |
|---|---------|------|-------|
| 1 | Progress bar height | `12px` (0.75 rem) | — |
| 2 | Track height | `8px` (0.5 rem) | `ProgressBar/Track` |
| 3 | Start/End point size | `6×6px` (0.375 rem) | — |
| 4 | Label font style | Heading/Regular/XXXXS | — |
| 5 | Semantic icon size | `18×18px` (1.125 rem) | `ProgressBar/Icon` |
| 6 | Track corner radius | `4px` (0.25 rem) | `ProgressBar/Track/CornerRadius` |
| 7 | Bar corner radius | `6px` (0.375 rem) | `ProgressBar/Bar/CornerRadius` |

### Spacing

- `Spacer/4` — vertical padding around the component
- `1px` (0.0625 rem) — padding between Start/End point and container
- `6px` (0.375 rem) — horizontal padding at ends

### Color — Morning

All variants share the same element structure. Light shade = `/3`, dark shade = `/7` within each palette:

| Element | Token suffix | Shade |
|---------|--------------|-------|
| Start/End point | `…/Value` | /7 |
| Track border | `…/TrackBorder` | /3 |
| Track | `…/Track` | /3 |
| Value (bar) | `…/Value` | /7 |
| Value border | `…/ValueBorder` | /7 |
| Semantic icon (not Neutral) | `…/Icon` | /7 |
| Descriptive text (%) | `Core/Text/Text` | Grey/9 (all variants) |

| Variant | Palette | Token prefix |
|---------|---------|--------------|
| Neutral | Grey | `ProgressBar/Default/` |
| Informative | Blue | `ProgressBar/Informative/` |
| Error | Red | `ProgressBar/Error/` |
| Success | Green | `ProgressBar/Success/` |
| Warning | Mango | `ProgressBar/Warning/` |

### Usage

**Do:** Use for measurable, linear tasks with a defined start and end (file uploads, installations, form submissions, downloads).  
**Don't:** Use for random/indefinite loading (use a loading indicator instead), for tasks too short to perceive progress, or when the user gains no benefit from seeing a percentage.

---

## Tags

A UI element to label, categorize, or interact with content. Tags convey information, support filtering, and enable navigation.

**Types:** Informational (Read-Only) · Removable · Link · With Icon · Selectable (Toggle)  
**Color variants:** Text Only · White · Outlined · Grey

### Size & Anatomy

| # | Element | Small (12px) | Standard (14px) | Token |
|---|---------|-------------|-----------------|-------|
| 1 | Container height | `22px` (1.375 rem) | `25px` (1.563 rem) | — |
| 2 | Tag text style | Body/XXS | Body/XS | — |
| 3 | Icon container size | `16×16px` (1 rem) | `16×16px` (1 rem) | — |
| 4 | Icon size | `12×12px` (0.75 rem) | `12×12px` (0.75 rem) | — |
| 5 | Line height | `2px` (0.125 rem) | `2px` (0.125 rem) | — |
| 6 | Radius | `6px` (0.375 rem) | `6px` (0.375 rem) | `Tags/Radius` |

Icon names: `accept`, `add`, `decline`

### Spacing

| # | Location | Value |
|---|----------|-------|
| 1 | Before/after text | Spacer/8 |
| 2 | Between text and icon container | Spacer/2 |
| 3 | Top/bottom inside tag | Spacer/2 |
| 4 | Padding label → selected border | 0px |
| 5 | Radius | `6px` (0.375 rem) |
| 6 | Border width | `1px` (0.0625 rem) |
| 7 | After icon container | Spacer/6 |
| 8 | Inside icon container | Spacer/2 |

### Usage by type

| Type | Do | Don't |
|------|----|-------|
| Informational | Display static info (category labels) | As interactive elements |
| Removable | In filters/inputs where tag removal is expected | As permanent labels |
| With Icon | When icon clarifies purpose (status, add, role) | With redundant or decorative icons |
| Selectable | Side filters, multi-select environments | With redundant or decorative icons |

### Color — Outlined (Morning)

| State | Background | Border | Text / Icon | Tokens (prefix `Tags/Outlined/`) |
|-------|------------|--------|-------------|-----------------------------------|
| Regular | White | Grey/4 | Grey/9 | `Default/Background · Border · Text` |
| Hover | Grey/1 | Grey/4 | Grey/9 | `Hover/Background · Border · Text` |
| Selected | White | Blue/7 | Blue/7 + underline | `Selected/Background · Border · Text` |
| Hover Selected | Blue/1 | Blue/7 | Blue/7 + underline | `HoverSelected/Background · Border · Text` |
| Read Only | White | Grey/4 | Grey/6 | `ReadOnly/Background · Border · Text` |

Text Only / White / Grey follow the same 5-state structure with `Tags/{Variant}/{State}/…` tokens.

---

## Buttons

Fundamental interactive elements that trigger actions, navigation, or system states.

**Button types:** Action (primary interaction) · Segmented (grouped toggle) · Control (embedded in components) · Social Media · Play/Pause  
**This section covers Action Buttons only.**

Labels use **Sentence case** and must not wrap. Trigger: mouse click anywhere in container · keyboard Enter or Space.

### Styles (hierarchy)

| Style | Visual | When to use |
|-------|--------|-------------|
| Primary | Blue fill | Main CTA — one per view (Submit, Save, Proceed) |
| Secondary | White fill + grey border | Second most important action |
| Tertiary | Dashed border + blue text | Less prominent or independent action |
| Invisible | No border or fill | Inline with content (Show More, Expand) |

One Primary per screen. Primary always left of Secondary. One icon per button maximum.

### Sizes

| Size | Height | Default for |
|------|--------|-------------|
| L | `42px` (2.625 rem) | XL / L / M screens — **default if unspecified** |
| M | `36px` (2.25 rem) | S / XS screens — default if unspecified at those breakpoints |
| S | `25px` (1.563 rem) | Space-constrained contexts (table cells, dialogs) |

### Anatomy — Label-based (L and M)

Primary, Secondary, and Tertiary share identical metrics per size.

| # | Element | L size | M size | Token |
|---|---------|--------|--------|-------|
| 1 | Container height | `42px` (2.625 rem) | `36px` (2.25 rem) | — |
| 2 | Label font | Navigation/Medium/XL | Navigation/Medium/XL | — |
| 3 | Icon size | `18×18px` (1.125 rem) | `16×16px` (1 rem) | `Button/Icon/L` · `Button/Icon/M` |
| 4 | Radius | `8px` (0.5 rem) | `8px` (0.5 rem) | `Button/Radius` |
| 5 | Border (inside) | `1px` (0.0625 rem) | `1px` (0.0625 rem) | `Button/Border` |

**L spacing:** Horizontal padding `14px` · Between label/icon: Spacer/8 · Top/bottom: Spacer/12  
**M spacing:** Horizontal padding `10px` · Vertical padding `9px` · Between label/icon: `6px` (0.375 rem)  
**Invisible L (exception):** No left/right padding · Top/bottom: Spacer/8 · Between label/icon: Spacer/8

### Color — Morning (Action Buttons)

**Primary**

| State | Background | Border | Text | Token prefix |
|-------|------------|--------|------|--------------|
| Default | Blue/8 | Blue/8 | White | `Button/Regular/Primary/Default/…` |
| Hover | Blue/9 | Blue/9 | White | `Button/Regular/Primary/Hover/Default/…` |
| Active | White | Blue/9 | Blue/9 | `Button/Regular/Primary/Active/Default/…` |
| Disabled | Blue/8 + 40% | Blue/8 + 40% | White + 40% | `…/Default/…` + `Core/Disabled` |

**Secondary**

| State | Background | Border | Text | Token prefix |
|-------|------------|--------|------|--------------|
| Default | White | Grey/7 | Blue/9 | `Button/Regular/Secondary/Default/…` |
| Hover | Black 10% | Grey/7 | Blue/9 | `Button/Regular/Secondary/Hover/…` |
| Active | White | Blue/9 | Blue/9 | `Button/Regular/Secondary/Active/…` |
| Disabled | White + 40% | Grey/7 + 40% | Blue/9 + 40% | `…/Default/…` + `Core/Disabled` |

Token properties per state: `…/Background`, `…/Border`, `…/Text`. Tertiary and Invisible follow the same 4-state structure under `Button/Regular/Tertiary/…` and `Button/Regular/Invisible/…`.

**Focus ring:** Primary/Secondary/Tertiary/Positive/Warning/Negative → 2px inside · Invisible → 2px outside.

### Usage

| Context | Do | Don't |
|---------|----|-------|
| Standard | General-purpose actions with clear labels; text + optional icon | When icon alone suffices; grouped/toggle sets; inline text flow |
| Icon-only | Space-constrained + universally recognizable icon; toolbars, cards, table cells | Primary/critical actions; when icon could be misunderstood |
| Toggle | Binary on/off state; quick toggle without navigation | Multi-option sets (use Segmented); critical actions needing confirmation |

---

## Cards

Container for grouping related content. Always elevated — never flat or borderless.

### Types

| Type | Distinguishing element | Typical use |
|------|----------------------|-------------|
| Default | Shadow/S at rest | General content grouping |
| KPI | 3px top accent strip + large numeric | Key metric display — see KPI section |
| Hero | Gradient bg · 2–3 column span | Featured summary, dashboard header |

### Anatomy

| # | Element | Value | Token |
|---|---------|-------|-------|
| 1 | Background | White | `Core/Surface/Base` |
| 2 | Border radius | `12px` (0.75 rem) | — |
| 3 | Padding | `20px` (Spacer/5) | — |
| 4 | Shadow (rest) | Shadow/S | `Shadow/S` |
| 5 | Shadow (hover) | Shadow/M + `translateY(-2px)` | `Shadow/M` |
| 6 | Transition | `box-shadow 200ms ease-in-out, transform 200ms ease-in-out` | — |

### Status Strip

A 3px top accent bar signals card state. Requires `position: relative; overflow: hidden` on `.card`.

```css
.card::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 3px;
  border-radius: 0.75rem 0.75rem 0 0;
}
```

Color by state: Done → `Blue/8` · Active → `Blue/7` · In Validation → `Blue/5` · Pending → `Blue/3`

### Hero Card

```css
background: linear-gradient(135deg, #002a86 0%, #0057d2 35%, #0070f2 70%, #4db1ff 100%);
/* Blue/10 → Blue/8 → Blue/7 → Blue/5 */
color: White; min-height: 16rem; grid-column: span 2;
```

### Section Card

Structural container for named report sections (dashboards). No hover lift — not interactive.

| # | Element | Value |
|---|---------|-------|
| 1 | Background | White |
| 2 | Border | `1px solid #d9dde0` (Grey/3) |
| 3 | Border radius | `12px` |
| 4 | Padding | `32px 40px` |
| 5 | Min-height | `180px` — use `0` for chart-heavy sections |
| 6 | Shadow | `0 1px 4px rgba(0,50,165,.06)` |

Header label: `14px`, `700`, uppercase, `0.08em` letter-spacing, **Blue/10 `#002a86`**. Optional `32×32px` icon slot. Full CSS → [sap-brand-shell.md](sap-brand-shell.md)

### Rules

- **Never flat/borderless** — Shadow/S minimum at all times
- **Hover**: upgrade to Shadow/M + `translateY(-2px)`; use `transition` row 6 above
- **Nesting**: max 2 levels deep; inner card uses Shadow/S only (no further upgrade on hover)
- `overflow: hidden` on all cards prevents status strip from overflowing the border radius

---

## KPI Display

A numeric value with a supporting label communicating one key metric. Used in cards, tiles, and strips.

### Size Scale

Resolves against the Heading type scale (line-height 1.1). Use Bold (700) for standard display; Black (900) for hero or showcase values.

| Alias | Typography token | rem | Typical use |
|-------|-----------------|-----|-------------|
| KPI/XL | Heading/Black/XXXL | 3 | Hero stat, gauge center |
| KPI/L | Heading/Bold/L | 2.25 | Card primary value, KPI strip |
| KPI/M | Heading/Bold/M | 2 | Compact tile |
| KPI/S | Heading/Bold/S | 1.75 | Dense layout, table summary |

### Rules

- **Value color: always `#000000` (Black)** — never semantic or palette color regardless of the state represented
- **Label:** Body/XXS (0.75 rem) · Grey/6 `#5b738b` · left-aligned with the value
- **Sub-line:** Body/XXS, same color · prefer concrete counts ("27 in-scope · 8 out of scope") over generic labels
- **Icon container (in strips):** 44×44px · Blue/1 bg · Blue/7 icon · 1px Blue/3 border · `0.65rem` radius
- **Strip cell spacing:** Spacer/4 (16px) top/bottom · Spacer/5 (20px) left/right

### Tile Structure (Report KPI Strip)

4-tile grid used in report summary sections.

```css
/* Strip */
.kpi-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px; }

/* Tile shell */
.kpi {
  padding: 0.8rem 1.1rem; background: #fff; border-radius: 0.65rem;
  border: 1px solid rgba(0,112,242,.09);
  box-shadow: 0 1px 4px rgba(0,50,165,.06);
  display: flex; flex-direction: column; gap: 0.25rem;
}
```

**Layer stack (top → bottom):**

| Layer | Class | Spec |
|-------|-------|------|
| Sub-label | `.kpi-l` | Accent bar label — see [sap-brand-shell.md](sap-brand-shell.md) |
| Main value | `.kpi-v` | `1.85rem`, weight `900`, color `#12171c` |
| Body area | `.kpi-body` | `min-height: 3.2rem`, holds tile-specific content |
| Bottom pill | `.kpi-pill` | `0.65rem`, border `1px solid rgba(0,112,242,.14)`, radius `0.35rem`, padding `0.42rem 0.55rem` |

**Pill sub-text:** color Grey/6 · `strong` = Grey/7 · priority callouts use Red/Mango semantic colors.

**Execution tile** — fraction + inline progress bar:

```css
.kpi-bar-track { flex: 1; height: 10.5px; border-radius: 5.25px; background: rgba(0,112,242,.1); }
.kpi-bar-fill  { height: 100%; width: var(--w, 0%); background: #0070f2; border-radius: 5.25px; }
/* Usage: <div class="kpi-bar-fill" style="--w:87%"></div> */
```

**Bug priority tile** — two-column number grid with hover tooltip:

```css
.kpi-bug-grid    { display: grid; grid-template-columns: max-content 1px max-content; column-gap: 0.9rem; align-items: end; }
.kpi-bug-divider { height: 1.85rem; background: rgba(0,0,0,.08); align-self: end; margin-bottom: 0.35rem; }
```

Hovering a count cell shows an `.ob-tip` tooltip (white card, `0 4px 20px rgba(0,50,165,.14)` shadow, arrow via `::before`/`::after`, capped at 5 rows).

**Execution windows tile** — stacked mini progress bars with sprint badge:

```css
.kpi-win        { background: rgba(0,112,242,.04); border: 1px solid rgba(0,112,242,.13); border-radius: 0.45rem; padding: 0.45rem 0.55rem; }
.kpi-win__badge { font-size: 0.54rem; font-weight: 700; background: #0070f2; color: #fff; border-radius: 2rem; padding: 0.07rem 0.38rem; }
.kpi-win__track { flex: 1; height: 4px; border-radius: 2px; background: rgba(0,112,242,.1); overflow: hidden; }
.kpi-win__fill  { height: 100%; background: #0070f2; width: var(--w, 0%); }
```
