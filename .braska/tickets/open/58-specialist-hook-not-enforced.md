# Specialist settings.json hooks not enforced — flip primary/add-dir

## Priority: High

## Description
Specialist hooks defined in `.claude/settings.json` within `--add-dir` directories are not loaded by Claude Code. Only skills and CLAUDE.md files are loaded from additional directories — settings and hooks are ignored.

The ticketmaster's file-protection hook at `~/.braska/specialists/ticketmaster/.claude/settings.json` was never actually firing. The only guardrail was the CLAUDE.md instructions, which the model can (and did) ignore.

### Proposed fix: flip primary and add-dir

Currently in `main.js`, specialists are launched as:
```
claude --cwd <project-dir> --add-dir <specialist-dir>
```

Flip it so the specialist dir is the primary and the project is added:
```
claude --cwd <specialist-dir> --add-dir <project-dir>
```

This gives us:
- Specialist `.claude/settings.json` hooks load and fire (hard guardrails)
- Per-specialist MCP servers
- Per-specialist settings/permissions
- Specialist CLAUDE.md loads automatically (no env var needed)
- `@` file autocompletion should still work for project files via `--add-dir`
- Skills from both dirs still auto-load

### Things to verify
- Confirm `@` autocompletion works for `--add-dir` files and the paths are usable
- Confirm git operations still work against the project repo from the specialist cwd
- Check if `--settings` flag is needed to layer in project-level settings

## Tasks
- Update specialist spawn logic in `main.js` to flip cwd and --add-dir
- Remove the `cd` to workDir that was added for the login shell CWD fix (specialist cwd will now be the specialist dir)
- Verify `@` autocompletion works for project files via --add-dir
- Verify git context resolves to the project repo
- Test that ticketmaster hook actually blocks writes outside `.braska/tickets/`
- Test with other specialists to ensure the pattern works generally
