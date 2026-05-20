# Research — github notifications dot (#61)

## Problem summary

A small orange dot appears next to the GitHub icon in the project-level section links in the left sidebar. It is driven by polling `window.github.notifications()` and adding `has-activity` to a badge element. The user wants it gone.

## Approaches considered

1. **Remove the dot entirely (CSS + JS)** — Delete the `has-activity` CSS rule and the JS that sets it. Also remove the now-dead `clearGitHubBadgeForWorkDir` helper and its import in `github-panel.js`. Clean, no dead code left.
   - Pros: minimal surface, no dead logic.
   - Cons: none — the feature is explicitly unwanted.

2. **Hide via CSS only** — Set `display: none` on `.project-section-badge.has-activity::after`. Leaves the JS polling in place.
   - Pros: one-line change.
   - Cons: JS keeps fetching notifications every time badges refresh (wasted IPC calls), dead code path remains.

3. **Add a settings toggle** — Let users enable/disable the dot in settings.
   - Pros: reversible.
   - Cons: over-engineering for an explicitly unwanted feature; issue asks to "get rid of" it, not toggle it.

## Recommended approach

Option 1: full removal. Three files, four deletions. No lingering IPC calls, no dead CSS.

## Verified tool behavior

No external-tool behavior assumptions made. The change is pure file editing (JS + CSS); no shell commands, git semantics, or external APIs are involved.

## Unknowns

None.

## Files inventory

- `renderer/sidebar.js:132–141` — `clearGitHubBadgeForWorkDir` export; called from github-panel to optimistically clear the badge after mark-read.
- `renderer/sidebar.js:162–171` — inside `refreshProjectBadges`; fetches `window.github.notifications()` and toggles `has-activity` on `ghBadge`.
- `renderer/github-panel.js:9` — imports `clearGitHubBadgeForWorkDir` from sidebar.
- `renderer/github-panel.js:316` — calls `clearGitHubBadgeForWorkDir(workDir)` after mark-all-read.
- `styles.css:301–308` — `.project-section-badge.has-activity::after` renders the 6px orange dot.
