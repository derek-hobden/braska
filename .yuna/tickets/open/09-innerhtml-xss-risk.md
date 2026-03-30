# Replace innerHTML usage with safe DOM APIs

## Priority: High (Security)

## Description

Throughout `index.html`, HTML strings are built with template literals and injected via `innerHTML` using user-controlled data. Escaping is inconsistent — some places escape `"` only, others escape `&<>"`. One missed spot creates an XSS vector.

## Tasks

- Replace `innerHTML` with `document.createElement` and `textContent` where possible
- Create a consistent HTML escaping utility function for cases where innerHTML is needed
- Audit all template literal HTML construction for unescaped interpolations
- Consider using a lightweight templating library or DOM builder

## Security Impact

Inconsistent escaping of user-controlled data in innerHTML creates XSS vulnerabilities.
