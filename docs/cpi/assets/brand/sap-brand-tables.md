# SAP Brand — Tables

Theme: **Morning**

---

## Overview

### Types of Tables

- **Simple Table:** Standard tabular format for flat, non-hierarchical data in rows and columns.
- **Tree Table:** Hierarchical data with expandable/collapsible rows for sublevels (categories, subcategories).

### Build Types

- **Column-Based:** Columns represent categories/attributes; rows display data points.  
  Best for: comparing attributes side by side (financial reports, product comparisons), highlighting trends, use cases where the header defines the data context.
- **Row-Based:** Each row is a standalone entity; columns are supplementary attributes.  
  Best for: user lists, task trackers, inventory; row-level actions; compact layouts where column headers are secondary to the data.

### Customizable Options

- **Columns highlighting** (Column-Based): Emphasizes specific columns for quick identification of key data. Use for metrics or KPIs. Use sparingly.
- **Rows highlighting** (Row-Based): Draws attention to specific rows for easier navigation. Use for emphasizing important records. Use sparingly.

### Fixed Elements

- **Fixed First Column** (optional, column-based tables): First column stays visible during horizontal scrolling.
- **Fixed Column Name Row:** Header rows stay locked while scrolling vertically. Keeps column titles accessible for large datasets.

### Content Alignment inside Cells

Vertical alignment options:

| Alignment | When to use |
|-----------|-------------|
| Center (default) | Balanced layouts with short or single-line content |
| Top | Multi-line content or rows with varying content heights |
| Bottom | Visual alignment with adjacent components or totals |

---

## Table Structure

**Anatomy**
- Toolbar (optional)
- Row with Column Headers
- Group row (optional)
- Row with Cells
- Footnotes — `Body/XXS`

**Spacing**
- Between rows: no spacing
- Between table and footnotes: `Spacing/24`

---

## Toolbar

**Anatomy**
- Header (optional): `Heading/Bold/XXXS`
- Border: 1px (0.0625 rem)
- Buttons (optional): standard, icon, or segmented

**Spacing**
- Right/Left: `Spacing/16`
- Top/Bottom from Title: `Spacing/16`
- Between Title and Actions: `Spacing/32`
- Between Actions: `Spacing/8`
- Actions: center-aligned

**Color**
| Element | Color | Token |
|---------|-------|-------|
| Background | White | `Core/Surface/Neutral` |
| Header text | Grey/9 | `Table/Toolbar/TextAndIcon` |
| Border underline | Grey/3 | `Table/Toolbar/Border` |

---

## Column Header

**Anatomy**
- Text: `Navigation/Medium/XL`
- Icon (optional, can be hidden): 18×18 px (1.125×1.125 rem)
- Border Default/Hover/Pressed: 1px (0.0625 rem)
- Border Highlighted: 2px (0.125 rem)

**Spacing**
- Left/Right inside Cell: `Spacing/16`
- Top/Bottom inside Cell: `Spacing/12`
- Between Text and Icon: `Spacing/8`

**Sticky header**
- Shadow: `Shadow/M` — clip content left/right and top

**Color** — Text/Icons: Grey/9 · `Core/Text/Text` (Pressed: White · `Core/Text/ContrastText`)

| State | Background | BG Token | Border | Border Token |
|-------|------------|----------|--------|--------------|
| Default | White | `Table/Header/Default/Background` | Grey/3 | `Table/Header/Default/Border` |
| Hover | Blue/1 | `Table/Header/Hover/Background` | Grey/3 | `Table/Header/Hover/Border` |
| Pressed | Blue/9 | `Table/Header/Active/Background` | Grey/3 | `Table/Header/Active/Border` |
| Highlighted | White | `Core/Surface/Base` | Blue/8 | `Core/PrimaryActionFg` |

---

## Group Header

**Anatomy**
- Heading: `Heading/Medium/XXXXS`
- Icon Button: Icon Button, Tertiary, S size (collapse/expand)
- Border: 1px (0.0625 rem)

**Spacing**
- Left/Right inside Cell: `Spacing/16`
- Top/Bottom inside Cell: `Spacing/8`
- Between Icon and Heading: `Spacing/4`

**Color** — Text: Grey/9 · `Core/Text/Text`

