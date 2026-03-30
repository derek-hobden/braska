# Replace all synchronous fs calls with async equivalents

## Priority: High

## Description

`main.js` uses synchronous fs methods throughout: `existsSync`, `readFileSync`, `writeFileSync`, `readdirSync`, `mkdirSync`, `unlinkSync`, `rmSync`, `lstatSync`. Every one of these blocks the Electron main process event loop.

## Tasks

- [x] Replace all `fs.*Sync` calls with `fs.promises.*` equivalents
- [x] Update function signatures to be async where needed
- [x] Ensure proper error handling with try/catch on awaited calls

## Impact

Prevents the main process from blocking on I/O, keeping the app responsive.
