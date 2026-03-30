# Add error handling for project save/load

## Priority: Medium

## Description

`loadProjects()` calls `JSON.parse(fs.readFileSync(...))` with no try-catch. If the projects JSON file gets corrupted (possible since writes are synchronous and non-atomic), the entire app crashes on startup with an unhandled exception.

## Tasks

- Wrap JSON parsing in try-catch
- On parse failure, back up the corrupted file and start with empty/default state
- Use atomic writes (write to temp file, then rename) to prevent corruption
- Add user-facing error notification when recovery occurs

## Impact

Prevents app crash on startup from corrupted config files.
