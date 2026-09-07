import { describe, expect, it } from 'vitest';
import { buildManifest, contentTypeForExt, storeUrl } from './manifest';
import type { StoredFile } from './store';

const launch: StoredFile = {
  hashBase64Url: 'HASH_LAUNCH', keyMd5: 'KEY_LAUNCH',
  sha256Hex: 'ff00', storeFileName: 'ff00.js', ext: 'js',
};
const image: StoredFile = {
  hashBase64Url: 'HASH_IMG', keyMd5: 'KEY_IMG',
  sha256Hex: 'aa11', storeFileName: 'aa11.png', ext: 'png',
};

describe('contentTypeForExt', () => {
  it('nhận diện các loại thường gặp', () => {
    expect(contentTypeForExt('png')).toBe('image/png');
    expect(contentTypeForExt('ttf')).toBe('font/ttf');
  });

  it('chấp nhận cả dạng có dấu chấm', () => {
    expect(contentTypeForExt('.png')).toBe('image/png');
  });

  it('lùi về octet-stream khi không biết', () => {
    expect(contentTypeForExt('xyz')).toBe('application/octet-stream');
  });
});

describe('storeUrl', () => {
  it('ghép URL tuyệt đối tới store', () => {
    expect(storeUrl('https://hoanghdtv.github.io/expo-app-update', image)).toBe(
      'https://hoanghdtv.github.io/expo-app-update/store/aa11.png'
    );
  });
});

describe('buildManifest', () => {
  const manifest = buildManifest({
    id: '11111111-2222-3333-4444-555555555555',
    createdAt: '2026-09-07T00:00:00.000Z',
    runtimeVersion: '1.0.0',
    baseUrl: 'https://hoanghdtv.github.io/expo-app-update',
    launch, assets: [image],
    expoClient: { name: 'demo' },
  });

  it('launchAsset khai báo application/javascript và không có fileExtension', () => {
    expect(manifest.launchAsset.contentType).toBe('application/javascript');
    expect(manifest.launchAsset.url).toBe(
      'https://hoanghdtv.github.io/expo-app-update/store/ff00.js'
    );
    expect('fileExtension' in manifest.launchAsset).toBe(false);
  });

  it('asset mang fileExtension có dấu chấm đứng đầu', () => {
    expect(manifest.assets[0].fileExtension).toBe('.png');
    expect(manifest.assets[0].contentType).toBe('image/png');
  });

  it('hash dùng base64url còn key dùng md5', () => {
    expect(manifest.assets[0].hash).toBe('HASH_IMG');
    expect(manifest.assets[0].key).toBe('KEY_IMG');
  });

  it('mang theo expoClient trong extra', () => {
    expect(manifest.extra.expoClient).toEqual({ name: 'demo' });
  });
});
