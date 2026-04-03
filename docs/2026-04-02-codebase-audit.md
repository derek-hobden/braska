# Braska Codebase Audit — April 2026

## Executive Summary

27 source files, ~6,400 lines of code, 5 npm dependencies. 86 IPC handlers across 10 main-process modules.

**Overall health: Good.** Security posture is strong, architecture is clean, documentation is excellent. Targeted fixes in this PR address the most critical gaps (missing process error handlers, implicit Electron security settings, unhandled promise chains). Remaining issues — oversized legacy files, zero accessibility, zero test coverage — are documented below for dedicated follow-up tickets.

| Dimension | Rating | Summary |
|-----------|--------|---------|
| Security | Strong | escHtml, execFileAsync, resolveInDir all consistent |
| Error Handling | Good | Consistent IPC pattern; process handlers added in this PR |
| Technical Debt | Active | 4 oversized files, duplicated patterns |
| Performance | Good | All async, no blocking ops |
| Architecture | Strong | Clean 2-process model, no circular deps |
| Dependencies | Minimal | 5 deps, all used, lockfile present |
| Accessibility | Poor | Zero ARIA, no keyboard nav, low contrast |
| Test Coverage | None | 0 tests, 0% coverage, no CI/CD |
| Coding Practices | Good | Consistent naming, async/await, no dead code |
| Documentation | Excellent | CLAUDE.md comprehensive, JSDoc on utils |

## Methodology

Three automated exploration agents analyzed every source file across all 10 audit dimensions. Findings include file:line references for traceability. Severity ratings: Critical / High / Medium / Low / Info.

---

## 1. Security Audit — Strong

### XSS Protection — Excellent

All dynamic user content passes through `escHtml()` (`renderer/utils.js:82`) before innerHTML insertion. Verified across all renderer modules: `todos-panel.js`, `github-panel.js`, `git-changes.js`, `notifications.js`, `sidebar.js`, `file-explorer.js`. Static HTML templates (settings panels, modals) contain no user data.

### Command Injection — Excellent

All shell commands use `execFileAsync` with argument arrays (`main/utils.js:6`). Verified across `git-ops.js`, `git-read.js`, `git-worktree.js`, `github.js`. The one exception is PTY spawning (`main/pty.js:17,25,36,45`) which requires shell strings but properly escapes single quotes via `.replace(/'/g, "'\"'\"'")`.

### Path Traversal — Excellent

`resolveInDir()` (`main/utils.js:12-19`) validates all user-supplied paths against a base directory. Used consistently in `main/files.js` (lines 8, 17, 57, 66, 75-77, 85, 97, 113), `main/github.js:160,181`, and `main/specialists.js:61`.

### Electron Security Settings — Fixed in this PR

**Before:** `main/index.js:30-33` relied on implicit defaults for `contextIsolation`, `nodeIntegration`, and `sandbox`.

