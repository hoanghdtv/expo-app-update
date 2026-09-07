import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { md5Hex, sha256Base64Url, sha256Hex } from './hashing';

export type StoredFile = {
  hashBase64Url: string;
  keyMd5: string;
  sha256Hex: string;
  storeFileName: string;
  ext: string;
};

export function storeFile(opts: { sourcePath: string; ext: string; siteDir: string }): StoredFile {
  const buf = readFileSync(opts.sourcePath);
  const hex = sha256Hex(buf);
  const storeFileName = `${hex}.${opts.ext}`;

  const storeDir = join(opts.siteDir, 'store');
  mkdirSync(storeDir, { recursive: true });

  const dest = join(storeDir, storeFileName);
  // Content-addressed: cùng tên nghĩa là cùng nội dung. Không ghi đè —
  // file cũ phải sống sót để rollback dùng lại được.
  if (!existsSync(dest)) {
    copyFileSync(opts.sourcePath, dest);
  }

  return {
    hashBase64Url: sha256Base64Url(buf),
    keyMd5: md5Hex(buf),
    sha256Hex: hex,
    storeFileName,
    ext: opts.ext,
  };
}
