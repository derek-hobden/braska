# Research — visual worktree hierarchy (#80)

## Problem summary

The braska sidebar currently renders all worktrees for a project as a flat list under the project's expand toggle. There is no visual indication of which branch a worktree was created from, so users cannot tell at a glance whether `sub-feature-x` will merge into `main` or into some intermediate feature branch. The request is to show a tree where worktrees branched from `main` are indented under it, and worktrees branched from another worktree's branch are indented further under that worktree.

## Approaches considered

### Approach A: Git reflog "Created from" parsing

Parse `git reflog show <branch> --format="%gs"` for each branch and extract the line matching `^branch: Created from <parent>`. This records the original branch name at creation time, regardless of whether the parent has since advanced.

- **Pros:** Records exactly what the user did (branched from X); stable even after parent branch advances or diverges; fast (~5ms per branch on local disk); works for all creation methods (`git checkout -b`, `git branch`, `git worktree add -b`).
- **Cons:** Requires one `git reflog show` subprocess per worktree branch (but these are cheap); returns `HEAD` when branching from a detached HEAD state (edge case); not available if `core.logAllRefUpdates = false` (rare, never the default).
- **Precedent:** VSCode's git extension reads reflog for similar per-branch metadata.

### Approach B: Ancestry / merge-base distance scoring

For each non-main branch, find which other worktree branch is its nearest ancestor by running `git merge-base --is-ancestor <candidate> <branch>` for every pair, picking the one with the smallest `git rev-list <candidate>..<branch> --count`.

- **Pros:** No dependency on reflog; pure topology.
- **Cons:** O(n²) subprocess calls; fundamentally broken once a parent branch advances past the branch point (parent is no longer an ancestor of the child). Reproducer confirmed this yields wrong results in practice.
- **Precedent:** Some GitHub UI heuristics use merge-base, but only for divergence display, not parenthood.

### Approach C: Store parent in Braska's own metadata

When the user creates a worktree via braska's UI, record `parentBranch` in the worktree's metadata stored under `~/.braska/projects/<name>/`.

- **Pros:** Perfectly accurate for worktrees created through braska; no extra git calls.
- **Cons:** Misses worktrees created outside braska (terminal, other IDEs); metadata must be migrated if the JSON key is added later; creates a new source of truth to keep synchronized.

### Approach D: Pure CSS visual nesting (manual user grouping)

Let users drag-reorder worktree rows into groups with indent CSS applied on drop.

- **Pros:** Fully explicit, no guessing.
- **Cons:** Manual work for users; no automation; requires DnD infrastructure not present in the codebase; defeats the stated goal of automatically showing where branches came from.

## Recommended approach

**Approach A — git reflog "Created from" parsing.**

Specifically:
1. In `main/projects.js`'s `getGitInfo()`, after parsing `git worktree list --porcelain`, fire one `git reflog show <branch> --format="%gs"` per worktree branch and extract the `branch: Created from <parent>` line. Add the result as `wt.parentBranch` on each worktree object (empty string for main/root, `null` if reflog is unavailable).
2. In `renderer/sidebar.js`'s `renderProjects()`, group the flat `p.worktrees` array into a tree before generating HTML: build a `Map<branch, children[]>`, assign root nodes (no `parentBranch` or `parentBranch` not in the worktree set) under main, then recurse to render child worktrees indented under their parent's row.
3. A new CSS class `wt-child` (or `data-depth` attribute controlling `padding-left`) drives the indentation — no new DOM structure needed beyond varying the left padding on `.worktree-item`.

This approach is correct (reflog records original creation parent even after parent advances), cheap (6 branches × 6ms = ~36ms, fully parallelizable with `Promise.all`), and requires no new IPC channels or preload APIs.

## Verified tool behavior

**Claim:** `git reflog show <branch> --format="%gs"` contains a line `branch: Created from <parentBranch>` that records the name of the branch that was the source when `<branch>` was created.

- **Reproducer:** `cd /tmp/wt-hierarchy-test/repo && git reflog show sub-feature --format="%gs" | grep "^branch: Created from"`
- **Observed output:** `branch: Created from feature-a`
- **Verdict:** Claim holds.
- **Implication:** This is the core mechanism; we can reliably extract `parentBranch` by running this command per worktree branch.

---

**Claim:** The reflog `Created from` entry remains accurate even after the parent branch receives new commits past the branch point.

- **Reproducer:** After committing onto `feature-a`: `git reflog show sub-feature --format="%gs" | grep "^branch: Created from"`
- **Observed output:** `branch: Created from feature-a`
- **Verdict:** Claim holds — reflog records the name at creation time, not the current tip SHA.
- **Implication:** The ancestry/merge-base approach (Approach B) is unreliable once parents advance; reflog is necessary.

