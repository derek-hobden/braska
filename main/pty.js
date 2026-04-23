const path = require('path');
const pty = require('node-pty');
const { fsp } = require('./utils');
const { ptyProcesses, getNextPtyId } = require('./state');
const { getTodoDir } = require('./todo');
const { parseFrontmatter, CLAUDE_AGENTS_DIR } = require('./agents');

function register({ ipcMain, BrowserWindow }) {
  ipcMain.handle('pty:spawn', async (event, agentName, workDir, dims, initialPrompt) => {
    const id = getNextPtyId();
    const shell = process.env.SHELL || '/bin/zsh';
    let cwd = workDir;
    let args;

    // Login shells (-l) read profile files that may change the working directory,
    // so we explicitly cd to workDir before running claude.
    const safeWorkDir = workDir.replace(/'/g, "'\"'\"'");

    // Compute todo dir for all Claude-based sessions so agents can @ reference todo files
    let todoDirFlag = '';
    if (agentName !== '__TERMINAL__') {
      try {
        const todoDir = await getTodoDir(workDir);
        await fsp.mkdir(todoDir, { recursive: true });
        const safeTodoDir = todoDir.replace(/'/g, "'\"'\"'");
        todoDirFlag = ` --add-dir '${safeTodoDir}'`;
      } catch {}
    }

    if (agentName === '__TERMINAL__') {
      args = ['-l'];
    } else if (agentName === '__CLAUDE__') {
      if (initialPrompt) {
        const safePrompt = initialPrompt.replace(/'/g, "'\"'\"'");
        args = ['-l', '-c', `cd '${safeWorkDir}' && claude${todoDirFlag} -- '${safePrompt}'`];
      } else {
        args = ['-l', '-c', `cd '${safeWorkDir}' && claude${todoDirFlag}`];
      }
    } else {
      // Native Claude Code agent: CWD is the project dir, agent config loaded from ~/.claude/agents/.
      if (!/^[a-zA-Z0-9_-]+$/.test(agentName)) throw new Error(`Invalid agent name: ${agentName}`);
      let permFlag = '';
      try {
        const agentFile = path.join(CLAUDE_AGENTS_DIR, `${agentName}.md`);
        const content = await fsp.readFile(agentFile, 'utf-8');
        const { meta } = parseFrontmatter(content);
        if (meta.permissionMode === 'bypassPermissions') permFlag = ' --dangerously-skip-permissions';
      } catch {}
      const baseCmd = `cd '${safeWorkDir}' && claude --agent '${agentName}'${permFlag}${todoDirFlag}`;
      if (initialPrompt) {
        const safePrompt = initialPrompt.replace(/'/g, "'\"'\"'");
        args = ['-l', '-c', `${baseCmd} -- '${safePrompt}'`];
      } else {
        args = ['-l', '-c', baseCmd];
      }
    }

    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: dims?.cols || 80,
      rows: dims?.rows || 24,
      cwd,
    });

    ptyProcesses.set(id, proc);
    const win = BrowserWindow.fromWebContents(event.sender);

    proc.onData(data => {
      if (!win?.isDestroyed()) win.webContents.send('pty:data', id, data);
    });

    proc.onExit(({ exitCode }) => {
      if (!win?.isDestroyed()) win.webContents.send('pty:exit', id, exitCode);
      ptyProcesses.delete(id);
    });

    return id;
  });

  ipcMain.on('pty:write', (_event, id, data) => {
    ptyProcesses.get(id)?.write(data);
  });

  ipcMain.on('pty:resize', (_event, id, cols, rows) => {
    try { ptyProcesses.get(id)?.resize(cols, rows); } catch {}
  });

  ipcMain.handle('pty:kill', (_event, id) => {
    const proc = ptyProcesses.get(id);
    if (proc) {
      proc.kill();
      ptyProcesses.delete(id);
    }
  });
}

module.exports = { register };
