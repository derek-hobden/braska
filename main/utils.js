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

module.exports = { pathExists, resolveInDir, errMsg, execFileAsync, fsp };
