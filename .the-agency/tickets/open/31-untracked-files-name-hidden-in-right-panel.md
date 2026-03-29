# Untracked file names hidden by parent directory in right panel

## Priority: Medium

## Description
When displaying untracked changes in the right-hand panel, the parent directory path takes up all the available space, causing the actual file name to be hidden/truncated. Users cannot see which file is being referenced without expanding or hovering.

The display should prioritize showing the file name itself, truncating or abbreviating the parent directory path if space is limited (e.g. using ellipsis for long parent paths).

## Tasks
- Adjust the layout/styling of untracked file entries in the right-hand panel so the file name is always visible
- Truncate or ellipsize the parent directory path when space is constrained
- Ensure the full path is still accessible (e.g. via tooltip on hover)
