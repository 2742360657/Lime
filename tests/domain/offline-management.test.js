const { createHash } = require('node:crypto');
const { sqliteHarness } = require('./sqliteHarness.cjs');
const { createDomain } = require('../../src/domain/service');
const { createUiRetry } = require('../../src/domain/uiRetry');

const now = Date.parse('2026-10-11T16:30:00Z'), ui = { actor: 'ui' };
let db, domain, sequence;
beforeEach(() => {
  sequence = 0; db = sqliteHarness();
  domain = createDomain(db, { id: () => 'item-' + ++sequence, now: () => now, digest: async value => createHash('sha256').update(value).digest('hex') });
});
afterEach(() => db.close());
const run = (command, operationId = 'op-' + ++sequence) => domain.execute(command, { ...ui, operationId });
async function memory(id, key, content = '合成个人事实', kind = 'fact', updated = new Date(now).toISOString()) {
  await db.execute('INSERT INTO local_memories(id,kind,key,content,forgotten,revision,created_at,updated_at) VALUES(?,?,?,?,0,1,?,?)', [id,kind,key,content,now,updated]);
}
async function habit() {
  await db.execute("INSERT INTO habits(id,name,archived_at,revision,deleted,sort_order) VALUES('habit','合成习惯',NULL,1,0,0)");
}

test('keyword search reaches older explicit memories and reports bounded coverage without forgotten content', async () => {
  await memory('old', '饮食', '不喝咖啡', 'preference', '2026-01-01T00:00:00.000Z');
  for (let i=0; i<105; i++) await memory('new-' + i, '其他-' + i);
  await memory('forgot', '忘记的饮食', '咖啡');
  await db.execute("UPDATE local_memories SET forgotten=1,content='' WHERE id='forgot'");
  expect(await domain.listMemories({limit:100})).toHaveLength(100);
  const page = await domain.queryMemories({query:'咖啡',kind:'preference'});
  expect(page.matched).toBe(1); expect(page.records.map(row => row.id)).toEqual(['old']); expect(page.nextCursor).toBeNull();
  expect((await domain.queryMemories()).matched).toBe(106);
});

test('timestamp ties paginate deterministically with exact current filter and remaining counts', async () => {
  for (const id of ['c','a','b','d','e']) await memory(id, '共同名称');
  const first = await domain.queryMemories({query:'共同',limit:2});
  const second = await domain.queryMemories({query:'共同',limit:2,cursor:first.nextCursor});
  const third = await domain.queryMemories({query:'共同',limit:2,cursor:second.nextCursor});
  expect([first,second,third].flatMap(p => p.records.map(row=>row.id))).toEqual(['a','b','c','d','e']);
  expect([first,second,third].map(p=>p.matched)).toEqual([5,5,5]);
  expect([first,second,third].map(p=>p.remaining)).toEqual([5,3,1]);
  expect(third.nextCursor).toBeNull(); expect(second.scope).toContain('续页');
});

test.each(['%', '_', '\\'])('memory keywords match literal LIKE metacharacter %s', async query => {
  await memory('literal', '合成' + query + '字符'); await memory('other', '无通配符');
  expect((await domain.queryMemories({query})).records.map(row=>row.id)).toEqual(['literal']);
});

