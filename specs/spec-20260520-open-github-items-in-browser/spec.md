# Spec — Open GitHub items in browser from the GitHub panel (#66)

Issue: https://github.com/derek-hobden/braska/issues/66 · PR: https://github.com/derek-hobden/braska/pull/72 · branch: `gh-issue-66` · started: 2026-05-20T00:00:00Z

**Status:** Draft awaiting manual UI verification. 76/76 tests pass (8 new for the notification URL helper). No CI is configured for non-`@claude` events on this repo so CI cannot gate; the renderer is ESM with browser-only globals (`window.windowActions`, `document.*`) and `node --test` has no DOM, so the UI is not machine-verified in this PR.

## Issue body

> ## Problem
>
> When I click the GitHub icon on a project/repo and the GitHub panel opens on the right, there's no convenient way to jump to that resource on github.com in my browser.
>
> This applies to every item the panel surfaces:
> - The repo itself (top-level header / title)
> - PRs
> - Issues
> - CI runs / workflow runs
> - Notifications
>
> ## Desired UX
>
> Some nice affordance — e.g. a small external-link icon on hover, a right-click "Open on GitHub" menu, or cmd-click on the row — that opens the corresponding github.com URL in the default browser.
>
> Should feel consistent across all five item types so it's discoverable once and works everywhere.

## Chosen approach

Add one consistent affordance applied to all five item types in the GitHub panel: a small external-link icon visible on row hover, plus cmd-click on the row, both of which call the existing `window.windowActions.openExternal(url)` IPC. A new repo-header row above `#gh-content` surfaces the repo as a clickable item with the same affordance. Notifications gain an `htmlUrl` field — derived server-side from `subject.url` and `subject.type` — because the REST `/notifications` endpoint returns API URLs, not html URLs.

## Assumptions

- ✓ **confident** — `ghState.cachedAuth.repo` carries `{owner, name, url}` and is populated before `refreshGitHub` reaches `gh-content` rendering.
  - _Basis (file:line)_: `main/github.js:34` — `gh repo view --json owner,name,url,defaultBranchRef` runs in the `gh:auth-status` handler and the renderer caches the result at `renderer/github-panel.js:75`.

- ✓ **confident** — `window.windowActions.openExternal(url)` opens an `http(s):` URL in the user's default browser via Electron `shell.openExternal`, after validating the protocol.
  - _Basis (file:line)_: `preload.js:196` exposes the bridge; `main/browser-view.js:126-137` is the handler — explicit protocol whitelist.

- ✓ **confident** — `#gh-inline-section > .gh-subnav { display: none }` only hides immediate `.gh-subnav` children, so a new `.gh-repo-header` sibling above `#gh-content` is unaffected.
  - _Basis (file:line)_: `styles.css:1755` uses `>` direct-child combinator.

- ✓ **confident** — The github.com URL for an issue/PR/commit notification can be derived from its `subject.url` + `subject.type`. Releases require the tag (only the ID is in `subject.url`), so releases skip the icon.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → GitHub REST `/notifications` shape. Mapping rules: issues→issues, pulls→pull, commits→commit. Pluralisation difference is intentional (github.com is singular).

- ✓ **confident** — Existing delegated click handlers in `refreshGitHubPRs`, `refreshGitHubIssues`, `refreshGitHubCI`, `refreshGitHubNotifs` can be extended in-place. Each uses `ghResetListeners()` to scope listeners to a fresh `AbortController`.
  - _Basis (file:line)_: `renderer/github-panel.js:23-25`, called before each `content.addEventListener('click', ...)`.

## Definition of done

- Hovering over a repo, PR row, issue row, CI run row, or notification row reveals a small `↗` icon. Clicking it opens the corresponding github.com URL in the default browser.
- Cmd-clicking anywhere on those rows opens the github.com URL instead of opening the in-panel detail view.
- Existing left-click behaviour (opening the detail view, switching filters, etc.) is unchanged.
- For notifications referring to Releases/Discussions/unknown subject types, no icon is shown (better to omit than to synthesise a broken URL).
- `node --test test/` is green; the new notification URL helper has unit-test coverage.

## Up-front tests

- `test/notifications-html-url.test.js::notificationSubjectToHtmlUrl handles issues/pulls/commits and returns null for releases/discussions/null`

## Tasks

Statuses: `- [ ]` pending, `- [x]` done. **▶ Active** marks the next pending task.