**After:** Explicit `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in webPreferences. Preload only uses `require('electron')` and `process.versions`, both available in sandboxed mode.

### Content Security Policy — Medium (Acceptable)

`index.html:5` uses `'unsafe-inline'` for both `style-src` and `script-src`. This is common in Electron apps with inline styles. The XSS risk is fully mitigated by consistent `escHtml()` usage. Tightening CSP would require moving all inline styles to CSS classes — not worth the effort given the mitigation in place.

### Preload API Surface — Good

`preload.js` exposes 15 namespaces via `contextBridge`. No direct `process`, `require`, `fs`, or `child_process` exposure. All dangerous operations route through IPC handlers with validation.

### IPC Input Validation — Low Risk

IPC handlers don't perform schema validation on inputs but rely on downstream operations (git CLI, fs operations) to fail safely. All handlers wrap operations in try/catch and return `{ ok: false, error: errMsg(err) }`. Branch names, labels, and other string inputs are validated by the git/gh CLIs they're passed to.

---

## 2. Error Handling & Resilience — Good

### IPC Return Pattern — Excellent

All 86 handlers consistently return `{ ok: true, ...data }` or `{ ok: false, error: errMsg(err) }`. Special cases properly extend the pattern with additional fields like `hasConflicts`, `noUpstream`, `notMerged` in git operations.

### Process-Level Error Handlers — Fixed in this PR

**Before:** No `uncaughtException` or `unhandledRejection` handlers. An unhandled rejection would log to console but provide no structured logging; an uncaught exception would crash the app silently.

**After:** `main/index.js:7-12` logs both with `[Braska]` prefix.

### Unhandled Promise Chains — Fixed in this PR

Added `.catch(err => console.error('[Braska]', err))` to 5 promise chains:
- `renderer/file-explorer.js:84` — `window.todos.init().then()`
- `renderer/settings.js:232` — `window.skills.remove().then()`
- `renderer/settings.js:239` — `window.skills.list().then()`
- `renderer/settings.js:248` — `window.specialists.remove().then()`
- `renderer/settings.js:255` — `window.specialists.list().then()`

### Remaining Gaps — Low

- `renderer/todos-panel.js:54,62` — `await window.todos.close()` result not checked for `.ok`
- `renderer/git-changes.js` — many event handlers call `refreshChanges()` without checking the preceding operation's result. Mitigated by the refresh always showing current state.
- `main/files.js:92` — `shell.showItemInFolder` failure silently swallowed (user-initiated action with no feedback)

### Silent Failures — Acceptable

Most empty catch blocks are intentional (file watcher errors in `main/files.js:43`, PTY resize in `main/pty.js:84`, optional file reads in `main/specialists.js:21,45`). These are non-critical operations where failure is harmless.

---

## 3. Technical Debt — Active

### Oversized Files — Fixed in this PR

All three major violations have been split. Only `worktree-modals.js` (434, 8.5% over) remains.

| File | Before | After | Split into |
|------|--------|-------|------------|
| `git-changes.js` | 861 | 321 | + `git-changes-actions.js` (222) + `git-changes-modals.js` (357) |
| `github-panel.js` | 741 | 262 | + `github-prs.js` (249) + `github-issues.js` (264) |
| `file-explorer.js` | 693 | 342 | + `file-explorer-ops.js` (399) |
| `worktree-modals.js` | 434 | 434 | (unchanged, minor violation) |

### Duplicated Button State Pattern

`renderer/git-changes.js` lines 413-499 repeat the same disable/execute/enable pattern 5+ times (amend, generate, fetch, pull, push buttons). Could be extracted to a `withButtonState(el, asyncFn)` helper.

### innerHTML Full-Rewrite Pattern

`renderer/github-panel.js:110` and `renderer/todos-panel.js:160` rebuild entire panel bodies via innerHTML assignment on each refresh. This loses event listeners attached to child elements. The `github-panel.js` AbortController pattern (`ghState.contentAC`) partially mitigates this for content listeners. Recommended: use event delegation on stable parent elements (like `renderer/tabs.js` already does).

### errMsg() Inconsistency

`main/git-ops.js` (lines 53, 79, 90, 185, 209, 221, 268) and `main/git-worktree.js` (lines 87, 103, 195) use inline `.split('\n')[0]` instead of `errMsg()`. This is partly justified — these paths extract extra fields (`hasConflicts`, `noUpstream`) from the error before truncating. Not a bug, but inconsistent.

---

## 4. Performance — Good

### No Blocking Operations

Zero `execSync`, `readFileSync`, `writeFileSync`, `readdirSync`, or `statSync` calls in the main process. All file I/O uses `fsp` (fs.promises). All git/gh commands use `execFileAsync` with timeouts (5000-30000ms).

### DOM Rebuild Inefficiency — Low Impact

`refreshChanges()` in `renderer/git-changes.js:88-160` rebuilds the entire changes panel via innerHTML on each refresh, losing scroll position. `renderer/todos-panel.js:112` partially mitigates with `prevScroll` save/restore. The github panel has the same pattern. Impact is low (panels are small) but could be improved with incremental DOM updates for large file lists.

### Resource Lifecycle — Good

- PTY processes tracked in `main/state.js` Map, deleted on exit (`main/pty.js:73`), killed on app quit (`main/index.js:141`)
- File watchers properly close previous before opening new (`main/files.js:35-45`)
- AbortController used for cancellable fetch-like operations in `renderer/github-panel.js:21`

### Startup — Acceptable

Critical path: `migrateData()` -> `ensureBuiltinSpecialists()` -> `createWindow()`. Splash screen masks perceived latency. `ensureBuiltinSpecialists()` does mtime-based file copies — fast but runs before window creation.

---

## 5. Architecture & Scalability — Strong

### Two-Process Model

Clean separation enforced: main (CommonJS) <-> preload (contextBridge) <-> renderer (ES modules). No cross-boundary violations found.

### Module Coupling

Main-process modules form an acyclic dependency graph. Each exports `register({ ipcMain, BrowserWindow, dialog, shell, app })` — clean dependency injection. Renderer modules avoid circular imports via init-function injection pattern (`renderer/app.js` wires all cross-module deps). Two dynamic imports exist (`git-changes.js` -> `sidebar.js`, `github-panel.js` -> `sidebar.js`) as a fallback for late-bound references.

### State Management

`renderer/state.js` exports flat objects (`tabState`, `appState`, `modalState`, `explorerState`, `watchState`, `ghState`, `gitState`) mutated via direct property assignment. Simple and works at current scale. If the app grows significantly, consider a centralized state store with change notifications.

`main/state.js` (13 lines) holds only the `ptyProcesses` Map and watcher refs — appropriately minimal.

---

## 6. Dependencies — Minimal

| Package | Purpose | Used In |
|---------|---------|---------|
| `electron@^41.1.0` | Runtime | Entire app |
| `node-pty@^1.1.0` | Terminal emulation | `main/pty.js` |
| `@xterm/xterm@^6.0.0` | Terminal UI | `renderer/terminals.js` |
| `@xterm/addon-fit@^0.11.0` | Terminal auto-fit | `renderer/terminals.js` |
| `@electron/rebuild@^4.0.3` | Native module rebuild | postinstall hook |

No unnecessary dependencies. No devDependencies. `package-lock.json` present and current (lockfile v3). All 5 dependencies are actively imported/used.

---

## 7. Accessibility — Poor

This is the weakest area and needs a dedicated effort.

### ARIA Attributes — None

Zero `role`, `aria-label`, `aria-pressed`, `aria-expanded`, or other ARIA attributes in `index.html` (367 lines). Interactive divs (`.launchpad-card`, `.tab-type-picker-item`, `.wt-ctx-item`) lack semantic roles.

### Keyboard Navigation — Minimal

Only `Cmd+1-9` tab switching shortcuts (`renderer/app.js:258-266`), `Cmd+W` close tab, and `Cmd+T` tab picker (`main/index.js:101-110`). No keyboard support for:
- Launchpad cards
- Context menus (require mouse)
- File tree navigation (arrow keys)
- Modal dialog navigation

Single `tabindex="0"` on `#filetree-body` only (`index.html:106`).

