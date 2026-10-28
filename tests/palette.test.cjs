const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, file);
const { THEME_PRESETS, getTheme } = require('../src/theme.ts');
const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
  .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('palette roles stay readable on every actual text surface and selection', () => {
  for (const id of Object.keys(THEME_PRESETS)) {
    const c = getTheme(id).colors;
    for (const text of ['textPrimary', 'textSecondary', 'textMuted']) {
      for (const surface of ['background', 'surface', 'surfaceMuted', 'primarySoft']) {
        const value = contrast(c[text], c[surface]);
        assert.ok(value >= 4.5, `${id} ${text}/${surface}: ${value.toFixed(2)}`);
      }
    }
    for (const [text, surface] of [['onPrimary','primary'],['primaryText','primarySoft'],['primaryText','surface'],['danger','dangerSoft'],['textPrimary','selection']]) {
      const value = contrast(c[text], c[surface]);
      assert.ok(value >= 4.5, `${id} ${text}/${surface}: ${value.toFixed(2)}`);
    }
  }
});
test('essential checkbox boundaries and selected indicators remain visible', () => {
  for (const id of Object.keys(THEME_PRESETS)) {
    const c = getTheme(id).colors;
    for (const surface of ['background','surface','primarySoft','surfaceMuted']) {
      assert.ok(contrast(c.controlBorder,c[surface]) >= 3, `${id}: checkbox boundary on ${surface}`);
      assert.ok(contrast(c.primary,c[surface]) >= 3, `${id}: selected indicator on ${surface}`);
    }
  }
});
