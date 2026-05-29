# Research — Issue #68 (markdown + clickable links in right panel)

## Problem

Right-panel views for Issues, PRs, CI runs, and Notifications display
issue/PR bodies and comments as HTML-escaped plain text, so markdown
shows as raw syntax and URLs are not clickable. The fix is to render
markdown for the user-authored body fields and to intercept anchor
clicks in the panel so they open in the system browser.

## Verified tool behavior

### marked GFM autolinking (vendored `renderer/vendor/marked.esm.min.js`)

Smoke test (Node 25, gfm:true, breaks:false):

```
IN:  Plain text with a raw URL: https://example.com/foo
OUT: <p>Plain text with a raw URL: <a href="https://example.com/foo">https://example.com/foo</a></p>

IN:  A [labeled link](https://example.com) and `code blocks` and **bold**.
OUT: <p>A <a href="https://example.com">labeled link</a> and <code>code blocks</code> and <strong>bold</strong>.</p>

IN:  A bare email me@example.com
OUT: <p>A bare email <a href="mailto:me@example.com">me@example.com</a></p>
```

So GFM auto-links raw `https://`, `http://`, and bare emails (as `mailto:`).
That covers "URLs aren't clickable" with no extra work — marked emits anchors
which we then route to `openExternal`.

### Existing markdown rendering pattern in the renderer

- `renderer/markdown.js` exports `renderMarkdown(text)` — wraps `marked.parse`,
  strips dangerous tags (`script`, `iframe`, `object`, `embed`, `link`,
  `meta`, `style`, `base`), strips `on*` attrs and `javascript:` hrefs,
  and runs hljs over `pre > code[class*="language-"]`.
- `renderer/terminals.js:421-431` shows the established anchor-click
  interception pattern for rendered markdown:

  ```js
  preview.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    e.preventDefault();
    if (href && /^(https?:|mailto:)/i.test(href)) {
      window.windowActions.openExternal(href);
    }
  });
  ```

- `styles.css:3077-3205` already defines a complete `.markdown-body` typography
  ruleset (headings, lists, code blocks, blockquote, table, img, hljs). No need
  to reinvent — apply the class to the rendered containers.

### GitHub panel sub-views and their text rendering

| File | Container | Currently | Markdown source? |
|---|---|---|---|
| `renderer/github-issues.js:139` | `.gh-detail-body` (issue.body) | `escHtml` | yes (user-authored markdown) |
| `renderer/github-issues.js:180` | `.gh-comment-body` (issue comments) | `escHtml` | yes |
| `renderer/github-prs.js:105`    | `.gh-detail-body` (pr.body)    | `escHtml` | yes |
| `renderer/github-prs.js:132`    | `.gh-comment-body` (pr comments) | `escHtml` | yes |
| `renderer/github-panel.js:230`  | CI run `.gh-ci-title` (`run.displayTitle`) | `escHtml` | no — plain commit-message subject |
| `renderer/github-panel.js:277`  | run detail `.gh-detail-title` (`run.displayTitle`) | `escHtml` | no |
| `renderer/github-panel.js:336`  | notification `.gh-notif-title` (`subject.title`) | `escHtml` | no — plain title |

So markdown rendering applies to **issues and PRs only**. The "applies
consistently across all four views" line in the issue is satisfied by the
**anchor-click interception** living in `handleGhExternalClick` (in
`github-panel.js`), which is already called by every sub-view's click
handler — issues, PRs, CI, notifications — so one change covers all four.

### Existing event delegation

Every GitHub sub-view calls `handleGhExternalClick(e)` at the top of its
click handler and short-circuits on `true`:

- `github-panel.js:241` — CI list
- `github-panel.js:347` — notifications list
- `github-issues.js:70` — issues list
- `github-prs.js:65` — PR list

So extending `handleGhExternalClick` to also catch `a[href^="http"]` /
`mailto:` clicks gives us consistent link-open behavior across all four
sub-views without touching their wiring.

The two existing branches of `handleGhExternalClick`:

1. Explicit `[data-gh-external-url]` button (the `↗` link icon).
2. Cmd-click on a row carrying `[data-gh-row-url]`.

The new branch goes between (1) and (2): if the click target is an
`<a href>` matching `^(https?:|mailto:)`, prevent default, route to
`openExternal`, return `true`. Ordering matters — explicit
`[data-gh-external-url]` buttons stay first.

### Sanitizer note

`markdown.js`'s sanitizer does not strip `<img>`. GitHub-hosted images
in issue bodies will render. CSP allows external image loads. Not a
blocker — same behavior as the editor preview.

### Test runner

`package.json` defines `test = node --test test/`. On Node 25 this fails
because the runner treats `test/` as a module path rather than a directory
glob. Baseline: 1 failure (the script itself crashes before discovering
files). The actual test files pass cleanly when invoked as
`node --test test/*.test.js test/*.test.mjs` (81/81 pass). This is a
pre-existing baseline issue, out of scope for this PR.

## Files inventory (read)

- `CLAUDE.md` — project conventions, YAGNI > DRY, shell out for git/gh/claude
- `renderer/markdown.js` — existing renderMarkdown helper, 46 lines, has sanitizer + hljs
- `renderer/github-panel.js` — refreshGitHub, ci section, notifs section, handleGhExternalClick helper
- `renderer/github-issues.js` — issue list + detail + edit + label picker (452 lines)
- `renderer/github-prs.js` — PR list + detail + merge controls + create form (289 lines)
- `renderer/notifications.js` — Braska's internal terminal-activity notifier (unrelated to GitHub notifications view; out of scope)
- `renderer/terminals.js` — editor markdown preview wiring (reference for the anchor-click pattern)
- `styles.css` — `.gh-detail-body`, `.gh-comment-body`, `.markdown-body` rulesets
- `test/journey-cards.test.mjs` — confirms ESM renderer tests can use node:test
- `.github/workflows/claude.yml` — only triggers on `@claude` mentions; no PR-build CI
