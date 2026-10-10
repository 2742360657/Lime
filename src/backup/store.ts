import type { DomainDatabase, DomainTransaction } from '../domain/types';
import { BackupError, dependencies, emptyBackupRows, equalRow, exportTables, historyRow, projectRow, replaceFiles, safeMeta, validateManifest, type BackupTable, type Manifest, type Row } from './model';

export type RestoreResult = { added: number; skipped: number; conflicts: number; repeated: boolean };
export async function captureBackup(db: DomainDatabase): Promise<Manifest> {
  return db.readTransaction(async tx => {
    const rows = emptyBackupRows();
    for (const table of exportTables) {
      rows[table] = (await tx.getAll<Row>(`SELECT * FROM ${table} ORDER BY id`)).filter(r => table !== 'local_meta' || safeMeta(r.id)).map(row => projectRow(table,row));
    }
    return { format: 'lime-local-backup', version: 2, exportedAt: new Date().toISOString(), rows, blobs: [] };
  });
}
export async function restoreBackup(db: DomainDatabase, manifest: Manifest, input: { digest: string; archiveUri: string; archiveSize: number; fileUri: (hash: string) => string; now: number }): Promise<RestoreResult> {
  manifest = validateManifest(manifest);
  if (!/^[a-f0-9]{64}$/.test(input.digest) || !input.archiveUri.startsWith('file:')) throw new BackupError('FORMAT');
  return db.writeTransaction(async tx => {
    const previous = await tx.getOptional<{ receipt: string }>('SELECT receipt FROM local_backup_imports WHERE id=?', [input.digest]);
    if (previous) return { ...JSON.parse(previous.receipt), repeated: true };
    const existing = new Map<string, Row>(), blocked = new Set<string>(), equal = new Set<string>();
    const key = (table: BackupTable, id: string) => JSON.stringify([table,id]);
    // Files in the archive use portable blob references. Materialize only fixed verified paths.
    const incoming = emptyBackupRows();
    for (const table of exportTables) {
      for (const row of await tx.getAll<Row>(`SELECT * FROM ${table}`)) existing.set(key(table,row.id), projectRow(table,row));
      incoming[table] = manifest.rows[table].map(row => historyRow(table, replaceFiles(table,row, uri => input.fileUri(uri.slice(5)))));
      for (const row of incoming[table]) {
        const k = key(table,row.id), old = existing.get(k);
        if (old) (equalRow(table,old,row) ? equal : blocked).add(k);
      }
    }
    // Task/operation source history is part of its graph, even though the old schema
    // stores source links through accepted proposals rather than a SQL foreign key.
    const reverse = new Map<string,string[]>();
    for (const row of incoming.local_proposals.filter(row => row.status === 'accepted' && row.receipt)) {
      const receipt = JSON.parse(String(row.receipt));
      if (receipt.entity?.kind === 'task') {
        const k = key('tasks',receipt.entity.id); reverse.set(k,[...(reverse.get(k) ?? []),key('local_proposals',row.id)]);
      }
    }
    // A conflicting parent cannot silently attach incoming children to the wrong version.
    let changed = true;
    while (changed) {
      changed = false;
      for (const table of exportTables) for (const row of incoming[table]) {
        const k = key(table,row.id);
        if (!blocked.has(k) && (dependencies(table,row).some(ref => blocked.has(key(ref.table,ref.id))) || reverse.get(k)?.some(parent => blocked.has(parent)))) { blocked.add(k); equal.delete(k); changed = true; }
      }
    }
    const result: RestoreResult = { added: 0, skipped: 0, conflicts: blocked.size, repeated: false };
    for (const table of exportTables) for (const row of incoming[table]) {
      const k = key(table,row.id);
      if (blocked.has(k)) continue;
      if (equal.has(k)) { result.skipped++; continue; }
      // A pre-existing configuration is never replaced, even by a newer input snapshot.
      if (table === 'local_meta' && await tx.getOptional('SELECT id FROM local_meta WHERE id=?',[row.id])) { result.conflicts++; continue; }
      await insert(tx,table,row);
      if (table === 'tasks') await tx.execute('INSERT OR REPLACE INTO local_meta(id,value) VALUES(?,?)',['restored-task-notify-'+row.id,String(row.revision)]);
      result.added++;
    }
    if (result.conflicts) await tx.execute('INSERT OR IGNORE INTO local_backup_archives(id,uri,hash,size,summary,created_at) VALUES(?,?,?,?,?,?)', [input.digest,input.archiveUri,input.digest,input.archiveSize,JSON.stringify(result),input.now]);
    await tx.execute('INSERT INTO local_backup_imports(id,receipt,created_at) VALUES(?,?,?)', [input.digest,JSON.stringify(result),input.now]);
    return result;
  });
}
async function insert(tx: DomainTransaction, table: BackupTable, row: Row) {
  const fields = Object.keys(row);
  await tx.execute(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`, fields.map(f => row[f]));
}
