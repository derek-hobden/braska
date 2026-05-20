# Research — consolidate duplicate ⇣N arrows on main worktree row (#64)

## Problem summary

When the main worktree is on the default branch and origin is ahead of local HEAD, two identical ⇣N arrows appear: a purple one (`.unpulled` from `pushBehind`) and an orange one (`.stale` from `mainStale.originAhead`). They count the same commits — origin/defaultBranch ahead of local HEAD — so the user sees `⇣2 ⇣2` and must hover both to discover they're duplicates.

## Approaches considered

1. **Filter pushBehind in divergenceBadges via flag** — add a `suppressPushBehind` option to `divergenceBadges`. Pro: self-documenting. Con: leaks caller-specific logic into a general utility.
2. **Zero out pushBehind before calling divergenceBadges (sidebar-only)** — compute a local `mForBadges` with `pushBehind: 0` when the stale indicator is being shown. Pro: minimal blast radius. Con: relies on `mainStale.originAhead > 0` as a proxy for "wt is on default branch", which is not always correct (if main worktree is on a feature branch, both could be non-zero and independent).
3. **Add branch to metrics, then suppress pushBehind precisely (recommended)** — include `wt.branch` in the metrics object returned from `git:worktree-metrics`, then suppress pushBehind in the sidebar only when `m.isMain && m.branch === m.mainStale?.branch`. Pro: correct edge-case handling, minimal change. Con: one extra field on the metrics object.

## Recommended approach

Approach 3. Add `branch: wt.branch || null` to the metrics `m` object in `main/git-read.js:173`. In `renderer/sidebar.js`, construct `mForBadges` by zeroing out `pushBehind` when `m.isMain && m.branch && m.branch === m.mainStale?.branch`, then pass `mForBadges` to `divergenceBadges`. This correctly handles the edge case where the main worktree is checked out to something other than the default branch (they differ, so both arrows are preserved).

## Verified tool behavior

**Claim:** `wt.branch` from `getGitInfo` is already the short branch name (e.g. `'main'`), and `mainStale.branch` from `detectDefaultBranch` is also the short branch name, so a direct `===` comparison is sufficient.

**Reproducer:** Inspect the source:
- `main/projects.js:58` — `wt.branch = line.slice(7).replace('refs/heads/', '')` → strips `refs/heads/` prefix
- `main/git-read.js:4-18` — `detectDefaultBranch` returns the raw name after stripping `refs/remotes/origin/` prefix (e.g., `'main'`)

**Observed output:** Both produce bare branch names without any prefix.

**Verdict:** Claim holds. `===` comparison is safe.

**Implication for recommended approach:** No change needed.

---

No external tool behavior assumptions beyond POSIX file operations and straightforward JS object spread.

## Unknowns

- None. The fix is entirely within renderer JS and one main-process IPC handler.

## Files inventory

- `main/git-read.js:150-208` — `git:worktree-metrics` IPC handler; builds the metrics `m` per worktree. Key: `wt.branch` available but not included in `m`.
- `main/projects.js:51-63` — `getGitInfo` builds `wt` objects; `wt.branch` is the short branch name.
- `renderer/sidebar.js:97-120` — `refreshWorktreeMetrics`; calls `divergenceBadges` and builds `staleHtml`.
- `renderer/utils.js:312-334` — `divergenceBadges`; renders pushBehind as `.unpulled` badge.