---

**Claim:** The ancestry/merge-base distance approach fails once the parent branch has new commits beyond the branch point.

- **Reproducer:** After `feature-a` got new commits: `git merge-base --is-ancestor feature-a sub-feature && echo "ancestor" || echo "NOT ancestor"`
- **Observed output:** `NOT ancestor`
- **Verdict:** Claim holds — Approach B cannot be used.
- **Implication:** Approach A (reflog) is required.

---

**Claim:** `git worktree add -b <newbranch> <path> <startpoint>` records `branch: Created from <startpoint>` in the reflog, so worktrees created via braska's UI get the right parent automatically.

- **Reproducer:** `git worktree add /tmp/wt-hierarchy-test/wt-created-from-wt -b created-from-wt feature-a && git reflog show created-from-wt --format="%gs" | grep "^branch: Created from"`
- **Observed output:** `branch: Created from feature-a`
- **Verdict:** Claim holds.
- **Implication:** No separate metadata write is needed for braska-created worktrees; reflog covers them automatically.

---

**Claim:** When a branch is created from a detached HEAD, reflog records `branch: Created from HEAD` (not a branch name), which is ambiguous.

- **Reproducer:** `git checkout --detach HEAD && git checkout -b detached-child && git reflog show detached-child --format="%gs" | grep "^branch: Created from"`
- **Observed output:** `branch: Created from HEAD`
- **Verdict:** Claim holds.
- **Implication:** When `parentBranch === "HEAD"`, treat the worktree as a root-level child of main.

---

**Claim:** The main worktree (the original repo root) has no `branch: Created from` reflog entry.

- **Reproducer:** `git reflog show main --format="%gs" | grep "^branch: Created from"`
- **Observed output:** (no output)
- **Verdict:** Claim holds — absence of a match is the correct signal for "root."
- **Implication:** `parentBranch = null/""` correctly identifies the main worktree as the root.

---

**Claim:** Six reflog calls in parallel take under 50ms total (acceptable for the `getGitInfo` hot path).

- **Reproducer:** `time (for branch in main feature-a feature-b sub-feature newbranch created-from-wt; do git reflog show "$branch" --format="%gs" 2>/dev/null | grep "^branch: Created from" | head -1; done)`
- **Observed output:** `real 0m0.029s`
- **Verdict:** Claim holds — 29ms for 6 branches sequentially; with `Promise.all` the cost collapses to roughly one reflog call.
- **Implication:** Adding these calls to `getGitInfo` with `Promise.all` is safe and will not cause noticeable latency.

---

**Claim:** `git worktree list --porcelain` does not include any parent-branch information.

- **Reproducer:** `git worktree list --porcelain`
- **Observed output:** Only `worktree`, `HEAD`, `branch` fields.
- **Verdict:** Claim holds — no parent information is present.
- **Implication:** We cannot skip the reflog step; it is the only source of parent branch data.

---

## Unknowns

- **Reflog disabled repos:** If `core.logAllRefUpdates = false` (enterprise repos sometimes set this), reflog entries may not exist. The graceful degradation (show all as flat under main) is the right fallback.
- **Cloned repos where branch was created elsewhere:** If a worktree branch was pushed from a different machine, the local reflog may lack a `Created from` entry. Falls back to being displayed under main.
- **Very long reflog histories:** For branches with thousands of rebase/commit operations before the `Created from` line, the `grep | head -1` pipeline reads more lines than needed. The `Created from` entry appears at the oldest end of the reflog.
- **Parent branch not in current worktree set:** If `feature-a` is a branch that exists locally but has no worktree, and `sub-feature` branched from it, `sub-feature` falls back to being shown under main.

## Files inventory

- `main/projects.js` — `getGitInfo()` runs `git worktree list --porcelain` and builds the `worktrees` array; this is where `parentBranch` field must be added via `Promise.all` reflog calls.
- `renderer/sidebar.js` — `renderProjects()` at line 31 builds the flat worktree HTML; this is where the tree-building algorithm must be inserted.
- `styles.css` — `.worktree-item` has `padding: 3px 16px 3px 44px`; a new `.wt-child` class (or `data-depth` attribute) must vary that left padding to add visual indentation.
- `preload.js` — `window.projects.list()` at line 10 returns the result of `projects:list`; no new IPC channel or preload entry is needed since `parentBranch` is just another field on the worktree objects already flowing through.
- `main/git-worktree.js` — `git:worktree-add` handler; since reflog handles it automatically no changes needed here.
- `main/git-read.js` — `git:worktree-metrics` at line 141; the `detectDefaultBranch` logic should be reused when determining which worktree is the tree root.
