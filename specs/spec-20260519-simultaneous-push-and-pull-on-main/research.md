# Research: Simultaneous Push and Pull Deadlock (Issue #51)

## Problem summary

When a branch is in a diverged state — `pushAhead > 0` (local commits not yet pushed) AND `pushBehind > 0` (remote commits not yet pulled) with a clean working tree — Braska's journey zone shows two separate cards: a "Pull" card and a "Push" card. Clicking "Push" silently fails with a confusing "rejected — non-fast-forward" git error because git refuses to push when the remote is ahead. The user has no in-product guidance that pull must happen before push, creating the appearance of a deadlock.

## Approaches considered

1. **Hide push card when `pushBehind > 0` (minimal suppression)**
   - Description: In `journey-cards.mjs`, add `&& !div.pushBehind` to the Priority 5 push check so the push card only shows when there is nothing to pull.
   - Pros: Tiny diff (one line); removes the confusing push option while the pull card still guides the user.
   - Cons: After the user pulls, they have to wait for the next status refresh to see the push card — which happens automatically but isn't obvious. Also hides the fact that a push is pending.
   - Precedent: None in codebase.

2. **Add a "Pull & Push" sync card for the diverged state**
   - Description: Detect `pushAhead > 0 && pushBehind > 0 && dirtyCount === 0` as a distinct case and emit a single "sync" card with a "Pull & Push" primary button (plus a "Pull Only" secondary). The handler runs pull, then push sequentially.
   - Pros: Clear UX — one button solves the problem in one click; the card title makes the diverged state explicit; no hidden failure path.
   - Cons: Two new files touched (journey-cards.mjs + journey-zone.js); adds a new action string `pull-push`.
   - Precedent: GitHub Desktop, VS Code SCM all expose a "Sync" action for this exact state.

3. **Add a `git:sync` IPC handler (server-side sequencing)**
   - Description: New handler in `main/git-ops.js` that calls `git pull` then `git push` atomically, plus bridge in `preload.js`.
   - Pros: Main process owns the sequencing; easier to add a timeout or retry.
   - Cons: More files changed (main/git-ops.js, preload.js too); no real advantage over client-side sequencing since pull and push are already separate IPC calls that compose fine.
   - Precedent: `git:pull-latest-main` in `main/git-worktree.js` does multi-step sequencing but that's because it involves stash + merge logic.

4. **Auto-pull before push (transparent rebase/merge on push failure)**
   - Description: When `git push` returns `noUpstream: false` with "rejected" output, automatically issue a `git pull` and retry the push.
   - Pros: Invisible to the user — push "just works."
   - Cons: Dangerous — auto-pull can produce merge conflicts the user didn't initiate; violates YAGNI; hard to test reliably.
   - Precedent: Not in this codebase.

## Recommended approach

**Approach 2** (sync card). It provides the best UX at the lowest risk and does not require touching the main process or preload. Changes are confined to two renderer files:

- `renderer/journey-cards.mjs`: Add a new `sync` card case before the existing pull card check when `pushAhead > 0 && pushBehind > 0 && dirtyCount === 0`. Return early so neither the separate pull card nor the separate push card are emitted.
- `renderer/journey-zone.js`: Add a `pull-push` action handler that calls `window.gitOps.pull`, and on success calls `_doPush(workDir, { autoUpstream: false })`.

No IPC changes. No preload changes. The existing `git:pull` and `git:push` handlers compose correctly for sequential use.

## Unknowns

- If the pull creates merge conflicts, the user lands in the conflicts card on the next refresh — this is already handled by Priority 0. No extra work needed.
- The sync card shows `pushBehind` count even though the background fetcher may not have run yet; the count is accurate only after a fetch. This is the same limitation as the existing "Pull changes (N new)" card — not a regression.
- No automated way to test the `pull-push` action handler without a real Electron environment, but the pure `computeJourneyCards` function can be fully tested.

## Files inventory

- `renderer/journey-cards.mjs` — pure card computation; the diverged state is not currently detected as a distinct case (lines 24–31 show the pull card, lines 89–108 show the push card, with no mutual exclusion).
- `renderer/journey-zone.js` — click handler (`_handleJourneyAction`) dispatches pull and push actions (lines 246–264); `_doPush` is injected; both are available for the new `pull-push` handler.
- `main/git-ops.js` — `git:pull` (lines 111–130) and `git:push` (lines 132–141) IPC handlers; no locking or mutex that would cause the reported "deadlock."
- `main/git-read.js` — `git:status` computes `mainDivergence.pushAhead`, `.pushBehind`, `.hasUpstream` via `rev-list --left-right --count` (lines 123–132); on the default branch the `ahead/behind` fields are 0, only push-tracking fields are populated.
- `main/git-fetcher.js` — background fetcher with per-project `inFlight` flag; does NOT block push or pull IPC handlers (lines 17–46).
- `test/journey-cards.test.mjs` — existing pure tests for `computeJourneyCards`; new diverged-state tests go here.
