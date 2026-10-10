import qrcode from 'qrcode-generator';

export function encodeWeixinQr(value: string) {
  // The package's CJS and ESM exports differ in optional encoding helpers.
  // Both expose stringToBytes; use the platform UTF-8 codec for either entry.
  qrcode.stringToBytes = text => Array.from(new TextEncoder().encode(text));
  const qr = qrcode(0, 'M');
  qr.addData(value); qr.make();
  return qr;
}
