import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type PlatformMetadataAsset = { path: string; ext: string };
export type PlatformMetadata = { bundle: string; assets: PlatformMetadataAsset[] };
export type ExportMetadata = {
  version: number;
  bundler: string;
  fileMetadata: Record<string, PlatformMetadata>;
};

export function readExportMetadata(distDir: string): { raw: Buffer; parsed: ExportMetadata } {
  const metadataPath = join(distDir, 'metadata.json');
  if (!existsSync(metadataPath)) {
    throw new Error(`Không tìm thấy metadata.json tại ${metadataPath}. Đã chạy "npm run export:android" chưa?`);
  }
  const raw = readFileSync(metadataPath);
  return { raw, parsed: JSON.parse(raw.toString('utf-8')) as ExportMetadata };
}

export function selectPlatform(parsed: ExportMetadata, platform: string): PlatformMetadata {
  const block = parsed.fileMetadata?.[platform];
  if (!block) {
    const available = Object.keys(parsed.fileMetadata ?? {}).join(', ') || '(không có)';
    throw new Error(`metadata.json không chứa platform "${platform}". Có sẵn: ${available}`);
  }
  return block;
}
