# Baseline Verify — pre-implementation

Command: `node --test test/*.test.js test/*.test.mjs`
Exit code: 0

```
1..20
# tests 101
# suites 14
# pass 101
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 440.226405
```

Note: `npm test` fails with `Error: Cannot find module '/home/user/braska/test'` because `node --test` treats a directory path as a single file. This is a pre-existing condition; all tests pass when invoked with the explicit glob pattern above.
