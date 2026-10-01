import { browserOptions, watch } from './gen-esbuild.browser.mjs';
import { nodeOptions } from './gen-esbuild.node.mjs';
import esbuild from 'esbuild';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Monaco's reusable grammars refer to its editor API for indentation enums.
// Resolve those imports to Theia's editor to avoid bundling a second Monaco engine.
browserOptions.plugins.push({
  name: 'inkspace-shared-monaco-api',
  setup(build) {
    build.onResolve({ filter: /editor\.api\.js$/ }, args => {
      if (args.importer.includes(`${path.sep}monaco-editor${path.sep}`)) {
        return { path: require.resolve('@theia/monaco-editor-core/esm/vs/editor/editor.api.js') };
      }
    });
  }
});
const browser = await esbuild.context(browserOptions);
const backend = await esbuild.context(nodeOptions);
if (watch) {
  await Promise.all([browser.watch(), backend.watch()]);
} else {
  try { await browser.rebuild(); await backend.rebuild(); }
  catch { process.exitCode = 1; }
  finally { await browser.dispose(); await backend.dispose(); }
}
