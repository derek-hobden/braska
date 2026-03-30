const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { execSync, execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const pty = require('node-pty');

if (process.platform === 'darwin') {
  app.setName('Braska');
}

const ptyProcesses = new Map();
let nextPtyId = 1;
let activeWatcher = null;

async function pathExists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

function getProjectsFile() {
  return path.join(app.getPath('userData'), 'projects.json');
}

async function loadProjects() {
  const file = getProjectsFile();
  if (!await pathExists(file)) return [];
  return JSON.parse(await fsp.readFile(file, 'utf-8'));
}

async function saveProjects(projects) {
  await fsp.writeFile(getProjectsFile(), JSON.stringify(projects, null, 2));
}

async function getGitInfo(projectPath) {
  try {
    if (!await pathExists(path.join(projectPath, '.git'))) return { isGit: false, worktrees: [] };
    const { stdout: output } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const worktrees = [];
    let isFirst = true;
    for (const block of output.trim().split('\n\n')) {
      const wt = { isMain: isFirst, isLocked: false };
      isFirst = false;
      for (const line of block.trim().split('\n')) {
        if (line.startsWith('worktree ')) wt.path = line.slice(9);
        else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '');
        else if (line === 'detached') wt.branch = '(detached)';
        else if (line === 'locked' || line.startsWith('locked ')) wt.isLocked = true;
        else if (line === 'prunable' || line.startsWith('prunable ')) wt.isPrunable = true;
      }
      if (wt.path) worktrees.push(wt);
    }
    return { isGit: true, worktrees };
  } catch {
    return { isGit: false, worktrees: [] };
  }
}

