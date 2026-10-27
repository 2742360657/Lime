const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { alertStore } = require('../src/theme/alertStore.ts');

test('destructive confirmation runs once; a stale press cannot operate the next dialog', () => {
  let deleted = 0, next = 0;
  alertStore.show('删除确认', '不可恢复', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => deleted++ }]);
  const id = alertStore.getSnapshot().id;
  alertStore.show('下一条', '', [{ text: '确定', onPress: () => next++ }]);
  alertStore.choose(id, 1); alertStore.choose(id, 1);
  assert.equal(deleted, 1); assert.equal(next, 0);
  alertStore.choose(alertStore.getSnapshot().id, 0); assert.equal(next, 1);
  assert.equal(alertStore.getSnapshot(), null);
});
test('cancel, system dismissal and chained callbacks preserve confirmation semantics', () => {
  let changed = false, dismissed = 0;
  alertStore.show('重要操作', '', [{ text: '取消', style: 'cancel' }, { text: '确认', onPress: () => changed = true }]);
  const protectedId = alertStore.getSnapshot().id;
  alertStore.dismiss(protectedId); assert.equal(alertStore.getSnapshot().id, protectedId);
  alertStore.choose(protectedId, 0); assert.equal(changed, false);
  alertStore.show('可关闭', '', undefined, { cancelable: true, onDismiss: () => dismissed++ });
  alertStore.dismiss(alertStore.getSnapshot().id); assert.equal(dismissed, 1);
  alertStore.show('第一步', '', [{ text: '继续', onPress: () => alertStore.show('完成') }]);
  alertStore.choose(alertStore.getSnapshot().id, 0);
  assert.equal(alertStore.getSnapshot().title, '完成');
  assert.equal(alertStore.getSnapshot().buttons[0].text, '确定');
  alertStore.choose(alertStore.getSnapshot().id, 0); assert.equal(alertStore.getSnapshot(), null);
});
test('all app inputs, toggles and confirmations use palette-aware controls', () => {
  const allowed = new Set(['ThemedTextInput.tsx', 'ThemedSwitch.tsx']);
  const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  for (const file of ['App.tsx', ...files('src').filter(p => p.endsWith('.tsx'))]) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react-native') continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const element of bindings.elements) {
        const name = (element.propertyName ?? element.name).text;
        assert.ok(!['TextInput', 'Switch', 'Alert'].includes(name) || allowed.has(path.basename(file)), `${file}: native ${name} bypasses selected palette`);
      }
    }
    assert.doesNotMatch(source.text, /#[\da-f]{6,8}\b|rgba?\([\d\s,.]+\)/i, `${file}: hard-coded UI color`);
  }
});
