# Use a bundler instead of direct node_modules imports

## Priority: Medium

## Description

The renderer dynamically imports directly from `node_modules` paths (lines 1236-1239 of `index.html`):

```js
import('./node_modules/@xterm/xterm/lib/xterm.mjs')
```

This is fragile and breaks if the project is restructured, dependencies are hoisted differently, or bundling is introduced.

## Tasks

- Set up a bundler (e.g., Vite, esbuild, or Webpack)
- Convert direct `node_modules` imports to standard module imports
- Configure the build pipeline for the renderer process

## Impact

Makes dependency resolution robust and enables tree-shaking, minification, and other optimizations.
