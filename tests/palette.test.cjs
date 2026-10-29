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

test('theme chooser preserves all thirteen requested source pairs and installed IDs', () => {
  assert.deepEqual(Object.values(THEME_PRESETS).map(p => p.pair), [
    ['#FFC2CB','#FFF5E8'],['#0B0C10','#A855F7'],['#8C5A42','#F5F1E9'],
    ['#FB7299','#FFFFFF'],['#F2F0EB','#8CB369'],['#F5F1E9','#0018A8'],
    ['#B5A3D0','#F5E6A3'],['#3EA88D','#C46B4E'],['#722F37','#C3B091'],
    ['#FFC700','#8A7E97'],['#FFF380','#7B2CBF'],['#E0E0E0','#FF8C94'],['#B87333','#123456'],
  ]);
  for (const id of ['forest','ocean','amber','rose','mint','slate','graphite','iris','clay','olive']) {
    assert.equal(getTheme(id).id,id);
  }
  assert.deepEqual(Object.values(THEME_PRESETS).filter(p => p.dark).map(p => p.id),['graphite','clay']);
});
