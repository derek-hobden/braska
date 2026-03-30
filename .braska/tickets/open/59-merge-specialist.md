# Merge Specialist

## Priority: High

## Description
Build a dedicated merge specialist agent into the Braska system. This specialist is an expert in handling merge conflicts and branch merging delicately and methodically. It gets invoked whenever there is a merge conflict or when the user wants to merge branches.

### Integration with Merge & Cleanup Flow
When the user clicks "Merge & Cleanup" on a worktree and a conflict is detected, instead of failing or showing a generic error, display a button asking if the user would like to get the merge specialist on the job. Clicking this button opens a new tab with the merge specialist, passing the relevant context (branches, conflicting files, worktree path).

### Specialist Capabilities
- Analyze merge conflicts methodically, understanding the intent of changes on both sides
- Walk the user through each conflict with clear explanations of what changed and why
- Display conflicting files and their diffs
- Provide resolution options: accept incoming, accept current, accept both, or manual edit
- Guide the user through resolving all conflicts in order
- Handle branch merging operations (merge, rebase, etc.) with care
- Complete the merge & cleanup process after conflicts are resolved

## Tasks
- Create the merge specialist definition in `~/.braska/specialists/merge/`
- Write the specialist's CLAUDE.md with instructions for methodical conflict resolution
- Build the conflict resolution UI (file list, diff view, resolution controls)
- Detect merge conflicts during "Merge & Cleanup" and surface a "Get Merge Specialist" button
- Open a new specialist tab with merge context (branch, conflicting files, worktree path)
- Allow completing the merge & cleanup after conflicts are resolved
- Support general branch merge operations beyond just worktree cleanup
