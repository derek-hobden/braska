# Separate renderer JS to enable tooling

## Priority: High

## Description

All renderer JavaScript lives inside a `<script>` tag in `index.html`, making it impossible to run ESLint, TypeScript, or any static analysis tools on the renderer code. This is closely related to issue #01 but specifically concerns the tooling impact.

## Tasks

- Extract renderer JS to a dedicated file (covered by issue #01)
- Configure ESLint for the project
- Consider adding TypeScript or JSDoc type annotations
- Add a lint script to `package.json`

## Note

This overlaps with issue #01 (extract CSS/JS from HTML). The extraction is the prerequisite; this issue covers the tooling setup that follows.
