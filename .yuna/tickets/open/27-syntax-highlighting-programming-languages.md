# Better Syntax Highlighting for Common Programming Languages

## Priority: Medium

## Description
Integrate improved syntax highlighting to support common programming languages in the editor/code view. Currently, code blocks lack rich syntax highlighting, making it harder to read and work with source code. Adding robust, language-aware highlighting will improve readability and the overall developer experience.

This should cover at minimum the most widely used languages: JavaScript, TypeScript, Python, Go, Rust, Java, C/C++, HTML, CSS, JSON, YAML, Markdown, and shell scripts. The implementation should be extensible so additional languages can be added easily in the future.

## Tasks
- Evaluate syntax highlighting libraries (e.g. highlight.js, Prism, CodeMirror, Shiki) for bundle size, language coverage, and integration ease
- Integrate the chosen library into the renderer
- Add highlighting support for core languages: JavaScript, TypeScript, Python, Go, Rust, Java, C/C++, HTML, CSS, JSON, YAML, Markdown, shell
- Ensure highlighting applies to code blocks in terminal output and file previews
- Add a mechanism for users or contributors to register additional language grammars
- Test highlighting across all supported languages with representative samples
