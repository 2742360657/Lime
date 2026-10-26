const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { buildTodoBuckets, compareTodosSmart, getTodoDateOptions, hasTodoDateOrderConflict } = require('../src/utils/todo.ts');
const { getTheme, THEME_PRESETS } = require('../src/theme.ts');
const todo = (id, dueDateKey, dueTime = null, order = 0, completedAt = null) => ({ id, title: id, note: '', dueDateKey, dueTime, order, completedAt, createdAt: 0 });
const freeze = (t) => t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 26, 12).getTime() });

test('date groups are disjoint at today/tomorrow/week boundaries and omit completed tasks', t => {
  freeze(t);
  const groups = buildTodoBuckets([
    todo('yesterday', '2026-10-25'), todo('earlier-today', '2026-10-26', '11:00'),
    todo('today', '2026-10-26'), todo('tomorrow', '2026-10-27'),
    todo('day2', '2026-10-28'), todo('day7', '2026-11-02'), todo('day8', '2026-11-03'),
    todo('no-date', null), todo('done', '2026-10-25', null, 0, 1),
  ]);
  assert.deepEqual(groups.map(g => [g.id, g.todos.map(t => t.id)]), [
    ['overdue', ['yesterday', 'earlier-today']], ['today', ['today']], ['tomorrow', ['tomorrow']],
    ['soon', ['day2', 'day7']], ['later', ['day8']], ['no-date', ['no-date']],
  ]);
});

test('the action overview can include every unfinished task, including all undated and distant tasks', t => {
  freeze(t);
  const input = [...Array.from({ length: 8 }, (_, i) => todo(`undated${i}`, null, null, i)), todo('distant', '2027-06-01'), todo('done', null, null, 9, 1)];
  const visible = buildTodoBuckets(input).flatMap(group => group.todos);
  assert.equal(visible.length, 9);
  assert.ok(visible.some(t => t.id === 'undated7'));
  assert.ok(visible.some(t => t.id === 'distant'));
  assert.ok(!visible.some(t => t.id === 'done'));
});

test('deadline and time have priority, while ties and undated tasks obey manual order', () => {
  const input = [todo('undatedB', null, null, 3), todo('late', '2026-11-01', '18:00', -10), todo('tieB', '2026-11-01', '09:00', 2), todo('day-end', '2026-11-01', null, -20), todo('tieA', '2026-11-01', '09:00', 1), todo('undatedA', null, null, 0)];
  assert.deepEqual(input.sort(compareTodosSmart).map(t => t.id), ['tieA', 'tieB', 'late', 'day-end', 'undatedA', 'undatedB']);
});

test('rescheduling labels name the exact destination instead of a date-range bucket', t => {
  freeze(t);
  const choices = getTodoDateOptions();
  assert.deepEqual(choices.map(t => t.dueDateKey), ['2026-10-26', '2026-10-27', '2026-10-29', '2026-11-25', null]);
  assert.match(choices[2].label, /3 天后.*2026-10-29/);
  assert.match(choices[3].label, /30 天后.*2026-11-25/);
});

test('sorting warns only for conflicting deadlines within a group, not valid manual ties or cross-group moves', () => {
  const items = [todo('a', '2026-11-01', '09:00'), todo('b', '2026-11-01', '18:00'), todo('c', '2026-11-01', '09:00')];
  const ordered = ids => ids.map(id => ({ id, groupId: 'soon' }));
  assert.equal(hasTodoDateOrderConflict(ordered(['b', 'a']), items), true);
  assert.equal(hasTodoDateOrderConflict(ordered(['c', 'a', 'b']), items), false);
  assert.equal(hasTodoDateOrderConflict([{ id: 'b', groupId: 'later' }, { id: 'a', groupId: 'soon' }], items), false);
  assert.equal(hasTodoDateOrderConflict(ordered(['unknown', 'a']), items), false);
});

test('all six themes keep primary action text and small secondary text readable', () => {
  const luminance = hex => {
    const channels = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  for (const id of Object.keys(THEME_PRESETS)) {
    const { colors } = getTheme(id);
    assert.ok(contrast(colors.primary, colors.white) >= 4.5, `${id}: primary button text`);
    assert.ok(contrast(colors.textSecondary, colors.background) >= 4.5, `${id}: secondary text`);
  }
});
