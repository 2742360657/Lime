const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { createSelectionReader } = require('../src/state/selection.ts');

test('unrelated saves keep the same selected reference; a changed slice invalidates it', () => {
  let state = { theme: 'forest', memos: ['one'], saving: false };
  const select = createSelectionReader(() => state, value => ({ theme: value.theme }));
  const before = select();
  state = { ...state, memos: ['edited'], saving: true };
  assert.equal(select(), before);
  state = { ...state, theme: 'ocean' };
  assert.notEqual(select(), before);
  assert.deepEqual(select(), { theme: 'ocean' });
});

test('changing a selector closure uses current arguments without contaminating the previous reader', () => {
  const state = { first: 'A', second: 'B' };
  const first = createSelectionReader(() => state, value => ({ name: value.first }));
  const previous = first();
  const second = createSelectionReader(() => state, value => ({ name: value.second }), { value: previous });
  assert.deepEqual(second(), { name: 'B' });
  assert.equal(first(), previous);
  const equivalent = createSelectionReader(() => state, value => ({ name: value.first }), { value: previous });
  assert.equal(equivalent(), previous);
});
