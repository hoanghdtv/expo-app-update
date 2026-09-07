import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestPathFor, readConfig, releasesPathFor } from './config';
import { sha256Hex, uuidFromSha256Hex } from './hashing';
import { gitSha, writeJson } from './io';
import { buildManifest } from './manifest';
import { readExportMetadata, selectPlatform } from './metadata';
import { appendRelease, readReleases } from './releases';
import { storeFile } from './store';

function main(): void {
  const cfg = readConfig(process.cwd());

  const { raw, parsed } = readExportMetadata(cfg.distDir);
  const platform = selectPlatform(parsed, cfg.platform);

  const launch = storeFile({
    sourcePath: join(cfg.distDir, platform.bundle),
    ext: 'js',
    siteDir: cfg.siteDir,
  });

  const assets = platform.assets.map((a) =>
    storeFile({ sourcePath: join(cfg.distDir, a.path), ext: a.ext, siteDir: cfg.siteDir })
  );

  const expoClient = JSON.parse(readFileSync(join(cfg.distDir, 'expoConfig.json'), 'utf-8'));

  const manifest = buildManifest({
    id: uuidFromSha256Hex(sha256Hex(raw)),
    createdAt: new Date().toISOString(),
    runtimeVersion: cfg.runtimeVersion,
    baseUrl: cfg.baseUrl,
    launch,
    assets,
    expoClient,
  });

  writeJson(join(cfg.siteDir, manifestPathFor(cfg)), manifest);

  const releasesAbs = join(cfg.siteDir, releasesPathFor(cfg));
  const releases = readReleases(releasesAbs, {
    channel: cfg.channel,
    runtimeVersion: cfg.runtimeVersion,
    platform: cfg.platform,
  });
  writeJson(
    releasesAbs,
    appendRelease(releases, {
      id: manifest.id,
      createdAt: manifest.createdAt,
      gitSha: gitSha(),
      manifest,
    })
  );

  console.log(`Đã publish update ${manifest.id}`);
  console.log(`  manifest: ${manifestPathFor(cfg)}`);
  console.log(`  launch:   ${launch.storeFileName}`);
  console.log(`  assets:   ${assets.length} file`);
}

main();
