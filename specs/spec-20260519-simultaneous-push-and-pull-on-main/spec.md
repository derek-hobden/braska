# Spec — simultaneous push and pull on main (#51)

Issue: [#51](https://github.com/derek-hobden/braska/issues/51) · PR: [#52](https://github.com/derek-hobden/braska/pull/52) · branch: `claude/issue-51` · started: 2026-05-19T00:00:00Z

**Status:** Complete; ready for review.

## Issue body

> I was on main recently, I had merged changes from a pr to remote main, and i had committed changes to local main. So I had changes to push, and changes to pull, both on main. The push and pull braska buttons were both not working as if there was some sort of deadlock. I was able to do it using the github CLI, but there is clearly a scenario here that braska cannot handle. try to find and solve the cause of this weird edge case.

## Chosen approach

When `pushAhead > 0 && pushBehind > 0 && dirtyCount === 0` (branch has diverged from its remote tracking branch), `journey-cards.mjs` currently emits both a pull card and a push card as separate journey cards. Clicking the push card triggers `git push`, which git rejects with "Updates were rejected because the remote contains work that you do not have locally" — a confusing failure with no in-product guidance. Clicking pull should work, but presenting push alongside it implies it's a valid immediate action.

The fix adds a distinct `sync` card case for the diverged state that replaces both the separate pull and push cards. The card title makes the situation explicit ("X ahead, Y behind") and offers "Pull & Push" as the primary action (sequential pull-then-push in the renderer) plus "Pull Only" as a secondary. No IPC changes are needed — the existing `git:pull` and `git:push` handlers compose correctly. Changes are confined to `renderer/journey-cards.mjs` (new card branch) and `renderer/journey-zone.js` (new `pull-push` action handler), with new pure unit tests in `test/journey-cards.test.mjs`.

## Assumptions

- ✓ **confident** — `git pull origin <branch>` succeeds (fast-forward or merge commit) when the working tree is clean, regardless of whether there are local unpushed commits. This is standard git behaviour.
- ✓ **confident** — After a successful pull that results in a merge commit, `git push` will push both the user's original commits and the merge commit. No special handling needed.
- ✓ **confident** — If pull produces merge conflicts, the next status refresh shows the `conflicts` card (Priority 0 in `computeJourneyCards`), which already handles this case.
- ✓ **confident** — The `_doPush` dep is available in `_handleJourneyAction` since it is injected via `initJourneyZone` in `renderer/journey-zone.js`.

## Definition of done

- When a branch has `pushAhead > 0 && pushBehind > 0` with a clean working tree, the journey zone shows a single "Sync with origin" card with "Pull & Push" and "Pull Only" buttons — NOT separate pull and push cards.
- Clicking "Pull & Push" calls `git pull`, then on success calls `git push`. If pull fails or produces conflicts, the error is shown and push is not attempted.
- Clicking "Pull Only" behaves identically to the existing pull action.
- When only `pushBehind > 0` (nothing to push), the existing "Pull changes" card still appears unchanged.
- When only `pushAhead > 0` (nothing to pull), the existing "Push" card still appears unchanged.
- All existing journey-cards tests pass.

## Up-front tests

- `test/journey-cards.test.mjs::diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean)` — asserts card key is `sync` and buttons include `pull-push` and `pull`.
- `test/journey-cards.test.mjs::diverged state — does NOT show separate pull-remote or share cards when diverged` — asserts neither `pull-remote` nor `share` keys appear in the diverged state.
- `test/journey-cards.test.mjs::diverged state — dirty files still gate pull and show commit card instead` — asserts that when `pushAhead > 0 && pushBehind > 0` but `dirtyCount > 0`, the commit card is shown (not sync card).

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred. Use **▶ Active** in bold on exactly one pending task at a time.

- [x] Write failing tests for diverged-state card in `test/journey-cards.test.mjs`
  - _Story: As a developer running the test suite, when I run `node --test test/journey-cards.test.mjs`, I see three new failing tests confirming the sync card is not yet produced._
  - _test: `test/journey-cards.test.mjs::diverged state — shows sync card...`_
- [x] Add `sync` card branch to `renderer/journey-cards.mjs` for the diverged state
  - _Story: As a user on main with 2 commits ahead and 1 behind, I see a "Sync with origin" card with "Pull & Push" and "Pull Only" buttons instead of separate pull and push cards._
  - _test: `test/journey-cards.test.mjs::diverged state — shows sync card...`_
- [x] Add `pull-push` action handler to `renderer/journey-zone.js`
  - _Story: As a user, when I click "Pull & Push", the branch pulls remote changes and immediately pushes local commits, with status updates ("Pulling…" → "Pushing…" → "Pulled & pushed" or error message)._
  - _test: manual (renderer action handler, no pure-unit harness)_

## Verify

Every command must exit 0 on success and non-zero on failure.

```bash
node --test test/journey-cards.test.mjs
node --test test/git-pull.test.js
node --test test/git-worktree.test.js
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches)

- **No `git:sync` IPC handler**: composing pull + push client-side in `journey-zone.js` is sufficient; adding a main-process handler would require touching `main/git-ops.js` and `preload.js` for no practical benefit.
- **No auto-pull on push failure**: silently pulling on rejection is dangerous (can produce unexpected merge conflicts) and undesirable in the YAGNI sense.

## Course corrections

_None yet._

## Subagent notes

Research subagent confirmed: `git-fetcher.js` has no locking that blocks push/pull IPC handlers. The `inFlight` flag in the fetcher only prevents concurrent fetch calls — it is unrelated to the push/pull deadlock appearance.

## Follow-ups (deferred work)

_None._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
