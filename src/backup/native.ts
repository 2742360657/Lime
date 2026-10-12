import { NativeModules } from 'react-native';
import { BackupError, type Blob } from './model';
export type FileDescriptor = Blob & { uri: string };
export type Stage = { id: string; uri: string; size: number; digest: string; manifest: string; blobs: { hash: string; size: number }[] };
const requireNative = () => { if (!NativeModules.LimeBackup) throw new BackupError('IO'); return NativeModules.LimeBackup; };
async function call<T>(name: string, ...args: unknown[]): Promise<T> {
  try { return JSON.parse(await requireNative()[name](...args)); }
  catch (e) { if (e instanceof BackupError) throw e; const code = (e as { code?: string })?.code; throw new BackupError(['FORMAT','LIMIT','MISSING_FILE','INTEGRITY'].includes(String(code)) ? code as 'FORMAT' : 'IO'); }
}
export const backupNative = {
  inspect: (uri: string, role: Blob['role']) => call<{ hash: string; size: number; uri: string }>('inspect',uri,role),
  pack: (manifest: string, files: FileDescriptor[]) => call<Pick<Stage,'id'|'uri'|'size'|'digest'>>('pack',manifest,JSON.stringify(files)),
  unpack: (uri: string) => call<Stage>('unpack',uri),
  install: (id: string) => call<{ archiveUri: string; paths: Record<string,string> }>('install',id),
  async discard(id: string) { try { await requireNative().discard(id); } catch {} },
  async write(id: string, uri: string) { try { await requireNative().writeTo(id,uri); } catch { throw new BackupError('IO'); } },
  async exportArchive(source: string, uri: string) { try { await requireNative().copyOut(source,uri); } catch { throw new BackupError('IO'); } },
};
