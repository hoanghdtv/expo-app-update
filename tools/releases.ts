import { existsSync, readFileSync } from 'node:fs';
import type { UpdateManifest } from './manifest';

export type ReleaseEntry = {
  id: string;
  createdAt: string;
  gitSha: string;
  rollbackOf?: string;
  manifest: UpdateManifest;
};

export type ReleasesFile = {
  channel: string;
  runtimeVersion: string;
  platform: string;
  releases: ReleaseEntry[];
};

export function readReleases(
  absPath: string,
  defaults: Omit<ReleasesFile, 'releases'>
): ReleasesFile {
  if (!existsSync(absPath)) return { ...defaults, releases: [] };
  return JSON.parse(readFileSync(absPath, 'utf-8')) as ReleasesFile;
}

export function appendRelease(file: ReleasesFile, entry: ReleaseEntry): ReleasesFile {
  return { ...file, releases: [entry, ...file.releases] };
}

export function findRelease(file: ReleasesFile, id: string): ReleaseEntry {
  const found = file.releases.find((r) => r.id === id);
  if (!found) {
    const ids = file.releases.map((r) => r.id).join(', ') || '(chưa có bản nào)';
    throw new Error(`Không tìm thấy release "${id}". Các id có sẵn: ${ids}`);
  }
  return found;
}
