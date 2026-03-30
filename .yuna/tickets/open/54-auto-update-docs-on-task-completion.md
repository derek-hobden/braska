# Auto-Update Docs on Task Completion

## Priority: Medium

## Description
When a task or ticket is finished, relevant documentation should be automatically updated to reflect the changes. Currently, docs can drift out of sync with the actual state of the codebase after work is completed.

This could be a button in the UI (e.g., "Update Docs") that triggers doc regeneration, or it could be an automatic step that runs when a ticket is marked as done. This may tie into the spec-driven development workflow (see ticket #24) — if specs define expected behavior, completing a task against a spec could automatically update associated docs to match.

Key considerations:
- **Trigger mechanism**: Manual button, automatic on ticket close, or both?
- **Scope detection**: Which docs need updating based on what changed?
- **Spec integration**: If spec-driven development is in place, use specs as the source of truth for doc updates
- **Safety**: Preview/diff of doc changes before applying, to avoid clobbering manual edits

## Tasks
- Decide on trigger mechanism (button, auto, or hybrid)
- Determine how to detect which docs are affected by a completed task
- Explore integration with spec-driven development (ticket #24)
- Implement doc update generation (AI-assisted or template-based)
- Add UI affordance (button or notification) for triggering/reviewing doc updates
