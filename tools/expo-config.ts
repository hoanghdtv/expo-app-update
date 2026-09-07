import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readConfig } from './config';
import { writeJson } from './io';

// import() động hoạt động với cả app.config.js dạng CommonJS lẫn ESM.
async function main(): Promise<void> {
  const cfg = readConfig(process.cwd());
  const url = pathToFileURL(join(process.cwd(), 'app.config.js')).href;
  const mod = (await import(url)) as { default?: { expo?: unknown }; expo?: unknown };
  const expoClient = (mod.default ?? mod).expo;

  if (!expoClient) {
    throw new Error('app.config.js không export object có khóa "expo"');
  }

  writeJson(join(process.cwd(), cfg.distDir, 'expoConfig.json'), expoClient);
  console.log(`Đã ghi ${cfg.distDir}/expoConfig.json`);
}

main();
