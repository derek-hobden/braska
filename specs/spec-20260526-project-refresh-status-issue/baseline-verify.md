# Baseline Verify — pre-implementation

Date: 2026-05-26

## Command

```bash
node --test test/*.test.js test/*.test.mjs
```

## Exit code

0

## Output (last 10 lines)

```
1..20
# tests 101
# suites 14
# pass 101
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 502.357719
```

## Notes

- `npm test` fails pre-existing with `Cannot find module '/home/user/braska/test'` (Node treats the directory as a module, not a test glob). This is unrelated to the issue.
- All 101 tests pass with the explicit glob invocation.
