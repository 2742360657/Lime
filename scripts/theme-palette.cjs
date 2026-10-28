/** Test tooling only: expose the source palette to native screenshot assertions. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/theme.ts');
const paletteModule = new Module(file, module);
paletteModule.filename = file;
paletteModule._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { THEME_PRESETS, getTheme } = paletteModule.exports;
process.stdout.write(JSON.stringify(Object.keys(THEME_PRESETS).map(getTheme)));
