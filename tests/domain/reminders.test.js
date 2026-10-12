const { createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createDomain } = require('../../src/domain/service');
const { planReminders, shanghaiTimestamp, NOTIFICATION_PREFIX, MAX_SCHEDULED, LATE_GRACE_MS } = require('../../src/reminders/planner');
const { createReminderService } = require('../../src/reminders/service');
const digest = async text => createHash('sha256').update(text).digest('hex');
let db, domain, counter, clock, allowed, os, driver, service;
const once = { type: 'reminder.create', title: '合成提醒', mode: 'once', dateKey: '2026-10-10', time: '09:00' };
const execute = (cmd, operationId = `op-${++counter}`) => domain.execute(cmd, { actor: 'ui', operationId });
beforeEach(() => {
  counter = 0; clock = shanghaiTimestamp('2026-10-09', '12:00'); db = sqliteHarness();
  domain = createDomain(db, { now: () => clock, id: () => `synthetic-${++counter}`, digest });
  allowed = true; os = new Set();
  driver = { allowed: jest.fn(async () => allowed), pending: jest.fn(async () => [...os]),
    cancel: jest.fn(async id => { os.delete(id); }), schedule: jest.fn(async id => { os.add(id); }) };
  service = createReminderService(db, driver, { now: () => clock, digest });
});
afterEach(() => db.close());
async function enabled() { await service.setSetting('enabled', true); }
async function rules() { return domain.listReminders(); }