| State | Background | BG Token | Border | Border Token |
|-------|------------|----------|--------|--------------|
| Regular | Grey/1 | `Core/Surface/Light` | Grey/3 | `Table/Item/Default/Border` |
| Hover | Grey/2 | `Core/Surface/Higher` | Grey/3 | `Table/Item/Hover/Border` |

---

## Table Cell

**Anatomy**
- Text: `Body/S`
- Icon (optional, can be hidden): 18×18 px (1.125×1.125 rem)
- Avatar
- Link
- Buttons: Primary, Secondary, Tertiary
- Digit: `Body/S` — right-aligned (LTR), left-aligned (RTL)

**Spacing**
- Left/Right padding: `Spacing/16`
- Top/Bottom padding: `Spacing/8`
- Between content elements inside cell: `Spacing/4`

**Sticky column**
- Shadow: `Shadow/M` — clip content top/bottom, left (LTR)

**Color** — Text/Icons: Grey/9 · `Core/Text/Text`

| State | Background | BG Token | Border | Border Token |
|-------|------------|----------|--------|--------------|
| Default | White | `Table/Item/Default/Background` | Grey/3 | `Table/Item/Default/Border` |
| Hover | Blue/1 | `Table/Item/Hover/Border`¹ | Grey/3 | `Table/Item/Hover/Border` |
| Highlighted | Grey/1 | `Table/Item/Hightlighted/Background` | Grey/3 | `Table/Item/Hightlighted/Border` |

> ¹ "Hightlighted" (sic) and `Table/Item/Hover/Border` as the Hover background token are verbatim from source.

---

## Additional Cell Content

**Buttons**
- Allow users to perform actions directly from the table (edit, delete, trigger functions).
- Default button size: S — maintains visual balance. Can be adjusted based on page needs.
- Place buttons in separate table cells. One or several actions per cell.

**Links**
- Provide navigation to other pages, detailed views, or related content.
- Text-based; styled to indicate clickability.
- Can link to external resources, other document sections, or other web pages.

**Avatars**
- Small images or icons representing users or entities, displayed alongside text.
- Provide a visual identifier for the associated person or item.
- Can be combined with a link.

**Digit**
- Numerical data (quantities, prices, dates, scores).
- Right-aligned (LTR) / left-aligned (RTL) for clarity and ease of comparison.

---

## Behavior and Interactions

### Column-based table

Two column types: **default** (standard format, no extra styling) and **highlighted** (visually distinct, for totals or critical metrics). Use highlighted columns sparingly.

Variants: Simple table Default · Simple table Highlighted · Tree table Default · Tree table Highlighted

### Row-based table

**Default rows:** no extra styling — clean, consistent look.  
**Highlighted rows:** visually distinct; emphasize active items or important records. Use sparingly.

Variants: Simple table Default · Simple table Row Highlighted · Tree table Default · Tree table Row Highlighted

### Group

Collapsible sections for organizing data. Users expand/collapse to focus on relevant data.

- **Open Group:** Whole group header area is clickable (accordion behavior).
- **Closed Group:** Rows belonging to the group are hidden.

### Scrolling

Scrollbars must be **visible by default** — no hover, drag, or interaction required to reveal them.

**Vertical scroll**
- Initial: Scrollbar appears when rows exceed viewport height.
- Scrolling: Thumb moves proportionally to scroll position.

**Horizontal scroll**
- Initial: Scrollbar appears when columns exceed viewport width.
- Scrolling: Thumb moves proportionally to scroll position.

**Sticky header**
- Initial: Header at top, visually consistent with table.
- Scrolling: Header rows stay fixed. A subtle shadow appears beneath while scrolling (fades when scrolling stops).

**Sticky first column**
- Initial: First column fixed, always visible.
- Scrolling: Column maintains position. Shadow appears on its edge to indicate scrollable content. Shadow disappears when scroll returns to the starting position (fully left).

### Several Lines in a Row

- **Row Height Adjustment:** Row height auto-increases to fit multi-line cell content. All text and elements stay fully visible without overflow.
- **Content Centering:** Other columns in the same row are vertically centered.

---

## Usage

### Simple Table

**Do**
- Use for flat lists (product list, contact details, schedule).
- Use for comparing data across multiple items in a clean, organized format.

