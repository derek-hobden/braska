# Baseline verify — pre-implementation

## Command: `npm test`

**Exit code:** 1 (pre-existing failure)

**Output tail:**
```
Error: Cannot find module '/home/user/braska/test'
code: 'MODULE_NOT_FOUND'
# tests 1 / pass 0 / fail 1
```

**Note:** This is a pre-existing condition. The `npm test` script (`node --test test/`) fails because Node resolves `test/` as a module path rather than a directory glob in this environment. Running `node --test test/*.js test/*.mjs` passes 19/19. This failure will be present in final verify as well and is NOT a regression from this PR's changes.
