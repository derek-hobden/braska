const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

async function pathExists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

function resolveInDir(baseDir, relPath) {
  const resolved = path.resolve(baseDir, relPath);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function errMsg(err) {
  return ((err.stderr || err.message || '').toString().split('\n')[0]) || 'Unknown error';
}

// Resolve the actual git dir for a working directory. In worktrees, .git is a
// file pointing elsewhere — this follows the indirection. Returns null if not a git repo.
async function resolveGitDir(workDir) {
  try {
    const dotGitPath = path.join(workDir, '.git');
    const stat = await fsp.stat(dotGitPath);
    if (stat.isDirectory()) return dotGitPath;
    if (stat.isFile()) {
      const content = (await fsp.readFile(dotGitPath, 'utf-8')).trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) return path.resolve(workDir, match[1]);
    }
  } catch {}
  return null;
}

module.exports = { pathExists, resolveInDir, errMsg, execFileAsync, fsp, resolveGitDir };
