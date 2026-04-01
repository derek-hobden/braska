# Git & GitHub Deep Integration

## Priority: High

## Description
Braska needs much tighter integration with Git and GitHub. Currently, Git and GitHub workflows (branches, pull requests, issues, etc.) are not deeply integrated into the IDE experience. Users should be able to manage the full Git/GitHub lifecycle without leaving Braska.

Key areas for integration:
- **Branch management**: Create, switch, rename, delete branches directly from the UI. Visualise branch history and relationships.
- **Pull requests**: Create, review, merge, and close PRs from within Braska. View PR diffs, comments, and review status. Link PRs to tickets.
- **Issues**: List, create, and manage GitHub issues. Sync with Braska's internal ticket system where appropriate.
- **Status & notifications**: Surface PR review requests, CI status, merge conflicts, and other GitHub activity in the UI.
- **Authentication**: Seamless GitHub auth (via `gh` CLI or OAuth) so all operations just work.

## Tasks
- Audit current Git integration and identify gaps
- Design UI for branch management (create, switch, delete, visualise)
- Implement PR creation flow (title, body, base branch, reviewers)
- Implement PR list view with status, checks, and review state
- Implement PR detail view with diff, comments, and merge controls
- Add GitHub Issues list and creation UI
- Link GitHub Issues to Braska tickets bidirectionally
- Surface CI/check status on branches and PRs
- Add GitHub notification feed or indicators in the UI
- Handle GitHub authentication and token management
- Create a GitHub specialist agent for automating common workflows
