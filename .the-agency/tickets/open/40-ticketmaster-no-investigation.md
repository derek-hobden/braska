# Ticketmaster: Don't Investigate or Solve Problems

## Priority: Medium

## Description
The Ticketmaster expert's CLAUDE.md should be updated to make it clear that its role is strictly to **understand** the user's request and **log it as a ticket** — not to investigate the codebase, diagnose root causes, or propose solutions.

Currently, the Ticketmaster may attempt to explore the codebase, analyze code, or suggest fixes when creating tickets. This is outside its intended scope. It should focus on gathering enough context from the user to write a clear, accurate ticket description, then write the ticket file.

## Tasks
- Add explicit instructions to the Ticketmaster CLAUDE.md prohibiting codebase investigation (e.g. reading source files, grepping for patterns, analyzing code)
- Add explicit instructions prohibiting solution proposals or fix suggestions within ticket descriptions
- Clarify that the Ticketmaster's job is to ask clarifying questions to understand the problem, then document it
- Ensure ticket descriptions capture the user's understanding of the problem, not the Ticketmaster's own analysis
