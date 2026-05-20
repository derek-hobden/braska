# Spec — Right panel: render markdown nicely and make links clickable for issues, PRs, CI runs, notifications (#68)

Issue: https://github.com/derek-hobden/braska/issues/68 · branch: `gh-issue-68` · started: 2026-05-20T00:00:00Z

**Status:** Ready for commit (implementation done; tests 81/81 green; awaiting manual UI verification).

## Issue body

> When viewing issues, PRs, CI runs, or notifications in the right panel, the content currently isn't formatted well — markdown shows up as raw text and URLs aren't clickable.
>
> ## Expected
> - Markdown (headings, lists, code blocks, bold/italic, etc.) renders properly
> - Links (both raw URLs and markdown links) are clickable and open in the browser
> - Applies consistently across:
>   - Issues view
>   - PRs view
>   - CI runs view
>   - Notifications view

## Chosen approach

Two surgical changes:

1. **Markdown rendering for user-authored bodies.** In `github-issues.js`
   and `github-prs.js`, replace `escHtml(body)` with `renderMarkdown(body)`
   for the issue/PR detail body and for each comment body. Add the existing
   `.markdown-body` typography class to those containers so headings, lists,
   code blocks, and links inherit the same styling already used by the editor
   markdown preview (`styles.css:3077-3205`).

2. **Consistent link-open behavior across all four sub-views.** Extend
   `handleGhExternalClick(e)` in `github-panel.js` to also intercept clicks
   on `<a href>` elements whose href matches `/^(https?:|mailto:)/i`,
   route them to `window.windowActions.openExternal`, and return `true`.
   Insert the new branch *after* the `[data-gh-external-url]` button check
   and *before* the meta-key row-URL check. Every sub-view already calls
   this helper, so the change is one place that benefits all four views.

CI-runs and notifications views render plain commit-message titles and
notification subjects — not markdown — so they keep `escHtml`. The
"applies consistently" requirement is satisfied by the link-interception
change, which is the only link-related affordance those views have.

Drop `white-space: pre-wrap` from `.gh-detail-body` and `.gh-comment-body`
in `styles.css` because rendered markdown has its own block structure;
keeping `pre-wrap` would introduce unwanted whitespace inside paragraphs.

## Assumptions

- ✓ **confident** — marked v15 with `gfm: true` auto-links raw
  `https://`/`http://` URLs and bare emails (as `mailto:`).
  - _Basis (reproducer)_: see research.md → Verified tool behavior →
    "marked GFM autolinking".

- ✓ **confident** — `renderMarkdown` from `renderer/markdown.js` is the
  established markdown helper, strips dangerous tags, applies hljs to
  fenced code blocks, and is already used by `renderer/terminals.js` for
  the editor preview.
  - _Basis (file:line)_: `renderer/markdown.js:39` — `export function renderMarkdown(text)`.

- ✓ **confident** — Anchor clicks in the renderer would otherwise navigate
  the whole window; the established pattern is to listen for clicks,
  `preventDefault`, and call `window.windowActions.openExternal(href)`.
  - _Basis (file:line)_: `renderer/terminals.js:421-431` — editor preview wires this for `<a>` clicks.

- ✓ **confident** — `handleGhExternalClick` is called at the top of every
  GitHub sub-view's click handler, so extending it gives consistent
  link-open behavior across issues, PRs, CI runs, and notifications.
  - _Basis (file:line)_: calls at `renderer/github-panel.js:241`, `renderer/github-panel.js:347`, `renderer/github-issues.js:70`, `renderer/github-prs.js:65`.

- ✓ **confident** — `.markdown-body` already styles headings, lists, code,
  blockquote, table, img, and `a` for this app's dark theme.
  - _Basis (file:line)_: `styles.css:3077-3205`.

