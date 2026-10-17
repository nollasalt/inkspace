const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const bundle = buildSync({ entryPoints: [require.resolve('../src/code-highlight.js')], bundle: true, platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
const compiled = { exports: {} }; new Function('module', 'exports', 'require', bundle)(compiled, compiled.exports, require);
const { highlightCode, codeMarkup } = compiled.exports;
const dom = new JSDOM(''), host = dom.window.document.createElement('div');
function check(source, hint, words = []) {
  const start = performance.now(), result = highlightCode(source, hint); host.innerHTML = result.value;
  assert.equal(host.textContent, source, 'highlighting preserves every character');
  assert.equal(result.engine, 'shiki', result.label);
  const tokens = [...host.querySelectorAll('span[style]')].map(node => ({ text: node.textContent, light: node.style.getPropertyValue('--shiki-light'), dark: node.style.getPropertyValue('--shiki-dark') }));
  assert(tokens.some(t => t.light && t.light !== '#000000'), 'code receives more than plain text color: ' + source);
  for (const word of words) assert(tokens.some(t => t.text.includes(word) && t.light !== '#000000' && t.dark), 'missing token color: ' + word);
  return { result, elapsedMs: performance.now() - start };
}
check('@dataclass\nclass Model:\n    async def forward(self, x: int = None):\n        if isinstance(x, int) and x is not None:\n            return True\n        else:\n            yield False\n', 'python', ['dataclass', 'class', 'async', 'def', 'self', 'int', 'None', 'if', 'isinstance', 'and', 'is', 'not', 'return', 'True', 'else', 'yield', 'False']);
check('export interface Result<T> { readonly value: T }\nconst result = await Promise.resolve(42);\n', 'typescript', ['export', 'interface', 'readonly', 'const', 'await', '42']);
check('namespace demo {\ntemplate<typename T>\nconstexpr T identity(T value) {\n    return value;\n}\nauto x = nullptr;\n}\n', 'C++', ['template', 'typename', 'constexpr', 'return', 'namespace', 'auto', 'nullptr']);
for (const [hint, source] of [['yaml', 'name: example\nitems:\n  - true'], ['go', 'package main\nfunc main() {}'], ['powershell', 'Get-ChildItem | Where-Object {$_.Name -like "*.ink"}'], ['cuda', '__global__ void add(int *a) { a[0] = 1; }'], ['jsx', 'const element = <Button enabled={true} />'], ['java', 'public static void main(String[] args) { return; }']]) check(source, hint);
// These used to be discarded by the custom relevance >= 4 threshold.
for (const source of ['print("hello")', 'x = 1', 'return True', 'const x = 1', '[1, 2, 3]', 'a = x + y']) check(source, '');
check('x = 1', '', ['1']); check('print("hello")', '', ['hello']);
check('x = 1', 'not-a-real-language');
const plain = highlightCode('def useful(rate):\n    return rate * 32', 'text'); assert.equal(plain.engine, 'plain'); assert(!plain.value.includes('<span'));
host.innerHTML = codeMarkup('<script>alert(1)</script>', 'html'); assert(!host.querySelector('script')); assert.equal(host.querySelector('code').textContent, '<script>alert(1)</script>');
assert(!codeMarkup('value', '\"><img src=x onerror=alert(1)>').includes('<img'));
const huge = 'x = 1\n'.repeat(20000); assert.equal(highlightCode(huge, 'python').value, huge);
const example = 'class Example:\n    def run(self):\n        return True\n';
const first = highlightCode(example, 'python'); const hot = performance.now(); for (let i = 0; i < 2000; i++) assert.equal(highlightCode(example, 'python'), first);
console.log(JSON.stringify({ passed: true, textMateGrammar: true, keywordsAndLiterals: true, decoratorsAndTypes: true, shortUnspecifiedCode: true, genericFallback: true, explicitPlainText: true, exactSourceAndEscaping: true, cacheHits: 2000, cacheMs: performance.now() - hot }));
dom.window.close();
