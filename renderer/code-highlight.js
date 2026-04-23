// Syntax highlighting for code files — wraps vendored highlight.js (common bundle).
// Used by the editor's Source/Preview toggle to render highlighted, read-only HTML.

import hljs from './vendor/highlight.esm.min.js';
import { escHtml } from './utils.js';

export { hljs };

const EXT_TO_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java', kt: 'kotlin',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  yml: 'yaml', yaml: 'yaml',
  sql: 'sql',
  swift: 'swift',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  ini: 'ini', toml: 'ini', conf: 'ini',
  diff: 'diff', patch: 'diff',
  makefile: 'makefile',
};

export function languageForPath(relPath) {
  const base = relPath.split('/').pop().toLowerCase();
  if (base === 'makefile' || base === 'dockerfile') return base === 'makefile' ? 'makefile' : 'bash';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_TO_LANG[ext] || null;
}

export function isHighlightable(relPath) {
  return languageForPath(relPath) !== null;
}

export function renderHighlighted(text, lang, relPath) {
  let source = text || '';
  // Pretty-print JSON before highlighting so big single-line files become readable.
  if (lang === 'json') {
    try { source = JSON.stringify(JSON.parse(source), null, 2); } catch { /* leave as-is */ }
  }
  let inner;
  try {
    inner = hljs.highlight(source, { language: lang, ignoreIllegals: true }).value;
  } catch {
    inner = escHtml(source);
  }
  return `<pre class="hljs"><code>${inner}</code></pre>`;
}
