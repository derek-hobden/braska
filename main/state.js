const ptyProcesses = new Map();
let nextPtyId = 1;
let activeWatcher = null;
let activeTodosWatcher = null;

module.exports = {
  ptyProcesses,
  getNextPtyId() { return nextPtyId++; },
  getActiveWatcher() { return activeWatcher; },
  setActiveWatcher(w) { activeWatcher = w; },
  getActiveTodosWatcher() { return activeTodosWatcher; },
  setActiveTodosWatcher(w) { activeTodosWatcher = w; },
};
