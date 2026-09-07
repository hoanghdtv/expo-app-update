# Hot update Expo qua CDN GitHub — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây POC chứng minh app Expo (Android) nhận được hot update — bundle JS, assets, rollback và version gating — với toàn bộ hạ tầng phát hành nằm trên GitHub Pages tĩnh, không dùng EAS Update và không có server nào khác.

**Architecture:** App dùng `expo-updates` nguyên bản, trỏ tới một `manifest.json` tĩnh trên GitHub Pages. Một bộ tool Node biến output của `expo export` thành cây tĩnh đúng Expo Updates protocol v1: manifest nằm ở đường dẫn `<channel>/<runtimeVersion>/<platform>/`, còn bundle và assets nằm trong `store/` đặt tên theo nội dung (content-addressed) dùng chung toàn cục. Vì tên file bằng hash nội dung nên file cũ không bao giờ bị ghi đè, khiến rollback chỉ là việc ghi lại manifest.

**Tech Stack:** Expo SDK 57, `expo-updates`, React Native, TypeScript, Node ≥ 20, `tsx`, `vitest`, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md`

## Global Constraints

- Nền tảng: **Android** duy nhất. Build local bằng `npx expo run:android`.
- Expo SDK **57**.
- Không có server động. Mọi thứ phải là file tĩnh trên GitHub Pages.
- Manifest trả về dạng `application/json` thuần. **Không** dùng `multipart/mixed` (GitHub Pages không đặt được tham số `boundary`).
- `hash` trong manifest = SHA-256 mã hóa **base64url** (base64 chuẩn, rồi `+`→`-`, `/`→`_`, bỏ `=`).
- `key` trong manifest = **MD5 hex**.
- Tên file trong `store/` = **SHA-256 hex** (không phải base64url — hex an toàn với filesystem không phân biệt hoa-thường của Windows).
- `id` của manifest phải đúng **dạng UUID** `8-4-4-4-12`, dẫn xuất tất định.
- `fileExtension` trong manifest **có dấu chấm đứng đầu** (`.png`).
- `store/` **chỉ được cộng thêm**, không bao giờ xóa file — rollback phụ thuộc vào điều này.
- Nhánh `gh-pages` **bắt buộc** có file `.nojekyll` ở gốc.
- **Không** bật `disableAntiBrickingMeasures` và **không** dùng `Updates.setUpdateURLAndRequestHeadersOverride()` — chúng vô hiệu hóa rollback tự động.
- Mọi lệnh build để test update phải là **release variant** (`--variant release`). Bản debug nạp JS từ Metro và bỏ qua `expo-updates` hoàn toàn.
- `<user>` và `<repo>` trong toàn bộ kế hoạch là tài khoản GitHub và tên repo thật, chốt ở Task 1. Chúng là tham số cấu hình, không phải hạng mục bỏ ngỏ.

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `app.config.js` | Cấu hình Expo; dựng `updates.url` từ env; đặt `extra.updateChannel` |
| `App.tsx` | Điểm vào, render `UpdatePanel` |
| `src/UpdatePanel.tsx` | Toàn bộ UI POC: banner phiên bản, ảnh, font, thông tin update, nút điều khiển |
| `src/version.ts` | Hằng số banner — file được sửa để tạo ra bản update mới |
| `assets/demo/photo.png` | Asset ảnh dùng cho kịch bản update asset |
| `tools/config.ts` | Đọc và validate biến môi trường thành `PublishConfig` |
| `tools/hashing.ts` | `sha256Base64Url`, `sha256Hex`, `md5Hex`, `uuidFromSha256Hex` |
| `tools/metadata.ts` | Đọc và validate `dist/metadata.json` |
| `tools/io.ts` | `writeJson` và `gitSha` — dùng chung cho cả publish và rollback |
| `tools/store.ts` | Copy file vào `store/` theo hash, merge không xóa |
| `tools/manifest.ts` | Dựng object manifest đúng protocol |
| `tools/releases.ts` | Đọc/ghi `releases.json`, tra cứu, dựng manifest rollback |
| `tools/expo-config.ts` | Sinh `dist/expoConfig.json` cho `manifest.extra.expoClient` |
| `tools/publish.ts` | CLI publish |
| `tools/rollback.ts` | CLI rollback |
| `.github/workflows/publish.yml` | CI publish |
| `.github/workflows/rollback.yml` | CI rollback thủ công |

Ranh giới: `hashing`/`manifest`/`releases` là hàm thuần, không đụng filesystem ngoài việc nhận Buffer — nên test được trực tiếp. `store` và `metadata` là lớp chạm filesystem, test bằng thư mục tạm thật. `publish`/`rollback` chỉ điều phối, không chứa logic riêng.

---

### Task 1: Scaffold app + xác minh GitHub Pages phục vụ được file

Đây là task chặn rủi ro. Spec mục 9 nêu có báo cáo lỗi tải asset khi host trên GitHub Pages. Task này xác nhận tầng hosting hoạt động **trước khi** viết bất kỳ tooling nào.

**Files:**
- Create: `app.config.js`, `App.tsx`, `src/version.ts`, `src/UpdatePanel.tsx`, `.gitignore`
- Create (nhánh `gh-pages`): `.nojekyll`, `probe/hello.js`, `probe/hello.png`

**Interfaces:**
- Consumes: không có
- Produces: `src/version.ts` export `BANNER_TEXT: string` và `BANNER_COLOR: string`; `app.config.js` đặt `extra.updateChannel: string`

- [ ] **Step 1: Tạo app Expo**

```bash
npx create-expo-app@latest . --template blank-typescript
npx expo install expo-updates expo-constants
npm i -D tsx vitest
```

- [ ] **Step 2: Viết `app.config.js`**

Xóa `app.json` nếu template tạo ra, thay bằng file này. Thay `<user>` và `<repo>` bằng giá trị thật.

```js
const GITHUB_USER = process.env.GITHUB_USER ?? '<user>';
const REPO_NAME = process.env.REPO_NAME ?? '<repo>';
const CHANNEL = process.env.UPDATE_CHANNEL ?? 'production';
const RUNTIME_VERSION = process.env.RUNTIME_VERSION ?? '1.0.0';
const PLATFORM = 'android';

const BASE_URL = `https://${GITHUB_USER}.github.io/${REPO_NAME}`;