// Skills management
async function getSkillsDir() {
  const dir = path.join(os.homedir(), '.braska', 'skills');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function listSkills() {
  const dir = await getSkillsDir();
  const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.md'));
  return Promise.all(files.map(async f => {
    const content = await fsp.readFile(path.join(dir, f), 'utf-8');
    return { name: f.replace(/\.md$/, ''), content };
  }));
}

// Specialists management
async function getSpecialistsDir() {
  const dir = path.join(os.homedir(), '.braska', 'specialists');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

const BUILTIN_SPECIALISTS = ['ticketmaster', 'debugger', 'code-reviewer', 'issue-creator'];

async function listSpecialists() {
  const dir = await getSpecialistsDir();
  const dirents = (await fsp.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory());
  return Promise.all(dirents.map(async d => {
    const specialistDir = path.join(dir, d.name);
    const claudeFile = path.join(specialistDir, 'claude.md');
    let instructions = '';
    try { instructions = await fsp.readFile(claudeFile, 'utf-8'); } catch {}
    const skillsDir = path.join(specialistDir, '.claude', 'skills');
    let skills = [];
    if (await pathExists(skillsDir)) {
      skills = (await fsp.readdir(skillsDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name);
    }
    return { name: d.name, instructions, skills, builtin: BUILTIN_SPECIALISTS.includes(d.name) };
  }));
}

// System specialists — auto-created on startup
async function ensureSystemSpecialists() {
  const ticketmasterDir = path.join(await getSpecialistsDir(), 'ticketmaster');
  const claudeFile = path.join(ticketmasterDir, 'claude.md');
  await fsp.mkdir(ticketmasterDir, { recursive: true });
  await fsp.writeFile(claudeFile, `You are the Ticketmaster for Braska. Your job is to help the user create well-formatted ticket files.

IMPORTANT RESTRICTIONS:
- You may ONLY create, read, edit, move, and delete files inside \`.braska/tickets/\`.
- You must NEVER create, edit, delete, or modify any files outside \`.braska/tickets/\`. This includes source code, configuration, documentation, scripts, and any other project files.
- If the user asks you to make code changes, fix bugs, or edit non-ticket files, refuse and explain that you are the Ticketmaster and can only manage tickets. Suggest they use an appropriate specialist instead.

Tickets are stored in .braska/tickets/ relative to the current working directory.

TICKET FILE FORMAT:
\`\`\`markdown
# Ticket Title

## Priority: High|Medium|Low

## Description
Detailed description of the problem or feature request...

## Tasks
- Task 1
- Task 2
\`\`\`

FILE NAMING: NN-kebab-case-title.md (e.g. 03-fix-auth-crash.md) where NN is the next available number.
SAVE LOCATION: .braska/tickets/open/

When you start:
1. First ensure the tickets directory exists: mkdir -p .braska/tickets/open
2. Check existing ticket files in .braska/tickets/open/, .braska/tickets/done/, and .braska/tickets/cancelled/ to determine the next number
3. Ask the user what ticket they would like to create
4. When you have enough information, write the file
5. After writing, confirm the ticket was created with its number and title
`, 'utf-8');

  // Ticketmaster file-edit hook enforcement (hard restriction)
  const ticketmasterHooksDir = path.join(ticketmasterDir, '.claude', 'hooks');
  await fsp.mkdir(ticketmasterHooksDir, { recursive: true });

  const ticketmasterSettingsFile = path.join(ticketmasterDir, '.claude', 'settings.json');
  await fsp.writeFile(ticketmasterSettingsFile, JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: "Edit|Write",
          hooks: [
            {
              type: "command",
              command: `bash '${path.join(ticketmasterHooksDir, 'protect-files.sh')}'`
            }
          ]
        }
      ]
    }
  }, null, 2), 'utf-8');

  const protectFilesScript = path.join(ticketmasterHooksDir, 'protect-files.sh');
  await fsp.writeFile(protectFilesScript, `#!/bin/bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == */.braska/tickets/* ]]; then
  exit 0  # allowed
fi

echo "BLOCKED: Ticketmaster can only edit files inside .braska/tickets/" >&2
exit 2  # reject
`, 'utf-8');
  await fsp.chmod(protectFilesScript, 0o755);

  const debuggerDir = path.join(await getSpecialistsDir(), 'debugger');
  const debuggerClaudeFile = path.join(debuggerDir, 'claude.md');
  await fsp.mkdir(debuggerDir, { recursive: true });
  await fsp.writeFile(debuggerClaudeFile, `You are the Master Debugger for Braska. Your job is to help the user systematically debug issues in their codebase.

DEBUGGING METHODOLOGY — follow this sequence rigorously:

1. REPRODUCE: First, understand and reproduce the problem.
   - Ask the user for the exact error message, stack trace, or unexpected behavior.
   - Identify the steps to reproduce.
   - Run the failing command or test yourself if possible to confirm the issue.

2. GATHER CONTEXT: Collect information before forming hypotheses.
   - Read the full error message and stack trace carefully — every line matters.
   - Check recent changes: run git log --oneline -20 and git diff to find regression candidates.
   - Identify the relevant files and code paths involved.
   - Check logs, console output, and any other diagnostic information.

3. ISOLATE: Narrow down the problem area.
   - Use binary search / divide-and-conquer: if the problem could be in many places, systematically eliminate halves.
   - Add targeted logging or use print-debugging to trace execution flow.
   - Check whether the issue is in the code, the data, the environment, or the configuration.
   - Create a minimal reproduction case when possible.

4. IDENTIFY ROOT CAUSE: Find the actual underlying problem, not just symptoms.
   - Do NOT jump to conclusions — verify each hypothesis with evidence.
   - Check for common bug patterns:
     - Off-by-one errors
     - Null/undefined references
     - Race conditions or timing issues
     - State mutation side effects
     - Type coercion or implicit conversions
     - Missing error handling
     - Incorrect assumptions about API contracts
     - Environment differences (dev vs prod)
   - Distinguish between the root cause and its symptoms.

5. FIX: Implement a targeted fix.
   - Fix the root cause, not just the symptom.
   - Keep the fix minimal and focused — do not refactor unrelated code.
   - Consider edge cases that the fix might affect.

6. VERIFY: Confirm the fix works.
   - Re-run the original reproduction steps.
   - Run related tests to check for regressions.
   - If no tests exist for this case, suggest writing one.

WORKING PRINCIPLES:
- Be methodical. Never guess — form hypotheses and test them.
- Document your findings as you go: state what you checked, what you found, and what you ruled out.
- Read error messages completely before doing anything else. The answer is often right there.
- When stuck, step back and question your assumptions.
- Prefer reading code over asking the user questions you could answer yourself.
- If you identify the bug but the fix is outside your confidence, explain what you found and suggest next steps rather than making a risky change.
- Always explain your reasoning so the user can learn from the debugging process.

When you start:
1. Ask the user to describe the problem: what is happening, what they expected, and any error messages or logs.
2. Begin the REPRODUCE step immediately — try to see the failure yourself.
3. Work through the methodology step by step, reporting progress as you go.
`, 'utf-8');

  const codeReviewerDir = path.join(await getSpecialistsDir(), 'code-reviewer');
  const codeReviewerClaudeFile = path.join(codeReviewerDir, 'claude.md');
  await fsp.mkdir(codeReviewerDir, { recursive: true });
  await fsp.writeFile(codeReviewerClaudeFile, `You are the Code Reviewer for Braska. Your job is to perform thorough, structured code reviews.

IMPORTANT RESTRICTIONS:
- You are READ-ONLY. You must NEVER create, edit, delete, or modify any source files, configuration files, or project files.
- Your sole purpose is to review code and provide feedback. If the user asks you to fix something, explain the issue and suggest a fix, but do NOT make the change yourself. Suggest they use an appropriate specialist instead.

When you start:
1. Ask the user what they would like you to review. Offer these options:
   - Staged changes (git diff --cached)
   - Unstaged changes (git diff)
   - All uncommitted changes (git diff HEAD)
   - A specific branch compared to main/master (git diff main..branch)
   - Specific files or directories
   - A recent commit or commit range (git diff <commit1>..<commit2>)
2. Once the user chooses, gather the code using git diff, git show, or by reading files as appropriate.
3. Produce your review in the structured format described below.

REVIEW METHODOLOGY — examine every change for:

1. CORRECTNESS: Logic errors, off-by-one mistakes, wrong conditions, incorrect return values, null/undefined handling, race conditions, broken control flow.
2. SECURITY: Injection vulnerabilities (SQL, XSS, command injection), hardcoded secrets, missing input validation, insecure defaults, authentication/authorization issues, data exposure, OWASP top 10.
3. PERFORMANCE: Unnecessary allocations, O(n²) where O(n) is possible, N+1 queries, redundant computation, blocking calls in async contexts, memory leaks.
4. CODE QUALITY: Unclear naming, excessive complexity, duplicated logic, violations of single responsibility, dead code, overly long functions.
5. ERROR HANDLING: Swallowed errors, missing try/catch, unhelpful error messages, failure to handle edge cases (null, empty, boundary values).
6. STYLE & CONSISTENCY: Violations of the project's existing conventions, inconsistent formatting, import ordering, misleading comments.
7. TESTING: Missing test coverage for new logic, untested edge cases, brittle assertions.
8. DOCUMENTATION: Missing or outdated comments for non-obvious logic, unclear API contracts, undocumented side effects.

OUTPUT FORMAT — structure your review as follows:

## Review Summary

**Scope:** (what was reviewed — e.g. "staged changes", "src/auth/ directory", "feature/login branch vs main")
**Files reviewed:** (count and list)
**Overall assessment:** (1-2 sentence summary)

## Critical Issues
Items that MUST be fixed — bugs, security vulnerabilities, data loss risks.
- \\\`file/path.ts:42\\\` — description of the issue and why it is critical
  > the offending code snippet
  **Suggested fix:** explanation

## Warnings
Items that SHOULD be fixed — performance problems, poor error handling, fragile logic.
- \\\`file/path.ts:87\\\` — description
  > code snippet
  **Suggested fix:** explanation

## Suggestions
Items that COULD be improved — style, readability, minor refactors.
- \\\`file/path.ts:15\\\` — description
  **Suggestion:** explanation

## Looks Good
Positive callouts — well-written code, good patterns, nice test coverage.

If a section has no items, write "None found." under it.

WORKING PRINCIPLES:
- Be precise: always cite file paths and line numbers.
- Be constructive: suggest concrete fixes, not just complaints.
- Be calibrated: do not mark style nits as critical. Reserve Critical for genuine bugs and security issues.
- Be thorough: review ALL files in the diff, not just the first one.
- When uncertain about intent, ask rather than assume.
- Consider the broader context: does this change interact safely with the rest of the codebase?
`, 'utf-8');
}

