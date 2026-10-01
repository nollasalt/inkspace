// Reuse Microsoft's Monaco language definitions with Theia's existing editor engine.
const monaco = require('@theia/monaco-editor-core');
const definitions = [
  ['markdown', ['.md', '.markdown'], require('monaco-editor/languages/definitions/markdown/markdown')],
  ['javascript', ['.js', '.mjs', '.cjs'], require('monaco-editor/languages/definitions/javascript/javascript')],
  ['typescript', ['.ts', '.tsx'], require('monaco-editor/languages/definitions/typescript/typescript')],
  ['python', ['.py'], require('monaco-editor/languages/definitions/python/python')],
  ['cpp', ['.cpp', '.cc', '.h', '.hpp', '.c'], require('monaco-editor/languages/definitions/cpp/cpp')],
  ['html', ['.html', '.htm'], require('monaco-editor/languages/definitions/html/html')],
  ['css', ['.css'], require('monaco-editor/languages/definitions/css/css')],
  ['yaml', ['.yaml', '.yml'], require('monaco-editor/languages/definitions/yaml/yaml')],
  ['shell', ['.sh'], require('monaco-editor/languages/definitions/shell/shell')]
];
module.exports = () => {
  for (const [id, extensions, definition] of definitions) {
    if (!monaco.languages.getLanguages().some(language => language.id === id)) {
      monaco.languages.register({ id, extensions, aliases: [id] });
      monaco.languages.setLanguageConfiguration(id, definition.conf);
      monaco.languages.setMonarchTokensProvider(id, definition.language);
    }
  }
};
