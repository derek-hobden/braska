# Expert Configuration Management UI

## Priority: Medium

## Description
Add a comprehensive configuration management panel to the app's settings section that lets users view, edit, and manage all configuration aspects of each expert from within the app. Currently, expert configuration is scattered across files that require manual editing — this should be surfaced in the UI.

For each expert, the user should be able to view and manage:

### 1. CLAUDE.md (Instructions)
- View and edit the expert's `claude.md` file (already partially supported in the experts settings panel)
- Syntax-highlighted markdown preview

### 2. Hooks
- List all hooks defined in the expert's `.claude/settings.json` (PreToolUse, PostToolUse, etc.)
- View/edit hook scripts referenced by each hook
- Add/remove hook entries
- Show hook matcher patterns and types (command, http, prompt, agent)

### 3. MCP Servers
- List MCP server configurations from the expert's `.claude/settings.json`
- Add/remove/edit MCP server entries (name, command, args, env)
- Show connection status if possible

### 4. Permission Rules
- View allow/deny rules from the expert's settings
- Add/remove permission rules

### 5. Skills
- List skills attached to the expert (already partially supported)
- View/edit skill file contents
- Attach/detach skills

### 6. Open in Finder / File Explorer
- "Reveal in Finder" button for the expert's root directory
- "Reveal in Finder" for individual config files (claude.md, settings.json, hook scripts, skill files)
- Use `shell.showItemInFolder()` (Electron API) for cross-platform support

### UI Approach
- Extend the existing Settings panel (or create a dedicated "Expert Config" view)
- Use a tabbed or accordion layout per expert, with sub-sections for each config type
- Read config files on demand via IPC (`file:read`) and write back via (`file:save`)
- Add new IPC handlers as needed for:
  - Reading/writing `.claude/settings.json` per expert
  - Listing hook scripts in `.claude/hooks/`
  - Opening files/folders in Finder (`shell.showItemInFolder`)

## Tasks
- Add IPC handler for `shell.showItemInFolder` (Reveal in Finder)
- Add IPC handler to read/write an expert's `.claude/settings.json`
- Add IPC handler to list and read hook scripts from an expert's `.claude/hooks/` directory
- Build UI section for viewing/editing an expert's CLAUDE.md (enhance existing)
- Build UI section for listing and managing hooks
- Build UI section for listing and managing MCP servers
- Build UI section for listing and managing permission rules
- Build UI section for managing attached skills (enhance existing)
- Add "Open in Finder" buttons for expert directory and individual config files
- Test full round-trip: view config, edit, save, verify changes take effect