test.each([{limit:0},{limit:101},{query:'x'.repeat(121)},{kind:'diary'},{cursor:{id:'a',updatedAt:'invalid'}},{sql:'SELECT *'}])('rejects unbounded or forged memory query %j', async input => {
  await expect(domain.queryMemories(input)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
});

test('activity page counts status filters, matches literal title/type and identifies missing checkins', async () => {
  await habit();
  const a = await run({type:'activity.start',title:'合成_%活动',kind:'阅读',habitId:'habit'});
  const b = await run({type:'activity.start',title:'合成活动',kind:'阅读',habitId:null});
  const c = await run({type:'activity.start',title:'取消活动',kind:'训练',habitId:null});
  await run({type:'activity.complete',id:a.entity.id,expectedRevision:1,note:'完成记录'});
  await run({type:'activity.cancel',id:c.entity.id,expectedRevision:1});
  expect((await domain.queryActivities()).records.map(row=>row.id)).toEqual([b.entity.id]);
  const first=await domain.queryActivities({status:'all',limit:2});
  const second=await domain.queryActivities({status:'all',limit:2,cursor:first.nextCursor});
  expect(first.matched).toBe(3); expect(second.remaining).toBe(1);
  expect(new Set([...first.records,...second.records].map(row=>row.id)).size).toBe(3);
  const page=await domain.queryActivities({status:'completed',query:'_%'});
  expect(page.records[0]).toMatchObject({id:a.entity.id,habit_name:'合成习惯',habit_available:1,checkin_state:'linked'});
  await db.execute('UPDATE checkins SET deleted=1');
  expect((await domain.queryActivities({status:'completed'})).records[0].checkin_state).toBe('missing');
  expect((await db.getOptional('SELECT COUNT(*) AS n FROM checkins')).n).toBe(1);
});

test('a lost UI response retries the committed operation without duplicating plans or checkins', async () => {
  await habit(); const retry=createUiRetry(()=>'retry-' + ++sequence);
  const command={type:'activity.start',title:'计划',kind:'训练',habitId:'habit'};
  const id=retry.operation(command); const saved=await run(command,id);
  // No committed() call: simulate losing the client response after the transaction committed.
  const replay=await run(command,retry.operation({...command}));
  expect(replay).toMatchObject({disposition:'replayed',entity:saved.entity});
  expect((await db.getOptional('SELECT COUNT(*) AS n FROM local_activities')).n).toBe(1);
  retry.committed();
  const complete={type:'activity.complete',id:saved.entity.id,expectedRevision:1,note:'完成'};
  const op=retry.operation(complete); await run(complete,op); await run(complete,retry.operation(complete));
  expect((await db.getOptional('SELECT COUNT(*) AS n FROM checkins')).n).toBe(1);
  expect((await db.getOptional('SELECT date_key FROM checkins')).date_key).toBe('2026-10-12');
  expect(retry.operation({...complete,note:'改变输入'})).not.toBe(op);
});

test('activity completion rollback preserves the active plan and can retry the same operation', async () => {
  await habit(); const saved=await run({type:'activity.start',title:'计划',kind:'训练',habitId:'habit'});
  const command={type:'activity.complete',id:saved.entity.id,expectedRevision:1,note:'保留输入'};
  db.failOn('INSERT INTO local_operations'); await expect(run(command,'retry-close')).rejects.toThrow();
  expect((await domain.queryActivities()).records[0].revision).toBe(1);
  expect((await db.getOptional('SELECT COUNT(*) AS n FROM checkins')).n).toBe(0);
  db.failOn(null); await run(command,'retry-close');
  expect((await db.getOptional('SELECT COUNT(*) AS n FROM checkins')).n).toBe(1);
});

test('memory and activity revisions refuse overflow without losing text or adding a checkin', async () => {
  await memory('memo','事实'); await db.execute('UPDATE local_memories SET revision=?',[Number.MAX_SAFE_INTEGER]);
  for (const command of [{type:'memory.correct',content:'更正'},{type:'memory.forget'}]) await expect(run({...command,id:'memo',expectedRevision:Number.MAX_SAFE_INTEGER})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  expect((await domain.queryMemories()).records[0].content).toBe('合成个人事实');
  await habit(); const saved=await run({type:'activity.start',title:'计划',kind:'训练',habitId:'habit'});
  await db.execute('UPDATE local_activities SET revision=?',[Number.MAX_SAFE_INTEGER]);
  await expect(run({type:'activity.complete',id:saved.entity.id,expectedRevision:Number.MAX_SAFE_INTEGER,note:''})).rejects.toMatchObject({code:'INVALID_ARGUMENT'});
  expect((await db.getOptional('SELECT COUNT(*) AS n FROM checkins')).n).toBe(0);
});
