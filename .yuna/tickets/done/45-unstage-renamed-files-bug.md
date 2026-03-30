# Unstage fails for renamed/previously-untracked files

## Priority: High

## Description
Clicking the unstage button on files that were renamed (or previously untracked) in the Changes panel fails with `fatal: pathspec '...' did not match any files`. The root cause is that `git diff --cached --numstat` uses rename detection by default, outputting compact rename paths like `.the-agency/tickets/{open => closed}/25-git-operations-support.md` — which aren't real filesystem paths and cause `git reset HEAD` to fail.

## Tasks
- [x] Add `--no-renames` to `git diff --cached --numstat` in `git:status` handler
- [x] Add `--no-renames` to `git diff --numstat` for consistency
