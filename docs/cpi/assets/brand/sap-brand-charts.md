# SAP Brand — Charts & Graphs

Theme: **Morning**

---

## Overview

Charts and graphs present data visually to help users interpret trends and comparisons at a glance. Interactive tooltips provide additional detail on demand.

| Chart type | Best for |
|------------|----------|
| Column | Comparing discrete categories; changes over time with limited data points |
| Donut | Part-to-whole relationships; 3–6 segments with clear differences |
| Line | Trends and fluctuations over time; single or multiple series |
| Radial | Comparing multiple attributes across items in a compact circular format |

**Color rule:** Always use the SAP blue palette (monochrome). Multi-color decorative charts are not permitted. Exception: status-semantic dimensions (e.g., passed / failed / blocked / not started) may use the matching system status colors.

**Shared anatomy** (all chart types unless noted):

| Element | Spec |
|---------|------|
| Title | Heading/Medium/XXXS |
| Label | Body/S |
| Legend | 16×16px · Line chart exception: 16×12px |

---

## Column Chart

Vertical or horizontal bars showing the value of categories. Height (or length) is proportional to the data.

### Types

| Type | Description |
|------|-------------|
| Vertical | Bars aligned vertically — ideal for time-series with separate data points |
| Horizontal | Bars along horizontal axis — better for long category labels or many items |
| Multiple | Columns side by side per category — direct cross-group comparison |
| Stacked | One column per category divided into segments — cumulative totals |

**Color variants:** Monochrome (blue shades) · ~~Colored~~ (not used)

### Anatomy

Base anatomy applies. Additional: Y-axis: Body/S · X-axis: Body/S

### Usage

**Do:** Compare data across categories (sales by region, product popularity) · Show changes over time · Highlight trends across multiple data series · Display simple patterns.  
**Don't:** Use for large data sets with many categories (becomes cluttered) · When precise values matter (use a table instead) · For proportional data (use donut chart).

---

## Donut Chart

A pie chart variant with a hollow center. Segments show parts of a whole; the center can display a total or key metric.

**Color variants:** Monochrome (blue shades) · ~~Colored~~ (not used)

### Anatomy

Base anatomy applies. Additional: Donut size: depends on page layout and column count

### Arc Construction

`C = 2πr` — e.g. `r = 65` → `C = 408.41`

**Segment formula** — start all arcs at 12 o'clock with `rotate(-90 cx cy)`:

```
arc_length = C × (count / total)
```

**Segment gap** — prevents arc bleed at joint points (G = 4 arc units recommended):

```
visual arc = geometric arc − G
offset     = −(sum of prior geometric arcs) − G/2
```

Worked example — `r=65, C=408.41, G=4`:

| Segment | count/365 | Geometric arc | Visual arc | Offset |
|---------|-----------|--------------|------------|--------|
| Passed | 142 | 158.87 | 154.87 | −2.00 |
| Failed | 28 | 31.33 | 27.33 | −160.87 |
| Blocked | 15 | 16.79 | 12.79 | −192.20 |
| Not Started | 180 | 201.42 | 197.42 | −209.00 |

Check: `154.87 + 27.33 + 12.79 + 197.42 + 4×4 = 408.41 ✓`

**SVG element:**

```html
<circle cx="..." cy="..." r="..." fill="none"
  stroke="[color]" stroke-width="22" stroke-linecap="butt"
  stroke-dasharray="[visual-arc] [C]"
  stroke-dashoffset="[offset]"
  transform="rotate(-90 cx cy)"/>
```

**Rules:**
- `stroke-linecap="butt"` is mandatory — `round` causes visible overlap between adjacent segments
- Hover pop-out: wrap each `<circle>` in `<g>` · CSS `transform-box: view-box; transform-origin: [cx]px [cy]px` · `scale(1.07)` on hover (CSS only — SVG `transform="rotate()"` stays on `<circle>`)
- Color sequence (status donut): Passed → Blue/10 · Failed → Blue/7 · Blocked → Blue/5 · Not Started → Blue/2 (track)

### Usage

**Do:** Part-to-whole relationships (market share, budget allocation) · Display totals/percentages in the center · Best with 3–6 segments that are clearly distinguishable.  
**Don't:** Precise value comparisons (bar charts are more accurate) · Time-series data (donut is static — use line chart) · When segment differences are small (hard to perceive).

---

## Line Chart

Data points connected by lines on a 2D grid. Visualizes trends, fluctuations, and correlations over time.

### Types

| Type | Description |
|------|-------------|
| One Line | Single data series — how one variable changes over time or categories |
| Multiple Line | Several series on the same graph — compare trends across variables |

**Color variants:** Monochrome (blue shades) · ~~Colored~~ (not used)

### Anatomy

Base anatomy applies (legend: 16×12px). Additional: Y-axis: Body/S · X-axis: Body/S

### Usage

**Do:** Visualize trends and changes over time · Compare multiple series · Observe growth patterns and fluctuations.  
**Don't:** More than 6–8 lines (similar lines become indistinguishable) · When precise value comparison is needed (bar charts are clearer) · For static categorical data with no time dimension.

---

## Radial Chart

Also known as Radial Bar Chart or Circular Bar Chart. Bars arc in a circle; longer bars represent larger values.

### Sizes

| Variant | Size |
|---------|------|
| Regular | Depends on page layout and number of charts per row |
| Micro L | `80×80px` (5×5 rem) |
| Micro M | `56×56px` (3.5×3.5 rem) |
| Micro S | `32×32px` (2×2 rem) |

### Anatomy — Regular

