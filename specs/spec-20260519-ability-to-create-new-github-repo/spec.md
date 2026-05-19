# Spec — ability to create new GitHub repo directly from braska (#46)

Issue: [#46](https://github.com/derek-hobden/braska/issues/46) · PR: [#47](https://github.com/derek-hobden/braska/pull/47) · branch: `claude/issue-46` · started: 2026-05-19T14:00:00Z

**Status:** Implementation complete; tidy and verify in progress.

## Issue body

> it would be cool if after I start a new project on my laptop, and use the button in braska to init a git repo, I could then turn the repo into a GitHub repo from inside brisk too. it should ask which account I want to create it on, what the name of the repo should be, if it should be public or private, and anything else you can think of that makes sense.

## Chosen approach

Add a "Create on GitHub…" button to the existing "Not a GitHub repository" screen in the GitHub panel (`renderer/github-panel.js` lines 105–112). Clicking it opens a new modal (`#create-repo-modal`) that asks for owner (dropdown populated from `gh api /user` + `gh api /user/orgs`), repo name (pre-filled from the local folder name), visibility (Public/Private radio), optional description, and a "Push now" checkbox (default on). The modal calls a new `gh:repo-create` IPC handler that shells out to `gh repo create <owner>/<name> --source <workDir> --remote origin [--push] [--public|--private] [--description <desc>]`. On success, `ghState.cachedAuth` is invalidated and `refreshGitHub` is called so the panel flips to the normal GitHub view.

Chosen over the sidebar popover and worktree context menu alternatives because (a) the "Not a GitHub repository" screen already shows at exactly the right moment with zero extra navigation, (b) it requires no new UI scaffolding beyond the modal, and (c) it mirrors the existing clone modal pattern exactly.

## Assumptions

- ✓ **confident** — `gh repo create <owner>/<name> --source <path> --remote origin [--push]` is the correct invocation: documented in `gh` CLI ≥2.0; `--source`, `--remote`, `--push` are stable flags.
- ✓ **confident** — `gh api /user` returns `{ login, ... }` and `gh api /user/orgs` returns `[{ login, ... }, ...]`: standard GitHub REST API v3 shape, stable.
- ✓ **confident** — Adding new fields to `modalState` in `state.js` is the correct pattern for modal-local state; the clone and worktree modals already do this.
- ⚠ **uncertain** — `gh api /user/orgs` returns orgs where the user is a *member*; it may not include orgs where `repo:create` is granted. Users may see an auth/permissions error from GitHub if they choose an org without repo-creation rights. We surface `gh`'s error message in the modal rather than pre-filtering the list, which is acceptable.
- ⚠ **uncertain** — Behavior of `gh repo create --source . --push` on a repo with zero commits (no HEAD). `gh` is expected to return a clear error message in this case; we pass it through unchanged. Users who haven't committed yet will see the error and know to commit first.

## Definition of done

- A "Create on GitHub…" button appears in the GitHub panel when the current project is a git repo but not a GitHub repo (`isGitHubRepo === false`, `authenticated === true`).
- The modal has: Owner dropdown (user + orgs), Repo name text input (pre-filled from folder name), Public/Private radio, optional Description input, "Push now" checkbox (default on).
- Submitting the modal calls `gh repo create` and shows inline errors on failure.
- On success the GitHub panel refreshes and shows the new repo's PRs/Issues/CI view.
- The `gh:repo-create` IPC handler validates name/owner before calling `gh`.
- All existing tests pass (`npm test`).

## Up-front tests

- `test/gh-repo-create.test.js::creates repo with correct gh args` — verifies argv includes `repo create owner/name --source <workDir> --remote origin --public --push`
- `test/gh-repo-create.test.js::creates private repo with description` — verifies `--private` and `--description` are in argv
- `test/gh-repo-create.test.js::omits --push when push is false` — verifies `--push` is absent from argv
- `test/gh-repo-create.test.js::rejects invalid repo name` — verifies validation fires before any gh call
- `test/gh-repo-create.test.js::returns ok:false on gh failure` — verifies gh stderr is returned as error
- `test/gh-auth-accounts.test.js::returns user and orgs list` — verifies both `/user` and `/user/orgs` api calls are made and combined
- `test/gh-auth-accounts.test.js::orgs fallback when orgs call fails` — verifies user is still returned if orgs fetch throws

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred. Use **▶ Active** in bold on exactly one pending task at a time.

- [x] Write tests for `gh:repo-create` and `gh:auth-accounts` IPC handlers
  - _Story: As a developer, when I run the test suite, the new handler tests fail for the right reason before any implementation exists._
  - _test: `test/gh-repo-create.test.js`, `test/gh-auth-accounts.test.js`_

- [x] Implement `gh:repo-create` and `gh:auth-accounts` in `main/github.js`
  - _Story: As braska, when the renderer invokes `gh:repo-create`, the main process calls `gh repo create` with correct argv and returns `{ ok, url }` or `{ ok, error }`._
  - _test: `test/gh-repo-create.test.js`, `test/gh-auth-accounts.test.js`_

- [x] Add `repoCreate` and `authAccounts` to `window.github` in `preload.js`
  - _Story: As the renderer, I can call `window.github.repoCreate(workDir, opts)` and `window.github.authAccounts(workDir)` over the context bridge._

- [x] Add `#create-repo-modal` HTML to `index.html`
  - _Story: As the DOM, the modal structure exists on page load with the correct IDs for the JS to query._

- [x] Add create-repo modal state fields to `renderer/state.js`
  - _Story: As the modal module, it can read/write `modalState.createRepoBusy` and related fields without importing a non-existent key._

- [x] Create `renderer/github-repo-create-modal.js` — modal logic
  - _Story: As a user, when I open the modal and fill in fields and click Create, the repo is created and the panel refreshes._

- [x] Add "Create on GitHub…" button in `renderer/github-panel.js` and wire modal init in `renderer/app.js`
  - _Story: As a user, when I navigate to the GitHub panel for a local-only git repo, I see the "Create on GitHub…" button._

## Verify

Every command must exit 0 on success and non-zero on failure.

```bash
node --test test/*.test.js test/*.test.mjs
```

Note: `npm test` (`node --test test/`) has a pre-existing failure because `node --test` on v22 cannot accept a directory containing non-test files (`helpers.js`). The working command above explicitly globs only test files.

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches)

_What was tried and discarded, with the reason._

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent ran and produced `research.md`. Key findings: `gh repo create <owner>/<name> --source <path> --remote origin --push` is the correct invocation; `gh api /user` + `/user/orgs` for owner dropdown; clone modal in `renderer/clone-modal.js` is the exact pattern to follow; `renderer/github-panel.js:105–112` is the insertion point for the button.

## Follow-ups (deferred work)

_Tasks marked deferred during implementation._

## Open questions

_Things that need human input before merge._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
