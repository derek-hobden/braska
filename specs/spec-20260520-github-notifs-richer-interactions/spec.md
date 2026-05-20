# Spec — GitHub panel: notifications tab richer interactions (#71)

Issue: https://github.com/derek-hobden/braska/issues/71 · branch: `gh-issue-71` · started: 2026-05-20T00:00:00Z

**Status:** Ready for commit. Draft PR until DELETE round-trip + visual verify in running app confirms ⚠ uncertain assumption.

## Issue body

> ## Problem
>
> In the right-hand GitHub panel, on the **Notifications** tab, clicking on a notification doesn't do anything meaningful. The overall functionality and UX feels thin and weak — there's no clear way to act on a notification beyond seeing it in the list.
>
> ## Suggestions
>
> Clicking a notification should do something useful (and/or there should be more actions exposed per-notification). Some options to consider:
>
> - Click → open the underlying issue / PR / discussion (in the embedded browser tab, or jump to it in the GitHub panel's Issues/PRs tabs).
> - Mark as read / mark as done.
> - Unsubscribe from the thread.
> - Snooze / archive.
> - Show the notification reason (mention, review-requested, assigned, etc.) more prominently.
> - Right-click context menu with the above actions.
>
> ## Acceptance
>
> - Clicking a notification has a clear, useful default action.
> - There is a discoverable way to perform the common notification actions (read / done / unsubscribe / open) without leaving the panel.

## Chosen approach

Three changes, scoped tight:

1. **Default click** on an Issue / PullRequest notification routes into the
   panel's own detail view by reusing the existing `directIssueNumber` /
   `directPRNumber` sentinel pattern (`renderer/app.js:250`). Non-routable
   types (CheckSuite, Discussion, Release, Commit) fall back to opening
   externally via `htmlUrl` when set; rows with `htmlUrl=null` are
   non-clickable (cursor stays default, no hover-pointer).
2. **Per-row "Mark as done" action** — small button visible on row hover,
   calls a new `gh:notification-thread-done` IPC handler that issues
   `DELETE /notifications/threads/{thread_id}`. Optimistically remove the row
   on success; on failure restore + surface inline error.
3. **Reason chip** — replace the thin `.gh-notif-reason` text with a colored
   chip carrying a human-readable label (`review_requested` → "review",
   `mention` → "mention", `assign` → "assigned", `ci_activity` → "CI",
   `subscribed` → "subscribed", others → raw value). Distinct background tint
   per category so the eye picks them out fast.

Deferred to follow-ups (out of v1 scope): right-click context menu,
unsubscribe, snooze/archive, open-in-embedded-browser-tab.

## Assumptions

- ✓ **confident** — `PATCH /notifications/threads/{thread_id}` works with
  the user's `repo` OAuth scope (no `notifications` scope required).
  - _Basis (reproducer)_: see research.md → Verified tool behavior →
    "`repo` OAuth scope is sufficient". `gh api -i -X PATCH
    /notifications/threads/23937025039` returned `HTTP/2.0 205 Reset Content`.

- ✓ **confident** — Routing via `ghState.directIssueNumber` and
  `directPRNumber` correctly short-circuits to the detail view because the
  consumer code already exists.
  - _Basis (file:line)_: `renderer/github-issues.js:26-32` and
    `renderer/github-prs.js:20-24` both detect and consume the sentinel at
    the top of their refresh function.

- ✓ **confident** — Notification objects from `gh api repos/{nwo}/notifications`
  expose a string `id` field usable as `thread_id`.
  - _Basis (reproducer)_: `gh api '/notifications?all=true&per_page=1'`
    returned `"id": "23937025039"`.

- ⚠ **uncertain** — `DELETE /notifications/threads/{thread_id}` (mark as
  done) accepts the same scopes as `PATCH` and behaves as documented (removes
  from inbox, idempotent on already-done).
  - _What I know_: GitHub REST docs list DELETE on the same path with the
    same scope set as PATCH; `X-Accepted-OAuth-Scopes: notifications, repo`
    is the same header value PATCH returned.
  - _Why uncertain_: not empirically tested — would have destructively
    marked the user's only available test thread as done. The IPC handler
    forwards the error message; first real-world use in the running app
    confirms it. Blocks the PR from leaving draft until a real round-trip
    succeeds in the app.

## Definition of done

- Clicking an Issue or PullRequest notification opens its detail view inside
  the panel without leaving the Notifications context (one click → detail).
- Hovering a row exposes a "Done" affordance that removes the row from the
  list on success.
- The notification reason is visible as a distinct chip (not the existing
  tiny grey text).
- Existing "Mark all read" still works and still marks the repo's
  notifications.
- All existing tests still pass; new tests cover the subject-type → routing
  decision.

## Up-front tests

- `test/github-notifications.test.js::routingDecision` — for subject.type
  `Issue` returns `{kind:'panel-issue'}`, `PullRequest` returns
  `{kind:'panel-pr'}`, `Discussion`/`Release`/`Commit`/`CheckSuite` returns
  `{kind:'external'}` when htmlUrl is set, `{kind:'none'}` when null.
- `test/github-notifications.test.js::reasonChipLabel` — known reasons map
  to short labels; unknown reason passes through.
- `test/github-notifications.test.js::subjectToHtmlUrl` — re-assert the
  existing `notificationSubjectToHtmlUrl` mapping is unchanged (regression
  net around the file we're touching).

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>`
deferred. Use **▶ Active** in bold on exactly one pending task at a time.

- [x] Extract pure helpers (`notifRoutingDecision`, `notifReasonChip`)
      into `renderer/notif-helpers.mjs` (ESM, no DOM deps); tests in
      `test/notif-helpers.test.mjs`. 14 tests added — full suite 95/95.

- [x] Added `gh:notification-thread-done` IPC handler in `main/github.js`
      (DELETE /notifications/threads/{thread_id}, numeric id validation);
      exposed `notificationThreadDone(workDir, threadId)` in `preload.js`.

- [x] Rewrote `refreshGitHubNotifs` in `renderer/github-panel.js`: default
      click routes Issue/PR rows via `ghState.directIssueNumber`/
      `directPRNumber`; non-routable rows with `htmlUrl` open externally;
      others are non-clickable. Hover-revealed "Done" button calls the new
      IPC, dims the row optimistically, restores on error with a 4-second
      inline error banner.

- [x] Styled the reason chip (category-tinted pill) and "Done" button
      (hover-revealed, green on hover) in `styles.css`. Existing
      `.gh-notif-reason` text removed; `.gh-notif-item` cursor defaults to
      `default` and becomes `pointer` only when `.is-clickable`.

## Verify

```bash
node --test 'test/**/*.test.{js,mjs}'
```

(`npm test` runs `node --test test/`, which fails under Node 25 with
`Cannot find module '.../test'` regardless of changes — pre-existing.
Recorded in `## Decisions`.)

## Size budget

Target: ≤8 files changed, ≤400 lines added/removed, ≤20 tasks. Breach is a
warning, not a block — see `## Course corrections` if breached.

## Decisions

- Reused existing branch `gh-issue-71` matching issue #71 (per fix-issue
  reuse rule); no new worktree created — already running in
  `/Users/derek/repos/braska.worktrees/gh-issue-71`.
- Chose **DELETE (mark as done)** over PATCH (mark as read) as the per-row
  action — per advisor: read leaves the row visible, which doesn't address
  the "thin and weak" complaint. Done removes the row.
- Skipped right-click context menu — no menu primitive in the renderer,
  inflates scope.
- Skipped open-in-embedded-browser as default click — disconnects the user
  from the panel's existing detail-view affordances (label edit, ticket
  linking, etc.).
