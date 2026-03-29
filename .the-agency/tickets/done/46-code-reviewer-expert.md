# Code Reviewer Expert

## Priority: Medium

## Description
Build a code reviewer expert into the app. This expert should provide comprehensive code review capabilities, covering all the standard best practices you'd expect from a thorough code reviewer.

Key review areas:
- **Correctness**: Logic errors, off-by-one bugs, null/undefined handling, race conditions
- **Security**: Injection vulnerabilities, auth issues, data exposure, OWASP top 10
- **Performance**: Unnecessary allocations, N+1 queries, blocking operations, memory leaks
- **Code quality**: Naming, readability, duplication, function length, single responsibility
- **Error handling**: Missing try/catch, swallowed errors, unhelpful error messages
- **Style & consistency**: Adherence to project conventions, formatting, import ordering
- **Testing**: Missing test coverage, edge cases, brittle assertions
- **Documentation**: Missing or outdated comments for non-obvious logic

## Tasks
- Create the expert directory at `.the-agency/experts/code-reviewer/`
- Write the expert's `CLAUDE.md` with review instructions and restrictions
- Configure the expert to review staged changes, specific files, or branches
- Support review output as inline comments with file paths and line numbers
- Provide a summary with categorized findings (critical, warning, suggestion)
- Ensure the expert is read-only and does not modify source files