- ✓ **confident** — `npm test` on Node 25 fails because the script
  (`node --test test/`) interprets `test/` as a module path; the test
  *files* pass when invoked with explicit globs. Pre-existing baseline
  issue, not caused by this change.
  - _Basis (reproducer)_: see research.md → Test runner.

## Definition of done

A human launches the app, opens a project's GitHub panel, and verifies:

- An issue with a markdown body (headings, lists, code blocks, bold,
  inline code) renders those elements properly — not raw `## ` or `` ``` ``.
- Raw URLs in the body are clickable; clicking opens the system browser
  (not the renderer window).
- Markdown-style links `[text](url)` are clickable and open in the system browser.
- The same applies to comments below the issue.
- Same for a PR's body and comments.
- The CI runs and notifications sub-views still render correctly (no markdown
  rendering for their plain titles, but any anchor present is link-routed).
- Existing tests still pass: `node --test test/*.test.js test/*.test.mjs` exits 0
  with 81/81 tests passing.

## Up-front tests

This is a renderer-UI change; the existing node:test suite covers only
main-process handlers. No new automated tests — manual verification per
"Definition of done" is the actual gate. Existing `node --test` suite
must continue to pass.

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] Extend `handleGhExternalClick` to intercept anchor clicks
  - _Story: As a user, when I click a link inside any GitHub sub-view of the right panel, then it opens in my system browser (not inside the app)._
  - _Files: `renderer/github-panel.js`_

- [x] Render markdown in the Issues detail view (body + comments) + wire click delegate
  - _Story: As a user, when I open an issue, then the body and each comment render markdown (headings, lists, code blocks, bold, inline code) and auto-linked URLs._
  - _Files: `renderer/github-issues.js`_

- [x] Render markdown in the PRs detail view (body + comments) + wire click delegate
  - _Story: As a user, when I open a PR, then the body and each comment render markdown the same way as issues._
  - _Files: `renderer/github-prs.js`_

- [x] Update CSS — apply `.markdown-body` typography (added via class on rendered containers); drop `white-space: pre-wrap`
  - _Story: As a user, the rendered markdown looks polished — proper paragraph spacing, list bullets, code blocks._
  - _Files: `styles.css`_

## Verify

```bash
node --test test/*.test.js test/*.test.mjs
```

Manual verification (cannot be scripted, see Definition of done):

```bash
# Launch app and exercise issue/PR detail views in the right panel
npm start
```

## Size budget

Target: ≤8 files changed, ≤400 lines added/removed, ≤20 tasks.

## Decisions

- 2026-05-20 — Reused existing branch `gh-issue-68` (matches the
  `gh-issue-N` regex described in the skill's branch-reuse rule).
- 2026-05-20 — CI runs and notifications views are not given markdown
  rendering: their fields (`displayTitle`, `subject.title`) are plain
  commit-message subjects / notification titles, not user-authored markdown.
  The "applies consistently" requirement is met by the link-interception
  change, which is the only link-related affordance those views support.
- 2026-05-20 — `npm test` script in `package.json` is broken on Node 25
  (interprets `test/` as a module path). Pre-existing baseline failure;
  out of scope for this PR. Use `node --test test/*.test.js test/*.test.mjs`
  for verification.
- 2026-05-20 — Reusing the existing `.markdown-body` typography class
  rather than introducing a new `.gh-md` selector. The class is already
  battle-tested by the editor preview and provides every element style
  needed.
- 2026-05-20 — Image rendering (`![alt](url)`) is left enabled.
  `markdown.js`'s sanitizer does not strip `<img>`; behavior matches the
  editor preview. GitHub-hosted images load via https; no CSP change needed.

## Don'ts (rejected approaches and disproved assumptions)

_Nothing recorded yet._

## Course corrections

_Nothing recorded yet._

## Subagent notes

_Nothing recorded yet._

## Follow-ups (deferred work)

- Fix `package.json` `test` script for Node 25 (use explicit globs). Out of scope here.

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 3._

## Verification results (post-implementation)

_Populated in Phase 5._
