import hljs from 'highlight.js/lib/common';
import powershell from 'highlight.js/lib/languages/powershell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import latex from 'highlight.js/lib/languages/latex';
import { syntaxLanguage, syntaxMarkup } from './code-grammar.js';
hljs.registerLanguage('powershell', powershell); hljs.registerLanguage('dockerfile', dockerfile); hljs.registerLanguage('latex', latex);
hljs.registerAliases(['cuda', 'cuh'], { languageName: 'cpp' });
const plain = source => source.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const automatic = hljs.listLanguages().filter(name => syntaxLanguage(name));
const plainHints = new Set(['text', 'txt', 'plaintext', 'plain', 'none', 'nohighlight']);
const cache = new Map();
const copyHosts = new WeakMap();
export function highlightCode(source, hint = '') {
  const language = hint.trim().toLowerCase().split(/\s+/)[0].replace(/^language-/, ''), key = language + '\0' + source;
  if (cache.has(key)) { const value = cache.get(key); cache.delete(key); cache.set(key, value); return value; }
  let result = { value: plain(source), language: '', label: plainHints.has(language) ? '纯文本' : '代码', engine: 'plain' };
  if (source.length <= 100000) try {
    if (!plainHints.has(language) && source.trim()) {
      let grammar = syntaxLanguage(language), inferred = !grammar;
      if (!grammar) {
        const found = hljs.highlightAuto(source.slice(0, 12000), automatic);
        if (found.relevance >= 4) grammar = syntaxLanguage(found.language || '');
      }
      // Very short or ambiguous fragments still receive standard lexical colors.
      // A JavaScript grammar is a broad fallback, never presented as a detected language.
      const fallback = !grammar; grammar ||= syntaxLanguage('javascript');
      result = { value: syntaxMarkup(source, grammar.id), language: fallback ? '' : grammar.id,
        label: fallback ? '代码 · 通用' : grammar.label + (inferred ? ' · 自动' : ''), engine: 'shiki' };
    }
  } catch { /* A malformed or unknown grammar must never hide the original code. */ }
  if (source.length <= 100000) { cache.set(key, result); if (cache.size > 48) cache.delete(cache.keys().next().value); }
  return result;
}
export function codeMarkup(source, hint) {
  const result = highlightCode(source, hint);
  return `<span class="ink-code-toolbar" data-ink-code-ui><span>${plain(result.label)}</span><button class="ink-code-copy" type="button" aria-label="复制代码">复制</button></span><code class="ink-code-content${result.language ? ' language-' + result.language : ''}">${result.value}</code>`;
}
export function installCodeControls({ root = document, writeText, canCopy = () => true }) {
  if (copyHosts.has(root)) { Object.assign(copyHosts.get(root), { writeText, canCopy }); return; }
  const host = { writeText, canCopy }; copyHosts.set(root, host);
  root.addEventListener('click', async event => {
    const button = event.composedPath().find(node => node.matches?.('.ink-code-copy'));
    if (!button || button.disabled || event.pointerType === 'pen' || event.pointerType === 'touch') return;
    if (event.composedPath().some(node => node.matches?.('.note')) && !host.canCopy()) return;
    const pre = button.closest('pre.ink-code-block'), source = pre?.querySelector('code')?.textContent;
    if (source == null) return;
    event.preventDefault(); event.stopPropagation();
    try { await host.writeText(source); button.textContent = '已复制'; button.setAttribute('aria-label', '代码已复制'); }
    catch { button.textContent = '复制失败'; }
    setTimeout(() => { if (button.isConnected) { button.textContent = '复制'; button.setAttribute('aria-label', '复制代码'); } }, 1600);
  });
}
