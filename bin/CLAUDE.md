## Purpose
CLI entrypoint published as the `braska` bin, allowing users to launch the app via `npx braska`. Registered in `package.json` under `bin.braska`.

## Contents
- `cli.js` — entrypoint script: locates the Electron binary and spawns it with the app's main entry point