### Focus Management — Missing

Modal dialogs (`index.html:260-363`) have no focus trapping — Tab key moves focus behind the modal. No initial focus set on modal open. No focus restore on modal close.

### Color Contrast — Low

`styles.css` uses `#555`, `#666`, `#888` text on dark backgrounds (`#1e1e1e`, `#2a2a2a`). Examples:
- `.wt-ctx-item.disabled { color: #555; }` — fails WCAG AA (3.2:1 ratio needed, actual ~2.0:1)
- `.remove-btn { opacity: 0.15; }` — nearly invisible
- `.expand-icon { opacity: 0.2; }` — barely visible

### Form Labels — Missing

No `<label>` elements associated with `<input>` fields in worktree modals (`index.html:272-276`).

---

## 8. Test Coverage — None

- 0 test files (no `*.test.js`, `*.spec.js`, `__tests__/`)
- Placeholder test script in `package.json`: `"test": "echo \"Error: no test specified\" && exit 1"`
- No CI/CD pipeline (no `.github/workflows/`)

**Recommended starting points for a test initiative:**
1. `main/utils.js` — pure functions (`errMsg`, `resolveInDir`, `pathExists`) with no dependencies
2. `renderer/utils.js` — pure functions (`escHtml`, `formatTimeAgo`, `parseDiffOutput`, `fileIcon`)
3. IPC handler return shape validation — verify all handlers return `{ ok }` on success/failure

