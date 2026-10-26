export const RELEASE_PAGE = 'https://github.com/2742360657/Lime/releases/latest';
export const MANIFEST_URL = `${RELEASE_PAGE}/download/release-manifest.json`;
export const APPLICATION_ID = 'com.androidsoftwaredaily.habitcheckin';
export const CHECK_INTERVAL = 24 * 60 * 60 * 1000;

export type UpdateAsset = { abi: string; name: string; size: number; sha256: string; url: string };
export type ReleaseManifest = {
  formatVersion: 1; channel: 'stable'; applicationId: string; version: string; versionCode: number;
  minimumAndroidApi: number; certificateSha256: string; tag: string; notes: string[]; assets: UpdateAsset[];
};
export type InstalledVersion = { applicationId: string; version: string; versionCode: number; sdk: number; supportedAbis: string[]; certificateSha256: string };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Reject foreign editions, ambiguous architectures and untrusted download locations. */
export function parseManifest(value: unknown): ReleaseManifest {
  if (!isRecord(value) || value.formatVersion !== 1 || value.channel !== 'stable' || value.applicationId !== APPLICATION_ID ||
      typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version) || value.tag !== `v${value.version}` ||
      !integer(value.versionCode, 1, 2_100_000_000) || !integer(value.minimumAndroidApi, 24, 100) || !hash(value.certificateSha256) ||
      !Array.isArray(value.assets) || value.assets.length === 0 || value.assets.length > 4) {
    throw new Error('更新清单不完整或不属于酸橙正式版，请稍后重试。');
  }
  const seen = new Set<string>();
  const assets = value.assets.map((asset): UpdateAsset => {
    if (!isRecord(asset) || typeof asset.abi !== 'string' || !['arm64-v8a', 'x86_64'].includes(asset.abi) || seen.has(asset.abi) ||
        asset.name !== `lime-${value.version}-${asset.abi}.apk` || !integer(asset.size, 1, 200 * 1024 * 1024) || !hash(asset.sha256) ||
        asset.url !== `https://github.com/2742360657/Lime/releases/download/${value.tag}/${asset.name}`) {
      throw new Error('更新安装包信息异常，已停止更新。');
    }
    seen.add(asset.abi);
    return { abi: asset.abi, name: asset.name as string, size: asset.size, sha256: asset.sha256, url: asset.url as string };
  });
  const notes = Array.isArray(value.notes) ? value.notes.filter((note): note is string => typeof note === 'string').slice(0, 30).map(note => note.slice(0, 500)) : [];
  return { formatVersion: 1, channel: 'stable', applicationId: APPLICATION_ID, version: value.version, versionCode: value.versionCode,
    minimumAndroidApi: value.minimumAndroidApi, certificateSha256: value.certificateSha256, tag: value.tag as string, notes, assets };
}

export function selectUpdate(manifest: ReleaseManifest, installed: InstalledVersion) {
  if (installed.applicationId !== APPLICATION_ID) throw new Error('当前安装包不属于酸橙正式版。');
  if (manifest.versionCode <= installed.versionCode) return null;
  if (manifest.minimumAndroidApi > installed.sdk) throw new Error('新版需要更高的 Android 版本，请查看发布说明。');
  if (manifest.certificateSha256 !== installed.certificateSha256) throw new Error('当前安装包签名与正式版不同，无法直接覆盖更新。');
  const asset = installed.supportedAbis.map(abi => manifest.assets.find(asset => asset.abi === abi)).find(Boolean);
  if (!asset) throw new Error('暂未找到适用于此设备的安装包。');
  return { manifest, asset };
}

export function shouldAutoCheck(enabled: boolean, lastCheck: number, now = Date.now()) {
  return enabled && (!Number.isFinite(lastCheck) || lastCheck <= 0 || lastCheck > now || now - lastCheck >= CHECK_INTERVAL);
}

export async function fetchManifest(signal: AbortSignal): Promise<ReleaseManifest> {
  const response = await fetch(`${MANIFEST_URL}?check=${Date.now()}`, { signal, headers: { 'Cache-Control': 'no-cache' } });
  if (!response.ok) throw new Error('暂时无法连接更新源，可以稍后重试或打开发布页。');
  const text = await response.text();
  if (text.length > 64 * 1024) throw new Error('更新清单异常，已停止检查。');
  return parseManifest(JSON.parse(text));
}
