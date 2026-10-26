import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.version, app.version);
assert.equal(run('git', ['status', '--porcelain']), '', 'Commit the exact release source first');
const sourceCommit = run('git', ['rev-parse', 'HEAD']);
const tag = `v${app.version}`;
const directory = path.resolve(process.argv[2] ?? 'artifacts/release');
const tools = path.join(process.env.ANDROID_HOME ?? '', 'build-tools', '36.0.0');
const expectedCertificate = readFileSync('docs/usage.md', 'utf8').match(/当前签名证书 SHA-256：`([a-f0-9]{64})`/)[1];
const changelog = readFileSync('CHANGELOG.md', 'utf8');
const section = changelog.split(`## ${app.version}\n`)[1]?.split('\n## ')[0];
assert.ok(section, 'Add release notes to CHANGELOG.md');
const notes = section.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));
assert.ok(notes.length > 0);
let bundleHash;
let minimumAndroidApi;
let internetPermission;
const assets = ['arm64-v8a', 'x86_64'].map(abi => {
  const name = `lime-${app.version}-${abi}.apk`;
  const file = path.join(directory, name);
  const badging = run(path.join(tools, 'aapt'), ['dump', 'badging', file]);
  const permissions = run(path.join(tools, 'aapt'), ['dump', 'permissions', file]);
  const cert = run(path.join(tools, 'apksigner'), ['verify', '--print-certs', file]).match(/certificate SHA-256 digest: ([a-f0-9]{64})/)[1];
  assert.equal(cert, expectedCertificate, 'Release signer changed');
  assert.ok(badging.includes(`name='${app.android.package}'`));
  assert.ok(badging.includes(`versionName='${app.version}'`) && badging.includes(`versionCode='${app.android.versionCode}'`));
  assert.ok(badging.includes(`native-code: '${abi}'`));
  assert.ok(!badging.includes('application-debuggable'));
  for (const permission of app.android.blockedPermissions ?? []) assert.ok(!permissions.includes(permission), `Unexpected ${permission}`);
  for (const permission of app.android.permissions ?? []) assert.ok(permissions.includes(permission), `Missing ${permission}`);
  const thisMinSdk = Number(badging.match(/sdkVersion:'(\d+)'/)[1]);
  minimumAndroidApi ??= thisMinSdk;
  assert.equal(thisMinSdk, minimumAndroidApi);
  internetPermission ??= permissions.includes('android.permission.INTERNET');
  const thisBundle = createHash('sha256').update(execFileSync('unzip', ['-p', file, 'assets/index.android.bundle'], { maxBuffer: 16 * 1024 * 1024 })).digest('hex');
  bundleHash ??= thisBundle;
  assert.equal(thisBundle, bundleHash, 'Architecture builds have different JavaScript');
  return { abi, name, size: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    url: `https://github.com/2742360657/Lime/releases/download/${tag}/${name}` };
});
const manifest = { formatVersion: 1, channel: 'stable', version: app.version, versionCode: app.android.versionCode,
  applicationId: app.android.package, tag, sourceCommit, minimumAndroidApi, certificateSha256: expectedCertificate,
  internetPermission, notes, assets };
writeFileSync(path.join(directory, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(path.join(directory, 'SHA256SUMS'), [...assets.map(asset => `${asset.sha256}  ${asset.name}`),
  `${createHash('sha256').update(readFileSync(path.join(directory, 'release-manifest.json'))).digest('hex')}  release-manifest.json`].join('\n') + '\n');
console.log(JSON.stringify({ tag, sourceCommit, bundleHash, certificateSha256: expectedCertificate, assets }, null, 2));
