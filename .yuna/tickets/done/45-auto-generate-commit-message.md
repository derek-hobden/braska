# Auto-Generate Commit Message

## Priority: Medium

## Description
Add a "Generate" button in the Changes panel commit area that uses Claude Code CLI (Haiku model) to auto-generate a commit message from the staged diff. Button shows a sparkle icon, displays a spinning animation while generating, and populates the commit textarea with the result.

## Tasks
- Add `git:generate-commit-msg` IPC handler in main.js using `exec` with login shell
- Pipe staged diff (truncated to 20K chars) to `claude -p --model claude-haiku-4-5-20251001 --max-turns 1`
- Add `generateCommitMsg` to `window.gitOps` preload bridge
- Add Generate button HTML with sparkle SVG icon alongside Commit button
- Add CSS for generate button (ghost style, spinning animation during generation)
- Add click handler with loading state, textarea population, and auto-resize
- Enable/disable Generate button based on staged file presence
