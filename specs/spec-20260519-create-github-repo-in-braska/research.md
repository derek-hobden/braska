# Research — ability to create github repo in braska directly (#39)

## 1. Problem Summary

A user who starts a new local project, uses Braska's "Initialize Repository" button to run `git init`, then wants to publish that repo to GitHub — all without leaving the app. The feature needs to collect: which GitHub account/org to create under, the repo name, public vs private visibility, and a description. After creation it should wire up the `origin` remote and push the initial commit (if any).

---

## 2. Verified Codebase Facts

**`gh:auth-status` return shape** (`main/github.js` lines 18–38):
`{ authenticated, user, isGitHubRepo, repo }` — `isGitHubRepo` is set by running `gh repo view` in `cwd`. Requires a network call. Already distinguishes "no GitHub remote" from "connected", but is a network call and runs cwd-relative.

**`git:status` return shape** (`main/git-read.js` line 135):
`{ isGit, branch, unstaged, staged, untracked, conflicted, mainDivergence, mainStale }` — no `hasRemote` or `isGitHub` field. Called on every panel refresh (hot path).

**Remote detection already exists in 3 places:**
- `main/projects.js` `getGitInfo()` — `git remote get-url origin`, sets `isGitHub` (sidebar/projects list).
- `main/git-worktree.js` `git:is-github-repo` handler — same pattern, exposed via `window.worktree.isGitHubRepo(workDir)`.
- `main/git-worktree.js` `git:pull-latest-main` — one-off check inside a mutation handler.

**"Initialize Repository" flow** (`renderer/git-changes.js` lines 285–311): When `status.isGit === false`, panel renders `<div class="changes-not-git">` with an "Initialize Repository" button. After `window.gitOps.init(workDir)` succeeds, calls `refreshChanges(workDir)` and `_loadProjects()`. Natural insertion point for "Publish to GitHub" as the next step.

**`gh repo create` CLI**: `gh repo create <name> --public|--private [--description "..."] [--source . --push]` handles the full workflow in one command.

**Account/org enumeration**: `gh api /user` (personal user) and `gh api /user/orgs` (orgs the user belongs to) together give the full list of owners.

**`clone-modal.js`** is the best reference implementation: two-tab modal, list loading, error states, calls `window.github.*` IPC then `window.projects.addCloned()`.

---

## 3. Four Plausible Approaches

**Approach A — Post-init prompt in `git-changes.js`**
After `git:init` succeeds, immediately open a modal offering "Publish to GitHub". Trigger is at the exact moment the user created a local repo.
- **Pro:** Zero friction — user is already looking at the changes panel.
- **Con:** Inline state complexity in `git-changes.js`; the panel doesn't own modal state today.

**Approach B — Journey zone card for "local git, no remote"**
Add a card in `journey-cards.mjs` firing when `isGit && !hasRemote`. Requires adding `hasRemote` to `git:status`.
- **Pro:** Journey zone is the canonical home for "what to do next" guidance.
- **Con:** Adds a `git remote` syscall to the hot path (though cheap — reads `.git/config`, no network).

**Approach C — Lazy check via `worktree.isGitHubRepo` + journey card**
Keep `git:status` clean; fire a one-time lazy call to `window.worktree.isGitHubRepo(workDir)` and cache in `gitState`.
- **Pro:** No hot-path overhead.
- **Con:** Async complexity — a second refresh or a `gitState` flag triggers re-render; journey zone currently computes cards synchronously from `status` alone.

**Approach D — "Publish" button in non-git / post-init state only**
Show "Publish to GitHub" only inside the `changes-not-git` block as a second button shown after init.
- **Pro:** Simplest scope; no changes to `git:status`, journey zone, or detection.
- **Con:** Misses existing local-only repos with no remote; discoverability is poor.

---

## 4. Industry Precedent

**VS Code:** When a git repo has no `origin` remote, shows "Publish Branch" in the Source Control header. Triggers GitHub extension flow: enumerates user + orgs via GitHub API, presents quick-pick, asks public/private, creates via REST API, adds remote, pushes. Repo name defaults to folder basename.

**GitHub Desktop:** Shows "Publish repository" button in toolbar whenever the current repo has no remote. Modal with: name (pre-filled), description, "Keep this code private" checkbox, organization dropdown. Calls GitHub REST API directly.

**IntelliJ IDEA:** VCS → Share Project on GitHub. Dialog with remote name, GitHub account selector, repo name, description, private checkbox.

**Common pattern:** (1) default name = folder basename, (2) account selector = personal + orgs, (3) visibility default = private, (4) optional description, (5) auto-add remote + push after creation.

---

## 5. Recommended Approach

**Combine Approach A and B** — a `PublishModal` triggered from two entry points.

**Entry point 1 (post-init):** After `git:init` succeeds in `git-changes.js`, automatically open the modal pre-filled with the folder basename. Highest-signal moment, zero extra detection needed.

**Entry point 2 (existing local repos):** In `journey-cards.mjs`, add a `publish-to-github` card when `status.hasRemote === false`. Detect `hasRemote` by adding a single `git remote` call inside `git:status` — this is a pure local read (reads `.git/config`, no network), cheap, consistent with other divergence info computed there.

**New IPC `gh:repo-create`** in `main/github.js` using `gh repo create <owner>/<name> --public|--private [--description "..."] --source <workDir> --remote origin --push`.

**New IPC `gh:list-accounts`** that calls `gh api /user` + `gh api /user/orgs?per_page=100` and returns `[{ login, type: 'user'|'org' }]`.

**New modal** `renderer/publish-modal.js` (modelled on `clone-modal.js`): repo name, owner picker, visibility radio (private default), optional description.

**Preload additions**: `window.github.repoCreate(workDir, name, owner, isPrivate, description)` and `window.github.listAccounts()`.

---

## 6. Unknowns

1. **No-commits edge case:** If the local repo has no commits yet, `gh repo create --source . --push` will fail (nothing to push). Need to detect via `git rev-parse HEAD` and skip `--push` or warn the user.

2. **`gh repo create` org syntax:** Whether to use `<org>/<name>` as positional arg vs `--org <org>` flag. Verify with `gh repo create --help` at runtime.

3. **`gh api /user/orgs` pagination:** Default returns 30; need `per_page=100` consistent with `gh:list-repos`.

4. **SSH vs HTTPS remote URL:** `gh repo create --source . --push` sets the remote using whatever protocol `gh` is configured for. A push failure after creation (credentials mismatch) should surface the remote URL so the user can push manually.

5. **Modal placement in `index.html`:** A new `<div id="publish-modal">` must be added.
