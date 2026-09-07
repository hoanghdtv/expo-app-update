import { describe, expect, it } from 'vitest';
import { md5Hex, sha256Base64Url, sha256Hex, uuidFromSha256Hex } from './hashing';

describe('sha256Base64Url', () => {
  it('mã hóa base64url, không có ký tự đệm', () => {
    // sha256("abc") base64 chuẩn = ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=
    expect(sha256Base64Url(Buffer.from('abc'))).toBe(
      'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0'
    );
  });

  it('không còn ký tự nào ngoài bảng chữ base64url', () => {
    for (let i = 0; i < 200; i++) {
      const out = sha256Base64Url(Buffer.from(`mau-${i}`));
      expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('md5Hex', () => {
  it('trả về md5 dạng hex thường', () => {
    expect(md5Hex(Buffer.from('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('uuidFromSha256Hex', () => {
  const hex = sha256Hex(Buffer.from('abc'));

  it('trả về đúng dạng UUID 8-4-4-4-12', () => {
    expect(uuidFromSha256Hex(hex)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('có tính tất định', () => {
    expect(uuidFromSha256Hex(hex)).toBe(uuidFromSha256Hex(hex));
  });

  it('từ chối chuỗi hex quá ngắn', () => {
    expect(() => uuidFromSha256Hex('abcd')).toThrow(/32/);
  });
});
