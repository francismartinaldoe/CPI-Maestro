# SAP Brand — Typography

**Font family:** `'72Brand', '72', '72full', Arial, Helvetica, sans-serif`  
**Web font:** `Typography/Web/72BrandVariable-Th-Blk.woff2` (primary) · `.woff` (fallback)  
**Self-contained HTML:** only when explicitly requested — paste `Typography/Web/72brand-webfont.css` into `<style>` (base64 embedded, ~35k tokens, no external files needed). Default: use `@font-face` with file path instead.  
Variable font — weight axis Thin → Black.

```css
@font-face {
  font-family: '72Brand';
  src: url('Typography/Web/72BrandVariable-Th-Blk.woff2') format('woff2'),
       url('Typography/Web/72BrandVariable-Th-Blk.woff') format('woff');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
```

## Font Weights

| Name | `font-weight` |
|------|--------------|
| Thin | 100 |
| Extra Light | 200 |
| Light | 300 |
| Book | 350 |
| Regular | 400 |
| Medium | 500 |
| Bold | 700 |
| Black | 900 |

## Pre-defined Sizes

Base: `1rem = 16px`. Text and headings should be **left-aligned**.

**Display** — line-height: 1.1 · weights: Medium, Regular, Bold · use for Hero headings / statistics

| Name | rem |
|------|-----|
| Display/L  | 5.25 |
| Display/M  | 4.5  |
| Display/S  | 4    |
| Display/XS | 3.5  |

**Headings** — line-height: 1.1 · weights: Medium (recommended), Regular, Bold · color: `#000000`

| Name | rem |
|------|-----|
| Heading/XXXL  | 3     |
| Heading/XXL   | 2.75  |
| Heading/XL    | 2.5   |
| Heading/L     | 2.25  |
| Heading/M     | 2     |
| Heading/S     | 1.75  |
| Heading/XS    | 1.5   |
| Heading/XXS   | 1.25  |
| Heading/XXXS  | 1.125 |
| Heading/XXXXS | 1     |

**Body Copy** — line-height: 1.5 · weight: Regular · color: Grey-9 `#223548` · recommended: Body/S

| Name | rem |
|------|-----|
| Body/XXL | 1.75  |
| Body/XL  | 1.5   |
| Body/L   | 1.25  |
| Body/M   | 1.125 |
| Body/S   | 1     |
| Body/XS  | 0.875 |
| Body/XXS | 0.75  |

**Navigation** — line-height: 1.1 · weights: Medium, Regular, Bold · for nav and menu systems

| Name | rem |
|------|-----|
| Navigation/XL | 1     |
| Navigation/L  | 0.938 |
| Navigation/M  | 0.875 |
| Navigation/S  | 0.813 |
| Navigation/XS | 0.75  |

**Eyebrow** — line-height: 1.1 · weight: Medium only · use all-caps · for short descriptions above headlines

| Name | rem |
|------|-----|
| Eyebrow/L | 1     |
| Eyebrow/M | 0.875 |
| Eyebrow/S | 0.75  |

## Responsive Type Sizing

Body Copy stays fixed (Body/S) across all breakpoints. Buttons shrink at XS/S.

| Text Type | XL | L | M | S |
|-----------|----|---|---|---|
| Hero Heading | Heading/XXL | Heading/L | Heading/M | Heading/S |
| Hero Paragraph | Body/L | Body/M | Body/S | Body/S |
| Page Section Heading | Heading/XL | Heading/M | Heading/S | Heading/XS |
| Page Section Sub-heading | Body/L | Body/L | Body/L | Body/M |
| Small Headings | Heading/XXS | Heading/XXS | Heading/XXS | Heading/XXXS |
| Body Copy | Body/S | Body/S | Body/S | Body/S |

---

## Combined Token Pattern

Format: `{Category}/{Weight}/{Size}` — e.g. `Heading/Medium/XXXS` = 1.125rem, weight 500, line-height 1.1

Commonly referenced: `Heading/Medium/XXXS` · `Heading/Medium/XXXXS` · `Navigation/Medium/XL` · `Body/S`

Resolve any unlisted composite: look up size from the category table, weight from Font Weights, line-height from the category header (Heading/Navigation: 1.1 · Body: 1.5).