- Skipped unsubscribe / snooze — single-action v1; record as follow-ups.
- Rows with `subject.url=null` (e.g. CheckSuite without html mapping) get
  no click target; "Done" still works on them.
- Baseline: `npm test` is broken under Node 25 (`node --test test/` fails
  with `Cannot find module`). Switched the Verify command to the working
  glob form. Not fixing `package.json` here — out of issue #71 scope.

## Don'ts (rejected approaches and disproved assumptions)

_Nothing recorded yet._

## Course corrections

- 2026-05-20 — Advisor caught two issues in the renderer wire-up:
  (1) row-click lookup used DOM index (`Array.indexOf`) into `result.data`,
  which desyncs after a Done click removes a row. Switched to lookup by
  `data-gh-notif-id` (`result.data.find(x => String(x.id) === rowId)`).
  (2) `ghState.hasActivity` was not reset when the last row was marked
  done one-at-a-time. Added the same reset path the "Mark all read"
  branch uses.

## Subagent notes

_None — research done in-process; the file inventory was small enough to
read directly._

## Follow-ups (deferred work)

- Right-click context menu surfacing read/done/unsubscribe/open + paste-link.
- `DELETE /notifications/threads/{thread_id}/subscription` for "Unsubscribe".
- Snooze (no GitHub REST API — would require local state).
- "Open in embedded browser tab" alternative for users who prefer not to
  leave the app.

## Open questions

- None.

## Baseline verify (pre-implementation)

_Populated at end of Phase 3._

## Verification results (post-implementation)

_Populated in Phase 5._