Base anatomy applies. Additional: Center number: `Heading/Regular/M` · Chart size: depends on layout and chart count per row

### Anatomy — Micro

Base anatomy applies. Additional: Center number: `Navigation/Regular/XL`

### Usage

**Do:** Compare multiple attributes across items in one view (skills comparison, product performance across categories).  
**Don't:** Simple one-dimensional comparisons (bar chart is more readable) · Too many attributes (becomes cluttered and confusing).

---

## Behavior & Interactions

**Tooltip on click (mouse and touch):**
- Clicking a segment, bar, or data point triggers a tooltip with additional details.
- The tooltip stays visible until the user clicks outside or interacts elsewhere.
- Clicking a different data point updates the tooltip dynamically to reflect the new selection.

---

## Color — Morning

Charts always use colors from the SAP brand palette. **Use the blue family (monochrome) only.**

| Rule | Detail |
|------|--------|
| Default series color | Blue family — shades from Blue/11 → Blue/3 across data series |
| Semantic exception | Passed/Failed/Blocked/Not Started may use Green/Red/Grey/Orange system colors |
| Annotations | Grey/9 · Token: `Core/Text/Text` |
| Chart name / title | Black · Token: `Core/Text/Heading` |

Do not use mixed multi-color palettes for decorative or arbitrary series differentiation.

---

## Sizing

- Chart dimensions scale with the page breakpoint.
- Title text sizes (Heading/XXL and Heading/L) remain consistent across breakpoints.
- **Complex charts:** span at least **6 grid columns** at larger breakpoints.
- **Simpler charts:** may display at **4 columns** wide.
- Donut and Radial sizes depend on page layout and the number of charts displayed per row.

---

## Report Chart Implementations

Concrete specs used in the FD24.2026 Feature Test Execution Report.

### Burnup Line Chart (Chart.js)

Tracks cumulative TC execution against a planned baseline over sprint days.

**Library:** Chart.js 4.x from CDN  
**Container:** `position: relative; flex: 1; min-height: 240px`

**Datasets:**

| Series | Color | Weight | Description |
|--------|-------|--------|-------------|
| Planned | `#89d1ff` (Blue/4) | `2px` | Ideal cumulative execution curve |
| Actual | `#0040b0` (Blue/9) | `2px` | Real cumulative executed TCs |

```js
datasets: [
  { label: 'Planned', data: [...], borderColor: '#89d1ff',
    tension: 0.35, pointRadius: 3, pointHoverRadius: 5, fill: false },
  { label: 'Actual',  data: [...], borderColor: '#0040b0',
    tension: 0.35, pointRadius: 3, pointHoverRadius: 5, fill: false }
]
```

**Axes:** Y-axis ticks aligned to sprint milestones (e.g., `[0, 94, 188, 281, 375]`); X-axis date labels (`'5th'`–`'22nd'`); both at `font-size: 11`.  
**Legend:** custom HTML using `.tes-legend-line` divs (16×2px colored bars) — not Chart.js built-in legend.

**Today plugin** — vertical dashed reference line at current date index:

```js
const todayPlugin = {
  id: 'todayLine',
  afterDraw(chart) {
    const x = chart.scales.x.getPixelForIndex(todayIndex);
    const { ctx, chartArea: { top, bottom } } = chart;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,112,242,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    // Label box above line
    ctx.fillStyle = '#0070f2';
    ctx.beginPath(); ctx.roundRect(x - 24, top - 22, 48, 18, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 10px "72",Arial';
    ctx.textAlign = 'center'; ctx.fillText('TODAY', x, top - 9);
    ctx.restore();
  }
};
```

---

### Bug Trend Line Chart (Chart.js)

Tracks bugs opened vs. resolved over sprint days. Same Chart.js structure as burnup.

**Container height:** `280px`

| Series | Color | Description |
|--------|-------|-------------|
| Bugs Added | `#000000` | Cumulative bugs opened |
| Bugs Resolved | `#188918` (Green/7) | Cumulative bugs resolved |

**Y-axis:** `min: 0`, `suggestedMax: 60`, `stepSize: 10`.  
**Points:** rendered only where the series value changes (not on flat segments).  
Uses the same `todayPlugin` as the burnup chart.

---

### Execution Status Donut (Inline SVG)

**Overrides the brand blue-monochrome rule** — uses semantic status colors. Permitted per the status-semantic exception in the Overview section.

**SVG dimensions:** `160×160px`, `viewBox="0 0 160 160"`  
**Circle geometry:** `cx=80, cy=80, r=60, stroke-width=20, stroke-linecap="butt"`  
**Segment gap:** `1.5` arc units  
**Start angle:** `transform="rotate(-90 80 80)"` on every circle

**Status color mapping:**

| Status | Color | Palette ref |
|--------|-------|-------------|
| Passed | `#256f3a` | Green/8 |
| Failed | `#aa0808` | Red/8 |
| Blocked | `#e76500` | Mango/6 |
| Aborted | `#475e75` | Grey/7 |
| Not Started | track (`#eaecee`) | Grey/2 |

**Center display:**

```css
.exec-center  { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.exec-big-pct { font-size: 1.9rem; font-weight: 900; color: #12171c; line-height: 1; }
.exec-sub     { font-size: 0.6rem; font-weight: 600; color: #8ea4b8; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 3px; }
```

**Hover behavior:** hovering any segment fades all other circles to `opacity: 0.22` via `.is-hovering` class on the SVG; center updates to show hovered count + label. Reverts on mouse-leave.

**Legend dots:** `12×12px`, `border-radius: 3px` (square-ish, not circular).
