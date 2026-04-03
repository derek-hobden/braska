// ── File explorer operations — rename, create, context menu, keyboard nav ──

import { explorerState } from './state.js';
import { SVG_FOLDER, SVG_FILE, fileIcon } from './utils.js';

// ── Deps (injected via initFileExplorerOps) ────────────────────
let _activeWorkDir = null;
let _filetreeBody = null;
let _ftContextMenu = null;
let _refreshFileTree = null;
let _ftFocusItem = null;
let _startTask = null;
let _switchRightPanelTab = null;

export function initFileExplorerOps(deps) {
  _activeWorkDir = deps.activeWorkDir;
  _filetreeBody = deps.filetreeBody;
  _ftContextMenu = deps.ftContextMenu;
  _refreshFileTree = deps.refreshFileTree;
  _ftFocusItem = deps.ftFocusItem;
  _startTask = deps.startTask;
  _switchRightPanelTab = deps.switchRightPanelTab;
  _initContextMenuActions();
  _initRootContextAndDragDrop();
  _initKeyboardNav();
  _initGlobalShortcuts();
}

// ── Pyrefly particle animations ─────────────────────────────────

function spawnPyreflies(rect, color, direction) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div');
    el.className = `ft-pyrefly ${direction}`;
    const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 18 + Math.random() * 38;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - (direction === 'out' ? 12 : 0);
    el.style.cssText = `left:${cx}px;top:${cy}px;color:${color};--dx:${dx}px;--dy:${dy}px;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
}

// ── Inline rename ───────────────────────────────────────────────

export function startInlineRename(entryEl) {
  const itemEl = entryEl.querySelector(':scope > .ft-item');
  const nameEl = itemEl?.querySelector('.ft-name');
  if (!nameEl || !entryEl.dataset.path) return;
  const originalName = nameEl.textContent;
  const relPath = entryEl.dataset.path;

  const input = document.createElement('input');
  input.className = 'ft-rename-input';
  input.type = 'text';
  input.value = originalName;
  nameEl.replaceWith(input);

  // Select name without extension for files
  const isFile = !!itemEl.classList.contains('ft-file');
  const dotIdx = originalName.lastIndexOf('.');
  if (isFile && dotIdx > 0) input.setSelectionRange(0, dotIdx);
  else input.select();
  input.focus();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    if (!newName || newName === originalName) { input.replaceWith(nameEl); return; }
    const result = await window.fileOps.rename(_activeWorkDir(), relPath, newName);
    if (!result?.ok) input.replaceWith(nameEl);
  };
  input.addEventListener('keydown', async (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); await commit(); }
    else if (e.key === 'Escape') { committed = true; input.replaceWith(nameEl); }
  });
  input.addEventListener('blur', commit);
}

// ── Inline create (new file / new folder) ───────────────────────

export async function startInlineCreate(targetEntryEl, isDir) {
  let dirRelPath = '';
  let depth = 0;
  let container;

  if (targetEntryEl) {
    let dirEl = targetEntryEl;
    if (!dirEl.querySelector(':scope > .ft-item.ft-dir')) {
      dirEl = dirEl.parentElement?.closest('.ft-entry') || null;
    }
    if (dirEl) {
      dirRelPath = dirEl.dataset.path || '';
      depth = dirRelPath ? dirRelPath.split('/').length : 0;
      container = dirEl.querySelector(':scope > .ft-children');
      dirEl.classList.add('expanded');
    }
  }
  if (!container) { container = _filetreeBody; depth = 0; }

  const tempEntry = document.createElement('div');
  tempEntry.className = 'ft-entry';
  const tempItem = document.createElement('div');
  tempItem.className = `ft-item ${isDir ? 'ft-dir' : 'ft-file'}`;
  tempItem.style.paddingLeft = (8 + depth * 16) + 'px';
  tempItem.innerHTML = `<span class="ft-icon" style="color:${isDir ? '#e8c882' : '#888'}">${isDir ? SVG_FOLDER : SVG_FILE}</span>`;
  const input = document.createElement('input');
  input.className = 'ft-rename-input';
  input.type = 'text';
  input.placeholder = isDir ? 'folder-name' : 'file-name';
  tempItem.appendChild(input);
  tempEntry.appendChild(tempItem);
  container.insertBefore(tempEntry, container.firstChild);
  input.focus();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const name = input.value.trim();
    tempEntry.remove();
    if (!name || !_activeWorkDir()) return;
    const result = isDir
      ? await window.fileOps.createDir(_activeWorkDir(), dirRelPath, name)
      : await window.fileOps.createFile(_activeWorkDir(), dirRelPath, name);
    if (result?.ok) {
      const newRelPath = (dirRelPath ? dirRelPath + '/' : '') + name;
      setTimeout(() => {
        const newEl = _filetreeBody.querySelector(`.ft-entry[data-path="${CSS.escape(newRelPath)}"]`);
        if (newEl) {
          const color = isDir ? '#e8c882' : fileIcon(name).color;
          spawnPyreflies(newEl.querySelector('.ft-item').getBoundingClientRect(), color, 'in');
          _ftFocusItem(newEl);
        }
      }, 400);
    }
  };
  input.addEventListener('keydown', async (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); await commit(); }
    else if (e.key === 'Escape') { committed = true; tempEntry.remove(); }
  });
  input.addEventListener('blur', commit);
}

// ── Context menu actions ────────────────────────────────────────

function _initContextMenuActions() {
  _ftContextMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('.wt-ctx-item');
    if (!item || item.classList.contains('disabled')) return;
    _ftContextMenu.classList.remove('active');
    const action = item.dataset.action;
    const relPath = explorerState.ftCtxTarget?.dataset.path || '';

    if (action === 'new-file') {
      await startInlineCreate(explorerState.ftCtxTarget, false);
    } else if (action === 'new-folder') {
      await startInlineCreate(explorerState.ftCtxTarget, true);
    } else if (action === 'rename') {
      if (explorerState.ftCtxTarget) startInlineRename(explorerState.ftCtxTarget);
    } else if (action === 'copy-path') {
      if (_activeWorkDir()) navigator.clipboard.writeText(_activeWorkDir() + '/' + relPath);
    } else if (action === 'reveal') {
      if (relPath && _activeWorkDir()) window.fileOps.reveal(_activeWorkDir(), relPath);
    } else if (action === 'open-terminal') {
      if (!_activeWorkDir()) return;
      let targetDir = _activeWorkDir();
      if (relPath) {
        const abs = _activeWorkDir() + '/' + relPath;
        targetDir = explorerState.ftCtxIsDir ? abs : abs.substring(0, abs.lastIndexOf('/'));
      }
      _startTask('__TERMINAL__', _activeWorkDir(), { cwd: targetDir });
    } else if (action === 'gitignore') {
      if (relPath && _activeWorkDir()) window.fileOps.gitignore(_activeWorkDir(), relPath);
    } else if (action === 'delete') {
      if (!relPath || !_activeWorkDir()) return;
      const name = relPath.split('/').pop();
      if (!confirm(`Delete "${name}"?`)) return;
      const itemEl = explorerState.ftCtxTarget?.querySelector('.ft-item');
      const rect = itemEl?.getBoundingClientRect();
      const color = explorerState.ftCtxIsDir ? '#e8c882' : fileIcon(name).color;
      if (rect) spawnPyreflies(rect, color, 'out');
      await window.fileOps.delete(_activeWorkDir(), relPath);
    }
  });
}

// ── Root-level context menu + drag-drop ─────────────────────────

function _initRootContextAndDragDrop() {
  _filetreeBody.addEventListener('contextmenu', (e) => {
    if (!_activeWorkDir()) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = e.target.closest('.ft-entry');
    explorerState.ftCtxTarget = entry || null;
    explorerState.ftCtxIsDir = entry ? !!entry.querySelector(':scope > .ft-item.ft-dir') : true;
    if (entry) _ftFocusItem(entry);
    showFtContextMenu(e.clientX, e.clientY);
  });

  document.addEventListener('click', () => _ftContextMenu.classList.remove('active'));
  document.addEventListener('contextmenu', () => _ftContextMenu.classList.remove('active'));

  _filetreeBody.addEventListener('dragover', (e) => {
    if (e.target.closest('.ft-entry')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    _filetreeBody.classList.add('ft-drop-root');
  });
  _filetreeBody.addEventListener('dragleave', (e) => {
    if (!_filetreeBody.contains(e.relatedTarget)) _filetreeBody.classList.remove('ft-drop-root');
  });
  _filetreeBody.addEventListener('drop', async (e) => {
    if (e.target.closest('.ft-entry')) return;
    e.preventDefault();
    _filetreeBody.classList.remove('ft-drop-root');
    if (!_activeWorkDir()) return;
    const paths = window.dragDrop.getLastDroppedPaths();
    if (paths.length) await window.fileOps.copyIn(_activeWorkDir(), '', paths);
  });
}

function showFtContextMenu(x, y) {
  _ftContextMenu.style.left = x + 'px';
  _ftContextMenu.style.top = y + 'px';
  _ftContextMenu.classList.add('active');
  requestAnimationFrame(() => {
    const rect = _ftContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) _ftContextMenu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) _ftContextMenu.style.top = (y - rect.height) + 'px';
  });
}

// ── Keyboard navigation helper ──────────────────────────────────

function getVisibleFtEntries() {
  return Array.from(_filetreeBody.querySelectorAll('.ft-entry')).filter(el => {
    let node = el.parentElement;
    while (node && node !== _filetreeBody) {
      if (node.classList.contains('ft-children') && getComputedStyle(node).display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  });
}

// ── Keyboard navigation ─────────────────────────────────────────

function _initKeyboardNav() {
  _filetreeBody.addEventListener('keydown', async (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
    if (activePanel !== 'explorer') return;

    const visible = getVisibleFtEntries();
    if (visible.length === 0) return;
    const idx = explorerState.ftFocusedEl ? visible.indexOf(explorerState.ftFocusedEl) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _ftFocusItem(visible[idx < 0 ? 0 : Math.min(idx + 1, visible.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _ftFocusItem(visible[idx <= 0 ? 0 : idx - 1]);
    } else if (e.key === 'ArrowRight') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      if (explorerState.ftFocusedEl.querySelector(':scope > .ft-item.ft-dir')) {
        if (!explorerState.ftFocusedEl.classList.contains('expanded')) {
          explorerState.ftFocusedEl.querySelector(':scope > .ft-item').click();
        } else {
          const first = explorerState.ftFocusedEl.querySelector(':scope > .ft-children > .ft-entry');
          if (first) _ftFocusItem(first);
        }
      }
    } else if (e.key === 'ArrowLeft') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      if (explorerState.ftFocusedEl.classList.contains('expanded')) {
        explorerState.ftFocusedEl.querySelector(':scope > .ft-item').click();
      } else {
        const parent = explorerState.ftFocusedEl.parentElement?.closest('.ft-entry');
        if (parent) _ftFocusItem(parent);
      }
    } else if (e.key === 'Enter') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      explorerState.ftFocusedEl.querySelector(':scope > .ft-item')?.click();
    } else if (e.key === 'F2') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      startInlineRename(explorerState.ftFocusedEl);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!explorerState.ftFocusedEl || !_activeWorkDir()) return;
      const relPath = explorerState.ftFocusedEl.dataset.path;
      if (!relPath) return;
      const name = relPath.split('/').pop();
      if (!confirm(`Delete "${name}"?`)) return;
      e.preventDefault();
      const isDir = !!explorerState.ftFocusedEl.querySelector(':scope > .ft-item.ft-dir');
      const color = isDir ? '#e8c882' : fileIcon(name).color;
      const rect = explorerState.ftFocusedEl.querySelector('.ft-item')?.getBoundingClientRect();
      if (rect) spawnPyreflies(rect, color, 'out');
      explorerState.ftFocusedEl = null;
      await window.fileOps.delete(_activeWorkDir(), relPath);
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      if (!_activeWorkDir()) return;
      try {
        const items = await navigator.clipboard.read();
        const paths = [];
        for (const item of items) {
          if (item.types.includes('text/uri-list')) {
            const blob = await item.getType('text/uri-list');
            const text = await blob.text();
            for (const line of text.split('\n')) {
              const u = line.trim();
              if (u.startsWith('file://')) {
                try { paths.push(decodeURIComponent(new URL(u).pathname)); } catch {}
              }
            }
          }
        }
        if (paths.length > 0) {
          e.preventDefault();
          const dirEl = explorerState.ftFocusedEl?.querySelector(':scope > .ft-item.ft-dir')
            ? explorerState.ftFocusedEl
            : explorerState.ftFocusedEl?.parentElement?.closest('.ft-entry') || null;
          const targetRelDir = dirEl?.dataset.path || '';
          await window.fileOps.copyIn(_activeWorkDir(), targetRelDir, paths);
        }
      } catch {}
    }
  });
}

// ── Global keyboard shortcuts ───────────────────────────────────

function _initGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      const { toggleSidebar } = _switchRightPanelTab; // actually passed as deps object
      // Import toggling functions dynamically to avoid circular deps
      import('./file-explorer.js').then(mod => mod.toggleSidebar());
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      import('./file-explorer.js').then(mod => mod.toggleFiletree());
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      import('./file-explorer.js').then(mod => {
        if (!explorerState.filetreeVisible) {
          mod.toggleFiletree();
          mod.switchRightPanelTab('changes');
        } else if (document.querySelector('.filetree-tab[data-panel="changes"]')?.classList.contains('active')) {
          mod.toggleFiletree();
        } else {
          mod.switchRightPanelTab('changes');
        }
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      import('./file-explorer.js').then(mod => {
        if (!explorerState.filetreeVisible) {
          mod.toggleFiletree();
          mod.switchRightPanelTab('todos');
        } else if (document.querySelector('.filetree-tab[data-panel="todos"]')?.classList.contains('active')) {
          mod.toggleFiletree();
        } else {
          mod.switchRightPanelTab('todos');
        }
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
      e.preventDefault();
      import('./file-explorer.js').then(mod => {
        if (!explorerState.filetreeVisible) {
          mod.toggleFiletree();
          mod.switchRightPanelTab('github');
        } else if (document.querySelector('.filetree-tab[data-panel="github"]')?.classList.contains('active')) {
          mod.toggleFiletree();
        } else {
          mod.switchRightPanelTab('github');
        }
      });
    }
  });
}
