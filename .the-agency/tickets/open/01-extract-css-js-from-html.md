# Extract CSS and JS from index.html

## Priority: High

## Description

`index.html` is a 1350-line monolith containing ~737 lines of CSS, ~550 lines of JavaScript, and HTML markup all in one file. This violates separation of concerns and makes the code untoolable — no linting, type checking, or static analysis can run on inline script/style tags.

## Tasks

- Extract all CSS into a separate stylesheet (e.g., `styles.css`)
- Extract all renderer JavaScript into a separate file (e.g., `renderer.js`)
- Update `index.html` to reference the external files
- Verify CSP headers allow loading the external files

## Benefits

- Enables ESLint, TypeScript, and other static analysis tools
- Improves readability and maintainability
- Allows proper bundling in the future
