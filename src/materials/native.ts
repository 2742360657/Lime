import { NativeModules, NativeEventEmitter } from 'react-native';
import type { Analysis, Copy } from './store';
const module = NativeModules.LimeMaterials;
function requireNative() { if (!module) throw new Error('当前安装包缺少材料组件，请安装新版开发包。'); return module; }
export const materialNative = {
  async copy(uri: string, name: string, mime = 'application/octet-stream'): Promise<Copy> { return JSON.parse(await requireNative().copyMaterial(uri, name, mime)); },
  async parse(uri: string, name: string): Promise<Analysis> { return JSON.parse(await requireNative().parseMaterial(uri, name)); },
  async pending(): Promise<{ id: string; entries: (Copy & { error?: string })[] }[]> { return JSON.parse(await requireNative().pending()); },
  async acknowledge(id: string) { await requireNative().acknowledge(id); },
  subscribe(fn: () => void) { if (!module) return () => {}; const listener = new NativeEventEmitter(module).addListener('LimeMaterialsIncoming', fn); return () => listener.remove(); },
};
