// ── Git changes tree view — folder hierarchy rendering ──
import { escHtml, SVG_FOLDER } from './utils.js';

/** Initialize the tree/list toggle button. */
export function initTreeToggle(gitState, getActiveWorkDir, refreshChanges) {
  const btn = document.getElementById('changes-tree-toggle');
  const update = () => {
    btn.classList.toggle('active', gitState.changesTreeView);
    btn.title = gitState.changesTreeView ? 'Switch to list view' : 'Switch to tree view';
  };
  update();
  btn.addEventListener('click', () => {
    gitState.changesTreeView = !gitState.changesTreeView;
    localStorage.setItem('braska-changes-tree-view', String(gitState.changesTreeView));
    update();
    const wd = getActiveWorkDir();
    if (wd) refreshChanges(wd);
  });
}

/** Render file items as a folder tree into the container. */
export function renderTreeEntries(container, items, entryFn, getPath) {
  const tree = buildTree(items, getPath);
  renderNode(container, tree, entryFn, getPath, 0);
}

function buildTree(items, getPath) {
  const root = { dirs: new Map(), items: [] };
  for (const item of items) {
    const parts = getPath(item).split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), items: [] });
      node = node.dirs.get(parts[i]);
    }
    node.items.push(item);
  }
  return root;
}

function countFiles(node) {
  let n = node.items.length;
  for (const child of node.dirs.values()) n += countFiles(child);
  return n;
}

function renderNode(container, node, entryFn, getPath, depth) {
  const sortedDirs = [...node.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [name, child] of sortedDirs) {
    // Compact single-child folder chains (e.g. src/components → one node)
    let label = name;
    let current = child;
    while (current.dirs.size === 1 && current.items.length === 0) {
      const [sub, subChild] = [...current.dirs.entries()][0];
      label += '/' + sub;
      current = subChild;
    }

    const groupEl = document.createElement('div');
    groupEl.className = 'changes-tree-group expanded';

    const headerEl = document.createElement('div');
    headerEl.className = 'changes-tree-folder';
    headerEl.style.paddingLeft = (12 + depth * 16) + 'px';
    headerEl.innerHTML = `<span class="ft-icon" style="color:#e8c882">${SVG_FOLDER}</span><span class="changes-tree-folder-name">${escHtml(label)}</span><span class="changes-tree-folder-count">${countFiles(current)}</span>`;

    const childrenEl = document.createElement('div');
    childrenEl.className = 'changes-tree-children';

    headerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      groupEl.classList.toggle('expanded');
    });

    groupEl.appendChild(headerEl);
    groupEl.appendChild(childrenEl);
    container.appendChild(groupEl);

    renderNode(childrenEl, current, entryFn, getPath, depth + 1);
  }

  // Files at this level
  const sortedFiles = [...node.items].sort((a, b) => getPath(a).localeCompare(getPath(b)));
  for (const item of sortedFiles) {
    const el = entryFn(item);
    const folderSpan = el.querySelector('.changes-file-folder');
    if (folderSpan) folderSpan.remove();
    el.style.paddingLeft = (12 + depth * 16) + 'px';
    container.appendChild(el);
  }
}
