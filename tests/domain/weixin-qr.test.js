const { execFileSync } = require('node:child_process');
const { encodeWeixinQr } = require('../../src/channels/weixin/qr');

// Exercise the real import export used by Metro as well as Jest's CJS resolution.
// An ESM import has no stringToBytesFuncs, even though the declaration lists it.
test('real ESM and CommonJS QR encoders produce identical UTF-8 matrices', () => {
  const value = 'https://example.test/scan?label=酸橙😀';
  const rows = qr => Array.from({length:qr.getModuleCount()},(_,r)=>Array.from({length:qr.getModuleCount()},(_,c)=>qr.isDark(r,c)?1:0).join(''));
  const actual = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
    import { encodeWeixinQr } from './src/channels/weixin/qr.ts';
    const qr=encodeWeixinQr(${JSON.stringify(value)});
    process.stdout.write(JSON.stringify(Array.from({length:qr.getModuleCount()},(_,r)=>Array.from({length:qr.getModuleCount()},(_,c)=>qr.isDark(r,c)?1:0).join(''))));
  `], {cwd:process.cwd(),encoding:'utf8',stdio:['ignore','pipe','ignore']});
  expect(JSON.parse(actual)).toEqual(rows(encodeWeixinQr(value)));
});
