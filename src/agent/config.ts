import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { validatePersona } from './store';

const KEY_NAME = 'lime.deepseek.key';
export async function readApiKey(): Promise<string | null> { return SecureStore.getItemAsync(KEY_NAME); }
export async function saveApiKey(key: string) {
  const trimmed = key.trim();
  if (!/^\S{10,512}$/.test(trimmed)) throw new Error('API Key 格式不正确。');
  await SecureStore.setItemAsync(KEY_NAME, trimmed);
}
export async function removeApiKey() { await SecureStore.deleteItemAsync(KEY_NAME); }
export async function pickPersona() {
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled) return null;
  const asset = picked.assets[0], file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size) > 128 * 1024) throw new Error('人格文件不能超过 128 KB。');
    return { ...validatePersona(asset.name, await file.text()), enabled: 1 };
  } finally {
    // Only the picker-created cache copy is removed, never the user's selected original.
    if (asset.uri.startsWith('file:') && file.exists && asset.uri.includes('/cache/')) file.delete();
  }
}
