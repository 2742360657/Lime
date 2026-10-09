const { DatabaseSync } = require('node:sqlite');
const { tableColumns } = require('../../src/storage/databaseSchema');

// Actual SQLite; only the SDK adapter is substituted. Queue/native acceptance is separate.
function sqliteHarness(filename = ':memory:') {
  const sql = new DatabaseSync(filename);
  for (const [table, fields] of Object.entries(tableColumns)) {
    sql.exec(`CREATE TABLE IF NOT EXISTS ${table}(id TEXT PRIMARY KEY,${Object.entries(fields).map(([name, column]) => `${name} ${column.type}`).join(',')})`);
  }
  let tail = Promise.resolve(), failSql = null;
  const tx = {
    async getOptional(query, args = []) { return sql.prepare(query).get(...args) ?? null; },
    async getAll(query, args = []) { return sql.prepare(query).all(...args); },
    async execute(query, args = []) {
      if (failSql && query.includes(failSql)) throw new Error('Synthetic transaction interruption');
      return sql.prepare(query).run(...args);
    },
  };
  function transaction(fn) {
    const result = tail.then(async () => {
      sql.exec('BEGIN');
      try { const value = await fn(tx); sql.exec('COMMIT'); return value; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    });
    tail = result.then(() => {}, () => {});
    return result;
  }
  return {
    sql, tx, ...tx, writeTransaction: transaction, readTransaction: transaction,
    failOn(fragment) { failSql = fragment; }, close() { sql.close(); },
  };
}
module.exports = { sqliteHarness };
