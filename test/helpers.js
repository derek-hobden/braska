// Test helpers — mock factories for main-process IPC handler tests.
// Uses zero dependencies beyond node:test built-ins.

const path = require('path');

// ── Mock execFileAsync ────────────────────────────────────────
// Returns a controller: { fn, calls, on(argMatch, response) }
//
// Usage:
//   const exec = mockExec();
//   exec.on('symbolic-ref', { stdout: 'main\n' });
//   exec.on('pull', { throws: 'Some error' });
//   // ... load module, call handler ...
//   assert.equal(exec.calls.length, 2);

function mockExec() {
  const calls = [];
  const rules = [];

  async function fn(cmd, args, opts) {
    calls.push({ cmd, args, opts });
    for (const rule of rules) {
      const haystack = [cmd, ...args].join(' ');
      if (haystack.includes(rule.match)) {
        if (rule.response.throws) {
          const err = new Error(rule.response.throws);
          err.stderr = rule.response.stderr || rule.response.throws;
          err.stdout = rule.response.stdout || '';
          throw err;
        }
        return { stdout: rule.response.stdout || '', stderr: rule.response.stderr || '' };
      }
    }
    return { stdout: '', stderr: '' };
  }

  function on(match, response) {
    rules.push({ match, response });
  }

  function reset() {
    calls.length = 0;
    rules.length = 0;
  }

  return { fn, calls, on, reset };
}

// ── Install mocked utils + projects into require cache ────────
// Call BEFORE requiring the module under test.
// Returns the exec mock so tests can configure responses.

function installMocks(exec) {
  const utilsPath = require.resolve('../main/utils');
  const projectsPath = require.resolve('../main/projects');

  require.cache[utilsPath] = {
    id: utilsPath, filename: utilsPath, loaded: true,
    exports: {
      execFileAsync: exec.fn,
      errMsg: (err) => ((err.stderr || err.message || '').toString().split('\n')[0]) || 'Unknown error',
      pathExists: async () => true,
      fsp: require('fs').promises,
      resolveInDir: (base, rel) => path.resolve(base, rel),
      resolveGitDir: async () => null,
    },
  };

  require.cache[projectsPath] = {
    id: projectsPath, filename: projectsPath, loaded: true,
    exports: {
      register: () => {},
      getGitInfo: async () => ({
        isGit: true,
        worktrees: [{ path: '/repo', branch: 'main', isMain: true }],
      }),
    },
  };
}

// ── Freshly load a main-process module with mocked deps ───────
// Clears the module from cache first so it picks up mocked requires.

function loadModule(relPath) {
  const abs = require.resolve(relPath);
  delete require.cache[abs];
  return require(abs);
}

// ── Mock ipcMain — captures registered handlers ───────────────

function mockIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, handler) { handlers.set(channel, handler); },
    async invoke(channel, ...args) {
      const h = handlers.get(channel);
      if (!h) throw new Error(`No handler registered for "${channel}"`);
      return h(null, ...args);  // null = _event
    },
    handlers,
  };
}

module.exports = { mockExec, installMocks, loadModule, mockIpcMain };
