const path = require('path');
const pty = require('node-pty');
const { fsp } = require('./utils');
const { ptyProcesses, getNextPtyId } = require('./state');
const { getTodoDir } = require('./todo');
const { getSpecialistsDir } = require('./specialists');

function register({ ipcMain, BrowserWindow }) {
  ipcMain.handle('pty:spawn', async (event, specialistName, workDir, dims, initialPrompt) => {
    const id = getNextPtyId();
    const shell = process.env.SHELL || '/bin/zsh';
    let cwd, args;

    // For Claude/specialist spawns, explicitly cd to workDir before running the command.
    // Login shells (-l) read profile files that may change the working directory,
    // so we cannot rely on cwd alone to guarantee the correct working directory.
    const safeWorkDir = workDir.replace(/'/g, "'\"'\"'");

    // Compute todo dir for all Claude-based sessions so agents can @ reference todo files
    let todoDirFlag = '';
    if (specialistName !== '__TERMINAL__') {
      try {
        const todoDir = await getTodoDir(workDir);
        await fsp.mkdir(todoDir, { recursive: true });
        const safeTodoDir = todoDir.replace(/'/g, "'\"'\"'");
        todoDirFlag = ` --add-dir '${safeTodoDir}'`;
      } catch {}
    }

    if (specialistName === '__TERMINAL__') {
      cwd = workDir;
      args = ['-l'];
    } else if (specialistName === '__CLAUDE__') {
      cwd = workDir;
      if (initialPrompt) {
        const safePrompt = initialPrompt.replace(/'/g, "'\"'\"'");
        args = ['-l', '-c', `cd '${safeWorkDir}' && claude --dangerously-skip-permissions${todoDirFlag} -- '${safePrompt}'`];
      } else {
        args = ['-l', '-c', `cd '${safeWorkDir}' && claude --dangerously-skip-permissions${todoDirFlag}`];
      }
    } else {
      // CWD is specialist dir so .claude/settings.json and hooks load from there.
      // Project dir loaded via --add-dir so CLAUDE.md and project files are accessible.
      const specialistDir = path.join(await getSpecialistsDir(), specialistName);
      const safeSpecialistDir = specialistDir.replace(/'/g, "'\"'\"'");
      cwd = specialistDir;
      const baseCmd = `cd '${safeSpecialistDir}' && claude --dangerously-skip-permissions --add-dir '${safeWorkDir}'${todoDirFlag}`;
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
      env: { ...process.env, CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1' },
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