**Don't**
- Use when data has hierarchical relationships (nested categories, parent-child).
- Use for unstructured content like lengthy paragraphs — tables are not designed for flowing text.
- Use when data is too detailed for meaningful tabular insights — prefer charts, diagrams, or summaries instead.

### Tree Table

**Do**
- Use for hierarchical data requiring users to explore parent-child relationships.
- Use when users need to navigate multiple levels of data granularity.

**Don't**
- Use when data is flat and a standard table would suffice.
- Use when hierarchy is too deep or complex to navigate effectively within a table.

---

## Design Guidelines

- **Do:** Align all cell content to the left — applies to text and all content types. Move spacing to the right of the longest table content.
- **Don't:** Align content to the right.

- **Do:** When comparing products, use a maximum of four items.
- **Don't:** Use more than five items for comparison. If more are needed, use Filter and Sort instead.

- **Do:** Use pagination for extensive data. Paginated tables usually do not require scrolling.

- **Do:** Use a scrollbar for long tables when rows exceed the viewport or container height.

- **Do:** Use a sticky header for long tables where the header would otherwise scroll out of view.
- **Don't:** Let users scroll past the table heading.

- **Do:** Use horizontal scroll when the table has more columns than fit in the viewport or container width.
- **Don't:** Try to fit all columns into the viewport — results in unreadable content.

---

## Assignee Avatars

Circular initials avatars for representing assignees in table rows. Color is deterministically derived from the name string so the same person always gets the same color.

### Anatomy

```css
.b-av {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  font-size: 0.5rem; font-weight: 700; color: #fff; letter-spacing: 0.02em;
  background: <derived>;   /* see palette below */
  flex-shrink: 0;
}
.b-av-wrap { display: inline-flex; align-items: center; gap: 0.42rem; vertical-align: middle; }
```

### Color Palette (20 colors)

Assigned by `charCodeSum % 20`. All provide sufficient contrast against white initials.

```js
const PALETTE = [
  '#0040b0','#0F828F','#2D7F5E','#5040A0','#B03060',
  '#6B3A2A','#A04000','#007070','#004060','#603080',
  '#406020','#802040','#205080','#706020','#304090',
  '#508030','#702060','#304830','#506870','#703020'
];
function avatarColor(name) {
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return PALETTE[sum % PALETTE.length];
}
```

### Initials Extraction

Handles "Last, First" (Jira default format) and "First Last":

```js
function initials(name) {
  if (name.includes(',')) {
    const [last, first] = name.split(',').map(s => s.trim());
    return ((first[0] || '') + (last[0] || '')).toUpperCase();
  }
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}
```

---

## Progressive Disclosure Rows

Collapsible row groups within tables. Used for out-of-scope features and resolved bugs — hidden by default to keep the primary view uncluttered.

### Separator Row

A full-width row acting as a toggle trigger, visually distinguishing the hidden group boundary.

```css
.sep-inner {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.42rem 0.6rem; cursor: pointer;
  color: #8ea4b8; font-size: 0.68rem; font-weight: 500;
  background: #f5f6f7; user-select: none;
}
.sep-inner:hover { color: #556475; }
```

### Toggle Icon

Circular icon toggling between `+` (collapsed) and `−` (expanded):

```css
.sep-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; border-radius: 50%;
  border: 1.5px solid #0070f2; color: #0070f2;
  font-size: 0.72rem; flex-shrink: 0;
}
```

### Toggle Behavior

```js
sepRow.addEventListener('click', () => {
  const expanded = sepRow.dataset.open === 'true';
  hiddenRows.forEach(r => r.style.display = expanded ? 'none' : 'table-row');
  icon.textContent = expanded ? '+' : '−';
  label.textContent = expanded ? collapsedLabel : expandedLabel;
  sepRow.dataset.open = String(!expanded);
});
```

Hidden rows start with `display: none`. When shown, apply `opacity: 0.62` to indicate secondary status.

### Variants

| Variant | Separator border | Used for |
|---------|-----------------|----------|
| Standard | None (bg `#f5f6f7`) | Out-of-scope features |
| Dashed | `border-top: 1px dashed rgba(142,164,184,.35)` | Resolved bugs |

