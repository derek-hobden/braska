const ptyProcesses = new Map();
let nextPtyId = 1;
let activeWatcher = null;
let activeTodoWatcher = null;

module.exports = {
  ptyProcesses,
  getNextPtyId() { return nextPtyId++; },
  getActiveWatcher() { return activeWatcher; },
  setActiveWatcher(w) { activeWatcher = w; },
  getActiveTodoWatcher() { return activeTodoWatcher; },
  setActiveTodoWatcher(w) { activeTodoWatcher = w; },
};
