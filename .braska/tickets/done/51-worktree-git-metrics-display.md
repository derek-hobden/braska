# Worktree Git Metrics Display

## Priority: Medium

## Description
Display git metrics alongside each worktree entry in the left pane. Currently worktrees are listed without any status information, making it hard to tell at a glance which worktrees have pending work or are out of date. Adding inline metrics will help the user quickly assess the state of each worktree without switching to it.

## Tasks
- Show the number of uncommitted changes (staged + unstaged) next to each worktree
- Show how many commits the worktree branch is behind main
- Show how many commits the worktree branch is ahead of main
- Display untracked file count
- Keep metrics visually compact (e.g. badges or small inline indicators)
- Update metrics when switching between worktrees or after git operations
