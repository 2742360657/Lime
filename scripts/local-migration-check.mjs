// Run at the phase boundary. Real Node SQLite checks application transactions;
// the separate Android development probe checks native PowerSync queue behavior.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url), ts = require('typescript');
function load(relative, overrides) {
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    throw new Error(`Unexpected native dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}
const schema = load('../src/storage/databaseSchema.ts', { '@powersync/react-native': require('@powersync/common') });
const migration = load('../src/storage/localMigration.ts', { './databaseSchema': schema });
assert.ok(schema.createDatabaseSchema().tables.every(table => table.localOnly));
assert.ok(schema.createDatabaseSchema(false).tables.find(table => table.name === 'documents').localOnly === false);
const folder = mkdtempSync(join(tmpdir(), 'lime-p1-'));
const databases = [];
function open(filename = ':memory:') {
  const sql = new DatabaseSync(filename);
  for (const [table, fields] of Object.entries(schema.tableColumns)) {
    sql.exec(`CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,${Object.entries(fields).map(([name, column]) => `${name} ${column.type}`).join(',')})`);
  }
  const db = {
    sql, fail: false,
    getOptional: async (query, args = []) => sql.prepare(query).get(...args) ?? null,
    getAll: async (query, args = []) => sql.prepare(query).all(...args),
    execute: async (query, args = []) => {
      if (db.fail && query.startsWith('INSERT INTO documents')) throw new Error('synthetic interrupted migration');
      return sql.prepare(query).run(...args);
    },
    async writeTransaction(fn) {
      sql.exec('BEGIN');
      try { const result = await fn(db); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
    async readTransaction(fn) {
      sql.exec('BEGIN');
      try { const result = await fn(db); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  databases.push(db);
  return db;
}
try {
  const source = open(), targetPath = join(folder, 'target.sqlite'), target = open(targetPath);
  await source.execute('INSERT INTO document_groups(id,kind,name,revision,deleted) VALUES(?,?,?,?,?)', ['group', 'diary', 'synthetic group', 1, 0]);
  for (let n = 0; n < 205; n++) {
    await source.execute('INSERT INTO documents(id,kind,title,body,date,revision,deleted) VALUES(?,?,?,?,?,?,?)', [`diary-${String(n).padStart(4, '0')}`, n % 2 ? 'memo' : 'diary', '合成记录', `原文\n${n}`, '2026-10-09', 4, n === 0 ? 1 : 0]);
  }
  await source.execute('INSERT INTO tasks(id,title,status,revision,deleted) VALUES(?,?,?,?,?)', ['task', 'synthetic task', 'done', 8, 0]);
  await source.execute('INSERT INTO habits(id,name,target_count,revision,deleted) VALUES(?,?,?,?,?)', ['habit', 'synthetic habit', 3, 2, 0]);
  await source.execute('INSERT INTO checkins(id,habit_id,note,revision,deleted) VALUES(?,?,?,?,?)', ['checkin', 'habit', '感受', 1, 0]);
  await source.execute('INSERT INTO local_drafts(id,document_id,body,base_revision,base_content) VALUES(?,?,?,?,?)', ['draft', 'diary-0000', '未完成原文', 4, '{"body":"原文"}']);
  await source.execute('INSERT INTO local_conflicts(id,snapshots,error) VALUES(?,?,?)', ['recovery', '[{"table":"documents","row":null}]', 'fixture']);
  for (const [id, value] of [['business-import-v1', '1'], ['memo-import-v1', '1'], ['chat-cache-synthetic', '[]']]) await source.execute('INSERT INTO local_meta(id,value) VALUES(?,?)', [id, value]);
  const before = await source.getAll('SELECT * FROM documents ORDER BY id');
  target.fail = true;
  await assert.rejects(migration.migrateLocalDatabase(target, source), /synthetic interrupted/);
  assert.equal((await target.getAll('SELECT * FROM local_meta')).length, 0);
  assert.equal((await target.getAll('SELECT * FROM document_groups')).length, 0);
  assert.equal((await target.getAll('SELECT * FROM documents')).length, 0);
  target.fail = false;
  await migration.migrateLocalDatabase(target, source);
  for (const table of schema.localTables) {
    const original = await source.getAll(`SELECT * FROM ${table} ORDER BY id`);
    const saved = await target.getAll(`SELECT * FROM ${table} ORDER BY id`);
    assert.deepEqual(table === 'local_meta' ? saved.filter(row => row.id !== migration.LOCAL_MIGRATION_KEY) : saved, original);
  }
  const receipt = JSON.parse((await target.getOptional('SELECT value FROM local_meta WHERE id=?', [migration.LOCAL_MIGRATION_KEY])).value);
  assert.equal(receipt.counts.documents, 205);
  assert.deepEqual(await source.getAll('SELECT * FROM documents ORDER BY id'), before);
  console.log('PASS real SQLite pagination, original fields/IDs/drafts/cache, atomic rollback and retry');
  await target.execute('UPDATE documents SET body=?,revision=revision+1 WHERE id=?', ['newer local content', 'diary-0001']);
  await migration.migrateLocalDatabase(target, source);
  assert.equal((await target.getOptional('SELECT body FROM documents WHERE id=?', ['diary-0001'])).body, 'newer local content');
  target.sql.close(); databases.splice(databases.indexOf(target), 1);
  const reopened = open(targetPath);
  await migration.migrateLocalDatabase(reopened, source);
  assert.equal((await reopened.getOptional('SELECT body FROM documents WHERE id=?', ['diary-0001'])).body, 'newer local content');
  assert.equal((await reopened.getOptional('SELECT base_content FROM local_drafts WHERE id=?', ['draft'])).base_content, '{"body":"原文"}');
  console.log('PASS file reopen and completed receipt prevent old source overwriting new local edits');
  const fresh = open();
  await migration.migrateLocalDatabase(fresh, null);
  assert.equal(JSON.parse((await fresh.getOptional('SELECT value FROM local_meta WHERE id=?', [migration.LOCAL_MIGRATION_KEY])).value).source, 'fresh');
  const occupied = open();
  await occupied.execute('INSERT INTO tasks(id,title) VALUES(?,?)', ['existing', 'keep this']);
  await assert.rejects(migration.migrateLocalDatabase(occupied, source), /尚未确认/);
  assert.equal((await occupied.getOptional('SELECT title FROM tasks WHERE id=?', ['existing'])).title, 'keep this');
  console.log('PASS fresh installation and refusal to overwrite unconfirmed target data');
} finally {
  for (const db of databases) db.sql.close();
  rmSync(folder, { recursive: true, force: true });
}
