# Research: close icon (#37)

## Problem Summary

The "remove project" button in the sidebar project list uses a plain `&times;` HTML entity rendered as a tiny, low-opacity character. Compared to the neighbouring TODO and GitHub SVG icons — which share a consistent 14×14px stroke-based visual language — the close button is:

1. **Too dark at rest:** color `#555`, opacity `0.15`. The section-link icons use opacity `0.5` at rest, giving them much better presence.
2. **Stylistically inconsistent:** An HTML entity text character beside two SVG icons looks like a bug. It doesn't scale or colour cleanly with `currentColor`.
3. **Wrong shape:** The neighbouring icons are circular in design (check-in-circle for todos, Octocat disc for GitHub). The issue asks for an "x in a circle" to complete the family.

## Key Findings

### Current close button

**`renderer/sidebar.js` line 64:**
```html
<button class="remove-btn" title="Remove project">&times;</button>
```

**`styles.css` lines 96–109:**
```css
.remove-btn {
  background: none;
  border: none;
  color: #555;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  opacity: 0.15;
  flex-shrink: 0;
  transition: opacity 0.2s ease;
}
.project-item:hover .remove-btn { opacity: 0.5; }
.remove-btn:hover { opacity: 1 !important; color: #e55; background: #2a1515; }
```

### Neighbouring icons

**`renderer/sidebar.js` lines 21–22 (local SVG constants):**
- `SVG_TODO` — 14×14 stroke `currentColor` circle with checkmark
- `SVG_GITHUB` — 14×14 fill `currentColor` Octocat disc

**`styles.css` (`.project-section-link` block):**
```css
color: #666;       /* base */
opacity: 0.5;      /* at rest */
/* on hover: color #ccc, background #2a2a2a, opacity 1 */
```

## Approaches

### Approach A — Inline SVG in button, tune CSS only
Replace `&times;` with a feather/lucide `x-circle` SVG (circle + diagonals). Keep the `<button class="remove-btn">` wrapper; update CSS to match section-link opacity/colour. No new constant in utils.js.

**Pro:** Minimal surface area; no new exports; easy to verify.  
**Con:** SVG string lives in a template literal inside `sidebar.js` like the other two local constants (SVG_TODO/SVG_GITHUB) — that's already the local pattern so not actually a con.

### Approach B — Add SVG_X_CIRCLE to utils.js and import it
Define constant in utils.js, import in sidebar.js alongside SVG_FOLDER etc.

**Pro:** Follows the utils.js pattern for shared SVG constants.  
**Con:** YAGNI — this icon is only used in sidebar.js; two other icons (SVG_TODO, SVG_GITHUB) are already defined locally in sidebar.js without going through utils.js, so the established local pattern is fine.

### Approach C — Swap to a CSS-only circle using border-radius + pseudo-element
Style the button with `border-radius: 50%` and size it to look circular; keep the `×` entity.

**Pro:** No SVG.  
**Con:** HTML entity doesn't render crisply at 14px; won't inherit `currentColor` cleanly; doesn't match the SVG icon family visually.

## Recommended Approach

**Approach A** — inline SVG `x-circle` as a local constant in `sidebar.js` (matching the SVG_TODO/SVG_GITHUB pattern that is already there), plus CSS updates to `.remove-btn` to match `.project-section-link` opacity/colour.

SVG to use (feather `x-circle`, 14×14):
```svg
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
```

CSS changes:
- Remove `font-size` and `padding: 2px 6px` (replace with `padding: 4px` matching section-link)
- Change `color: #555` → `color: #666`
- Change `opacity: 0.15` → `opacity: 0.5`
- Keep hover: red tint (`color: #e55; background: #2a1515; opacity: 1`) — that's intentional UX for destructive action

## Unknowns

- None. The change is CSS + one string replacement in a single file. No interaction with IPC, state, or other subsystems.

No external lookup performed.
