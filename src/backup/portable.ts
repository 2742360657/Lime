import { BackupError, MAX_MANIFEST, blobUri, exportTables, fileSlots, replaceFiles, validateManifest, type Manifest, type Blob } from './model';
import type { FileDescriptor } from './native';
export async function portableSnapshot(snapshot: Manifest, inspect: (uri: string, role: Blob['role']) => Promise<{ hash: string; size: number; uri: string }>) {
  const files = new Map<string,FileDescriptor>(), byUri = new Map<string,FileDescriptor>();
  for (const table of exportTables) for (const row of snapshot.rows[table]) for (const slot of fileSlots(table,row)) {
    let descriptor = byUri.get(slot.value);
    if (!descriptor) { descriptor = { ...await inspect(slot.value,slot.role), role: slot.role }; byUri.set(slot.value,descriptor); }
    if ((slot.hash !== undefined && descriptor.hash !== slot.hash) || (slot.size !== undefined && descriptor.size !== slot.size)) throw new BackupError('INTEGRITY');
    const prior = files.get(descriptor.hash);
    if (!prior || slot.role === 'archive') files.set(descriptor.hash,{ ...descriptor, role: slot.role });
  }
  const rows = { ...snapshot.rows };
  for (const table of exportTables) rows[table] = snapshot.rows[table].map(row => replaceFiles(table,row, uri => blobUri(byUri.get(uri)!.hash)));
  const descriptors = [...files.values()].sort((a,b) => a.hash.localeCompare(b.hash));
  const manifest = validateManifest({ ...snapshot, rows, blobs: descriptors.map(({hash,size,role}) => ({hash,size,role})) });
  const text = JSON.stringify(manifest);
  // Native enforces exact UTF-8 bytes too; this cheap upper bound avoids a giant bridge transfer.
  if (text.length * 3 > MAX_MANIFEST) throw new BackupError('LIMIT');
  return { manifest, text, files: descriptors };
}