// Per-project ticket tracking
const migratedProjects = new Set();
async function getTicketsDir(workDir) {
  // Migrate legacy .the-agency / .yuna directories (once per project per session)
  if (!migratedProjects.has(workDir)) {
    migratedProjects.add(workDir);
    const newDir = path.join(workDir, '.braska');
    try {
      const agencyDir = path.join(workDir, '.the-agency');
      if (await pathExists(agencyDir) && !await pathExists(newDir)) {
        await fsp.rename(agencyDir, newDir);
      }
      const yunaDir = path.join(workDir, '.yuna');
      if (await pathExists(yunaDir) && !await pathExists(newDir)) {
        await fsp.rename(yunaDir, newDir);
      }
    } catch (err) {
      console.error(`Failed to migrate to ${newDir}:`, err.message);
    }
  }
  return path.join(workDir, '.braska', 'tickets');
}

async function ensureTicketsDirs(workDir) {
  const dir = await getTicketsDir(workDir);
  const openDir = path.join(dir, 'open');
  const doneDir = path.join(dir, 'done');
  const cancelledDir = path.join(dir, 'cancelled');
  await fsp.mkdir(openDir, { recursive: true });
  await fsp.mkdir(doneDir, { recursive: true });
  await fsp.mkdir(cancelledDir, { recursive: true });
  // Migrate legacy closed/ tickets to done/
  const legacyClosedDir = path.join(dir, 'closed');
  if (await pathExists(legacyClosedDir)) {
    try {
      for (const f of await fsp.readdir(legacyClosedDir)) {
        await fsp.rename(path.join(legacyClosedDir, f), path.join(doneDir, f));
      }
      await fsp.rmdir(legacyClosedDir);
    } catch {}
  }
}

async function listTickets(workDir) {
  const dir = await getTicketsDir(workDir);
  const results = [];
  for (const status of ['open', 'done', 'cancelled']) {
    const subdir = path.join(dir, status);
    try {
      for (const f of await fsp.readdir(subdir)) {
        if (!f.endsWith('.md')) continue;
        const filePath = path.join(subdir, f);
        const content = await fsp.readFile(filePath, 'utf-8');
        const titleMatch = content.match(/^# (.+)$/m);
        const prioMatch = content.match(/^## Priority:\s*(.+)$/m);
        results.push({
          filename: f,
          title: titleMatch ? titleMatch[1].trim() : f.replace(/\.md$/, ''),
          priority: prioMatch ? prioMatch[1].trim() : null,
          status,
          path: filePath,
        });
      }
    } catch {}
  }
  results.sort((a, b) => {
    const na = parseInt(a.filename) || 0;
    const nb = parseInt(b.filename) || 0;
    return nb - na;
  });
  return results;
}

function createWindow() {
  // Splash screen — shows instantly while main window loads
  const splash = new BrowserWindow({
    width: 340,
    height: 340,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#00000000',
  });
  splash.loadFile('splash.html');

  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });

  win.once('ready-to-show', () => {
    // Morph splash into main window shape, then swap
    const endBounds = win.getBounds();
    const startBounds = splash.getBounds();
    const duration = 500;
    const steps = 30;
    let step = 0;

    splash.webContents.executeJavaScript('document.body.classList.add("morph")');

    const interval = setInterval(() => {
      step++;
      const t = step / steps;
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      splash.setBounds({
        x: Math.round(startBounds.x + (endBounds.x - startBounds.x) * ease),
        y: Math.round(startBounds.y + (endBounds.y - startBounds.y) * ease),
        width: Math.round(startBounds.width + (endBounds.width - startBounds.width) * ease),
        height: Math.round(startBounds.height + (endBounds.height - startBounds.height) * ease),
      });

      if (step >= steps) {
        clearInterval(interval);
        // Solid backdrop behind cross-fade so desktop never shows through
        const backdrop = new BrowserWindow({
          ...endBounds,
          frame: false,
          resizable: false,
          backgroundColor: '#1e1e1e',
          skipTaskbar: true,
        });
        backdrop.show();

        // Cross-fade: fade in app behind splash, then fade out splash
        win.setOpacity(0);
        win.show();
        let fadeStep = 0;
        const fadeSteps = 12;
        const fadeInterval = setInterval(() => {
          fadeStep++;
          const ft = fadeStep / fadeSteps;
          win.setOpacity(ft);
          if (!splash.isDestroyed()) splash.setOpacity(1 - ft);
          if (fadeStep >= fadeSteps) {
            clearInterval(fadeInterval);
            if (!splash.isDestroyed()) splash.destroy();
            if (!backdrop.isDestroyed()) backdrop.destroy();
          }
        }, 200 / fadeSteps);
      }
    }, duration / steps);
  });

  // Intercept Cmd+W so it closes the active tab/pane instead of the window
  // Intercept Cmd+T to open the new-tab picker
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.meta || input.control) && input.type === 'keyDown') {
      if (input.key.toLowerCase() === 'w') {
        event.preventDefault();
        win.webContents.send('close-active-tab');
      } else if (input.key.toLowerCase() === 't') {
        event.preventDefault();
        win.webContents.send('open-tab-picker');
      }
    }
  });

  win.loadFile('index.html');
}

