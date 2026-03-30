# Ticketmaster File Edit Hook Enforcement

## Priority: High

## Description
The Ticketmaster expert's CLAUDE.md instructs it to only edit files inside `.the-agency/tickets/`, but this is a soft restriction that the model can (and did) ignore. We need a hard enforcement mechanism using Claude Code hooks scoped to the ticketmaster expert directory.

Since experts are loaded via `claude --add-dir <expertDir>`, Claude Code picks up `.claude/settings.json` from that directory. A `PreToolUse` hook on `Edit|Write` can reject any file edit outside `.the-agency/tickets/` with exit code 2 (block).

### Files to create

**`~/.the-agency/experts/ticketmaster/.claude/settings.json`**
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.the-agency/experts/ticketmaster/.claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

**`~/.the-agency/experts/ticketmaster/.claude/hooks/protect-files.sh`** (must be chmod +x)
```bash
#!/bin/bash
FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == */.the-agency/tickets/* ]]; then
  exit 0  # allowed
fi

echo "BLOCKED: Ticketmaster can only edit files inside .the-agency/tickets/" >&2
exit 2  # reject
```

### Pattern for other experts
This same approach can be used to restrict any expert to specific directories or file patterns. Consider applying similar hooks to other experts as they are created.

## Tasks
- Create `.claude/hooks/` directory inside the ticketmaster expert dir
- Create `protect-files.sh` hook script and make it executable
- Create `.claude/settings.json` with the PreToolUse hook config
- Test that the ticketmaster can still create/edit tickets
- Test that the ticketmaster is blocked from editing code files
- Consider extending this pattern to other experts with restricted scopes
