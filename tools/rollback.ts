import { join } from 'node:path';
import { manifestPathFor, readConfig, releasesPathFor } from './config';
import { sha256Hex, uuidFromSha256Hex } from './hashing';
import { gitSha, writeJson } from './io';
import type { UpdateManifest } from './manifest';
import { appendRelease, findRelease, readReleases } from './releases';

export function rollbackManifest(source: UpdateManifest, createdAt: string): UpdateManifest {
  // id mới là bắt buộc: client ghi nhớ id đã chạy VÀ id đã đánh dấu lỗi,
  // nên phát lại manifest cũ nguyên xi sẽ bị bỏ qua.
  return {
    ...source,
    id: uuidFromSha256Hex(sha256Hex(Buffer.from(`${source.id}|${createdAt}`))),
    createdAt,
  };
}

function main(): void {
  const targetId = process.argv[2];
  if (!targetId) {
    throw new Error('Thiếu id đích. Dùng: npm run rollback:update -- <updateId>');
  }

  const cfg = readConfig(process.cwd());
  const releasesAbs = join(cfg.siteDir, releasesPathFor(cfg));
  const releases = readReleases(releasesAbs, {
    channel: cfg.channel,
    runtimeVersion: cfg.runtimeVersion,
    platform: cfg.platform,
  });

  const target = findRelease(releases, targetId);
  const manifest = rollbackManifest(target.manifest, new Date().toISOString());

  writeJson(join(cfg.siteDir, manifestPathFor(cfg)), manifest);
  writeJson(
    releasesAbs,
    appendRelease(releases, {
      id: manifest.id,
      createdAt: manifest.createdAt,
      gitSha: gitSha(),
      rollbackOf: targetId,
      manifest,
    })
  );

  console.log(`Đã rollback về ${targetId}, phát hành thành update mới ${manifest.id}`);
}

// Vitest đặt biến VITEST — cho phép import rollbackManifest mà không chạy main().
if (process.env.VITEST === undefined) {
  main();
}
