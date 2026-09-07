import { describe, expect, it } from 'vitest';
import { manifestPathFor, releasesPathFor, resolveConfig } from './config';

const FILE = {
  githubUser: 'hoanghdtv',
  repoName: 'expo-app-update',
  baseUrl: 'https://expo-app-update.pages.dev',
  channel: 'production',
  runtimeVersion: '1.0.0',
  platform: 'android',
};

describe('resolveConfig', () => {
  it('lấy baseUrl trực tiếp từ file cấu hình', () => {
    expect(resolveConfig(FILE).baseUrl).toBe('https://expo-app-update.pages.dev');
  });

  it('cắt bỏ dấu / ở cuối baseUrl', () => {
    const cfg = resolveConfig({ ...FILE, baseUrl: 'https://expo-app-update.pages.dev/' });
    expect(cfg.baseUrl).toBe('https://expo-app-update.pages.dev');
  });

  it('báo lỗi nêu đích danh baseUrl khi thiếu', () => {
    expect(() => resolveConfig({ ...FILE, baseUrl: '' })).toThrow(/baseUrl/);
  });

  it('mặc định siteDir là site và distDir là dist', () => {
    const cfg = resolveConfig(FILE);
    expect(cfg.siteDir).toBe('site');
    expect(cfg.distDir).toBe('dist');
  });

  it('báo lỗi nêu đích danh khóa còn thiếu', () => {
    expect(() => resolveConfig({ ...FILE, githubUser: '' })).toThrow(/githubUser/);
  });
});

describe('đường dẫn', () => {
  it('manifest nằm dưới channel/runtimeVersion/platform', () => {
    expect(manifestPathFor(resolveConfig(FILE))).toBe('production/1.0.0/android/manifest.json');
  });

  it('releases nằm cạnh manifest', () => {
    expect(releasesPathFor(resolveConfig(FILE))).toBe('production/1.0.0/android/releases.json');
  });
});
