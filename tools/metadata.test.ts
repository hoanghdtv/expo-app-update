import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readExportMetadata, selectPlatform } from './metadata';

const SAMPLE = {
  version: 0,
  bundler: 'metro',
  fileMetadata: {
    android: {
      bundle: '_expo/static/js/android/entry-abc123.hbc',
      assets: [{ path: 'assets/aaaa1111', ext: 'png' }],
    },
  },
};

function makeDist(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(contents));
  return dir;
}

describe('readExportMetadata', () => {
  it('parse được metadata.json và giữ nguyên buffer thô', () => {
    const dir = makeDist(SAMPLE);
    const { raw, parsed } = readExportMetadata(dir);
    expect(parsed.fileMetadata.android.bundle).toBe('_expo/static/js/android/entry-abc123.hbc');
    // buffer thô phải là byte nguyên bản — id của update dẫn xuất từ nó
    expect(JSON.parse(raw.toString('utf-8'))).toEqual(SAMPLE);
  });

  it('báo lỗi rõ ràng khi thiếu metadata.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    expect(() => readExportMetadata(dir)).toThrow(/metadata\.json/);
  });
});

describe('selectPlatform', () => {
  it('trả về khối của platform yêu cầu', () => {
    expect(selectPlatform(SAMPLE as never, 'android').assets).toHaveLength(1);
  });

  it('báo lỗi khi platform không có trong export', () => {
    expect(() => selectPlatform(SAMPLE as never, 'ios')).toThrow(/ios/);
  });
});
