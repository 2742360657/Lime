import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { database } from '../storage/database';
import { DomainError, type DocumentRef } from '../domain/types';
import { createMaterialStore, errorText, type Material } from './store';
import { materialNative } from './native';
export const materialStore = createMaterialStore(database, { id: Crypto.randomUUID, now: Date.now });
let collection: Promise<void> | null = null;
export function collectIncoming() {
  if (collection) return collection;
  collection = (async () => {
    for (const batch of await materialNative.pending()) {
      if (!await materialStore.receipt(batch.id)) {
        const refs: DocumentRef[] = [], errors: string[] = [];
        for (const entry of batch.entries) {
          if (entry.error) { errors.push(errorText(entry.error)); continue; }
          try { const material = await materialStore.save(entry, await materialNative.parse(entry.uri, entry.name)); refs.push({ id: material.id, revision: material.revision, kind: 'attachment' }); }
          catch { errors.push('文件导入失败；原件仍在入站区，请重新打开应用。'); throw new Error('材料导入暂未完成，原件保留。'); }
        }
        await materialStore.stage(batch.id, { refs, errors });
      }
      await materialNative.acknowledge(batch.id);
    }
  })().finally(() => { collection = null; });
  return collection;
}
export function listenIncoming(onError: () => void) {
  const collect = () => { void collectIncoming().catch(onError); };
  collect();
  const dispose = materialNative.subscribe(collect), state = AppState.addEventListener('change', value => { if (value === 'active') collect(); });
  return () => { dispose(); state.remove(); };
}
export async function chooseMaterials(): Promise<{ materials: Material[]; errors: string[] }> {
  const picked = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
  if (picked.canceled) return { materials: [], errors: [] };
  const materials: Material[] = [], errors: string[] = [];
  try {
    if (picked.assets.length > 6) throw new Error('一次最多选择6件文件。');
    for (const asset of picked.assets) {
      try { const copy = await materialNative.copy(asset.uri, asset.name, asset.mimeType); materials.push(await materialStore.save(copy, await materialNative.parse(copy.uri, copy.name))); }
      catch (e) { errors.push(errorText(e instanceof Error ? e.message : 'UNREADABLE')); }
    }
  } finally { for (const asset of picked.assets) { try { new File(asset.uri).delete(); } catch {} } }
  return { materials, errors };
}
export async function prepareMaterialImages(refs: DocumentRef[]): Promise<{ id: string; label: string; data: string }[]> {
  const images: { id: string; label: string; data: string }[] = []; let bytes = 0;
  for (const ref of refs.filter(r => r.kind === 'attachment')) {
    const material = await materialStore.get(ref.id);
    if (!material || material.deleted || material.revision !== ref.revision || material.status !== 'ready') throw new DomainError('SOURCE_CHANGED');
    // Native creates bounded analysis copies; no external URI is sent to the model.
    for (const image of JSON.parse(material.images) as { uri: string; label: string }[]) {
      if (images.length >= 6) throw new Error('本轮最多6张图片或扫描页，请减少所选材料。');
      const file = new File(image.uri); if (!file.exists) throw new Error('图片副本已不存在，请重新解析材料。');
      bytes += file.size; if (bytes > 8 * 1024 * 1024) throw new Error('本轮图片超过8MiB，请减少所选材料。');
      images.push({ id: ref.id, label: image.label, data: await file.base64() });
    }
  }
  return images;
}
