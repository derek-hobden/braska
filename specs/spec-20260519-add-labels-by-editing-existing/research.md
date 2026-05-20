# Research — add labels by editing existing issue (#59)

## Problem summary

Issue #59 requests the ability to apply labels to an existing GitHub issue from within the edit form in the GitHub Issues tab. The feature is substantively already implemented: `renderer/github-issues.js` includes `renderLabelsRegion`, `wireEditLabelHandlers`, and `openLabelPicker` that let users add and remove labels in edit mode. The IPC back-end (`gh:issue-edit`, `gh:issue-labels`) and preload bridge are all wired up. The gap is UX discoverability: in edit mode the label controls live inside `.gh-detail-header` — the same narrow flex row as the "← Issues" button and the state badge — making them easy to overlook and cramped at narrow panel widths.

## Approaches considered

### 1. Status quo (close as implemented)

The label editing code is complete and functional.

**Pros:** Zero code changes.

**Cons:** The user filed the issue, so they didn't find the controls. The header row is a narrow single-line flex container; label chips and "+ Add label" compete for horizontal space and can wrap awkwardly.

---

### 2. Move label editing to a dedicated section below the body textarea (recommended)

In edit mode, remove the `.gh-edit-labels-region` div from `.gh-detail-header` and render it as a standalone block below `.gh-edit-body-input`, mirroring how `github-issues-create.js` places `<label>Labels</label>` + picker after the description textarea.

**Pros:** Parity with the create form. Labels section is always visible in edit mode without competing for header space. No new API calls, no backend changes. Consistent with YAGNI.

**Cons:** Minor re-render churn on each label toggle (already the case today).

**Precedent:** `github-issues-create.js` already shows `<label>Labels</label>` as a named section in a vertical-stack form.

---

### 3. Replace picker popup with eager checkbox list (create-form style)

In edit mode, eagerly load all labels and render checkboxes identical to the create form's `.gh-labels-picker`.

**Pros:** Eliminates the two-step "click + Add label → see picker" interaction.

**Cons:** One extra `gh label list` call every time the user clicks Edit; more HTML/CSS changes.

---

### 4. Standalone "Edit labels" affordance in read mode

Add an "Edit labels" shortcut separate from the main "Edit" button so users can modify labels without entering full text-edit mode.

**Pros:** Single-purpose, faster for label-only edits.

**Cons:** Splits the edit surface into two entry points; more code; YAGNI violation given approach 2 solves discoverability with less work.

## Recommended approach

**Approach 2: move label editing to a dedicated section below the body textarea in edit mode.**

Changes are targeted to `showGitHubIssueDetail` in `renderer/github-issues.js`:

1. In the header block, only render `gh-edit-labels-region` when NOT in edit mode (static view chips stay in the header).
2. After the `gh-edit-body-input` textarea, when `isEditing`, render a new `gh-edit-labels-section` div containing a caption ("Labels") and the `gh-edit-labels-region`.
3. `wireEditLabelHandlers`, `openLabelPicker`, `renderLabelsRegion`, `saveIssueEdit`, and all IPC handlers remain unchanged.
4. Add minimal CSS for `.gh-edit-labels-section`.

## Verified tool behavior

`gh` CLI is not available in this environment. No live reproducers run. Behavior verified by source-code inspection:

- **`gh issue edit <n> --add-label <name>`** — `main/github.js` handler `gh:issue-edit` (lines 241–256) builds this correctly. `saveIssueEdit` computes non-overlapping add/remove sets before calling the handler.
- **`gh issue edit <n> --remove-label <name>`** — same handler, `--remove-label` flag per label.
- **`gh label list --json name,color`** — handler at lines 265–270; returns `[{name,color}]` array as expected by `openLabelPicker`.

No external behavior assumptions made beyond these source-verified paths.

## Unknowns

- Whether the user's report is a discoverability issue or a functional bug (can't verify without running the app).
- `gh label list --limit 100` is not paginated; repos with >100 labels would be silently truncated (pre-existing limitation, out of scope).
- Whether the click-to-toggle picker dismiss gesture (clicking "+ Add label" again clears the picker) is intuitive.

## Files inventory

- `renderer/github-issues.js` — primary file to modify; contains `showGitHubIssueDetail`, `renderLabelsRegion`, `wireEditLabelHandlers`, `openLabelPicker`, `saveIssueEdit`.
- `renderer/github-issues-create.js` — UX precedent: `<label>Labels</label>` section after body textarea in create form.
- `main/github.js` — `gh:issue-edit` (lines 241–256) and `gh:issue-labels` (lines 265–270); no changes needed.
- `preload.js` — `window.github.issueEdit` (line 130), `window.github.issueLabels` (line 134); no changes needed.
- `styles.css` — `.gh-label-chip-edit`, `.gh-label-picker`, `.gh-label-pick-item` (lines 3564–3606) already styled; need minor addition for the new section wrapper.
