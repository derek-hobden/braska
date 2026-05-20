## Purpose
Built-in expert/agent definitions bundled with Braska. Each `.md` file defines a named expert (a Claude profile with a system prompt and skill references). Scripts under `scripts/` are helper shell scripts that agents can invoke during sessions.

## Contents
- `committer.md` — expert definition for the Committer agent (stages and commits changes)
- `github-specialist.md` — expert definition for the GitHub Specialist agent (PR creation, issue management)
- `code-reviewer.md` — expert definition for the Code Reviewer agent
- `debugger.md` — expert definition for the Debugger agent
- `merger.md` — expert definition for the Merger agent (resolves merge conflicts)
- `todoist.md` — expert definition for the Todoist agent (manages todo/ticket files)
- `scripts/` — helper shell scripts available to agents during sessions