test('reminder commit/replay, stale edit, soft cancellation and transaction failure', async () => {
  db.failOn('INSERT INTO local_operations');
  await expect(execute(once, 'create')).rejects.toThrow('Synthetic');
  expect(await rules()).toHaveLength(0);
  db.failOn(null);
  const receipt = await execute(once, 'create');
  expect(await execute(once, 'create')).toMatchObject({ disposition: 'replayed', entity: receipt.entity });
  const update = { ...once, type: 'reminder.update', id: receipt.entity.id, expectedRevision: 1, title: '新名称' };
  await execute(update);
  await expect(execute(update)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  await execute({ type: 'reminder.cancel', id: receipt.entity.id, expectedRevision: 2 });
  expect((await rules())[0]).toMatchObject({ enabled: 0, revision: 3, title: '新名称' });
});

test.each([
  { ...once, dateKey: '2026-10-08' }, { ...once, dateKey: '2026-02-29' },
  { ...once, advanceDays: 7 }, { ...once, monthDay: '10-10' },
  { ...once, time: '24:00' }, { ...once, lunar: true },
  { ...once, mode: 'annual', dateKey: null, monthDay: '02-30' },
  { ...once, mode: 'annual', dateKey: null, monthDay: '02-29', advanceDays: 0, dayOf: false },
])('invalid/past/ambiguous rules cannot commit %j', async command => {
  await expect(execute(command)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  expect(await rules()).toHaveLength(0);
});

test('yearly advance crosses New Year; leap birthday is not silently moved; Shanghai time is deterministic', async () => {
  await execute({ type: 'reminder.create', title: '公历生日', mode: 'annual', monthDay: '01-03', time: '09:00', advanceDays: 7 });
  const planned = planReminders(await rules(), [], false, clock).occurrences;
  expect(planned.slice(0, 2).map(p => p.at)).toEqual([shanghaiTimestamp('2026-12-27', '09:00'), shanghaiTimestamp('2027-01-03', '09:00')]);
  await execute({ type: 'reminder.create', title: '闰日', mode: 'annual', monthDay: '02-29', time: '09:00' });
  expect(planReminders(await rules(), [], false, clock).occurrences.some(p => p.title === '闰日')).toBe(false);
  const leap = planReminders(await rules(), [], false, shanghaiTimestamp('2027-12-01', '00:00')).occurrences.find(p => p.title === '闰日');
  expect(leap.at).toBe(Date.parse('2028-02-29T01:00:00Z'));
});

test('changing/cancelling a rule cancels the old OS ID before scheduling a replacement; no duplicate on refresh', async () => {
  const receipt = await execute(once); await enabled(); const first = [...os][0];
  await service.refresh(); expect(driver.schedule).toHaveBeenCalledTimes(1);
  await execute({ ...once, type: 'reminder.update', id: receipt.entity.id, expectedRevision: 1, dateKey: '2026-10-11' });
  await service.refresh(); expect(os.has(first)).toBe(false); expect(os.size).toBe(1);
  expect(driver.cancel.mock.invocationCallOrder[0]).toBeLessThan(driver.schedule.mock.invocationCallOrder[1]);
  await execute({ type: 'reminder.cancel', id: receipt.entity.id, expectedRevision: 2 });
  await service.refresh(); expect(os.size).toBe(0);
});

test('permission denied/disabled cancels only owned notifications; rules persist', async () => {
  await execute(once); await enabled(); os.add('other-feature'); allowed = false;
  await service.refresh(); expect([...os]).toEqual(['other-feature']); expect(await rules()).toHaveLength(1);
  expect(service.getSnapshot()).toMatchObject({ enabled: true, allowed: false, scheduled: 0 });
  allowed = true; await service.refresh(); expect(os.size).toBe(2);
  await service.setSetting('enabled', false); expect([...os]).toEqual(['other-feature']);
});

test('task dates without a time use 09:00; ordinary updates/completion cancel old IDs', async () => {
  const receipt = await execute({ type: 'task.create', title: '合成到期任务', dueDateKey: '2026-10-10' });
  await enabled(); expect(os.size).toBe(0); await service.setSetting('tasks', true); expect(os.size).toBe(1);
  expect(driver.schedule.mock.calls[0][1].at).toBe(shanghaiTimestamp('2026-10-10', '09:00'));
  const original = [...os][0];
  // Covers legacy UI transaction writers; no reminder-specific callback is required.
  await db.tx.execute('UPDATE tasks SET due_time=?,revision=revision+1 WHERE id=?', ['10:30', receipt.entity.id]);
  await service.refresh(); expect(os.has(original)).toBe(false);
  await db.tx.execute("UPDATE tasks SET status='done',revision=revision+1 WHERE id=?", [receipt.entity.id]);
  await service.refresh(); expect(os.size).toBe(0);
});

test('OS success followed by DB failure resumes once using the stable native identifier', async () => {
  await execute(once);
  db.failOn("SET status='scheduled'"); await enabled();
  expect(os.size).toBe(1); expect(service.getSnapshot().error).not.toBeNull();
  db.failOn(null); await service.refresh(); expect(driver.schedule).toHaveBeenCalledTimes(1);
  expect(service.getSnapshot()).toMatchObject({ scheduled: 1, error: null });
});

test('cancel failure does not schedule replacement, retry repairs the queue; expired instances do not resend', async () => {
  const receipt = await execute(once); await enabled();
  await execute({ ...once, type: 'reminder.update', id: receipt.entity.id, expectedRevision: 1, dateKey: '2026-10-11' });
  driver.cancel.mockRejectedValueOnce(new Error('Synthetic cancel failure'));
  await service.refresh(); expect(driver.schedule).toHaveBeenCalledTimes(1);
  await service.refresh(); expect(driver.schedule).toHaveBeenCalledTimes(2);
  clock = shanghaiTimestamp('2026-10-12', '12:00'); os.clear(); await service.refresh();
  expect(os.size).toBe(0); expect(driver.schedule).toHaveBeenCalledTimes(2);
  expect((await db.tx.getAll('SELECT status FROM local_reminder_instances')).some(r => r.status === 'elapsed')).toBe(true);
});

test('source changes during scheduling cause a fresh serialized pass and remove stale notification', async () => {
  const receipt = await execute(once); let refreshed;
  driver.schedule.mockImplementationOnce(async id => {
    os.add(id); await db.tx.execute('UPDATE local_reminder_rules SET enabled=0,revision=revision+1 WHERE id=?', [receipt.entity.id]);
    refreshed = service.refresh();
  });
  await enabled(); await refreshed;
  expect(os.size).toBe(0); expect(service.getSnapshot().scheduled).toBe(0);
});

test('bounded rolling window and capacity are explicit; overdue dates do not become instant notifications', () => {
  const task = { title: '合成', due_date_key: '2026-10-10', due_time: null, deleted: 0, revision: 1, status: 'open' };
  const tasks = Array.from({ length: MAX_SCHEDULED + 3 }, (_, n) => ({ ...task, id: `task-${n}` }));
  tasks.push({ ...task, id: 'far', due_date_key: '2030-01-01' }, { ...task, id: 'old', due_date_key: '2026-01-01' });
  const plan = planReminders([], tasks, true, clock);
  expect(plan).toMatchObject({ deferred: 3, farther: 1 }); expect(plan.occurrences).toHaveLength(MAX_SCHEDULED);
  expect(plan.occurrences.every(p => p.at > clock)).toBe(true);
});

test('agent reminder changes remain confirmed proposals, even if a grant row is forged', async () => {
  await db.tx.execute("INSERT INTO local_agent_requests(id,status,source_refs) VALUES('request','running','[]')");
  await db.tx.execute("INSERT INTO local_agent_grants(id,request_id,command_type) VALUES('grant','request','reminder.create')");
  await expect(domain.executeRoutine(once, { actor: 'agent', requestId: 'request' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  const proposal = await domain.propose(once, { proposalId: 'proposal', requestId: 'request' });
  await domain.acceptProposal(proposal.id, proposal.revision, { actor: 'ui', operationId: 'confirmed' });
  expect(await rules()).toHaveLength(1); expect(os.size).toBe(0);
});


test('opening after due time retains only a valid queued instance; queue disappearance never resends', async () => {
  await execute(once); await enabled(); const id = [...os][0];
  clock = shanghaiTimestamp(once.dateKey, once.time) + 120000;
  await service.refresh(); expect([...os]).toEqual([id]);
  expect(driver.cancel).not.toHaveBeenCalled(); expect(driver.schedule).toHaveBeenCalledTimes(1);
  expect(service.getSnapshot()).toMatchObject({ scheduled: 0, delayed: 1, error: null });
  expect(await db.tx.getOptional('SELECT status FROM local_reminder_instances WHERE id=?', [id])).toMatchObject({ status: 'delayed' });
  os.clear(); await service.refresh();
  expect(service.getSnapshot().delayed).toBe(0); expect(driver.schedule).toHaveBeenCalledTimes(1);
  expect(await db.tx.getOptional('SELECT status FROM local_reminder_instances WHERE id=?', [id])).toMatchObject({ status: 'elapsed' });
});

test('past rules and unrecorded native IDs cannot acquire grace; exactly 24 hours expires', async () => {
  await execute(once); clock = shanghaiTimestamp(once.dateKey, once.time) + 120000;
  await enabled(); expect(driver.schedule).not.toHaveBeenCalled();
  os.add(NOTIFICATION_PREFIX + 'unrecorded'); await service.refresh(); expect(os.size).toBe(0);
  clock = shanghaiTimestamp('2026-10-09', '12:00'); await service.refresh(); expect(os.size).toBe(1);
  clock = shanghaiTimestamp(once.dateKey, once.time) + LATE_GRACE_MS - 1;
  await service.refresh(); expect(os.size).toBe(1); expect(service.getSnapshot().delayed).toBe(1);
  clock++; await service.refresh(); expect(os.size).toBe(0); expect(service.getSnapshot().delayed).toBe(0);
});

test.each(['revision', 'cancel', 'disabled', 'permission'])('a late queued rule is cancelled on %s without resending', async change => {
  const receipt = await execute(once); await enabled(); const id = [...os][0];
  clock = shanghaiTimestamp(once.dateKey, once.time) + 120000;
  if (change === 'revision') await db.tx.execute('UPDATE local_reminder_rules SET revision=revision+1 WHERE id=?', [receipt.entity.id]);
  if (change === 'cancel') await execute({ type: 'reminder.cancel', id: receipt.entity.id, expectedRevision: 1 });
  if (change === 'disabled') await service.setSetting('enabled', false);
  if (change === 'permission') allowed = false;
  await service.refresh(); expect(os.has(id)).toBe(false); expect(driver.schedule).toHaveBeenCalledTimes(1);
});

test.each(['done', 'deleted', 'tasks-disabled'])('a late queued task is cancelled on %s', async change => {
  const receipt = await execute({ type: 'task.create', title: '合成任务', dueDateKey: once.dateKey });
  await service.setSetting('tasks', true); await enabled();
  clock = shanghaiTimestamp(once.dateKey, once.time) + 120000;
  if (change === 'done') await db.tx.execute("UPDATE tasks SET status='done',revision=revision+1 WHERE id=?", [receipt.entity.id]);
  if (change === 'deleted') await db.tx.execute('UPDATE tasks SET deleted=1,revision=revision+1 WHERE id=?', [receipt.entity.id]);
  if (change === 'tasks-disabled') await service.setSetting('tasks', false);
  await service.refresh(); expect(os.size).toBe(0); expect(driver.schedule).toHaveBeenCalledTimes(1);
});

test('annual grace crosses a year boundary; retained items share the future capacity', async () => {
  clock = shanghaiTimestamp('2026-12-31', '12:00');
  await execute({ type: 'reminder.create', title: '跨年', mode: 'annual', monthDay: '12-31', time: '23:59' });
  await enabled(); const oldId = driver.schedule.mock.calls[0][0];
  clock = shanghaiTimestamp('2027-01-01', '00:01');
  for (let n = 0; n < MAX_SCHEDULED; n++) await execute({ type: 'task.create', title: `合成${n}`, dueDateKey: '2027-01-02' });
  await service.setSetting('tasks', true);
  expect(os.has(oldId)).toBe(true); expect(os.size).toBe(MAX_SCHEDULED);
  expect(service.getSnapshot()).toMatchObject({ delayed: 1, scheduled: MAX_SCHEDULED - 1, deferred: 2 });
});

test('missing DB acknowledgement recovers a late native notification without a second schedule', async () => {
  await execute(once); db.failOn("SET status='scheduled'"); await enabled();
  clock = shanghaiTimestamp(once.dateKey, once.time) + 120000;
  db.failOn(null); await service.refresh();
  expect(os.size).toBe(1); expect(driver.schedule).toHaveBeenCalledTimes(1);
  expect(service.getSnapshot()).toMatchObject({ delayed: 1, error: null });
});


test('one persistent schedule failure cannot starve other reminders; retry does not duplicate successes', async () => {
  const first = await execute(once);
  await execute({ ...once, title: '正常二', time: '10:00' });
  await execute({ ...once, title: '正常三', time: '11:00' });
  let broken = true;
  driver.schedule.mockImplementation(async (id, occurrence) => {
    if (broken && occurrence.sourceId === first.entity.id) throw new Error('Synthetic per-item failure');
    os.add(id);
  });
  await enabled();
  expect(os.size).toBe(2); expect(driver.schedule).toHaveBeenCalledTimes(3);
  expect(service.getSnapshot()).toMatchObject({ scheduled: 2, error: null, failures: [{ sourceId: first.entity.id, title: once.title }] });
  expect((await db.tx.getAll("SELECT status FROM local_reminder_instances WHERE source_id=?", [first.entity.id]))[0].status).toBe('error');
  await service.refresh(); expect(os.size).toBe(2); expect(driver.schedule).toHaveBeenCalledTimes(4);
  broken = false; await service.refresh();
  expect(os.size).toBe(3); expect(driver.schedule).toHaveBeenCalledTimes(5);
  expect(service.getSnapshot()).toMatchObject({ scheduled: 3, failures: [], error: null });
});

test('failure acknowledgement is transactional: DB errors abort and retry recovers other items', async () => {
  await execute(once); await execute({ ...once, title: '正常后项', time: '10:00' });
  driver.schedule.mockRejectedValueOnce(new Error('Synthetic native failure'));
  db.failOn("SET status='error'"); await enabled();
  expect(driver.schedule).toHaveBeenCalledTimes(1); expect(os.size).toBe(0);
  expect(service.getSnapshot().error).not.toBeNull(); expect(service.getSnapshot().failures).toEqual([]);
  db.failOn(null); await service.refresh(); expect(os.size).toBe(2);
  expect(service.getSnapshot()).toMatchObject({ scheduled: 2, failures: [], error: null });
});

test('a failed expired item is not retried while later valid items remain queued', async () => {
  await execute(once); await execute({ ...once, title: '后项', time: '11:00' });
  driver.schedule.mockRejectedValueOnce(new Error('Synthetic failure'));
  await enabled(); expect(service.getSnapshot().failures).toHaveLength(1);
  clock = shanghaiTimestamp(once.dateKey, once.time) + 120000; await service.refresh();
  expect(driver.schedule).toHaveBeenCalledTimes(2); expect(os.size).toBe(1);
  expect(service.getSnapshot()).toMatchObject({ scheduled: 1, delayed: 0, failures: [], error: null });
});

test('global queue failure clears stale success counts and does not cancel or reschedule unknown state', async () => {
  await execute(once); await enabled(); expect(service.getSnapshot().scheduled).toBe(1);
  driver.pending.mockRejectedValueOnce(new Error('Synthetic queue failure')); await service.refresh();
  expect(service.getSnapshot()).toMatchObject({ scheduled: 0, delayed: 0, failures: [] });
  expect(service.getSnapshot().error).not.toBeNull(); expect(os.size).toBe(1);
  expect(driver.cancel).not.toHaveBeenCalled(); expect(driver.schedule).toHaveBeenCalledTimes(1);
  await service.refresh(); expect(service.getSnapshot()).toMatchObject({ scheduled: 1, error: null });
});
