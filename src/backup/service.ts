import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { database } from '../storage/database';
import { agentRuntime } from '../agent/AgentProvider';
import { parseRecordBackup, restoreRecordBackup } from '../storage/recordBackup';
import { backupNative, type Stage } from './native';
import { BackupError, validateManifest, type Manifest } from './model';
import { captureBackup, restoreBackup } from './store';
import { portableSnapshot } from './portable';

async function destination(name: string): Promise<string | null> {
  const access = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(FileSystem.StorageAccessFramework.getUriForDirectoryInRoot('Documents'));
  if (!access.granted) return null;
  return FileSystem.StorageAccessFramework.createFileAsync(access.directoryUri,name,'application/zip');
}
export async function exportFullBackup() {
  const portable = await portableSnapshot(await captureBackup(database),backupNative.inspect);
  const packed = await backupNative.pack(portable.text,portable.files);
  let output: string | null = null;
  try {
    output = await destination(`lime-backup-${Date.now()}.zip`); if (!output) return false;
    await backupNative.write(packed.id,output); return true;
  } catch (error) {
    if (output) await FileSystem.deleteAsync(output,{idempotent:true}).catch(() => {});
    throw error;
  } finally { await backupNative.discard(packed.id); }
}
export type PreparedBackup = { kind: 'full'; stage: Stage; manifest: Manifest; count: number } | { kind: 'legacy'; legacy: Awaited<ReturnType<typeof parseRecordBackup>>; count: number };
export async function pickFullBackup(): Promise<PreparedBackup | null> {
  if (agentRuntime.getSnapshot().busy) throw new BackupError('BUSY');
  const chosen = await DocumentPicker.getDocumentAsync({type:'*/*',multiple:false,copyToCacheDirectory:false});
  if (chosen.canceled) return null;
  const asset = chosen.assets[0];
  if (/\.json$/i.test(asset.name)) {
    const legacy = await parseRecordBackup(await backupNative.legacyText(asset.uri));
    return { kind: 'legacy', legacy, count: legacy.count };
  }
  return prepareFullBackup(asset.uri);
}
export async function prepareFullBackup(uri: string): Promise<Extract<PreparedBackup,{kind:'full'}>> {
  const stage = await backupNative.unpack(uri);
  try {
    const manifest = validateManifest(JSON.parse(stage.manifest));
    const actual = new Map(stage.blobs.map(b => [b.hash,b.size]));
    if (actual.size !== manifest.blobs.length || manifest.blobs.some(b => actual.get(b.hash) !== b.size)) throw new BackupError('INTEGRITY');
    return { kind:'full',stage,manifest,count:Object.values(manifest.rows).reduce((n,r) => n+r.length,0) };
  } catch (error) { await backupNative.discard(stage.id); if(error instanceof BackupError)throw error;throw new BackupError('FORMAT'); }
}
export async function discardPrepared(input: PreparedBackup) { if(input.kind==='full')await backupNative.discard(input.stage.id); }
export async function restorePrepared(input: PreparedBackup) {
  if(agentRuntime.getSnapshot().busy)throw new BackupError('BUSY');
  if(input.kind==='legacy')return restoreRecordBackup(input.legacy);
  const installed=await backupNative.install(input.stage.id);
  return restoreBackup(database,input.manifest,{ digest:input.stage.digest,archiveUri:installed.archiveUri,archiveSize:input.stage.size,now:Date.now(),fileUri:hash => {
    const uri=installed.paths[hash]; if(!uri)throw new BackupError('INTEGRITY');return uri;
  }});
}
export async function exportRecoveryArchive(uri: string) {
  const target=await destination(`lime-recovery-${Date.now()}.zip`);if(!target)return false;
  try { await backupNative.exportArchive(uri,target);return true; }
  catch(error) { await FileSystem.deleteAsync(target,{idempotent:true}).catch(()=>{});throw error; }
}
