# Research — Open GitHub items in browser from the GitHub panel (#66)

## Problem summary

The right-side GitHub panel surfaces five item types — the repo, PRs, issues, CI/workflow runs, and notifications. None of them currently offer any way to jump to the corresponding github.com page in the default browser. The user wants a consistent affordance across all five item types: discoverable once, works everywhere.

## Approaches considered

1. **Cmd-click only.** Match the `renderer/terminals.js:66` pattern. Quick, ~3 lines. Downside: invisible to anyone who doesn't know to try it.
2. **Always-visible external-link icon.** Discoverable, but adds visual noise to dense list rows.
3. **Always-visible icon + cmd-click.** Most discoverable, but doubles the affordance footprint.
4. **Hover-visible icon + cmd-click on the row.** Discoverable on hover (the issue text explicitly mentions "on hover"), invisible at rest, plus a power-user shortcut. **← chosen.**
5. **Right-click context menu via Electron `Menu.popup()`.** Cleanest mouse-only UX but a new IPC channel + menu wiring per row type. Out of scope for #66.

## Recommended approach

- One SVG external-link icon (`SVG_EXTERNAL_LINK`) in `renderer/utils.js`.
- One renderer helper that emits the icon as a button with `data-gh-external-url="<url>"`.
- One row of CSS: `.gh-ext-link { opacity: 0 }` then `.gh-item:hover .gh-ext-link, .gh-ci-item:hover .gh-ext-link, .gh-notif-item:hover .gh-ext-link, .gh-repo-header:hover .gh-ext-link { opacity: 1 }`.
- Each delegated click handler intercepts in this order: (1) `[data-gh-external-url]` click → openExternal + stopPropagation; (2) `event.metaKey` on the row → openExternal + return; (3) fall through to the existing detail-open behaviour.
- One new repo-header row inside `gh-inline-section`, above `#gh-content`, showing `owner/repo` + the icon. `ghState.cachedAuth.repo` already holds `{owner, name, url}`. `#gh-inline-section > .gh-subnav { display: none }` only hides immediate `.gh-subnav` children — the new header is unaffected.
- Notifications need the only piece of non-trivial logic: the REST `/notifications` endpoint returns `subject.url` as an API URL (`api.github.com/repos/X/Y/issues/N`), not an html URL. Translate server-side in `main/github.js` and emit `htmlUrl` on each notification. Rows whose subject URL can't be translated (Releases, Discussions, null) simply don't get an icon.

## Verified tool behavior

### `gh:notifications` response shape

GitHub REST `/repos/{owner}/{repo}/notifications` returns notifications with this subject shape (from the REST v3 docs, https://docs.github.com/en/rest/activity/notifications):
```
{
  "subject": {
    "title": "...",
    "url": "https://api.github.com/repos/octocat/Hello-World/issues/123",
    "latest_comment_url": "...",
    "type": "Issue" | "PullRequest" | "Commit" | "Release" | "Discussion" | ...
  }
}
```
The notification itself has **no** top-level html_url field; the html URL must be derived from `subject.url` + `subject.type`. Patterns:
- `api.github.com/repos/{X}/{Y}/issues/{N}` → `github.com/{X}/{Y}/issues/{N}`
- `api.github.com/repos/{X}/{Y}/pulls/{N}` → `github.com/{X}/{Y}/pull/{N}` (singular!)
- `api.github.com/repos/{X}/{Y}/commits/{SHA}` → `github.com/{X}/{Y}/commit/{SHA}` (singular!)
- Releases (ID, not tag): not deterministically derivable → return null.
- Discussions / null subject.url → return null.

### Existing IPC

`window.windowActions.openExternal(url)` is already exposed (preload.js:196 → main `window:open-external`). The handler validates the URL is `http:`/`https:`/`mailto:` before passing to `shell.openExternal`, so the renderer can pass any URL without additional sanitisation. Used by `renderer/terminals.js:66` (cmd-click in xterm) and `renderer/terminals.js:429` (web-links addon).

### `url` fields present on existing IPC responses

- `gh:pr-list` — `url` ✓ (gh-cli `--json url`)
- `gh:pr-view` — `url` ✓
- `gh:issue-list` — `url` ✓
- `gh:issue-view` — `url` ✓
- `gh:run-list` — `url` ✓ (added recently)
- `gh:run-view` — `url` ✓
- `gh:notifications` — needs html_url enrichment (see above)
- `ghState.cachedAuth.repo` — `url` ✓ (set in `main/github.js:34` via `gh repo view --json owner,name,url,defaultBranchRef`)

## Unknowns

None blocking. Releases / Discussion notifications will skip the icon, which is acceptable degradation.

## Files inventory

- `renderer/utils.js` — SVG constants and small helpers.
- `renderer/github-panel.js` — `refreshGitHub` (repo header), `refreshGitHubCI`, `refreshGitHubNotifs`.
- `renderer/github-prs.js` — PR list rows.
- `renderer/github-issues.js` — issue list rows.
- `main/github.js` — notification htmlUrl enrichment.
- `styles.css` — hover affordance.
- `test/notifications-html-url.test.js` — new test for the URL helper.
