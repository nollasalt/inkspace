// Upstream TextMate grammars and VS Code themes; no project-specific keyword lists.
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import light from '@shikijs/themes/light-plus';
import dark from '@shikijs/themes/dark-plus';
import python from '@shikijs/langs/python';
import javascript from '@shikijs/langs/javascript';
import typescript from '@shikijs/langs/typescript';
import jsx from '@shikijs/langs/jsx';
import tsx from '@shikijs/langs/tsx';
import c from '@shikijs/langs/c';
import cpp from '@shikijs/langs/cpp';
import csharp from '@shikijs/langs/csharp';
import java from '@shikijs/langs/java';
import json from '@shikijs/langs/json';
import jsonc from '@shikijs/langs/jsonc';
import html from '@shikijs/langs/html';
import xml from '@shikijs/langs/xml';
import css from '@shikijs/langs/css';
import scss from '@shikijs/langs/scss';
import less from '@shikijs/langs/less';
import shell from '@shikijs/langs/shellscript';
import sql from '@shikijs/langs/sql';
import rust from '@shikijs/langs/rust';
import yaml from '@shikijs/langs/yaml';
import go from '@shikijs/langs/go';
import powershell from '@shikijs/langs/powershell';
import docker from '@shikijs/langs/docker';
import latex from '@shikijs/langs/latex';
import markdown from '@shikijs/langs/markdown';
import diff from '@shikijs/langs/diff';
import ruby from '@shikijs/langs/ruby';
import graphql from '@shikijs/langs/graphql';
import ini from '@shikijs/langs/ini';
import kotlin from '@shikijs/langs/kotlin';
import lua from '@shikijs/langs/lua';
import make from '@shikijs/langs/make';
import perl from '@shikijs/langs/perl';
import objc from '@shikijs/langs/objective-c';
import php from '@shikijs/langs/php';
import r from '@shikijs/langs/r';
import swift from '@shikijs/langs/swift';
import vb from '@shikijs/langs/vb';
import wasm from '@shikijs/langs/wasm';
const bundles = [python, javascript, typescript, jsx, tsx, c, cpp, csharp, java, json, jsonc, html, xml, css, scss, less, shell, sql, rust, yaml, go, powershell, docker, latex, markdown, diff, ruby, graphql, ini, kotlin, lua, make, perl, objc, php, r, swift, vb, wasm];
const languages = new Map();
for (const bundle of bundles) for (const grammar of bundle) {
  const value = { id: grammar.name, label: grammar.displayName || grammar.name, bundle };
  for (const alias of [grammar.name, ...grammar.aliases || []]) languages.set(alias.toLowerCase(), value);
}
for (const [alias, id] of Object.entries({ cuda: 'cpp', cuh: 'cpp', objectivec: 'objective-c', vbnet: 'vb', 'python-repl': 'python', 'php-template': 'php' })) languages.set(alias, languages.get(id));
let highlighter;
export const syntaxLanguage = hint => languages.get(hint.toLowerCase());
export function syntaxMarkup(source, language) {
  highlighter ||= createHighlighterCoreSync({ langs: [], themes: [light, dark], engine: createJavaScriptRegexEngine() });
  const grammar = languages.get(language);
  if (!highlighter.getLoadedLanguages().includes(grammar.id)) highlighter.loadLanguageSync(grammar.bundle);
  const html = highlighter.codeToHtml(source, { lang: grammar.id, themes: { light: 'light-plus', dark: 'dark-plus' }, defaultColor: false });
  // Keep the existing code frame and source mapping; Shiki owns every syntax token and color.
  return html.slice(html.indexOf('<code>') + 6, html.lastIndexOf('</code>'));
}
