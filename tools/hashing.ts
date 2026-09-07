import { createHash } from 'node:crypto';

export function sha256Base64Url(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function md5Hex(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

export function uuidFromSha256Hex(hex: string): string {
  if (hex.length < 32) {
    throw new Error(`uuidFromSha256Hex cần ít nhất 32 ký tự hex, nhận được ${hex.length}`);
  }
  const h = hex.slice(0, 32);
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
}
