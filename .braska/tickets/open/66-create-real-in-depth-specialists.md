# Create Real In-Depth Specialists

## Priority: High

## Description
The current specialist system uses basic CLAUDE.md files to define specialist behavior. We should create real, in-depth specialists that are more capable and well-defined — possibly leveraging Claude Code's built-in mechanisms for custom agents/specialists (e.g. custom slash commands, agent definitions, or the Claude Agent SDK pattern).

Research how Claude Code natively supports specialist/agent definitions and adopt that approach rather than reinventing the wheel. This could involve:
- Using Claude Code's built-in custom agent or sub-agent patterns
- Defining specialists with proper tool access, permissions, and scoped instructions
- Giving each specialist a well-defined role with detailed system prompts, example interactions, and guardrails
- Making specialists more robust with structured input/output contracts

The goal is to move from lightweight prompt-only specialists to deeply configured, reliable agents that consistently produce high-quality results within their domain.

## Tasks
- Research Claude Code's built-in mechanisms for custom agents/specialists (custom slash commands, agent SDK, sub-agent patterns, etc.)
- Evaluate which approach best fits Braska's architecture and workflow
- Design a new specialist definition format that leverages native capabilities
- Migrate existing specialists (Ticketmaster, Code Reviewer, Debugger, Merge Specialist) to the new format
- Create new in-depth specialists as needed (e.g. Architect, Test Writer, Refactorer)
- Document the specialist creation process so new specialists can be added easily
