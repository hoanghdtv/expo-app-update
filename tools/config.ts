import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type UpdateConfigFile = {
  githubUser: string;
  repoName: string;
  baseUrl: string;
  channel: string;
  runtimeVersion: string;
  platform: string;
};

export type PublishConfig = UpdateConfigFile & {
  siteDir: string;
  distDir: string;
};

const REQUIRED_KEYS: (keyof UpdateConfigFile)[] = [
  'githubUser', 'repoName', 'baseUrl', 'channel', 'runtimeVersion', 'platform',
];

export function resolveConfig(file: UpdateConfigFile): PublishConfig {
  for (const key of REQUIRED_KEYS) {
    if (!file[key]) {
      throw new Error(`update.config.json thiếu khóa bắt buộc hoặc để rỗng: ${key}`);
    }
  }
  return {
    ...file,
    baseUrl: file.baseUrl.replace(/\/$/, ''),
    siteDir: 'site',
    distDir: 'dist',
  };
}

export function readConfig(cwd: string): PublishConfig {
  const path = join(cwd, 'update.config.json');
  if (!existsSync(path)) {
    throw new Error(`Không tìm thấy ${path}`);
  }
  return resolveConfig(JSON.parse(readFileSync(path, 'utf-8')) as UpdateConfigFile);
}

export function manifestPathFor(cfg: PublishConfig): string {
  return `${cfg.channel}/${cfg.runtimeVersion}/${cfg.platform}/manifest.json`;
}

export function releasesPathFor(cfg: PublishConfig): string {
  return `${cfg.channel}/${cfg.runtimeVersion}/${cfg.platform}/releases.json`;
}
