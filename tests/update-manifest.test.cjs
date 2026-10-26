const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { parseManifest, selectUpdate, shouldAutoCheck, fetchManifest, CHECK_INTERVAL, MANIFEST_URL } = require('../src/update/manifest.ts');
const manifest = () => ({ formatVersion: 1, channel: 'stable', version: '1.3.0', versionCode: 11,
  applicationId: 'com.androidsoftwaredaily.habitcheckin', tag: 'v1.3.0', minimumAndroidApi: 24,
  certificateSha256: 'a'.repeat(64), notes: ['更新说明'], assets: ['arm64-v8a', 'x86_64'].map(abi => ({
    abi, name: `lime-1.3.0-${abi}.apk`, size: 32000000, sha256: 'b'.repeat(64),
    url: `https://github.com/2742360657/Lime/releases/download/v1.3.0/lime-1.3.0-${abi}.apk`,
  })) });
const installed = (patch = {}) => ({ applicationId: manifest().applicationId, version: '1.2.5', versionCode: 10,
  sdk: 36, certificateSha256: 'a'.repeat(64), supportedAbis: ['x86_64', 'x86'], ...patch });

test('published contract chooses native ABI preference and only offers strictly newer version codes', () => {
  const release = parseManifest(manifest());
  assert.equal(selectUpdate(release, installed()).asset.abi, 'x86_64');
  assert.equal(selectUpdate(release, installed({ supportedAbis: ['arm64-v8a', 'x86_64'] })).asset.abi, 'arm64-v8a');
  assert.equal(selectUpdate(release, installed({ versionCode: 11 })), null);
  assert.equal(selectUpdate(release, installed({ versionCode: 12 })), null);
});
test('rejects foreign editions, prereleases, invalid versions and ambiguous asset metadata', () => {
  for (const patch of [{ applicationId: 'foreign' }, { channel: 'beta' }, { formatVersion: 2 },
    { version: '1.3.0-beta' }, { tag: 'v1.3.1' }, { versionCode: 11.5 }, { minimumAndroidApi: 0 }, { certificateSha256: 'invalid' }]) {
    assert.throws(() => parseManifest({ ...manifest(), ...patch }));
  }
  for (const patch of [{ abi: 'x86' }, { size: 0 }, { size: 201 * 1024 * 1024 }, { size: 1.5 }, { sha256: 'bad' }, { name: '../../other.apk' }]) {
    const value = manifest(); Object.assign(value.assets[0], patch); assert.throws(() => parseManifest(value));
  }
  const duplicate = manifest(); duplicate.assets.push(duplicate.assets[0]); assert.throws(() => parseManifest(duplicate));
  assert.throws(() => parseManifest({ ...manifest(), assets: [] }));
});
test('download URL is bound to exact repository, tag and filename', () => {
  for (const url of ['http://github.com/2742360657/Lime/releases/download/v1.3.0/lime-1.3.0-arm64-v8a.apk',
    'https://github.com.evil.test/2742360657/Lime/releases/download/v1.3.0/lime-1.3.0-arm64-v8a.apk',
    'https://github.com/other/Lime/releases/download/v1.3.0/lime-1.3.0-arm64-v8a.apk',
    'https://github.com/2742360657/Lime/releases/download/v1.3.1/lime-1.3.0-arm64-v8a.apk',
    manifest().assets[0].url + '?redirect=evil', 'file:///cache/update.apk']) {
    const value = manifest(); value.assets[0].url = url; assert.throws(() => parseManifest(value));
  }
});
test('incompatible Android, signature, app identity and ABI produce actionable errors', () => {
  for (const [patch, pattern] of [[{ sdk: 23 }, /Android/], [{ certificateSha256: 'c'.repeat(64) }, /签名/],
    [{ applicationId: 'foreign' }, /正式版/], [{ supportedAbis: ['x86'] }, /设备/]]) {
    assert.throws(() => selectUpdate(parseManifest(manifest()), installed(patch)), pattern);
  }
});
test('automatic check is opt-out, daily, and recovers from clock rollback', () => {
  const now = CHECK_INTERVAL * 5;
  assert.equal(shouldAutoCheck(false, 0, now), false);
  assert.equal(shouldAutoCheck(true, 0, now), true);
  assert.equal(shouldAutoCheck(true, now - CHECK_INTERVAL + 1, now), false);
  assert.equal(shouldAutoCheck(true, now - CHECK_INTERVAL, now), true);
  assert.equal(shouldAutoCheck(true, now + 1, now), true);
});
test('notes are bounded plain strings', () => {
  const parsed = parseManifest({ ...manifest(), notes: [42, ...Array(40).fill('x'.repeat(600))] });
  assert.equal(parsed.notes.length, 30); assert.equal(parsed.notes[0].length, 500);
});
test('anonymous manifest fetch uses fixed public asset and rejects HTTP, oversized and malformed responses', async t => {
  let request;
  t.mock.method(global, 'fetch', async (url, options) => { request = { url, options }; return { ok: true, text: async () => JSON.stringify(manifest()) }; });
  const controller = new AbortController();
  assert.equal((await fetchManifest(controller.signal)).versionCode, 11);
  assert.ok(request.url.startsWith(MANIFEST_URL + '?check='));
  assert.equal(request.options.signal, controller.signal);
  assert.equal(request.options.headers.Authorization, undefined);
  for (const response of [{ ok: false }, { ok: true, text: async () => 'x'.repeat(65537) }, { ok: true, text: async () => '{}' }]) {
    global.fetch = async () => response; await assert.rejects(() => fetchManifest(controller.signal));
  }
});