async function migrateData() {
  // Home directory: ~/.the-agency -> ~/.braska, ~/.yuna -> ~/.braska
  const braskaHome = path.join(os.homedir(), '.braska');
  try {
    const agencyHome = path.join(os.homedir(), '.the-agency');
    if (await pathExists(agencyHome) && !await pathExists(braskaHome)) {
      await fsp.rename(agencyHome, braskaHome);
    }
    const yunaHome = path.join(os.homedir(), '.yuna');
    if (await pathExists(yunaHome) && !await pathExists(braskaHome)) {
      await fsp.rename(yunaHome, braskaHome);
    }
  } catch (err) {
    console.error('Failed to migrate home directory:', err.message);
  }

  // Electron userData: projects.json
  const newUserData = app.getPath('userData');
  const newProjects = path.join(newUserData, 'projects.json');
  for (const legacyName of ['the-agency', 'Yuna']) {
    try {
      const oldUserData = path.join(app.getPath('appData'), legacyName);
      if (oldUserData !== newUserData) {
        const oldProjects = path.join(oldUserData, 'projects.json');
        if (await pathExists(oldProjects) && !await pathExists(newProjects)) {
          await fsp.mkdir(newUserData, { recursive: true });
          await fsp.copyFile(oldProjects, newProjects);
        }
      }
    } catch (err) {
      console.error(`Failed to migrate userData from ${legacyName}:`, err.message);
    }
  }
}

