// ── Shared mutable state for the Braska renderer ──
// Every property is exported as a named object so modules can read/write via
// reference (e.g. `appState.activeWorkDir = wd`). DOM element references are
// intentionally omitted — query them locally with document.getElementById().

// ── Application-wide state ──────────────────────────────────────
export const appState = {
  activeSection: null,        // current settings section ('skills' | 'agents' | 'mcp-servers' | null)
  savedActiveTabId: null,     // preserved tab id when entering settings
  savedActiveWorkDir: null,   // preserved workDir when entering settings
  pendingWorkDir: null,       // workDir waiting for tab-type picker
  projectScopeMode: null,     // 'todos' | 'github' | null — set when navigating via sidebar section links (no worktree)
  projectScopePath: null,     // project root path when in project-scope mode
};

// ── Tab management state ────────────────────────────────────────
export const tabState = {
  tabs: new Map(),            // id → { term, fitAddon, resizeObs, pane, tabEl, label, workDir, ... }
  tabOrder: new Map(),        // workDir → [tabId, ...]
  activeTabByWorkDir: new Map(), // workDir → last-active tabId
  activeTabId: null,
  activeWorkDir: null,
  nextBrowserTabId: -1,
  dragTabId: null,            // currently dragged tab ID
};

// ── Worktree modal state ────────────────────────────────────────
export const modalState = {
  wtContextTarget: null,      // the worktree-item element being right-clicked
  wtCreateProjectPath: null,
  wtDeleteProjectPath: null,
  wtDeletePath: null,
  wtDeleteForce: false,
  wtMergeProjectPath: null,
  wtMergeWorktreePath: null,
  wtMergeForce: false,
  wtMergeAlreadyMerged: false,
  wtMergeDone: false,
  wtMergeFeatureBranch: null,
  cloneSource: 'url',         // 'url' | 'list' — current tab in clone modal
  cloneRepoRef: '',           // parsed/selected owner/repo
  cloneDestParent: '',        // chosen parent directory (absolute)
  cloneBusy: false,           // true while a clone is in-flight
  createRepoWorkDir: '',      // workDir for the create-repo modal
  createRepoBusy: false,      // true while repo creation is in-flight
};

// ── File explorer state ─────────────────────────────────────────
export const explorerState = {
  filetreeVisible: false,
  sidebarVisible: true,
  workDirExplorerVisible: new Map(), // per-worktree explorer visibility
  ftFocusedEl: null,          // currently focused file-tree entry element
  ftCtxTarget: null,          // right-clicked file-tree entry element
  ftCtxIsDir: false,          // whether the context-menu target is a directory
};

// ── File-system watcher debounce ────────────────────────────────
export const watchState = {
  fsWatchDebounce: null,
  todoWatchDebounce: null,
  fetchRefreshDebounce: null,
  projectsChangedDebounce: null,
};

// ── GitHub panel state ──────────────────────────────────────────
export const ghState = {
  section: 'prs',             // 'prs' | 'issues' | 'ci' | 'notifs'
  prFilter: 'open',           // 'open' | 'closed' | 'all'
  issueFilter: 'open',        // 'open' | 'closed' | 'all'
  cachedAuth: null,           // { authenticated, isGitHubRepo, workDir, ts }
  ciInterval: null,           // setInterval handle for CI auto-refresh
  contentAC: null,            // AbortController for #gh-content event listeners
  pendingPRForm: false,       // set by post-commit banner, consumed by refreshGitHubPRs
  viewActive: false,          // true when GitHub sub-view is shown in the unified panel
  hasActivity: false,         // true when GitHub has unread activity (CI fail, review, etc.)
  _isGitHubRepo: undefined,   // cached result of git:is-github-repo (fast remote URL check)
  _isGitHubRepoWorkDir: null, // workDir the cached result belongs to
};

// ── Git / pull-main state ───────────────────────────────────────
export const gitState = {
  currentPullMainWorkDir: null,
  currentCommitWorkDir: null,
  _pullMainIsStashConflict: false,
  _pullMainDirtyResolve: null,
  _stageAttentionTimeout: null,
  changesTreeView: false,
  postCommitPrompts: new Map(),   // workDir → { timestamp } — triggers post-commit banner
  mergedToMain: new Map(),        // workDir → { featureBranch, targetBranch, mainWorktreePath } — post-merge state
};
