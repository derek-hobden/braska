# Fix directory traversal vulnerability in filetree:list

## Priority: Critical (Security)

## Description

The `filetree:list` IPC handler (line 219 of `main.js`) accepts any `dirPath` from the renderer and reads it with `fs.readdirSync` without validation. A compromised renderer could enumerate the entire filesystem. Combined with `'unsafe-inline'` in the CSP, this is exploitable.

## Tasks

- Validate that `dirPath` is within a known project directory before reading
- Reject paths containing `..` traversal components
- Normalize and resolve paths before validation
- Consider restricting to a whitelist of registered project roots

## Security Impact

Directory traversal allows reading arbitrary directories on the host filesystem.
