import { describe, expect, it } from 'vitest';
import type { UpdateManifest } from './manifest';
import { appendRelease, findRelease, readReleases } from './releases';

const DEFAULTS = { channel: 'production', runtimeVersion: '1.0.0', platform: 'android' };
const MISSING = 'khong/ton/tai/releases.json';

function entry(id: string) {
  return {
    id, createdAt: '2026-09-07T00:00:00.000Z', gitSha: 'deadbeef',
    manifest: { id } as unknown as UpdateManifest,
  };
}

describe('readReleases', () => {
  it('trả về file rỗng khi chưa tồn tại', () => {
    expect(readReleases(MISSING, DEFAULTS).releases).toEqual([]);
  });
});

describe('appendRelease', () => {
  it('đặt bản mới nhất lên đầu', () => {
    const f = appendRelease(appendRelease(readReleases(MISSING, DEFAULTS), entry('a')), entry('b'));
    expect(f.releases.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('findRelease', () => {
  const f = appendRelease(readReleases(MISSING, DEFAULTS), entry('a'));

  it('tìm được theo id', () => {
    expect(findRelease(f, 'a').gitSha).toBe('deadbeef');
  });

  it('báo lỗi kèm các id có sẵn khi không tìm thấy', () => {
    expect(() => findRelease(f, 'z')).toThrow(/a/);
  });
});
