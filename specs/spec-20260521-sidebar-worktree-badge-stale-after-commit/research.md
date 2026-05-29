# Research — Sidebar worktree badge shows stale modified-files count after commit until manual refresh (#76)

## Problem summary

The sidebar worktree badge (the "14M" modified-files count pill) is rendered by `refreshWorktreeMetrics()` in `renderer/sidebar.js`. After a commit that clears all changes, the badge stays stale because the `filetree.onChange` handler in `app.js` calls `refreshChanges()` but not `refreshWorktreeMetrics()` — and the PTY `onExit` handler in `terminals.js` calls `refreshRightPanel()` (itself not touching the badge) gated only on the active worktree. Background-worktree commits are never refreshed through any path.

## Approaches considered

**Approach A — Add `refreshWorktreeMetrics()` to the `filetree.onChange` isGitChange branch (app.js)**
One-sentence: When the fs.watch fires for any `.git/`-prefixed filename (which happens on every commit), also call `refreshWorktreeMetrics()`.
- Pros: Covers all commit sources (manual modal, agent PTY, raw terminal git commands). Low-risk; the function is already called in `app.js`. Consistent with how every other git mutation (stage/unstage/discard/push/pull) works.
- Cons: Fires on every `.git/` event, not just commits — e.g. also on staging, which already calls `refreshWorktreeMetrics()` via the action path (double refresh). The 300 ms debounce window collapses all events in a burst, so in practice it fires once.
- Precedent: The same handler already calls `refreshChanges()` in this branch; `refreshWorktreeMetrics()` is the missing sibling call.

**Approach B — Add `refreshWorktreeMetrics()` to the PTY `onExit` handler in terminals.js**
One-sentence: When any agent PTY exits, call `refreshWorktreeMetrics()` unconditionally (not gated on `workDir === activeWorkDir`).
- Pros: Covers background worktree commits; the agent may have committed while the user was viewing a different worktree and the fs.watch only covers the active worktree.
- Cons: Fires on every agent exit, including exits that have nothing to do with git (e.g. a browser research session).
- Precedent: The `onExit` handler already calls `refreshRightPanel(workDir)` (gated on activeWorkDir), so adding a metrics call alongside it is a natural extension.

**Approach C — Combined: both A and B**
One-sentence: Apply both fixes so every commit path — fs.watch event, interactive PTY agent exit, background PTY agent exit — triggers a sidebar refresh.
- Pros: Exhaustive coverage; handles the active-worktree case fast (via fs.watch debounce) and the background-worktree case on exit. No single change is enough on its own.
- Cons: For an active-worktree commit by an agent, `refreshWorktreeMetrics()` will fire twice (once from the fs.watch, once from `onExit`). The function is already idempotent and called multiple times in other flows; the duplicate is harmless.
- Precedent: The existing `onPushSuccess` in `git-changes.js` already calls both `refreshChanges()` and `refreshWorktreeMetrics()` in the same codepath, accepting the double-call as the correct pattern.

**Approach D — Add a periodic metrics poll (e.g. every 30 s)**
One-sentence: Schedule a `setInterval` to call `refreshWorktreeMetrics()` periodically, independent of events.
- Pros: Catches any missed event (including external `git commit` in a terminal outside Braska).
- Cons: Architecturally inconsistent — every other metric refresh is event-driven; a poll adds latency and CPU budget concern.
- Precedent: None in the codebase for file-status metrics.

## Recommended approach

**Approach C (both A and B).**

Fix A handles the common case instantly (300 ms after any `.git/` write, regardless of whether the commit came from the modal, a PTY agent, or a raw terminal). Fix B additionally handles the gap where a committer agent exits after the user has switched to a different worktree tab — in that case the fs.watch is pointed at the new workDir, so fix A never fires for the original worktree. Both changes are single-line additions consistent with every other git mutation in the codebase.

## Verified tool behavior

**Claim 1:** `fs.watch(worktreeDir, { recursive: true })` fires events with `filename` values that start with `.git/` during a `git commit`.

- **Reproducer:** 
  ```sh
  mkdir -p /tmp/spec-stale-badge-smoke/testrepo
  cd /tmp/spec-stale-badge-smoke/testrepo
  git init && git config user.email t@t.com && git config user.name T
  echo hello > file.txt && git add file.txt && git commit -m init
  echo changed > file.txt && git add file.txt
  node watch_test.js
  ```
