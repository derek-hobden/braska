# Research — GitHub panel: notifications tab richer interactions

Issue #71 · branch `gh-issue-71`

## Problem summary

The GitHub panel's Notifications tab lists notifications but rows have no
default click action. Only the small ↗ button (or cmd-click) opens the item
externally. Per-notification actions (mark done / unsubscribe), reason
prominence, and routing into the panel's own detail views are absent.

## Approaches considered

1. **Right-click context menu with full action set (read/done/unsubscribe/open)** —
   most flexible, but requires building a menu primitive (none exists in the
   renderer), inflates scope, and right-click is poorly discoverable. Reject.

2. **Embedded browser tab on click (open inside braska's `<webview>` tab)** —
   uniform behaviour for all subject types, but disconnects the user from the
   panel's existing Issue/PR detail flows (which support inline editing,
   labelling, linking to tickets). Reject as default.

3. **(chosen) Route click into the panel's own Issue/PR detail views; add a
   visible-on-hover per-row "Mark as done" button; render reason as colored
   chip.** — reuses `showGitHubIssueDetail` / `showGitHubPRDetail` and the
   existing `ghState.directIssueNumber` / `directPRNumber` sentinel pattern
   (`renderer/app.js:250`, `renderer/github-issues.js:28`, `renderer/github-prs.js:20`).
   Single high-value action (done) covers the "thin and weak" UX complaint.

## Verified tool behavior

### `repo` OAuth scope is sufficient for per-thread mark-as-read/done

The skill-runner's `gh` token holds scopes `gist, read:org, repo, workflow`
— no `notifications` scope. GitHub's `/notifications/threads/{thread_id}`
endpoint accepts `notifications` OR `repo` per `X-Accepted-OAuth-Scopes`.

```
$ gh api -i /notifications/threads/23937025039
HTTP/2.0 200 OK
X-Accepted-Oauth-Scopes: notifications, repo
X-Oauth-Scopes: gist, read:org, repo, workflow

$ gh api -i -X PATCH /notifications/threads/23937025039
HTTP/2.0 205 Reset Content
X-Accepted-Oauth-Scopes: notifications, repo
```

`PATCH` returns 205 (success) with `repo` scope alone. `DELETE` is documented
at the same endpoint with identical accepted scopes — assumed by parallel
structure (we did not destructively test DELETE; flagged in spec assumptions).

Why this matters: an earlier 404 test (`gh api -X PATCH /threads/00000000`)
returned `gh: This API operation needs the "notifications" scope`, but that
is the gh CLI's heuristic message on 404, not authoritative. The 205 on a
real thread is the authoritative signal.

### `subject.url` is `null` for some types

Per the existing main-process `notificationSubjectToHtmlUrl` regex
(`main/github.js:22`), only `issues|pulls|commits` API URLs are mapped to
html URLs. The user's actual notification inbox contains a `CheckSuite`
notification with `subject.url = null` — for these, `htmlUrl` is null and the
external-open affordance doesn't fire. Decision (recorded below): no fallback
URL for null-htmlUrl rows; they stay non-routable. Mark-as-done still works.

```
$ gh api '/notifications?all=true&per_page=1' | jq '.[0] | {id, reason, subject}'
{
  "id": "23937025039",
  "reason": "ci_activity",
  "subject": {
    "title": "Azure daily cost report workflow run failed for main branch",
    "url": null,
    "type": "CheckSuite"
  }
}
```

### Existing panel routing pattern

`renderer/app.js:250` `openIssueInPanel(workDir, issueNumber)` sets
`ghState.section = 'issues'; ghState.directIssueNumber = issueNumber;` then
calls `switchRightPanelTab('github')`. `refreshGitHubIssues`
(`renderer/github-issues.js:26-32`) consumes the sentinel and short-circuits
to `showGitHubIssueDetail`. PRs use the same pattern via `directPRNumber`
(`renderer/github-prs.js:20-24`).

When clicking a notification we are already inside the github panel and
section is already `notifs`. To route into the issue/PR detail view we
need to (a) set `ghState.section = 'prs' | 'issues'`, (b) set the direct-
sentinel, (c) call `refreshGitHub(workDir)`. Calling the panel-tab-switch is
unnecessary — we're already in github.

## Files inventory

- `renderer/github-panel.js` — owns the Notifications section; `refreshGitHubNotifs` at L305-384.
- `renderer/github-issues.js:26-32, 88-` — direct-jump consumer + `showGitHubIssueDetail`.
- `renderer/github-prs.js:20-24, 83-` — same for PRs.
- `main/github.js:305-326` — list + mark-all-read handlers.
- `main/github.js:18-32` — `notificationSubjectToHtmlUrl` mapping.
- `preload.js:138-139` — `notifications`, `notificationsMarkRead` bridge.
- `styles.css:3824-3870` — existing `.gh-notif-*` styles.
- `renderer/state.js:75` — `directPRNumber` sentinel (and `directIssueNumber` nearby).
- `test/` — node:test suite location.

## Unknowns

- None blocking. DELETE-on-thread (mark as done) is not empirically verified
  because we did not destructively test it; the spec records this as a
  ⚠ uncertain assumption that blocks ready-for-review until a real round-trip
  in the running app confirms it.
