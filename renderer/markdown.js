// Markdown rendering — wraps vendored marked with a small sanitizer pass.
// Local .md files are user-authored, but CSP allows inline scripts, so we
// strip dangerous tags/attributes defensively before injecting HTML.

import { marked } from './vendor/marked.esm.min.js';
import { hljs } from './code-highlight.js';

marked.setOptions({ gfm: true, breaks: false });

const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'link', 'meta', 'style', 'base'];

function sanitize(root) {
  for (const tag of DANGEROUS_TAGS) {
    for (const el of root.querySelectorAll(tag)) el.remove();
  }
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

function highlightCodeBlocks(root) {
  for (const code of root.querySelectorAll('pre > code[class*="language-"]')) {
    const cls = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = cls ? cls.slice('language-'.length) : null;
    if (!lang || !hljs.getLanguage(lang)) continue;
    try {
      code.innerHTML = hljs.highlight(code.textContent, { language: lang, ignoreIllegals: true }).value;
      code.classList.add('hljs');
    } catch { /* leave plain */ }
  }
}

export function renderMarkdown(text) {
  const html = marked.parse(text || '');
  const tmpl = document.createElement('template');
  tmpl.innerHTML = html;
  sanitize(tmpl.content);
  highlightCodeBlocks(tmpl.content);
  return tmpl.innerHTML;
}
