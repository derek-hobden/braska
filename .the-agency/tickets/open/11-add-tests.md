# Add test suite

## Priority: High

## Description

There are zero tests. The test script in `package.json` is literally `echo "Error: no test specified" && exit 1`. This is an app that spawns shell processes with dangerous flags, manipulates the filesystem, and manages user configurations — it needs tests.

## Tasks

- Choose a test framework (e.g., Vitest, Jest)
- Add unit tests for core logic (git info parsing, project load/save, path validation)
- Add integration tests for IPC handlers
- Add tests for shell escaping edge cases
- Update the `test` script in `package.json`

## Impact

Catches regressions and validates security-critical code paths like shell escaping and path validation.