---

## 9. Coding Practices — Good

### Naming Conventions — Consistent

- Files: kebab-case (`git-changes.js`, `file-explorer.js`)
- Functions: camelCase (`refreshFileTree`, `openWorkDir`)
- IPC channels: namespaced kebab (`git:stage-all`, `file:read`, `pty:spawn`)
- State objects: camelCase (`tabState`, `appState`, `ghState`)

### Async/Await — Consistent

All async operations use async/await. One exception: `main/git-ops.js:49-56` uses callback-based `.exec()` for commit message generation (necessary for stdin piping).

### Code Hygiene

- Zero TODO/FIXME/HACK/XXX comments
- No dead code detected
- No unused exports
- Comments explain WHY not WHAT (per CLAUDE.md rules)

---

## 10. Documentation — Excellent

### CLAUDE.md — Comprehensive

99 lines covering architecture, file map with line counts, feature addition guides, rules, and data directories. File map line counts updated in this PR to match reality.

### JSDoc — Present on Utilities

`renderer/utils.js` documents all 11 exported functions with JSDoc comments: `stripAnsi`, `formatTimeAgo`, `escHtml`, `specialistDisplayName`, `statSpan`, `fileIcon`, `parseDiffOutput`, `renderDiffContent`, `changeEntry`, `getWorkDirLabel`, `generateTodoBranchName`.

### Specialist Templates — Well-Documented

All 5 builtin specialists (`todoist`, `debugger`, `code-reviewer`, `github-specialist`, `merger`) include `claude.md` with detailed workflow instructions.

### Project History

`project.md` tracks progress chronologically. `docs/2026-04-02-performance-audit-refactoring.md` documents the prior performance refactoring with lessons learned.

---

## Prioritized Recommendations

### High Priority
1. **Accessibility overhaul** — Add ARIA attributes, keyboard navigation, focus management, and fix color contrast. Needs a dedicated ticket with systematic approach.
2. **Split oversized files** — `git-changes.js` (861), `github-panel.js` (741), `file-explorer.js` (693). Each is a separate refactoring ticket.

### Medium Priority
3. **Test infrastructure** — Set up a test runner and write initial tests for pure utility functions in `main/utils.js` and `renderer/utils.js`.
4. **Event delegation consistency** — Standardize on event delegation for panels that refresh via innerHTML (follow `tabs.js` pattern).
5. **Button state helper** — Extract duplicated disable/enable/status pattern from `git-changes.js` into a shared utility.

### Low Priority
6. **CI/CD pipeline** — Add GitHub Actions for linting and (once tests exist) automated testing.
7. **todos-panel result checking** — Add `.ok` checks to `todos-panel.js:54,62`.
8. **CSP tightening** — Consider removing `'unsafe-inline'` if inline styles are ever refactored to CSS classes.

---

## Appendix: File Sizes

```
main/
  index.js              147    (updated in this PR)
  state.js               13
  utils.js               25
  projects.js            81
  skills.js              37
  specialists.js         67
  specialists-setup.js   48
  todos.js              124
  pty.js                 96
  files.js              129
  git-read.js           142
  git-ops.js            273
  git-worktree.js       333
  github.js             190
  migration.js           40

renderer/
  app.js                266
  state.js               73
  utils.js              238
  sidebar.js            144
  tabs.js               186
  terminals.js          325
  notifications.js      198
  settings.js           288
  todos-panel.js        230
  file-explorer.js      342
  file-explorer-ops.js  399
  worktree-modals.js    434    ** 8.5% over limit **
  git-changes.js        321
  git-changes-actions.js 222
  git-changes-modals.js 357
  github-panel.js       262
  github-prs.js         249
  github-issues.js      264

Other:
  preload.js            189
  index.html            367
  styles.css           2952
```
