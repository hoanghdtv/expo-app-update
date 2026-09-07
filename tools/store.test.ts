import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hashing';
import { storeFile } from './store';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'site-'));
}

describe('storeFile', () => {
  it('đặt tên file theo sha256 hex kèm phần mở rộng', () => {
    const siteDir = tmp();
    const src = join(tmp(), 'a.png');
    writeFileSync(src, 'abc');

    const stored = storeFile({ sourcePath: src, ext: 'png', siteDir });

    expect(stored.storeFileName).toBe(`${stored.sha256Hex}.png`);
    expect(readFileSync(join(siteDir, 'store', stored.storeFileName), 'utf-8')).toBe('abc');
  });

  it('nội dung giống nhau cho ra một file duy nhất', () => {
    const siteDir = tmp();
    const dir = tmp();
    writeFileSync(join(dir, 'x.png'), 'trung');
    writeFileSync(join(dir, 'y.png'), 'trung');

    storeFile({ sourcePath: join(dir, 'x.png'), ext: 'png', siteDir });
    storeFile({ sourcePath: join(dir, 'y.png'), ext: 'png', siteDir });

    expect(readdirSync(join(siteDir, 'store'))).toHaveLength(1);
  });

  it('không xóa file đã có trong store — rollback phụ thuộc vào điều này', () => {
    const siteDir = tmp();
    const dir = tmp();
    writeFileSync(join(dir, 'old.js'), 'bundle cu');
    writeFileSync(join(dir, 'new.js'), 'bundle moi');

    const old = storeFile({ sourcePath: join(dir, 'old.js'), ext: 'js', siteDir });
    storeFile({ sourcePath: join(dir, 'new.js'), ext: 'js', siteDir });

    expect(readFileSync(join(siteDir, 'store', old.storeFileName), 'utf-8')).toBe('bundle cu');
    expect(readdirSync(join(siteDir, 'store'))).toHaveLength(2);
  });

  it('không ghi đè file đã tồn tại tại đường dẫn đích', () => {
    const siteDir = tmp();
    const dir = tmp();
    const src = join(dir, 'bundle.js');
    const noiDungNguon = 'noi dung nguon';
    writeFileSync(src, noiDungNguon);

    // Đặt sẵn một file khác nội dung tại đúng đường dẫn store sẽ nhắm tới.
    const dest = join(siteDir, 'store', `${sha256Hex(Buffer.from(noiDungNguon))}.js`);
    mkdirSync(join(siteDir, 'store'), { recursive: true });
    writeFileSync(dest, 'NOI DUNG CU PHAI SONG SOT');

    storeFile({ sourcePath: src, ext: 'js', siteDir });

    expect(readFileSync(dest, 'utf-8')).toBe('NOI DUNG CU PHAI SONG SOT');
  });
});