- **Observed output:**
  ```
  type=rename filename=".git/objects/01"
  type=change filename=".git/index"
  type=change filename=".git/COMMIT_EDITMSG"
  type=change filename=".git/logs/HEAD"
  type=change filename=".git/refs/heads/master"
  Total .git events: 14
  Has .git or .git/ prefixed filename: true
  ```
- **Verdict:** Claim holds.
- **Implication:** The `isGitChange` guard in `app.js` correctly identifies every commit event. Adding `refreshWorktreeMetrics()` in that branch will fire for every commit (debounced to one call per 300 ms burst).

---

**Claim 2:** The `app.js` `filetree.onChange` handler's `isGitChange` branch does NOT call `refreshWorktreeMetrics()`, it returns early after calling `refreshChanges()`.

- **Reproducer:** Read `/home/user/braska/renderer/app.js` lines 200–216.
- **Observed output:**
  ```js
  if (isGitChange) {
    const entry = document.querySelector(...);
    if (entry && !entry.classList.contains('is-git')) loadProjects();
    refreshChanges(tabState.activeWorkDir);
    return;   // <-- early return, no refreshWorktreeMetrics
  }
  ```
- **Verdict:** Claim holds.
- **Implication:** This is the primary missing call site for fix A.

---

**Claim 3:** The `terminals.js` `pty.onExit` handler calls `refreshRightPanel(workDir)` gated on `workDir === activeWorkDir`, but never calls `refreshWorktreeMetrics()`.

- **Reproducer:** Read `/home/user/braska/renderer/terminals.js` lines 128–135.
- **Observed output:**
  ```js
  window.pty.onExit(id, code => {
    ...
    if (agentName === 'committer') onCommitterExit(workDir);
    if (agentName === 'github-specialist') onGithubSpecialistExit(workDir);
    if (workDir === tabState.activeWorkDir) refreshRightPanel(workDir);
    // no refreshWorktreeMetrics call
  });
  ```
- **Verdict:** Claim holds.
- **Implication:** This is the missing call site for fix B; the `workDir === activeWorkDir` guard confirms why background-worktree commits are never covered.

---

**Claim 4:** `refreshRightPanel()` does not call `refreshWorktreeMetrics()`.

- **Reproducer:** Read `/home/user/braska/renderer/app.js` lines 85–94.
- **Observed output:**
  ```js
  export function refreshRightPanel(workDir) {
    const filetreePanel = document.getElementById('filetree-panel');
    if (filetreePanel.classList.contains('hidden') || !workDir) return;
    const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
    if (activePanel === 'changes') refreshChanges(workDir);
    else if (activePanel === 'todo') refreshTodos(workDir);
    else if (activePanel === 'github') refreshGitHub(workDir);
    else refreshFileTree(workDir);
  }
  ```
- **Verdict:** Claim holds.
- **Implication:** Confirms that even when `refreshRightPanel` is called on agent exit, it never updates the sidebar badge.

## Unknowns

- Whether non-main worktrees (those where `.git` is a file, not a directory) have the same fs.watch coverage for refs changes. The `main/files.js` watcher sets up a separate `gitWatcher` for the real git dir in those cases, emitting `.git/index` as the synthetic filename; whether it reliably catches refs changes from the real git dir for linked worktrees was not fully verified.
- Performance: `refreshWorktreeMetrics()` runs `git status --porcelain` plus multiple `git rev-list` calls per worktree. Repositories with many worktrees will take proportionally longer; no performance budget was measured.

## Files inventory

- `renderer/sidebar.js` — Defines `refreshWorktreeMetrics()` (calls `window.worktree.metrics`) and renders the `.wt-metrics` badge HTML.
- `renderer/app.js` — Entry point; contains the `filetree.onChange` handler where `refreshWorktreeMetrics()` is missing from the `isGitChange` branch. Also defines `refreshRightPanel()`.
- `renderer/terminals.js` — PTY onExit handler; calls `refreshRightPanel` for active worktree but not `refreshWorktreeMetrics`. Fix B goes here.
- `renderer/git-changes-modals.js` — Working reference: the manual commit modal `submitBtn` handler calls both `_refreshChanges(workDir)` and `_refreshWorktreeMetrics()` on success — this is the pattern the fix should replicate.
- `main/git-read.js` — `git:worktree-metrics` IPC handler; runs `git status --porcelain` per worktree to compute the counts.
- `main/files.js` — Implements `filetree:watch` IPC handler using `fs.watch({ recursive: true })`; emits `filetree:changed` with the filename that triggered the event.
- `preload.js` — Context-bridge wiring; `window.worktree.metrics` maps to `git:worktree-metrics`.
