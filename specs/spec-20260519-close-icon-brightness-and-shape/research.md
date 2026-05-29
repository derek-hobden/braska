# Research — close icon (#44)

## Problem summary

The "remove project" button (`.remove-btn`) in the sidebar project list uses a plain `&times;` text character and is styled with `color: #555; opacity: 0.15` at rest, making it significantly dimmer than the adjacent todo and GitHub icons (`.project-section-link`) which use 14×14 SVGs at `color: #666; opacity: 0.5`. The issue asks for (1) brightness parity with those icons and (2) optionally switching to an X-in-a-circle SVG to match the circular visual language of the neighboring icons.

## Approaches considered

### A — CSS brightness fix only
Raise `.remove-btn` opacity from 0.15 → 0.5 at rest and 0.5 → 1 on project-item hover, to match `.project-section-link`. Keep `&times;` text.

- **Pros:** One-line CSS change, zero risk.
- **Cons:** A text character looks inconsistent next to SVG icons.
- **Precedent:** None found.

### B — CSS fix + replace `&times;` with XCircle SVG
Match brightness (same as A) and replace the text with a 14×14 XCircle SVG (circle + two diagonal lines), consistent with how `SVG_TODO` and `SVG_GITHUB` are defined in the same file.

- **Pros:** Visually consistent with the two icon peers; resolves both user complaints.
- **Cons:** Slightly more change than A, but still small and contained.
- **Precedent:** The existing `SVG_TODO` / `SVG_GITHUB` pattern in `renderer/sidebar.js` lines 21–22.

### C — Refactor remove-btn to share `.project-section-link` class
Add the `project-section-link` class to the remove-btn so it inherits all styles automatically, then override only the hover colour to keep the red destructive cue.

- **Pros:** Ties to a single source of truth.
- **Cons:** Mixing a button element with a div-oriented class; couples the visual contract to the link class, making future changes to section-link styling silently affect the remove button.
- **Precedent:** None found.

## Recommended approach

**B** — CSS brightness fix + XCircle SVG. It directly satisfies both requests in the issue, follows the established SVG-constant pattern in `sidebar.js`, and is a small, reviewable change.

## Unknowns

- Whether the red destructive hover (`color: #e55; background: #2a1515`) should be preserved — it is not mentioned in the issue. Assumption: keep it; it is a useful affordance.

## Files inventory

- `renderer/sidebar.js` (lines 21–22, 64): defines SVG constants and renders the `remove-btn` HTML — needs a new `SVG_CLOSE` constant and updated button inner HTML.
- `styles.css` (lines 96–109): defines `.remove-btn` styles — needs opacity/color alignment and a `display:inline-flex` layout tweak to host the SVG correctly.
