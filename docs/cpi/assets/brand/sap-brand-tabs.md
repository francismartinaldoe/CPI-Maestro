# SAP Brand — Tabs

Theme: **Morning**

---

## Overview

Tabs organize related content into sections within a single view. Only one tab is active at a time; its associated content is displayed while all other panels are hidden. Displayed in a single row across the top of the content area. Can be used at page level or embedded within components (dialogs, filters).

**States**

| State | Description |
|-------|-------------|
| Default | Unselected, not hovered. Neutral styling. |
| Hover | Visual feedback (underline or background highlight). No content change. |
| Active | Currently selected. Bold + underline styling. |
| Disabled | Unavailable. Reduced emphasis. Opacity: 40%. |

---

## Types

**Text-Only Tabs** — may include Alert badge or Number badge.
- ✅ Short, clear labels; meaning fully conveyed by text; clean/minimal interfaces
- ❌ Labels are ambiguous or too similar; icons could significantly improve recognition

**Icon Tabs** — may include Alert badge.
- ✅ Improving recognition of categories; frequently used/high-priority views; icons add meaningful (not decorative) support
- ❌ Icons don't add clear meaning; space is limited; visual complexity outweighs benefit

**Process Tabs** — may include Alert badge.
- ✅ Multi-step flows (move between stages); lifecycle states (Planned, In Progress, Completed); related states visible and accessible
- ❌ Content sections are unrelated; flow is strictly linear and requires enforced completion → use Wizard instead; users need to compare multiple states side-by-side

---

## Anatomy — Text-Only Tabs

Overflow button appears on the **right side** when tabs exceed available space.  
Alignment: left-aligned by default (LTR), right-aligned (RTL).  
Counters & alerts: Alert Badge or Number Badge. May include counts in label text (e.g., "Inbox (3)"). Do not mix badge types within a tab set.

| Element | Spec |
|---------|------|
| Tab Container | Hug content |
| Label Font | `Navigation/Bold/XL` |
| Active indicator height | 3px · top rounded corners: 2px |
| Tab bottom border | 1px (0.063 rem) |
| Alert badge | Standard Alert badge component |
| Number badge | Standard Number Badge component |
| Overflow button | Tertiary, M size |

---

## Spacing

**Tabs → content area below**

| Breakpoint | Spacing |
|-----------|---------|
| XL–M | `Spacing/40` |
| S–XS | `Spacing/32` |

Applied by default unless overridden by page layout or editor settings.

**Text-Only Tab internal spacing**

| Element | Spacing |
|---------|---------|
| Top/Bottom | `Spacing/12` |
| Between tabs (standard) | `Spacing/32` · min `Spacing/16` if horizontal space is limited |
| Right/Left paddings | `Spacing/4` |
| Label → Number Badge | `Spacing/4` |
| Label → Alert Badge | `Spacing/2` |

---

## Color — Morning Theme (Text-Only Tabs)

Show attention badge only when new items are triggered from outside the app. Do not show when users add items themselves.

| State | Title color | Underline | Opacity | Title token | Underline token |
|-------|------------|-----------|---------|------------|----------------|
| Active | Blue/8 | Blue/8 | — | `Core/BrandSelection` | `Core/BrandSelection` |
| Inactive | Grey/9 | — | — | `Core/Text/Text` | — |
| Hover | Blue/8 | — | — | `Core/Text/BrandText` | — |
| Disabled | Grey/9 | — | 40% | `Core/Text/Text` | `Core/Disabled` (opacity) |

---

## Behavior & Interactions

**State transitions (Horizontal Tabs)**
- Initial: First tab active by default. Active content visible; all other panels hidden.
- Hover: Visual feedback only. No content change. Activation requires click or keyboard input.
- Active: Tab activates on click or keyboard. Previously active tab deactivates. Content panel updates to show selected tab's content.

**Alignment**
- Default: Left (LTR) / Right (RTL).
- Center: Use only when tab count is small and navigation remains visually balanced. Default to reading-direction alignment when in doubt.

**Overflow button**  
When tabs exceed available horizontal space, a Menu button appears at the right.

| Stage | Behavior |
|-------|----------|
| Initial | Menu button visible; items hidden to conserve space. First tab in Active state. |
| Interaction | Click → dropdown shows remaining tabs. Button state changes to Toggled. |
| Completion | User selects item → it replaces the last visible tab in the bar. Menu button resets to initial. |

Two overflow variants: overflow button (icon/text) · overflow dropdown.

---

## Usage & Design Guidelines

**Horizontal Tabs**
- ✅ Group related content to reduce cognitive load (forms, settings, dashboards)
- ✅ Familiar top-aligned tab navigation within a page or module
- ❌ Don't use for nested actions or metadata in the tab list
- ❌ Don't use to indicate progress — use a Progress Indicator instead
- ❌ Don't use when users need to compare two content groups side-by-side

**Vertical Tabs**
- ✅ Longer tab labels or descriptive text; secondary navigation (settings panel, admin); extra elements (tooltips, links) in tab list
- ❌ Narrow vertical layouts (e.g., modals); primary navigation contexts (less discoverable); simple lists that don't need extended label context

**Design rules**
- Labels: clear and short — **max 25 characters**
- **One row of tabs only.** If tabs spill into a second row, simplify the design.
- Place tabs **directly above** the content they switch. Never below or to the side.
- Max 2 lines per tab label (Icon or Text-Only). Avoid text wrapping whenever possible.
- When a tab is selected, the tab bar stays fixed — only the content area below changes. Do not move or scroll the tab bar on content switch.

---

## Filter Controls

Inline filter controls used within sections to filter chart data or table rows. **Not** navigation tabs — they never switch page-level content.

### ES Tags (multi-select filters)

Multiple tags can be active simultaneously. Used for filtering by execution status, test type, feature domain, etc.

```css
.es-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.es-tag {
  font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: 6px;
  border: 1px solid #a9b4be; background: #fff; color: #223548;
  cursor: pointer; font-family: '72', Arial, Helvetica, sans-serif;
}
.es-tag--active                    { border-color: #0070f2; color: #0070f2; }
.es-tag:hover:not(.es-tag--active) { background: #f5f6f7; }
```

| State | Border | Text | Background |
|-------|--------|------|------------|
| Default | Grey/4 `#a9b4be` | Grey/9 `#223548` | White |
| Active | Blue/7 `#0070f2` | Blue/7 `#0070f2` | White |
| Hover (inactive) | Grey/4 | Grey/9 | Grey/1 `#f5f6f7` |

### TES Tabs (single-select chart toggles)

Radio-style toggles for switching chart dataset views. Exactly one is always active.

```css
.tes-tabs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tes-tab {
  font-size: 12px; font-weight: 600;
  padding: 4px 12px; border-radius: 2rem;
  border: 1px solid #d9dde0; background: #fff; color: #556475;
  cursor: pointer; white-space: nowrap;
  font-family: '72', Arial, Helvetica, sans-serif;
}
.tes-tab--active { background: #0070f2; border-color: #0070f2; color: #fff; }
```

| State | Background | Border | Text |
|-------|------------|--------|------|
| Default | White | Grey/3 `#d9dde0` | Grey/7 `#556475` |
| Active | Blue/7 `#0070f2` | Blue/7 | White |

**Key difference from ES Tags:** TES Tabs use a solid fill on active (full pill); ES Tags use only a colored border + text. Use TES Tabs when exactly one view must always be selected; use ES Tags when zero or multiple selections are valid.