- [x] Add `notificationSubjectToHtmlUrl(apiUrl, type)` to `main/github.js` (or a small adjacent file `main/github-notifications-url.js`), exported alongside `register`. Cover Issue, PullRequest, Commit, null/unknown.
  - _Story: As the notifications panel, when I have a subject `{url, type}`, I can ask for the html URL or get `null` so the renderer knows whether to show the icon._
  - _test: `test/notifications-html-url.test.js`_
- [x] Enrich `gh:notifications` handler so each returned notification has `htmlUrl` (possibly null) at the top level.
  - _Story: As the renderer, when I render a notification row, `n.htmlUrl` already tells me whether and where to link._
- [x] Add `SVG_EXTERNAL_LINK` to `renderer/utils.js`, plus a small helper `ghExtLink(url)` that returns the HTML for the icon button (empty string when url is falsy).
- [x] Update PR list rendering in `renderer/github-prs.js` to include `data-gh-row-url` on each `.gh-item` and the `ghExtLink(pr.url)` inside. Extend the delegated handler to (1) intercept `[data-gh-external-url]` clicks, (2) intercept `metaKey` row clicks, then (3) fall through to the existing detail-open.
- [x] Same change in `renderer/github-issues.js` for the issue list.
- [x] Same change in `renderer/github-panel.js::refreshGitHubCI` for the CI list (`run.url`).
- [x] Same change in `renderer/github-panel.js::refreshGitHubNotifs` for the notifications list — skip the icon and skip cmd-click handling for rows where `n.htmlUrl` is null.
- [x] Add a repo-header row in `renderer/github-panel.js::refreshGitHub` above `#gh-content`, showing `owner/repo` with the icon. Skip when `ghState.cachedAuth.repo` is missing.
- [x] Add CSS in `styles.css`: `.gh-ext-link` button base style (transparent, small, currentColor SVG) hidden at opacity 0; visible on `.gh-item:hover`, `.gh-ci-item:hover`, `.gh-notif-item:hover`, `.gh-repo-header:hover`. Plus `.gh-repo-header` styling.

## Verify

```bash
cd /Users/derek/repos/braska && node --test test/*.test.js test/*.test.mjs
```

## Size budget

Target: ≤8 files changed, ≤400 lines added/removed, ≤20 tasks. Breach is a warning, not a block.

## Decisions

- 2026-05-20: Reused existing branch `gh-issue-66` and existing worktree `/Users/derek/repos/braska.worktrees/gh-issue-66` — both already match issue #66 per the skill's branch-already-encodes-the-issue rule.
- 2026-05-20: Spec-location cached as `tracked:specs` (matches the repo's existing `specs/spec-*` convention).
- 2026-05-20: Chose hover-visible icon + metaKey row-click over an always-visible icon and over a native context menu. Hover matches the issue text and keeps dense list rows uncluttered. Right-click context menu would need an Electron IPC + Menu.popup per row type and is out of scope.
- 2026-05-20: Notification URL helper lives in `main/github.js` (server-side enrichment) rather than the renderer — keeps renderer code DOM-only and makes the only non-trivial mapping testable via `node --test`.
- 2026-05-20: Skipping detail-view icons (PR detail, issue detail, CI run detail). The list-row affordance covers every item type once; doubling up on detail pages adds touchpoints without proportional UX value.
- 2026-05-20: Releases / Discussions / null `subject.url` → emit `htmlUrl: null` and the renderer omits the icon. Better than synthesising a wrong URL.
- 2026-05-20: Baseline: `npm test` / `node --test test/` fails on Node 25.8.1 with `Cannot find module '/.../test'`. Node 25 changed how `--test <dir>` resolves — the directory-walk mode is broken on the current local Node. Workaround for Verify: invoke with explicit globs `node --test test/*.test.js test/*.test.mjs`. The CI workflow (`claude.yml`) only runs on `@claude` mentions, not on push/PR, so this does not gate the PR. Filed as a follow-up: update `package.json` `test` script or document the Node-25 break.

## Don'ts (rejected approaches and disproved assumptions)

- ✗ Don't translate the notification API URL in the renderer. The renderer must not know about REST URL shapes; it would also make the mapping untestable through the existing `node --test` setup.
- ✗ Don't add `--delete-branch` style "force every notification to have a URL" workaround. Releases need the tag, not the ID; synthesising a 404 link is worse than no link.
- ✗ Don't add the icon to detail-view headers in this PR — explicit scope cap.

## Course corrections

_Nothing recorded yet._

## Subagent notes

_None._

## Follow-ups (deferred work)

- A native Electron right-click context menu ("Copy GitHub URL", "Open on GitHub") for power users.
- Icon affordance on detail-view headers (PR detail, issue detail, CI run detail).

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 3 by the verify script._

## Verification results (post-implementation)

_Populated in Phase 5._