app.whenReady().then(async () => {
  await migrateData();
  await ensureSystemSpecialists();
  createWindow();

  ipcMain.handle('projects:list', async () => {
    const projects = await loadProjects();
    return Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })));
  });

  ipcMain.handle('projects:add', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    const folderPath = filePaths[0];
    const projects = await loadProjects();
    if (projects.some((p) => p.path === folderPath)) return null;
    const project = { path: folderPath, name: path.basename(folderPath) };
    projects.push(project);
    await saveProjects(projects);
    return project;
  });

  ipcMain.handle('projects:remove', async (_event, projectPath) => {
    const projects = (await loadProjects()).filter((p) => p.path !== projectPath);
    await saveProjects(projects);
    return Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })));
  });

  ipcMain.handle('skills:list', () => listSkills());

  ipcMain.handle('skills:save', async (_event, name, content) => {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fsp.writeFile(path.join(await getSkillsDir(), `${safe}.md`), content, 'utf-8');
    return listSkills();
  });

  ipcMain.handle('skills:remove', async (_event, name) => {
    const file = path.join(await getSkillsDir(), `${name}.md`);
    if (await pathExists(file)) await fsp.unlink(file);
    return listSkills();
  });

  ipcMain.handle('specialists:list', () => listSpecialists());

  ipcMain.handle('specialists:save', async (_event, name, instructions, skillNames) => {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const specialistDir = path.join(await getSpecialistsDir(), safe);
    const skillsDir = path.join(specialistDir, '.claude', 'skills');
    await fsp.mkdir(skillsDir, { recursive: true });
    await fsp.writeFile(path.join(specialistDir, 'claude.md'), instructions, 'utf-8');
    // Clear existing skill directories
    for (const f of await fsp.readdir(skillsDir)) {
      const p = path.join(skillsDir, f);
      try { await fsp.rm(p, { recursive: true, force: true }); } catch {}
    }
    // Create skill directories with SKILL.md symlinks
    const srcSkillsDir = await getSkillsDir();
    for (const sk of skillNames) {
      const target = path.join(srcSkillsDir, `${sk}.md`);
      if (!await pathExists(target)) continue;
      const skillDir = path.join(skillsDir, sk);
      await fsp.mkdir(skillDir, { recursive: true });
      await fsp.symlink(target, path.join(skillDir, 'SKILL.md'));
    }
    return listSpecialists();
  });

  ipcMain.handle('specialists:remove', async (_event, name) => {
    const specialistDir = path.join(await getSpecialistsDir(), name);
    if (await pathExists(specialistDir)) await fsp.rm(specialistDir, { recursive: true, force: true });
    return listSpecialists();
  });

  // Ticket tracking
  ipcMain.handle('tickets:init', (_event, workDir) => ensureTicketsDirs(workDir));
  ipcMain.handle('tickets:list', (_event, workDir) => listTickets(workDir));
  ipcMain.handle('tickets:read', async (_event, filePath) => {
    try { return await fsp.readFile(filePath, 'utf-8'); }
    catch { return ''; }
  });
  ipcMain.handle('tickets:close', async (_event, filePath, status) => {
    const targetDir = path.join(path.dirname(path.dirname(filePath)), status);
    await fsp.mkdir(targetDir, { recursive: true });
    const dest = path.join(targetDir, path.basename(filePath));
    await fsp.rename(filePath, dest);
    return dest;
  });

  // PTY / terminal management (multi-tab)
  ipcMain.handle('pty:spawn', async (event, specialistName, workDir, dims, initialPrompt) => {
    const id = nextPtyId++;
    const shell = process.env.SHELL || '/bin/zsh';
    let cwd, args;

    // For Claude/specialist spawns, explicitly cd to workDir before running the command.
    // Login shells (-l) read profile files that may change the working directory,
    // so we cannot rely on cwd alone to guarantee the correct working directory.
    const safeWorkDir = workDir.replace(/'/g, "'\"'\"'");

    if (specialistName === '__TERMINAL__') {
      cwd = workDir;
      args = ['-l'];
    } else if (specialistName === '__CLAUDE__') {
      cwd = workDir;
      if (initialPrompt) {
        const safePrompt = initialPrompt.replace(/'/g, "'\"'\"'");
        args = ['-l', '-c', `cd '${safeWorkDir}' && claude --dangerously-skip-permissions -- '${safePrompt}'`];
      } else {
        args = ['-l', '-c', `cd '${safeWorkDir}' && claude --dangerously-skip-permissions`];
      }
    } else {
      // CWD is project dir so @ file autocompletion works.
      // Specialist's claude.md loaded via --add-dir + env var. Skills auto-load from --add-dir.
      cwd = workDir;
      const specialistDir = path.join(await getSpecialistsDir(), specialistName);
      const safeSpecialistDir = specialistDir.replace(/'/g, "'\"'\"'");
      const baseCmd = `cd '${safeWorkDir}' && claude --dangerously-skip-permissions --add-dir '${safeSpecialistDir}'`;
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

  ipcMain.handle('file:read', async (_event, filePath) => {
    return fsp.readFile(filePath, 'utf-8');
  });

  ipcMain.handle('file:save', async (_event, filePath, content) => {
    await fsp.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('filetree:list', async (_event, dirPath) => {
    try {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      return entries
        .map(e => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  });

  ipcMain.on('filetree:watch', (event, dirPath) => {
    if (activeWatcher) { activeWatcher.close(); activeWatcher = null; }
    if (!dirPath) return;
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      activeWatcher = fs.watch(dirPath, { recursive: true }, (_eventType, filename) => {
        if (!win?.isDestroyed()) win.webContents.send('filetree:changed', filename);
      });
      activeWatcher.on('error', () => {});
    } catch {}
  });

  ipcMain.on('filetree:unwatch', () => {
    if (activeWatcher) { activeWatcher.close(); activeWatcher = null; }
  });

  // Git diff/changes handlers
  ipcMain.handle('git:status', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      try { execSync('git rev-parse --git-dir', opts); }
      catch { return { isGit: false, unstaged: [], staged: [], untracked: [] }; }

      const parseNumstat = (out) => {
        const t = out.trim();
        if (!t) return [];
        return t.split('\n').map(line => {
          const [a, d, ...rest] = line.split('\t');
          return { file: rest.join('\t'), added: a === '-' ? 0 : +a, deleted: d === '-' ? 0 : +d };
        });
      };

      let unstaged = [], staged = [], untracked = [];
      try { unstaged = parseNumstat(execSync('git diff --no-renames --numstat', opts)); } catch {}
      try { staged = parseNumstat(execSync('git diff --cached --no-renames --numstat', opts)); } catch {}
      try {
        const out = execSync('git ls-files --others --exclude-standard', opts).trim();
        if (out) untracked = out.split('\n');
      } catch {}

      return { isGit: true, unstaged, staged, untracked };
    } catch {
      return { isGit: false, unstaged: [], staged: [], untracked: [] };
    }
  });

  ipcMain.handle('git:worktree-metrics', async (_event, projectPath) => {
    try {
      const info = await getGitInfo(projectPath);
      if (!info.isGit) return [];

      // Detect default branch name
      let defaultBranch = 'main';
      try {
        const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: projectPath, encoding: 'utf-8', timeout: 5000 });
        const ref = stdout.trim().replace('refs/remotes/origin/', '');
        if (ref) defaultBranch = ref;
      } catch {
        // Fallback: check if 'main' or 'master' exists
        try {
          await execFileAsync('git', ['rev-parse', '--verify', 'master'], { cwd: projectPath, encoding: 'utf-8', timeout: 5000 });
          defaultBranch = 'master';
        } catch {}
      }

      const results = await Promise.all(info.worktrees.map(async (wt) => {
        const m = { path: wt.path, changed: 0, untracked: 0, ahead: 0, behind: 0 };
        const opts = { cwd: wt.path, encoding: 'utf-8', timeout: 10000 };
        try {
          const { stdout } = await execFileAsync('git', ['status', '--porcelain'], opts);
          if (stdout.trim()) {
            for (const line of stdout.trim().split('\n')) {
              if (line.startsWith('?? ')) m.untracked++;
              else m.changed++;
            }
          }
        } catch {}
        // Skip ahead/behind for the default branch itself
        if (wt.branch && wt.branch !== defaultBranch && wt.branch !== '(detached)') {
          try {
            const { stdout } = await execFileAsync('git', ['rev-list', '--count', `${defaultBranch}..HEAD`], opts);
            m.ahead = parseInt(stdout.trim(), 10) || 0;
          } catch {}
          try {
            const { stdout } = await execFileAsync('git', ['rev-list', '--count', `HEAD..${defaultBranch}`], opts);
            m.behind = parseInt(stdout.trim(), 10) || 0;
          } catch {}
        }
        return m;
      }));

      return results;
    } catch {
      return [];
    }
  });

  ipcMain.handle('git:diff', (_event, workDir, filePath, isStaged) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 };
      const safeFile = filePath.replace(/'/g, "'\"'\"'");
      const cmd = isStaged ? `git diff --cached -- '${safeFile}'` : `git diff -- '${safeFile}'`;
      return execSync(cmd, opts);
    } catch { return ''; }
  });

  ipcMain.handle('git:log', (_event, workDir, count) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const n = Math.min(Math.max(parseInt(count) || 20, 1), 100);
      const out = execSync(`git log --format="%H%x00%s%x00%an%x00%ar" -${n}`, opts).trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [hash, message, author, date] = line.split('\0');
        return { hash, message, author, date };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:commit-files', (_event, workDir, hash) => {
    try {
      if (!/^[0-9a-f]+$/i.test(hash)) return [];
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const out = execSync(`git diff-tree --no-commit-id --numstat -r ${hash}`, opts).trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [a, d, ...rest] = line.split('\t');
        return { file: rest.join('\t'), added: a === '-' ? 0 : +a, deleted: d === '-' ? 0 : +d };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:diff-commit', (_event, workDir, hash, filePath) => {
    if (!/^[0-9a-f]+$/i.test(hash)) return '';
    const safeFile = filePath.replace(/'/g, "'\"'\"'");
    const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 };
    try {
      return execSync(`git diff ${hash}~1 ${hash} -- '${safeFile}'`, opts);
    } catch {
      try { return execSync(`git show ${hash} -- '${safeFile}'`, opts); }
      catch { return ''; }
    }
  });

  // Git operations — staging, commit, network, branches, stash
  const safe = s => s.replace(/'/g, "'\"'\"'");

  ipcMain.handle('git:stage-all', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      execSync('git add -A', opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:stage', (_event, workDir, filePaths) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const escaped = filePaths.map(f => `'${safe(f)}'`).join(' ');
      execSync(`git add -- ${escaped}`, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:unstage', (_event, workDir, filePaths) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const escaped = filePaths.map(f => `'${safe(f)}'`).join(' ');
      execSync(`git reset HEAD -- ${escaped}`, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:commit', (_event, workDir, message) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 15000 };
      const out = execSync(`git commit -m '${safe(message)}'`, opts);
      return { ok: true, summary: out.trim() };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:generate-commit-msg', async (_event, workDir) => {
    try {
      let patch = execSync('git diff --cached', { cwd: workDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
      if (!patch.trim()) return { ok: false, error: 'No staged changes' };
      if (patch.length > 20000) patch = patch.slice(0, 20000) + '\n\n[diff truncated]';
      const safe = s => s.replace(/'/g, "'\"'\"'");
      const prompt = `Write a commit message for this diff. First line: concise summary under 72 chars. If the change is non-trivial, add a blank line then bullet points explaining what changed. Output ONLY the message, no fences or quotes.\n\n${patch}`;
      return new Promise((resolve) => {
        require('child_process').exec(
          `claude -p --model claude-haiku-4-5-20251001 --max-turns 1`,
          { cwd: workDir, encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024, shell: process.env.SHELL || '/bin/zsh' },
          (error, stdout, stderr) => {
            if (error) resolve({ ok: false, error: stderr || error.message });
            else resolve({ ok: true, message: stdout.trim() });
          }
        ).stdin.end(prompt);
      });
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:fetch', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      const out = execSync('git fetch --all 2>&1', opts);
      return { ok: true, output: out };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:pull', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      const out = execSync('git pull', opts);
      return { ok: true, output: out.trim() };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const hasConflicts = msg.includes('CONFLICT') || msg.includes('Automatic merge failed');
      return { ok: false, error: msg, hasConflicts };
    }
  });

  ipcMain.handle('git:push', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      execSync('git push 2>&1', opts);
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const noUpstream = msg.includes('no upstream') || msg.includes('has no upstream branch');
      return { ok: false, error: msg, noUpstream };
    }
  });

  ipcMain.handle('git:push-set-upstream', (_event, workDir, branch) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      execSync(`git push --set-upstream origin '${safe(branch)}' 2>&1`, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:pull-latest-main', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };

      // Determine main branch name
      let mainBranch = 'main';
      try {
        const root = execSync('git rev-parse --show-toplevel', { ...opts, timeout: 5000 }).trim();
        const info = await getGitInfo(root);
        const mainWt = info.worktrees.find(w => w.isMain);
        if (mainWt && mainWt.branch && mainWt.branch !== '(detached)') {
          mainBranch = mainWt.branch;
        }
      } catch { /* use fallback */ }

      // Check current branch
      let currentBranch;
      try {
        currentBranch = execSync('git symbolic-ref --short HEAD', { ...opts, timeout: 5000 }).trim();
      } catch {
        return { ok: false, error: 'Cannot determine current branch (detached HEAD?)' };
      }
      if (currentBranch === mainBranch) {
        return { ok: false, error: 'Already on the main branch. Use Pull instead.' };
      }

      // Check for uncommitted changes
      const status = execSync('git status --porcelain', opts).trim();
      if (status) {
        const count = status.split('\n').length;
        return { ok: false, error: `${count} uncommitted change${count !== 1 ? 's' : ''}. Commit or stash before pulling main.`, isDirty: true, dirtyCount: count };
      }

      // Determine merge target: origin/main if remote exists, otherwise local main
      let hasRemote = false;
      try {
        const remotes = execSync('git remote', { ...opts, timeout: 5000 }).trim();
        hasRemote = remotes.length > 0;
      } catch { /* no remotes */ }

      let mergeTarget;
      if (hasRemote) {
        execSync('git fetch origin 2>&1', opts);
        mergeTarget = `origin/${safe(mainBranch)}`;
      } else {
        mergeTarget = safe(mainBranch);
      }

      // Check if already up to date
      try {
        execSync(`git merge-base --is-ancestor '${mergeTarget}' HEAD`, { ...opts, timeout: 10000 });
        return { ok: true, alreadyUpToDate: true };
      } catch { /* not ancestor — there are changes to merge */ }

      // Merge main into current branch
      try {
        const out = execSync(`git merge '${mergeTarget}' 2>&1`, opts);
        return { ok: true, output: out.trim() };
      } catch (mergeErr) {
        const msg = (mergeErr.stderr || mergeErr.stdout || mergeErr.message || '').toString();
        if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
          try { execSync('git merge --abort', opts); } catch { /* ignore */ }
          return { ok: false, hasConflicts: true, error: 'Merge conflicts with main. The merge has been aborted.' };
        }
        return { ok: false, error: msg };
      }
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:current-branch', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      return execSync('git symbolic-ref --short HEAD', opts).trim();
    } catch {
      try {
        const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
        return '(detached: ' + execSync('git rev-parse --short HEAD', opts).trim() + ')';
      } catch { return ''; }
    }
  });

  ipcMain.handle('git:branch-list', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const fmt = '%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)';
      const out = execSync(`git branch --format="${fmt}"`, opts).trim();
      if (!out) return [];
      const wtInfo = await getGitInfo(workDir);
      const wtBranches = new Map();
      for (const w of wtInfo.worktrees) {
        if (w.branch && w.branch !== '(detached)') wtBranches.set(w.branch, w.path);
      }
      return out.split('\n').filter(Boolean).map(line => {
        const [name, head, tracking, trackInfo] = line.split('\0');
        const isCurrent = head === '*';
        const inWorktree = !isCurrent && wtBranches.has(name);
        const worktreePath = inWorktree ? wtBranches.get(name) : null;
        let ahead = 0, behind = 0;
        if (trackInfo) {
          const aMatch = trackInfo.match(/ahead (\d+)/);
          const bMatch = trackInfo.match(/behind (\d+)/);
          if (aMatch) ahead = parseInt(aMatch[1]);
          if (bMatch) behind = parseInt(bMatch[1]);
        }
        return { name, isCurrent, tracking: tracking || null, ahead, behind, inWorktree, worktreePath };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:branch-create', (_event, workDir, name, startPoint) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const cmd = startPoint
        ? `git branch '${safe(name)}' '${safe(startPoint)}'`
        : `git branch '${safe(name)}'`;
      execSync(cmd, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:branch-switch', async (_event, workDir, name) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const wtInfo = await getGitInfo(workDir);
      for (const w of wtInfo.worktrees) {
        if (w.branch === name && !w.isMain) {
          return { ok: false, error: `Branch '${name}' is checked out in worktree at ${w.path}`, inWorktree: true };
        }
      }
      execSync(`git switch '${safe(name)}'`, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:branch-delete', async (_event, workDir, name, force) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const wtInfo = await getGitInfo(workDir);
      for (const w of wtInfo.worktrees) {
        if (w.branch === name) {
          return { ok: false, error: `Branch '${name}' is checked out in a worktree at ${w.path}` };
        }
      }
      const flag = force ? '-D' : '-d';
      execSync(`git branch ${flag} '${safe(name)}'`, opts);
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const notMerged = msg.includes('not fully merged');
      return { ok: false, error: msg, notMerged };
    }
  });

  ipcMain.handle('git:stash-list', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const out = execSync('git stash list --format="%gd%x00%s%x00%ar"', opts).trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [ref, message, date] = line.split('\0');
        return { ref, message, date };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:stash-save', (_event, workDir, message) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const cmd = message ? `git stash push -u -m '${safe(message)}'` : 'git stash push -u';
      execSync(cmd, opts);
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      if (msg.includes('No local changes')) return { ok: false, error: 'No changes to stash' };
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('git:stash-pop', (_event, workDir, index) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const n = parseInt(index) || 0;
      execSync(`git stash pop stash@{${n}}`, opts);
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const hasConflicts = msg.includes('CONFLICT') || msg.includes('could not apply');
      return { ok: false, error: msg, hasConflicts };
    }
  });

  ipcMain.handle('git:stash-drop', (_event, workDir, index) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const n = parseInt(index) || 0;
      execSync(`git stash drop stash@{${n}}`, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  // Worktree management
  ipcMain.handle('git:branches', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const out = execSync('git branch --format="%(refname:short)"', opts).trim();
      if (!out) return [];
      const allBranches = out.split('\n').filter(Boolean);
      // Filter out branches already checked out in other worktrees
      const wtInfo = await getGitInfo(workDir);
      const checkedOut = new Set(wtInfo.worktrees.map(w => w.branch).filter(Boolean));
      return allBranches.filter(b => !checkedOut.has(b));
    } catch { return []; }
  });

  ipcMain.handle('git:worktree-add', async (_event, workDir, worktreePath, branch, createNew) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 15000 };
      const safePath = worktreePath.replace(/'/g, "'\"'\"'");
      const safeBranch = branch.replace(/'/g, "'\"'\"'");
      const cmd = createNew
        ? `git worktree add -b '${safeBranch}' '${safePath}'`
        : `git worktree add '${safePath}' '${safeBranch}'`;
      execSync(cmd, opts);
      return { ok: true };
    } catch (err) {
      if (err.stderr && err.stderr.includes('already exists')) {
        try {
          // Remove leftover worktree directory if it exists but isn't a valid worktree
          if (await pathExists(worktreePath)) {
            execSync(`git worktree remove '${worktreePath.replace(/'/g, "'\"'\"'")}' --force`, { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
          }
          const opts = { cwd: workDir, encoding: 'utf-8', timeout: 15000 };
          const safePath = worktreePath.replace(/'/g, "'\"'\"'");
          const safeBranch = branch.replace(/'/g, "'\"'\"'");
          execSync(`git worktree add '${safePath}' '${safeBranch}'`, opts);
          return { ok: true };
        } catch (retryErr) {
          return { ok: false, error: retryErr.stderr || retryErr.message };
        }
      }
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:worktree-remove', async (_event, workDir, worktreePath, force, deleteBranch) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };

      // Resolve the branch for this worktree before removing it
      let wtBranch = null;
      if (deleteBranch) {
        const info = await getGitInfo(workDir);
        const wt = info.worktrees.find(w => w.path === worktreePath);
        if (wt && wt.branch && !wt.isMain) wtBranch = wt.branch;
      }

      const safePath = worktreePath.replace(/'/g, "'\"'\"'");
      const cmd = force
        ? `git worktree remove --force '${safePath}'`
        : `git worktree remove '${safePath}'`;
      execSync(cmd, opts);

      // Delete the branch after worktree removal
      if (wtBranch) {
        const safeBranch = wtBranch.replace(/'/g, "'\"'\"'");
        try { execSync(`git branch -d '${safeBranch}'`, opts); }
        catch {
          // -d fails if not fully merged; use -D to force
          try { execSync(`git branch -D '${safeBranch}'`, opts); } catch {}
        }
      }

      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const isDirty = msg.includes('modified') || msg.includes('untracked') || msg.includes('changes');
      const isLocked = msg.includes('locked');
      return { ok: false, error: msg, isDirty, isLocked };
    }
  });

  ipcMain.handle('git:worktree-prune', (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      execSync('git worktree prune', opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:worktree-lock', (_event, workDir, worktreePath, unlock) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const safePath = worktreePath.replace(/'/g, "'\"'\"'");
      const cmd = unlock
        ? `git worktree unlock '${safePath}'`
        : `git worktree lock '${safePath}'`;
      execSync(cmd, opts);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.stderr || err.message };
    }
  });

  ipcMain.handle('git:merge-preflight', async (_event, workDir, featureWorktreePath) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };

      const featureWt = info.worktrees.find(w => w.path === featureWorktreePath);
      if (!featureWt) return { ok: false, error: 'Worktree not found' };
      if (featureWt.isMain) return { ok: false, error: 'Cannot merge the main worktree into itself' };
      if (featureWt.branch === '(detached)') return { ok: false, error: 'Cannot merge a detached HEAD' };

      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };

      const featureBranch = featureWt.branch;
      const targetBranch = mainWt.branch;
      const opts = { encoding: 'utf-8', timeout: 10000 };
      const safe = s => s.replace(/'/g, "'\"'\"'");

      // Check for uncommitted changes in feature worktree
      let isDirty = false, dirtyFileCount = 0;
      try {
        const status = execSync('git status --porcelain', { ...opts, cwd: featureWorktreePath }).trim();
        if (status) {
          isDirty = true;
          dirtyFileCount = status.split('\n').length;
        }
      } catch { /* ignore */ }

      // Get commits that would be merged
      let commits = [], commitCount = 0;
      try {
        const log = execSync(`git log --oneline '${safe(targetBranch)}..${safe(featureBranch)}'`, { ...opts, cwd: workDir }).trim();
        if (log) {
          commits = log.split('\n').slice(0, 20).map(line => {
            const sp = line.indexOf(' ');
            return { hash: line.slice(0, sp), message: line.slice(sp + 1) };
          });
          commitCount = log.split('\n').length;
        }
      } catch { /* branches may have diverged, that's ok */ }

      // Check if already merged
      let alreadyMerged = false;
      try {
        execSync(`git merge-base --is-ancestor '${safe(featureBranch)}' '${safe(targetBranch)}'`, { ...opts, cwd: workDir });
        alreadyMerged = true;
      } catch { /* non-zero exit = not ancestor = not merged */ }

      return {
        ok: true,
        featureBranch,
        targetBranch,
        targetWorktreePath: mainWt.path,
        isDirty,
        dirtyFileCount,
        isLocked: featureWt.isLocked || false,
        alreadyMerged,
        commitCount,
        commits,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('git:merge-and-cleanup', async (_event, workDir, featureWorktreePath, force) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };

      const featureWt = info.worktrees.find(w => w.path === featureWorktreePath);
      if (!featureWt) return { ok: false, error: 'Worktree not found' };

      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };

      const featureBranch = featureWt.branch;
      const targetBranch = mainWt.branch;
      const safe = s => s.replace(/'/g, "'\"'\"'");
      const opts = { encoding: 'utf-8', timeout: 30000 };

      // Merge feature branch into main (must run from main worktree dir)
      try {
        execSync(`git merge '${safe(featureBranch)}'`, { ...opts, cwd: mainWt.path });
      } catch (mergeErr) {
        const msg = (mergeErr.stderr || mergeErr.stdout || mergeErr.message || '').toString();
        if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
          try { execSync('git merge --abort', { ...opts, cwd: mainWt.path }); } catch { /* ignore */ }
          return { ok: false, hasConflicts: true, error: 'Merge conflicts detected. The merge has been aborted — no changes were made.' };
        }
        return { ok: false, error: msg };
      }

      // Cleanup: remove worktree then delete branch
      try {
        const safePath = featureWorktreePath.replace(/'/g, "'\"'\"'");
        const removeCmd = force
          ? `git worktree remove --force '${safePath}'`
          : `git worktree remove '${safePath}'`;
        execSync(removeCmd, { ...opts, cwd: workDir });

        try {
          execSync(`git branch -d '${safe(featureBranch)}'`, { ...opts, cwd: workDir });
        } catch {
          execSync(`git branch -D '${safe(featureBranch)}'`, { ...opts, cwd: workDir });
        }
      } catch (cleanupErr) {
        return { ok: false, mergeSucceeded: true, cleanupError: cleanupErr.stderr || cleanupErr.message };
      }

      return { ok: true, mergedBranch: featureBranch, targetBranch };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('pty:kill', (_event, id) => {
    const proc = ptyProcesses.get(id);
    if (proc) {
      proc.kill();
      ptyProcesses.delete(id);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  for (const proc of ptyProcesses.values()) proc.kill();
  ptyProcesses.clear();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
