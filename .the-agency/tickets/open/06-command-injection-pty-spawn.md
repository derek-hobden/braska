# Fix command injection risk in PTY spawning

## Priority: Critical (Security)

## Description

In `main.js` (line 185), shell commands are constructed by manually escaping single quotes in the work directory path:

```js
const safeWorkDir = workDir.replace(/'/g, "'\"'\"'");
cmd = `claude --dangerously-skip-permissions 'Work in the following project directory: ${safeWorkDir}'`;
```

This manual escaping is fragile and one edge case away from arbitrary command execution.

## Tasks

- Use a proper shell escaping library (e.g., `shell-quote`)
- Or better: avoid constructing shell command strings entirely — pass arguments as an array to avoid shell interpretation
- Add tests for edge cases (paths with special characters, unicode, newlines)

## Security Impact

Potential arbitrary command execution via crafted project directory names.
