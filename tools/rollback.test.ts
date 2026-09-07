import { describe, expect, it } from 'vitest';
import type { UpdateManifest } from './manifest';
import { rollbackManifest } from './rollback';

const source: UpdateManifest = {
  id: '11111111-2222-3333-4444-555555555555',
  createdAt: '2026-09-01T00:00:00.000Z',
  runtimeVersion: '1.0.0',
  launchAsset: { hash: 'H', key: 'K', contentType: 'application/javascript', url: 'https://x/store/a.js' },
  assets: [{ hash: 'H2', key: 'K2', contentType: 'image/png', fileExtension: '.png', url: 'https://x/store/b.png' }],
  metadata: {},
  extra: { expoClient: { name: 'demo' } },
};

describe('rollbackManifest', () => {
  const out = rollbackManifest(source, '2026-09-07T12:00:00.000Z');

  it('trỏ tới đúng launchAsset và assets của bản gốc', () => {
    expect(out.launchAsset).toEqual(source.launchAsset);
    expect(out.assets).toEqual(source.assets);
  });

  it('cấp id MỚI — client bỏ qua id nó đã chạy hoặc đã đánh dấu lỗi', () => {
    expect(out.id).not.toBe(source.id);
    expect(out.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('dùng createdAt mới', () => {
    expect(out.createdAt).toBe('2026-09-07T12:00:00.000Z');
  });

  it('tất định với cùng cặp đầu vào', () => {
    expect(rollbackManifest(source, '2026-09-07T12:00:00.000Z').id).toBe(out.id);
  });
});