module.exports = {
  expo: {
    name: 'expo-app-update',
    slug: 'expo-app-update',
    version: '1.0.0',
    android: { package: 'com.example.expoappupdate' },
    runtimeVersion: RUNTIME_VERSION,
    updates: {
      url: `${BASE_URL}/${CHANNEL}/${RUNTIME_VERSION}/${PLATFORM}/manifest.json`,
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    extra: {
      updateChannel: CHANNEL,
      baseUrl: BASE_URL,
    },
  },
};
```

`runtimeVersion` cố ý là chuỗi cứng, không dùng policy `appVersion` — kịch bản gating ở Task 8 cần kiểm soát giá trị này bằng tay.

- [ ] **Step 3: Viết `src/version.ts`**

```ts
export const BANNER_TEXT = 'v1 — EMBEDDED';
export const BANNER_COLOR = '#1e3a8a';
```

- [ ] **Step 4: Viết `src/UpdatePanel.tsx`**

`Updates.channel` **luôn `undefined`** với custom server (nó chỉ được điền khi dùng EAS Update), nên channel đọc từ `expo-constants`.

```tsx
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useUpdates } from 'expo-updates';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BANNER_COLOR, BANNER_TEXT } from './version';

export default function UpdatePanel() {
  const { currentlyRunning, isUpdateAvailable, isUpdatePending, isChecking,
          isDownloading, checkError, downloadError } = useUpdates();
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string) =>
    setLog((prev) => [`${new Date().toISOString().slice(11, 19)}  ${line}`, ...prev]);

  const channel = (Constants.expoConfig?.extra as { updateChannel?: string })?.updateChannel;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.banner, { backgroundColor: BANNER_COLOR }]}>
        <Text style={styles.bannerText}>{BANNER_TEXT}</Text>
      </View>

      <Text style={styles.row}>updateId: {currentlyRunning.updateId ?? '(none)'}</Text>
      <Text style={styles.row}>createdAt: {currentlyRunning.createdAt?.toISOString() ?? '(none)'}</Text>
      <Text style={styles.row}>runtimeVersion: {currentlyRunning.runtimeVersion}</Text>
      <Text style={styles.row}>channel (từ extra): {channel ?? '(none)'}</Text>
      <Text style={styles.row}>isEmbeddedLaunch: {String(currentlyRunning.isEmbeddedLaunch)}</Text>
      <Text style={styles.row}>isEmergencyLaunch: {String(currentlyRunning.isEmergencyLaunch)}</Text>
      <Text style={styles.row}>
        trạng thái: {isChecking ? 'đang kiểm tra' : isDownloading ? 'đang tải' : 'rảnh'}
        {isUpdateAvailable ? ' · có bản mới' : ''}{isUpdatePending ? ' · chờ restart' : ''}
      </Text>
      {checkError ? <Text style={styles.err}>checkError: {checkError.message}</Text> : null}
      {downloadError ? <Text style={styles.err}>downloadError: {downloadError.message}</Text> : null}

      <Button title="Kiểm tra update" onPress={async () => {
        try { const r = await Updates.checkForUpdateAsync(); append(`check → available=${r.isAvailable}`); }
        catch (e) { append(`check LỖI: ${String(e)}`); }
      }} />
      <Button title="Tải update" onPress={async () => {
        try { const r = await Updates.fetchUpdateAsync(); append(`fetch → new=${r.isNew}`); }
        catch (e) { append(`fetch LỖI: ${String(e)}`); }
      }} />
      <Button title="Restart để áp dụng" onPress={() => Updates.reloadAsync()} />

      {log.map((line, i) => <Text key={i} style={styles.log}>{line}</Text>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingTop: 60, gap: 6 },
  banner: { padding: 24, borderRadius: 12, marginBottom: 12 },
  bannerText: { color: 'white', fontSize: 28, fontWeight: '700', textAlign: 'center' },
  row: { fontSize: 13 },
  err: { fontSize: 13, color: '#b91c1c' },
  log: { fontSize: 11, color: '#555' },
});
```

- [ ] **Step 5: Viết `App.tsx`**

```tsx
import UpdatePanel from './src/UpdatePanel';
export default function App() {
  return <UpdatePanel />;
}
```

- [ ] **Step 6: Build release và chạy trên thiết bị/emulator Android**

```bash
npx expo run:android --variant release
```

Bản debug bỏ qua `expo-updates` hoàn toàn — bắt buộc phải là release.

Kỳ vọng: app chạy, banner ghi `v1 — EMBEDDED`, `isEmbeddedLaunch: true`, `updateId` là `(none)` hoặc id của bản embedded.

- [ ] **Step 7: Tạo nhánh `gh-pages` và bật GitHub Pages**

Cần một file PNG thật để kiểm tra Content-Type, nên copy một icon của template ra ngoài repo trước khi chuyển nhánh:

```bash
ls assets/*.png                      # xem template sinh ra những file nào
cp "$(ls assets/*.png | head -1)" ../probe-image.png

git checkout --orphan gh-pages
git rm -rf .
touch .nojekyll
mkdir -p probe
echo 'console.log("probe");' > probe/hello.js
cp ../probe-image.png probe/hello.png
git add -A && git commit -m "chore: khởi tạo update site"
git push -u origin gh-pages
git checkout main
```

Trong Settings → Pages của repo, đặt Source = nhánh `gh-pages`, thư mục `/ (root)`.

- [ ] **Step 8: Xác minh Pages phục vụ đúng — ĐÂY LÀ CỔNG CHẶN RỦI RO**

Chờ Pages deploy xong (~1 phút), rồi:

```bash
curl -I https://<user>.github.io/<repo>/probe/hello.js
curl -I https://<user>.github.io/<repo>/probe/hello.png
```

Kỳ vọng: cả hai trả `HTTP/2 200`. `hello.js` có `content-type: application/javascript` (hoặc `text/javascript`), `hello.png` có `content-type: image/png`.

Nếu nhận 404: gần như chắc chắn là thiếu `.nojekyll` hoặc Pages chưa deploy xong. **Không đi tiếp cho tới khi hai lệnh này trả 200** — toàn bộ thiết kế phụ thuộc vào nó.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold app Expo + xác minh hosting GitHub Pages"
```

---

### Task 2: Hàm băm và sinh UUID

**Files:**
- Create: `tools/hashing.ts`
- Test: `tools/hashing.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `sha256Base64Url(buf: Buffer): string`
  - `sha256Hex(buf: Buffer): string`
  - `md5Hex(buf: Buffer): string`
  - `uuidFromSha256Hex(hex: string): string`

- [ ] **Step 1: Thêm script test vào `package.json`**

```json
"scripts": {
  "test:tools": "vitest run tools"
}
```

- [ ] **Step 2: Viết test thất bại**

`tools/hashing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { md5Hex, sha256Base64Url, sha256Hex, uuidFromSha256Hex } from './hashing';

describe('sha256Base64Url', () => {
  it('mã hóa base64url, không có ký tự đệm', () => {
    // sha256("abc") base64 chuẩn = ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=
    expect(sha256Base64Url(Buffer.from('abc'))).toBe(
      'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0'
    );
  });

  it('không còn ký tự nào ngoài bảng chữ base64url', () => {
    for (let i = 0; i < 200; i++) {
      const out = sha256Base64Url(Buffer.from(`mẫu-${i}`));
      expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('md5Hex', () => {
  it('trả về md5 dạng hex thường', () => {
    expect(md5Hex(Buffer.from('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});

describe('uuidFromSha256Hex', () => {
  const hex = sha256Hex(Buffer.from('abc'));

  it('trả về đúng dạng UUID 8-4-4-4-12', () => {
    expect(uuidFromSha256Hex(hex)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('có tính tất định', () => {
    expect(uuidFromSha256Hex(hex)).toBe(uuidFromSha256Hex(hex));
  });

  it('từ chối chuỗi hex quá ngắn', () => {
    expect(() => uuidFromSha256Hex('abcd')).toThrow(/32/);
  });
});
```

Ca kiểm tra `+` và `/` là chủ ý: `sha256("abc")` chứa cả hai ký tự đó ở dạng base64 chuẩn, nên nó bắt được đúng lỗi encoding mà spec mục 9 cảnh báo.

- [ ] **Step 3: Chạy test, xác nhận thất bại**

```bash
npm run test:tools
```

Kỳ vọng: FAIL — `Cannot find module './hashing'`.

- [ ] **Step 4: Viết `tools/hashing.ts`**

```ts
import { createHash } from 'node:crypto';

export function sha256Base64Url(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export function md5Hex(buf: Buffer): string {
  return createHash('md5').update(buf).digest('hex');
}

export function uuidFromSha256Hex(hex: string): string {
  if (hex.length < 32) {
    throw new Error(`uuidFromSha256Hex cần ít nhất 32 ký tự hex, nhận được ${hex.length}`);
  }
  const h = hex.slice(0, 32);
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 6 test.

- [ ] **Step 6: Commit**

```bash
git add tools/hashing.ts tools/hashing.test.ts package.json
git commit -m "feat(tools): hàm băm và sinh UUID cho manifest"
```

---

### Task 3: Đọc metadata của `expo export`

**Files:**
- Create: `tools/metadata.ts`
- Test: `tools/metadata.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `type PlatformMetadataAsset = { path: string; ext: string }`
  - `type PlatformMetadata = { bundle: string; assets: PlatformMetadataAsset[] }`
  - `type ExportMetadata = { version: number; bundler: string; fileMetadata: Record<string, PlatformMetadata> }`
  - `readExportMetadata(distDir: string): { raw: Buffer; parsed: ExportMetadata }`
  - `selectPlatform(parsed: ExportMetadata, platform: string): PlatformMetadata`

- [ ] **Step 1: Viết test thất bại**

`tools/metadata.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readExportMetadata, selectPlatform } from './metadata';

const SAMPLE = {
  version: 0,
  bundler: 'metro',
  fileMetadata: {
    android: {
      bundle: '_expo/static/js/android/entry-abc123.hbc',
      assets: [{ path: 'assets/aaaa1111', ext: 'png' }],
    },
  },
};

function makeDist(contents: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'dist-'));
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(contents));
  return dir;
}

describe('readExportMetadata', () => {
  it('parse được metadata.json và giữ nguyên buffer thô', () => {
    const dir = makeDist(SAMPLE);
    const { raw, parsed } = readExportMetadata(dir);
    expect(parsed.fileMetadata.android.bundle).toBe('_expo/static/js/android/entry-abc123.hbc');
    // buffer thô phải là byte nguyên bản — id của update dẫn xuất từ nó
    expect(JSON.parse(raw.toString('utf-8'))).toEqual(SAMPLE);
  });

  it('báo lỗi rõ ràng khi thiếu metadata.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dist-'));
    expect(() => readExportMetadata(dir)).toThrow(/metadata\.json/);
  });
});

describe('selectPlatform', () => {
  it('trả về khối của platform yêu cầu', () => {
    expect(selectPlatform(SAMPLE as never, 'android').assets).toHaveLength(1);
  });

  it('báo lỗi khi platform không có trong export', () => {
    expect(() => selectPlatform(SAMPLE as never, 'ios')).toThrow(/ios/);
  });
});
```

Test đầu khẳng định `raw` là byte nguyên bản chứ không phải kết quả re-serialize — quan trọng, vì `id` của update dẫn xuất từ hash của buffer này và phải ổn định.

- [ ] **Step 2: Chạy test, xác nhận thất bại**

```bash
npm run test:tools
```

Kỳ vọng: FAIL — không tìm thấy `./metadata`.

- [ ] **Step 3: Viết `tools/metadata.ts`**

```ts
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
    throw new Error(`Không tìm thấy metadata.json tại ${metadataPath}. Đã chạy "expo export" chưa?`);
  }
  const raw = readFileSync(metadataPath);
  return { raw, parsed: JSON.parse(raw.toString('utf-8')) as ExportMetadata };
}

export function selectPlatform(parsed: ExportMetadata, platform: string): PlatformMetadata {
  const block = parsed.fileMetadata?.[platform];
  if (!block) {
    const có = Object.keys(parsed.fileMetadata ?? {}).join(', ') || '(không có)';
    throw new Error(`metadata.json không chứa platform "${platform}". Có sẵn: ${có}`);
  }
  return block;
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 10 test (6 từ Task 2 + 4 mới).

- [ ] **Step 5: Commit**

```bash
git add tools/metadata.ts tools/metadata.test.ts
git commit -m "feat(tools): đọc metadata.json của expo export"
```

---

### Task 4: Store content-addressed và dựng manifest

**Files:**
- Create: `tools/store.ts`, `tools/manifest.ts`
- Test: `tools/store.test.ts`, `tools/manifest.test.ts`

**Interfaces:**
- Consumes: `sha256Base64Url`, `sha256Hex`, `md5Hex` từ `tools/hashing.ts`
- Produces:
  - `type StoredFile = { hashBase64Url: string; keyMd5: string; sha256Hex: string; storeFileName: string; ext: string }`
  - `storeFile(opts: { sourcePath: string; ext: string; siteDir: string }): StoredFile`
  - `type ManifestAsset = { hash: string; key: string; contentType: string; fileExtension: string; url: string }`
  - `type ManifestLaunchAsset = { hash: string; key: string; contentType: string; url: string }`
  - `type UpdateManifest = { id: string; createdAt: string; runtimeVersion: string; launchAsset: ManifestLaunchAsset; assets: ManifestAsset[]; metadata: Record<string, never>; extra: { expoClient: unknown } }`
  - `contentTypeForExt(ext: string): string`
  - `storeUrl(baseUrl: string, stored: StoredFile): string`
  - `buildManifest(input: { id: string; createdAt: string; runtimeVersion: string; baseUrl: string; launch: StoredFile; assets: StoredFile[]; expoClient: unknown }): UpdateManifest`

- [ ] **Step 1: Viết test thất bại cho store**

`tools/store.test.ts`:

```ts
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    writeFileSync(join(dir, 'x.png'), 'trùng');
    writeFileSync(join(dir, 'y.png'), 'trùng');

    storeFile({ sourcePath: join(dir, 'x.png'), ext: 'png', siteDir });
    storeFile({ sourcePath: join(dir, 'y.png'), ext: 'png', siteDir });

    expect(readdirSync(join(siteDir, 'store'))).toHaveLength(1);
  });

  it('không xóa file đã có trong store — rollback phụ thuộc vào điều này', () => {
    const siteDir = tmp();
    const dir = tmp();
    writeFileSync(join(dir, 'cũ.js'), 'bundle cũ');
    writeFileSync(join(dir, 'mới.js'), 'bundle mới');

    const cũ = storeFile({ sourcePath: join(dir, 'cũ.js'), ext: 'js', siteDir });
    storeFile({ sourcePath: join(dir, 'mới.js'), ext: 'js', siteDir });

    expect(readFileSync(join(siteDir, 'store', cũ.storeFileName), 'utf-8')).toBe('bundle cũ');
    expect(readdirSync(join(siteDir, 'store'))).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

```bash
npm run test:tools
```

Kỳ vọng: FAIL — không tìm thấy `./store`.

- [ ] **Step 3: Viết `tools/store.ts`**

```ts
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
```

- [ ] **Step 4: Viết test thất bại cho manifest**

`tools/manifest.test.ts`:

```ts
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
    expect(storeUrl('https://u.github.io/r', image)).toBe(
      'https://u.github.io/r/store/aa11.png'
    );
  });
});

describe('buildManifest', () => {
  const manifest = buildManifest({
    id: '11111111-2222-3333-4444-555555555555',
    createdAt: '2026-09-07T00:00:00.000Z',
    runtimeVersion: '1.0.0',
    baseUrl: 'https://u.github.io/r',
    launch, assets: [image],
    expoClient: { name: 'demo' },
  });

  it('launchAsset khai báo application/javascript và không có fileExtension', () => {
    expect(manifest.launchAsset.contentType).toBe('application/javascript');
    expect(manifest.launchAsset.url).toBe('https://u.github.io/r/store/ff00.js');
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
```

- [ ] **Step 5: Chạy test, xác nhận thất bại**

```bash
npm run test:tools
```

Kỳ vọng: store PASS, manifest FAIL — không tìm thấy `./manifest`.

- [ ] **Step 6: Viết `tools/manifest.ts`**

```ts
import type { StoredFile } from './store';

export type ManifestLaunchAsset = {
  hash: string; key: string; contentType: string; url: string;
};
export type ManifestAsset = ManifestLaunchAsset & { fileExtension: string };

export type UpdateManifest = {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ManifestLaunchAsset;
  assets: ManifestAsset[];
  metadata: Record<string, never>;
  extra: { expoClient: unknown };
};

const CONTENT_TYPES: Record<string, string> = {
  js: 'application/javascript',
  hbc: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export function contentTypeForExt(ext: string): string {
  return CONTENT_TYPES[ext.replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream';
}

export function storeUrl(baseUrl: string, stored: StoredFile): string {
  return `${baseUrl.replace(/\/$/, '')}/store/${stored.storeFileName}`;
}

export function buildManifest(input: {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  baseUrl: string;
  launch: StoredFile;
  assets: StoredFile[];
  expoClient: unknown;
}): UpdateManifest {
  return {
    id: input.id,
    createdAt: input.createdAt,
    runtimeVersion: input.runtimeVersion,
    launchAsset: {
      hash: input.launch.hashBase64Url,
      key: input.launch.keyMd5,
      contentType: 'application/javascript',
      url: storeUrl(input.baseUrl, input.launch),
    },
    assets: input.assets.map((a) => ({
      hash: a.hashBase64Url,
      key: a.keyMd5,
      contentType: contentTypeForExt(a.ext),
      fileExtension: `.${a.ext.replace(/^\./, '')}`,
      url: storeUrl(input.baseUrl, a),
    })),
    metadata: {},
    extra: { expoClient: input.expoClient },
  };
}
```

- [ ] **Step 7: Chạy test, xác nhận pass**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 21 test.

- [ ] **Step 8: Commit**

```bash
git add tools/store.ts tools/store.test.ts tools/manifest.ts tools/manifest.test.ts
git commit -m "feat(tools): store content-addressed và dựng manifest"
```

---

### Task 5: CLI publish — kịch bản E2E #1 (update JS)

Đây là task đầu tiên chứng minh vòng lặp hot update chạy thật.

**Files:**
- Create: `tools/config.ts`, `tools/io.ts`, `tools/releases.ts`, `tools/expo-config.ts`, `tools/publish.ts`
- Test: `tools/config.test.ts`, `tools/releases.test.ts`
- Modify: `package.json` (thêm script)

**Interfaces:**
- Consumes: toàn bộ interface của Task 2–4
- Produces:
  - `writeJson(absPath: string, value: unknown): void`
  - `gitSha(): string`
  - `type PublishConfig = { githubUser: string; repoName: string; channel: string; runtimeVersion: string; platform: string; baseUrl: string; siteDir: string; distDir: string }`
  - `loadConfig(env: Record<string, string | undefined>): PublishConfig`
  - `manifestPathFor(cfg: PublishConfig): string` — đường dẫn tương đối `<channel>/<rv>/<platform>/manifest.json`
  - `releasesPathFor(cfg: PublishConfig): string`
  - `type ReleaseEntry = { id: string; createdAt: string; gitSha: string; rollbackOf?: string; manifest: UpdateManifest }`
  - `type ReleasesFile = { channel: string; runtimeVersion: string; platform: string; releases: ReleaseEntry[] }`
  - `readReleases(absPath: string, defaults: Omit<ReleasesFile, 'releases'>): ReleasesFile`
  - `appendRelease(file: ReleasesFile, entry: ReleaseEntry): ReleasesFile`
  - `findRelease(file: ReleasesFile, id: string): ReleaseEntry`

- [ ] **Step 1: Viết test thất bại cho config và releases**

`tools/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loadConfig, manifestPathFor, releasesPathFor } from './config';

const ENV = {
  GITHUB_USER: 'u', REPO_NAME: 'r', UPDATE_CHANNEL: 'production',
  RUNTIME_VERSION: '1.0.0', SITE_DIR: 'site', DIST_DIR: 'dist',
};

describe('loadConfig', () => {
  it('dựng baseUrl từ user và repo', () => {
    expect(loadConfig(ENV).baseUrl).toBe('https://u.github.io/r');
  });

  it('mặc định platform là android', () => {
    expect(loadConfig(ENV).platform).toBe('android');
  });

  it('báo lỗi nêu đích danh biến còn thiếu', () => {
    expect(() => loadConfig({ ...ENV, GITHUB_USER: undefined })).toThrow(/GITHUB_USER/);
  });
});

describe('đường dẫn', () => {
  it('manifest nằm dưới channel/runtimeVersion/platform', () => {
    expect(manifestPathFor(loadConfig(ENV))).toBe('production/1.0.0/android/manifest.json');
  });

  it('releases nằm cạnh manifest', () => {
    expect(releasesPathFor(loadConfig(ENV))).toBe('production/1.0.0/android/releases.json');
  });
});
```

`tools/releases.test.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UpdateManifest } from './manifest';
import { appendRelease, findRelease, readReleases } from './releases';

const DEFAULTS = { channel: 'production', runtimeVersion: '1.0.0', platform: 'android' };

function entry(id: string) {
  return {
    id, createdAt: '2026-09-07T00:00:00.000Z', gitSha: 'deadbeef',
    manifest: { id } as unknown as UpdateManifest,
  };
}

describe('readReleases', () => {
  it('trả về file rỗng khi chưa tồn tại', () => {
    const p = join(mkdtempSync(join(tmpdir(), 'rel-')), 'releases.json');
    expect(readReleases(p, DEFAULTS).releases).toEqual([]);
  });
});

describe('appendRelease', () => {
  it('đặt bản mới nhất lên đầu', () => {
    const f = appendRelease(appendRelease(readReleases('/không/tồn/tại', DEFAULTS), entry('a')), entry('b'));
    expect(f.releases.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('findRelease', () => {
  const f = appendRelease(readReleases('/không/tồn/tại', DEFAULTS), entry('a'));

  it('tìm được theo id', () => {
    expect(findRelease(f, 'a').gitSha).toBe('deadbeef');
  });

  it('báo lỗi kèm các id có sẵn khi không tìm thấy', () => {
    expect(() => findRelease(f, 'z')).toThrow(/a/);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận thất bại**

```bash
npm run test:tools
```

Kỳ vọng: FAIL — không tìm thấy `./config` và `./releases`.

- [ ] **Step 3: Viết `tools/config.ts`**

```ts
export type PublishConfig = {
  githubUser: string;
  repoName: string;
  channel: string;
  runtimeVersion: string;
  platform: string;
  baseUrl: string;
  siteDir: string;
  distDir: string;
};

function required(env: Record<string, string | undefined>, name: string): string {
  const v = env[name];
  if (!v) throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  return v;
}

export function loadConfig(env: Record<string, string | undefined>): PublishConfig {
  const githubUser = required(env, 'GITHUB_USER');
  const repoName = required(env, 'REPO_NAME');
  return {
    githubUser,
    repoName,
    channel: env.UPDATE_CHANNEL ?? 'production',
    runtimeVersion: env.RUNTIME_VERSION ?? '1.0.0',
    platform: env.PLATFORM ?? 'android',
    baseUrl: `https://${githubUser}.github.io/${repoName}`,
    siteDir: env.SITE_DIR ?? 'site',
    distDir: env.DIST_DIR ?? 'dist',
  };
}

export function manifestPathFor(cfg: PublishConfig): string {
  return `${cfg.channel}/${cfg.runtimeVersion}/${cfg.platform}/manifest.json`;
}

export function releasesPathFor(cfg: PublishConfig): string {
  return `${cfg.channel}/${cfg.runtimeVersion}/${cfg.platform}/releases.json`;
}
```

- [ ] **Step 4: Viết `tools/releases.ts`**

```ts
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
```

Lưu **toàn bộ manifest** trong mỗi entry là chủ ý: rollback dựng lại được bản cũ mà không cần suy luận hay build lại gì cả.

- [ ] **Step 5: Chạy test, xác nhận pass**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 30 test.

- [ ] **Step 6: Viết `tools/io.ts`**

Dùng chung cho cả `publish.ts` và `rollback.ts` — cả hai đều cần ghi JSON có tạo thư mục cha và đều cần lấy git SHA.

```ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeJson(absPath: string, value: unknown): void {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`);
}

export function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    // gitSha chỉ dùng để tra cứu — không có thì cũng không chặn việc publish
    return 'unknown';
  }
}
```

- [ ] **Step 7: Viết `tools/publish.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, manifestPathFor, releasesPathFor } from './config';
import { sha256Hex, uuidFromSha256Hex } from './hashing';
import { gitSha, writeJson } from './io';
import { buildManifest } from './manifest';
import { readExportMetadata, selectPlatform } from './metadata';
import { appendRelease, readReleases } from './releases';
import { storeFile } from './store';

function main(): void {
  const cfg = loadConfig(process.env);

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
```

- [ ] **Step 8: Viết `tools/expo-config.ts` và thêm script vào `package.json`**

`expo export` **không** sinh ra `expoConfig.json`, mà `manifest.extra.expoClient` lại cần nội dung đó. Sinh nó bằng script riêng thay vì dựa vào việc chuyển hướng stdout của CLI — CLI có thể in thêm log lẫn vào JSON.

`tools/expo-config.ts`:

```ts
import { join } from 'node:path';
import { writeJson } from './io';

// app.config.js export { expo: {...} } — đây chính là public config
// mà Constants.expoConfig phản ánh lúc runtime.
const config = require(join(process.cwd(), 'app.config.js'));
const expoClient = config.expo ?? config.default?.expo;

if (!expoClient) {
  throw new Error('app.config.js không export object có khóa "expo"');
}

writeJson(join(process.cwd(), process.env.DIST_DIR ?? 'dist', 'expoConfig.json'), expoClient);
console.log('Đã ghi dist/expoConfig.json');
```

`package.json`:

```json
"scripts": {
  "test:tools": "vitest run tools",
  "export:android": "expo export --platform android && tsx tools/expo-config.ts",
  "publish:update": "tsx tools/publish.ts"
}
```

- [ ] **Step 9: Chạy export và xác nhận đầu vào đúng như mong đợi**

```bash
npm run export:android
cat dist/metadata.json
cat dist/expoConfig.json
```

Kỳ vọng: `metadata.json` có `fileMetadata.android.bundle` (đường dẫn kết thúc bằng `.hbc`) và mảng `assets` với các mục `{ path, ext }`. `expoConfig.json` là object JSON có `name`, `slug` và `extra.updateChannel`.

- [ ] **Step 10: Publish thật lên `gh-pages`**

```bash
git worktree add site gh-pages
GITHUB_USER=<user> REPO_NAME=<repo> npm run publish:update
cd site && git add -A && git commit -m "publish: update đầu tiên" && git push && cd ..
```

Dùng `git worktree` để `site/` là một checkout thật của `gh-pages`, nên `store/` giữ nguyên file cũ giữa các lần publish — đúng yêu cầu merge-không-replace ở spec mục 4.1.

- [ ] **Step 11: Xác minh manifest phục vụ được**

```bash
curl -s https://<user>.github.io/<repo>/production/1.0.0/android/manifest.json | head -c 400
```

Kỳ vọng: JSON manifest, `content-type: application/json`. Kiểm tra `id` đúng dạng UUID.

- [ ] **Step 12: KỊCH BẢN E2E #1 — update JS**

1. Sửa `src/version.ts` thành `BANNER_TEXT = 'v2 — OTA'`, `BANNER_COLOR = '#166534'`
2. `npm run export:android`
3. `GITHUB_USER=<user> REPO_NAME=<repo> npm run publish:update`
4. Commit và push trong `site/`
5. Chờ ~1 phút cho Pages deploy
6. Mở app trên máy Android, bấm **Kiểm tra update** → log ghi `available=true`
7. Bấm **Tải update** → log ghi `new=true`
8. Bấm **Restart để áp dụng**

Kỳ vọng: banner đổi thành `v2 — OTA` màu xanh lá, `isEmbeddedLaunch: false`, `updateId` khớp `id` trong manifest.

Nếu app báo `checkError`: kiểm tra bản build là release chứ không phải debug, và `updates.url` trong `AndroidManifest.xml` (`android/app/src/main/AndroidManifest.xml`, tìm `EXPO_UPDATE_URL`) trỏ đúng.

- [ ] **Step 13: Commit**

```bash
git add tools/ package.json src/version.ts
git commit -m "feat(tools): CLI publish + xác minh hot update JS end-to-end"
```

---

### Task 6: Update assets — kịch bản E2E #2

**Files:**
- Create: `assets/demo/photo.png`
- Modify: `src/UpdatePanel.tsx`, `package.json`

**Interfaces:**
- Consumes: `storeFile`, `buildManifest` (không đổi)
- Produces: không có interface mới — task này chứng minh đường dẫn asset đã hoạt động

- [ ] **Step 1: Thêm font và ảnh**

```bash
npx expo install expo-font @expo-google-fonts/inter
mkdir -p assets/demo
cp assets/icon.png assets/demo/photo.png
```

Dùng luôn các icon mà template sinh ra làm ảnh demo — chúng khác nhau rõ rệt về mặt thị giác, đủ để nhận biết ảnh nào đang hiển thị. Nếu `assets/icon.png` không tồn tại, chạy `ls assets/*.png` và chọn hai file khác nhau: một cho bước này, một cho Step 5.

- [ ] **Step 2: Hiển thị ảnh và font trong `src/UpdatePanel.tsx`**

Thêm import ở đầu file:

```tsx
import { Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Image } from 'react-native';
```

Thêm vào đầu component, ngay sau `const [log, setLog] = ...`:

```tsx
const [fontsLoaded] = useFonts({ Inter_700Bold });
```

Thêm vào JSX, ngay dưới khối banner:

```tsx
<Image source={require('../assets/demo/photo.png')} style={styles.demo} />
<Text style={fontsLoaded ? styles.fontDemo : undefined}>
  Mẫu font tùy chỉnh 0123456789
</Text>
```

Thêm vào `StyleSheet.create`:

```tsx
demo: { width: 160, height: 160, alignSelf: 'center', marginBottom: 12 },
fontDemo: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 12 },
```

- [ ] **Step 3: Publish bản có assets**

```bash
npm run export:android
GITHUB_USER=<user> REPO_NAME=<repo> npm run publish:update
cd site && git add -A && git commit -m "publish: thêm assets" && git push && cd ..
```

- [ ] **Step 4: Xác nhận assets nằm trong manifest và tải được**

```bash
curl -s https://<user>.github.io/<repo>/production/1.0.0/android/manifest.json \
  | grep -o '"url":"[^"]*"' | head -20
```

Chọn một URL trong `store/` có đuôi `.png` hoặc `.ttf` rồi:

```bash
curl -I <url-đó>
```

Kỳ vọng: `HTTP/2 200`. Đây là chỗ rủi ro của spec mục 9 — nếu ra 404 thì dừng lại và kiểm tra `.nojekyll` cùng việc file đã được commit lên `gh-pages` chưa.

- [ ] **Step 5: KỊCH BẢN E2E #2 — update asset**

1. Trên app: check → fetch → restart. Xác nhận ảnh và font mới xuất hiện.
2. Thay ảnh bằng một icon khác hẳn về mặt thị giác: `cp assets/adaptive-icon.png assets/demo/photo.png` (hoặc file PNG thứ hai đã chọn ở Step 1).
3. `npm run export:android` và publish lại.
4. Trên app: check → fetch → restart.

Kỳ vọng: ảnh đổi sang ảnh mới. Đây là bằng chứng asset thực sự được cập nhật qua OTA chứ không phải chỉ có JS.

- [ ] **Step 6: Commit**

```bash
git add assets/ src/UpdatePanel.tsx package.json package-lock.json
git commit -m "feat: demo update assets (ảnh + font) qua OTA"
```

---

### Task 7: Rollback tự động — kịch bản E2E #3

Lớp L1 của spec mục 6. Không cần viết code — task này xác minh `expo-updates` thực sự tự phục hồi.

**Files:**
- Modify: `src/version.ts` (tạm thời, sẽ hoàn nguyên)

**Interfaces:**
- Consumes: pipeline publish của Task 5
- Produces: không có

- [ ] **Step 1: Ghi lại trạng thái hiện tại**

Mở app, ghi lại `updateId` đang chạy. Đây là bản mà app phải quay về.

- [ ] **Step 2: Tạo một bundle crash ngay lúc khởi động**

Thêm vào **đầu** `src/version.ts`, ở cấp module (không nằm trong hàm nào):

```ts
throw new Error('CRASH CỐ Ý — kiểm tra rollback tự động');
```

Phải ở cấp module thì lỗi mới xảy ra trong lúc nạp bundle, tức là lúc `expo-updates` còn đang theo dõi và có thể can thiệp.

- [ ] **Step 3: Publish bản hỏng**

```bash
npm run export:android
GITHUB_USER=<user> REPO_NAME=<repo> npm run publish:update
cd site && git add -A && git commit -m "publish: bundle hỏng cố ý" && git push && cd ..
```

- [ ] **Step 4: KỊCH BẢN E2E #3 — rollback tự động**

1. Mở app, check → fetch → restart
2. App sẽ crash hoặc chớp màn hình lỗi
3. Mở lại app

Kỳ vọng: app chạy lại được bằng bản **trước** đó (hoặc bản embedded). `isEmergencyLaunch` có thể là `true` và `emergencyLaunchReason` có nội dung. `updateId` **không phải** id của bản hỏng.

Ghi lại quan sát thực tế vào `docs/rollback-notes.md` — hành vi chính xác (quay về bản trước hay về embedded) phụ thuộc trạng thái cache trên máy, và biết chắc điều này quan trọng cho Task 8.

- [ ] **Step 5: Hoàn nguyên bundle hỏng và publish bản lành**

```bash
# xóa dòng throw khỏi src/version.ts
npm run export:android
GITHUB_USER=<user> REPO_NAME=<repo> npm run publish:update
cd site && git add -A && git commit -m "publish: khôi phục bundle lành" && git push && cd ..
```

Xác nhận trên app: check → fetch → restart, app chạy bình thường trở lại.

- [ ] **Step 6: Commit**

```bash
git add src/version.ts docs/rollback-notes.md
git commit -m "docs: xác minh rollback tự động khi bundle crash lúc khởi động"
```

---

### Task 8: Rollback thủ công — kịch bản E2E #4

Lớp L2 của spec mục 6.

**Files:**
- Create: `tools/rollback.ts`
- Test: `tools/rollback.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `findRelease`, `appendRelease`, `readReleases`, `UpdateManifest`, `uuidFromSha256Hex`, `sha256Hex`
- Produces: `rollbackManifest(source: UpdateManifest, createdAt: string): UpdateManifest`

- [ ] **Step 1: Viết test thất bại**

`tools/rollback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UpdateManifest } from './manifest';
import { rollbackManifest } from './rollback';

const source: UpdateManifest = {
  id: '11111111-2222-3333-4444-555555555555',
  createdAt: '2026-09-01T00:00:00.000Z',
  runtimeVersion: '1.0.0',
  launchAsset: { hash: 'H', key: 'K', contentType: 'application/javascript', url: 'https://x/store/a.js' },
  assets: [{ hash: 'H2', key: 'K2', contentType: 'image/png', fileExtension: '.png', url: 'https://x/store/b.png' }],
  metadata: {},
  extra: { expoClient: { name: 'demo' } },
};

describe('rollbackManifest', () => {
  const out = rollbackManifest(source, '2026-09-07T12:00:00.000Z');

  it('trỏ tới đúng launchAsset và assets của bản gốc', () => {
    expect(out.launchAsset).toEqual(source.launchAsset);
    expect(out.assets).toEqual(source.assets);
  });

  it('cấp id MỚI — client bỏ qua id nó đã chạy hoặc đã đánh dấu lỗi', () => {
    expect(out.id).not.toBe(source.id);
    expect(out.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('dùng createdAt mới', () => {
    expect(out.createdAt).toBe('2026-09-07T12:00:00.000Z');
  });

  it('tất định với cùng cặp đầu vào', () => {
    expect(rollbackManifest(source, '2026-09-07T12:00:00.000Z').id).toBe(out.id);
  });
});
```

Test thứ hai là hạt nhân của spec mục 4.4 — phát lại manifest cũ nguyên xi thì rollback không có tác dụng.

- [ ] **Step 2: Chạy test, xác nhận thất bại**

```bash
npm run test:tools
```

Kỳ vọng: FAIL — không tìm thấy `./rollback`.

- [ ] **Step 3: Viết `tools/rollback.ts`**

```ts
import { join } from 'node:path';
import { loadConfig, manifestPathFor, releasesPathFor } from './config';
import { sha256Hex, uuidFromSha256Hex } from './hashing';
import { gitSha, writeJson } from './io';
import type { UpdateManifest } from './manifest';
import { appendRelease, findRelease, readReleases } from './releases';

export function rollbackManifest(source: UpdateManifest, createdAt: string): UpdateManifest {
  // id mới bắt buộc: client ghi nhớ id đã chạy VÀ id đã đánh dấu lỗi,
  // nên phát lại manifest cũ nguyên xi sẽ bị bỏ qua.
  return {
    ...source,
    id: uuidFromSha256Hex(sha256Hex(Buffer.from(`${source.id}|${createdAt}`))),
    createdAt,
  };
}

function main(): void {
  const targetId = process.env.TARGET_UPDATE_ID;
  if (!targetId) throw new Error('Thiếu biến môi trường bắt buộc: TARGET_UPDATE_ID');

  const cfg = loadConfig(process.env);
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

if (process.env.VITEST === undefined) {
  main();
}
```

Điều kiện `VITEST` cho phép import `rollbackManifest` trong test mà không kích hoạt `main()`.

- [ ] **Step 4: Chạy test, xác nhận pass**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 34 test.

- [ ] **Step 5: Thêm script rollback vào `package.json`**

```json
"rollback:update": "tsx tools/rollback.ts"
```

- [ ] **Step 6: KỊCH BẢN E2E #4 — rollback thủ công**

1. Lấy danh sách các bản đã phát hành:

```bash
curl -s https://<user>.github.io/<repo>/production/1.0.0/android/releases.json \
  | grep -o '"id": "[^"]*"' | head -10
```

2. Chọn id của một bản **cũ** (ví dụ bản `v1`), rồi:

```bash
cd site && git pull && cd ..
GITHUB_USER=<user> REPO_NAME=<repo> TARGET_UPDATE_ID=<id-cũ> npm run rollback:update
cd site && git add -A && git commit -m "rollback: quay về <id-cũ>" && git push && cd ..
```

3. Trên app: check → fetch → restart

Kỳ vọng: app hiện lại nội dung của bản cũ (banner và ảnh của bản đó), nhưng `updateId` là một UUID **mới** chứ không phải id cũ. Đây chính là điểm "phát hành lại như update mới" ở spec mục 4.4.

- [ ] **Step 7: Commit**

```bash
git add tools/rollback.ts tools/rollback.test.ts package.json
git commit -m "feat(tools): rollback thủ công bằng cách phát lại bản cũ như update mới"
```

---

### Task 9: Version gating — kịch bản E2E #5

**Files:**
- không tạo file mới; dùng biến môi trường `RUNTIME_VERSION`

**Interfaces:**
- Consumes: `loadConfig`, `manifestPathFor`
- Produces: không có

- [ ] **Step 1: Publish vào một runtimeVersion khác**

```bash
RUNTIME_VERSION=2.0.0 npm run export:android
GITHUB_USER=<user> REPO_NAME=<repo> RUNTIME_VERSION=2.0.0 npm run publish:update
cd site && git add -A && git commit -m "publish: runtimeVersion 2.0.0" && git push && cd ..
```

- [ ] **Step 2: Xác nhận manifest mới tồn tại ở đường dẫn riêng**

```bash
curl -sI https://<user>.github.io/<repo>/production/2.0.0/android/manifest.json
curl -sI https://<user>.github.io/<repo>/production/1.0.0/android/manifest.json
```

Kỳ vọng: cả hai trả 200, và là hai file khác nhau.

- [ ] **Step 3: KỊCH BẢN E2E #5 — gating**

App đang chạy được build với `RUNTIME_VERSION=1.0.0`, nên URL của nó trỏ tới `.../1.0.0/android/manifest.json`.

Trên app: bấm **Kiểm tra update**.

Kỳ vọng: log ghi `available=false`. App **không** nhìn thấy bản `2.0.0`, vì nó không có đường nào để nhìn tới đường dẫn đó. Đây là bằng chứng gating theo path hoạt động (spec mục 3.2, quyết định B).

- [ ] **Step 4: Xác nhận chiều ngược lại**

```bash
UPDATE_CHANNEL=staging npm run export:android
GITHUB_USER=<user> REPO_NAME=<repo> UPDATE_CHANNEL=staging npm run publish:update
cd site && git add -A && git commit -m "publish: channel staging" && git push && cd ..
```

Trên app (build ở channel `production`): bấm **Kiểm tra update** → `available=false`.

Kỳ vọng: channel gating hoạt động theo đúng cơ chế đó.

- [ ] **Step 5: Ghi kết quả**

Tạo `docs/gating-notes.md` ghi lại kết quả hai kịch bản, kèm URL manifest cụ thể đã dùng.

- [ ] **Step 6: Commit**

```bash
git add docs/gating-notes.md
git commit -m "docs: xác minh gating theo runtimeVersion và channel"
```

---

### Task 10: Tự động hóa CI và tài liệu

**Files:**
- Create: `.github/workflows/publish.yml`, `.github/workflows/rollback.yml`, `README.md`

**Interfaces:**
- Consumes: `tools/publish.ts`, `tools/rollback.ts` qua npm script
- Produces: không có

- [ ] **Step 1: Viết `.github/workflows/publish.yml`**

```yaml
name: Publish update

on:
  workflow_dispatch:
    inputs:
      channel:
        description: Channel
        required: true
        default: production
      runtimeVersion:
        description: Runtime version
        required: true
        default: '1.0.0'

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          ref: gh-pages
          path: site

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run export:android
        env:
          UPDATE_CHANNEL: ${{ inputs.channel }}
          RUNTIME_VERSION: ${{ inputs.runtimeVersion }}
          GITHUB_USER: ${{ github.repository_owner }}
          REPO_NAME: ${{ github.event.repository.name }}

      - run: npm run publish:update
        env:
          UPDATE_CHANNEL: ${{ inputs.channel }}
          RUNTIME_VERSION: ${{ inputs.runtimeVersion }}
          GITHUB_USER: ${{ github.repository_owner }}
          REPO_NAME: ${{ github.event.repository.name }}
          SITE_DIR: site

      - name: Commit lên gh-pages
        working-directory: site
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "publish: ${{ inputs.channel }} ${{ inputs.runtimeVersion }} (${{ github.sha }})"
          git push
```

Hai lần `actions/checkout` là chủ ý: `site/` phải là checkout thật của `gh-pages` để `store/` giữ lại toàn bộ file cũ. Đây là yêu cầu merge-không-replace ở spec mục 4.1 — nếu thay bằng action publish kiểu "xóa và thay toàn bộ", rollback sẽ hỏng.

- [ ] **Step 2: Viết `.github/workflows/rollback.yml`**

```yaml
name: Rollback update

on:
  workflow_dispatch:
    inputs:
      channel:
        description: Channel
        required: true
        default: production
      runtimeVersion:
        description: Runtime version
        required: true
        default: '1.0.0'
      targetUpdateId:
        description: id của update muốn quay về (xem releases.json)
        required: true

permissions:
  contents: write

jobs:
  rollback:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          ref: gh-pages
          path: site

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run rollback:update
        env:
          UPDATE_CHANNEL: ${{ inputs.channel }}
          RUNTIME_VERSION: ${{ inputs.runtimeVersion }}
          TARGET_UPDATE_ID: ${{ inputs.targetUpdateId }}
          GITHUB_USER: ${{ github.repository_owner }}
          REPO_NAME: ${{ github.event.repository.name }}
          SITE_DIR: site

      - name: Commit lên gh-pages
        working-directory: site
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "rollback: về ${{ inputs.targetUpdateId }}"
          git push
```

- [ ] **Step 3: Chạy thử workflow publish**

Vào tab Actions của repo, chạy **Publish update** với channel `production` và runtimeVersion `1.0.0`.

Kỳ vọng: job xanh, có commit mới trên `gh-pages`, app nhận được update.

- [ ] **Step 4: Viết `README.md`**

Nội dung bắt buộc có:

- Kiến trúc trong một đoạn, kèm link tới spec
- Cách build: `npx expo run:android --variant release` và **lý do bản debug không dùng được**
- Cách publish thủ công và qua CI
- Cách rollback, kèm cách tra `releases.json` để lấy id
- **Độ trễ CDN ~10 phút** của `manifest.json` trên GitHub Pages — đây là hành vi đúng như thiết kế, không phải lỗi
- Những gì cố ý không hỗ trợ: iOS, code signing, directive `rollBackToEmbedded`, đổi channel lúc runtime (kèm lý do: nó xung đột với rollback tự động)

- [ ] **Step 5: Chạy toàn bộ test lần cuối**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 34 test.

- [ ] **Step 6: Commit**

```bash
git add .github/ README.md
git commit -m "feat: workflow CI publish/rollback và tài liệu"
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 2.1 manifest JSON thuần | 5 (bước 10) |
| 2.2 gating theo path | 1 (bước 2), 9 |
| 2.3 không có directive | 10 (bước 4, ghi rõ trong README) |
| 2.4 "không có update mới" bằng cách so id | 9 (bước 3) |
| 3.2 store content-addressed | 4 |
| 3.2 `.nojekyll` | 1 (bước 7) |
| 3.3 định dạng manifest | 2, 4 |
| 4.1 sync merge-không-replace | 5 (bước 9), 10 (bước 1) |
| 4.2 `releases.json` | 5 |
| 4.3 GitHub Actions | 10 |
| 4.4 rollback = update mới | 8 |
| 5.1 cấu hình app | 1 |
| 5.2 màn hình POC | 1, 6 |
| 6 rollback L1 | 7 |
| 6 rollback L2 | 8 |
| 8.1 unit test | 2, 3, 4, 5, 8 |
| 8.2 E2E #1–#5 | 5, 6, 7, 8, 9 |
| 9 spike hosting sớm | 1 (bước 8) |
