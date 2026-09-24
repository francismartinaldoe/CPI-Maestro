# SAP Brand — Motion & Interaction

**Default to no animation.** Add motion only where it clarifies a state change, orients the user, or adds subtle delight. Never use motion decoratively or in bulk.

---

## Principles

- **Informative:** Every animation should clarify what changed — not obscure it.
- **Expressive:** Motion may add brand character, but remains secondary to function.
- **Natural:** Transitions reflect physical cues (inertia, weight, directional flow) so users can anticipate movement.

---

## Core CSS Values

| Property | Value |
|----------|-------|
| Duration | `300ms` |
| Easing | `ease` — slow start, sharp acceleration, gradual ease-out |
| Delay | None — duration alone provides sufficient timing |
| Properties | `opacity`, `transform` only — **never** `transition: all` |

```css
transition: opacity 300ms ease, transform 300ms ease;
```

### Duration Reference

`300ms` is the default. Deviate only for micro-feedback (shorter) and KPI reveals (longer):

| Interaction | Duration | Easing | Note |
|-------------|----------|--------|------|
| Button press / toggle | 100–150ms | `ease-out` | Immediate micro-feedback |
| Card shadow lift | 200ms | `ease-in-out` | Paired with `translateY(-2px)` |
| Panel expand / collapse | 250ms | `ease-in-out` | Layout shift — slightly slower feels physical |
| Page / route transition | 300ms | `ease-in-out` | Default |
| Stagger delay | +50ms per item | — | Additive delay per grid item, not duration change |
| KPI count-up | 800ms | `ease-out` | Only on initial viewport entry; never repeat |

Always pair shadow changes with `transform` in the same declaration. Always include:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; }
}
```

---

## Components WITHOUT Motion

These components are **static by design**. Do not add enter/exit animations to them.

| Component | Rule |
|-----------|------|
| Footer | Appears immediately, no animation. Only interactive children (links, icons) use hover transitions. |
| Tab nav highlighter / underline bar | Snaps instantly — no slide or fade. Applies to: Masthead, Tab nav, Side nav, Secondary nav, Pagination. |
| Filter container | No animation when switching categories or toggling filter types. Interactive elements inside (checkboxes, switches, links) may use standard hover. |

---

## Viewport & Scroll Rules

- Animate **only on viewport entry** — never continuously on scroll position.
- Avoid animations that push layout or cause jumps.
- Direction follows the user's scroll:
  - Scrolling vertically down → animate from below (bottom-to-top reveal)
  - Scrolling horizontally right → animate left-to-right
- Nested components must match the parent's direction (e.g., accordion opens down; content inside also animates downward).
- Lazy-loaded items animate in the direction of scroll.

---

## Animation Patterns

### Tile-based content (grid) — staggered reveal

Elements appear sequentially with a slight delay between each (domino effect).

- Animates **row by row**, following grid flow
- Each item: `opacity` fade-in + slight upward `transform` (translateY)
- Components: Resource center, Promo tiles, Tiles, Tile-based link-list

### Column-based content (layout) — synchronized row reveal

Entire row becomes visible at once, preserving column relationships and preventing visual noise.

- Reveal direction: Bottom-to-Top (vertical scroll) or Left-to-Right (horizontal blocks)
- Components: Universal layout

---

## Lazy Loading

Add `loading="lazy"` to all off-screen images and iframes. Defers loading until the element is almost in view — performance improvement with no visual trade-off.

```html
<img src="..." loading="lazy" alt="...">
<iframe src="..." loading="lazy"></iframe>
```
