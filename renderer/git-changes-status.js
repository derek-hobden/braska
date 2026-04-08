// ── Status toast for git changes panel ───────────────────────────
// Extracted so it can be imported by journey-zone and other modules
// without pulling in all of git-changes.js.

let _statusEl = null;

function getStatusEl() {
  if (!_statusEl) _statusEl = document.getElementById('changes-toolbar-status');
  return _statusEl;
}

export function showChangesStatus(msg, type) {
  const el = getStatusEl();
  if (!el) return;
  el.textContent = msg;
  el.className = 'changes-toolbar-status ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ''; el.className = 'changes-toolbar-status'; }, type === 'error' ? 8000 : 4000);
}
