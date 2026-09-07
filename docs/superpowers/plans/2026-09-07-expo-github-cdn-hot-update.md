# Hot update Expo qua CDN GitHub — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây POC chứng minh app Expo (Android) nhận được hot update — bundle JS, assets, rollback và version gating — với toàn bộ hạ tầng phát hành nằm trên GitHub Pages tĩnh, không dùng EAS Update và không có server nào khác.

**Architecture:** App dùng `expo-updates` nguyên bản, trỏ tới một `manifest.json` tĩnh trên GitHub Pages. Một bộ tool Node biến output của `expo export` thành cây tĩnh đúng Expo Updates protocol v1: manifest nằm ở đường dẫn `<channel>/<runtimeVersion>/<platform>/`, còn bundle và assets nằm trong `store/` đặt tên theo nội dung (content-addressed) dùng chung toàn cục. Vì tên file bằng hash nội dung nên file cũ không bao giờ bị ghi đè, khiến rollback chỉ là việc ghi lại manifest.

**Tech Stack:** Expo SDK 57, `expo-updates`, React Native, TypeScript, Node 24, `tsx`, `vitest`, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md`

## Môi trường đã xác minh

Đã kiểm tra trên máy thật ngày 2026-09-07. **Không cần kiểm tra lại.**

| Thứ | Trạng thái |
|---|---|
| Node / npm | v24.15.0 / 11.12.1 ✓ |
| JDK | OpenJDK 21.0.8 ✓ |
| Android SDK | `C:\Users\HOANG\AppData\Local\Android\Sdk` ✓ |
| Thiết bị Android | máy thật đang cắm, serial `R3CM80Z2SDD` ✓ |
| `gh` CLI | v2.96.0, đã đăng nhập tài khoản `hoanghdtv` ✓ |
| `ANDROID_HOME` | **chưa set** — Task 1 Step 1 xử lý |
| git remote | **chưa có** — Task 1 Step 8 tạo repo bằng `gh` |

Repo đích: **`hoanghdtv/expo-app-update`, public**. Public là bắt buộc — GitHub Pages trên repo private đòi tài khoản Pro trả phí.

## ⚠️ SỬA ĐỔI KIẾN TRÚC — 2026-09-07, phát hiện khi thực thi Task 5

Ràng buộc "chỉ GitHub, không server khác" đã được chứng minh là **bất khả thi**. Client `expo-updates` bắt buộc nhận response header `expo-protocol-version` trên mọi response manifest; thiếu nó, `UpdateFactory.kt` ném `"Legacy manifests are no longer supported"`. GitHub Pages không đặt được header tùy chỉnh. Chi tiết và bằng chứng ở **mục 2.3b của spec**.

**Tầng phục vụ mới: Cloudflare Pages.** File vẫn nằm trong GitHub trên nhánh `gh-pages` (nguồn sự thật, lưu lịch sử cho rollback); Cloudflare Pages đứng trước làm CDN và đọc file `_headers` để thêm header bắt buộc. Không có code server.

Những gì đổi trong kế hoạch này:
- `update.config.json` có thêm trường `baseUrl` tường minh; `resolveConfig` không còn dựng URL từ `githubUser` + `repoName`.
- Nhánh `gh-pages` có thêm file `_headers` khai báo `expo-protocol-version: 1`.
- **Mọi quy trình publish từ Task 6 trở đi có thêm một bước cuối**: sau khi commit và push trong `site/`, chạy `npx wrangler pages deploy site/ --project-name=expo-app-update` để đẩy lên CDN.
- URL trong các task từ Task 6 trở đi dùng `https://expo-app-update.pages.dev`.

Các URL `github.io` còn sót lại trong Task 1, 4, 5 được giữ nguyên có chủ đích — chúng là hồ sơ ghi lại những gì đã thực sự chạy tại thời điểm đó.

URL update site: `https://expo-app-update.pages.dev` (nguồn: nhánh `gh-pages` trên GitHub)

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
- Nhánh `gh-pages` **bắt buộc** có file `_headers` ở gốc khai báo `expo-protocol-version: 1`. Thiếu nó, client ném `"Legacy manifests are no longer supported"` và không update nào áp dụng được. Đây là ràng buộc cứng, không có cờ cấu hình nào tắt được.
- Mỗi lần publish hoặc rollback đều phải kết thúc bằng `npx wrangler pages deploy site/ --project-name=expo-app-update`. Commit lên `gh-pages` mới chỉ là lưu lịch sử; chưa deploy thì CDN chưa thấy nội dung mới.
- **Không** bật `disableAntiBrickingMeasures` và **không** dùng `Updates.setUpdateURLAndRequestHeadersOverride()` — chúng vô hiệu hóa rollback tự động.
- Mọi lệnh build để test update phải là **release variant** (`--variant release`). Bản debug nạp JS từ Metro và bỏ qua `expo-updates` hoàn toàn.
- **Không dùng biến môi trường để cấu hình.** Cú pháp `VAR=x npm run ...` không chạy trên PowerShell/cmd, và việc `app.config.js` với bộ publish đọc hai nguồn khác nhau sẽ gây lệch URL âm thầm. Nguồn sự thật duy nhất là `update.config.json`, cả app lẫn tooling cùng đọc.
- Mọi lệnh trong kế hoạch chạy được ở **cả Git Bash lẫn PowerShell**, trừ các lệnh POSIX được đánh dấu rõ là "chạy trong Git Bash".

---

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `update.config.json` | **Nguồn sự thật duy nhất**: user, repo, channel, runtimeVersion, platform |
| `app.config.js` | Cấu hình Expo; dựng `updates.url` từ `update.config.json` |
| `App.tsx` | Điểm vào, render `UpdatePanel` |
| `src/UpdatePanel.tsx` | Toàn bộ UI POC: banner, ảnh, font, thông tin update, nút điều khiển |
| `src/version.ts` | Hằng số banner — file được sửa để tạo ra bản update mới |
| `assets/demo/photo.png` | Asset ảnh dùng cho kịch bản update asset |
| `tools/config.ts` | Đọc và validate `update.config.json` thành `PublishConfig` |
| `tools/hashing.ts` | `sha256Base64Url`, `sha256Hex`, `md5Hex`, `uuidFromSha256Hex` |
| `tools/io.ts` | `writeJson` và `gitSha` — dùng chung cho publish và rollback |
| `tools/metadata.ts` | Đọc và validate `dist/metadata.json` |
| `tools/store.ts` | Copy file vào `store/` theo hash, merge không xóa |
| `tools/manifest.ts` | Dựng object manifest đúng protocol |
| `tools/releases.ts` | Đọc/ghi `releases.json`, tra cứu, dựng manifest rollback |
| `tools/expo-config.ts` | Sinh `dist/expoConfig.json` cho `manifest.extra.expoClient` |
| `tools/publish.ts` | CLI publish |
| `tools/rollback.ts` | CLI rollback, nhận id qua tham số dòng lệnh |
| `.github/workflows/publish.yml` | CI publish |
| `.github/workflows/rollback.yml` | CI rollback thủ công |

Ranh giới: `hashing`/`manifest`/`releases`/`config` là hàm thuần, test được trực tiếp. `store` và `metadata` chạm filesystem, test bằng thư mục tạm thật. `publish`/`rollback` chỉ điều phối, không chứa logic riêng.

---

### Task 1: Scaffold app + tạo repo + xác minh GitHub Pages phục vụ được file

Đây là task chặn rủi ro. Spec mục 9 nêu có báo cáo lỗi tải asset khi host trên GitHub Pages. Task này xác nhận tầng hosting hoạt động **trước khi** viết bất kỳ tooling nào.

**Files:**
- Create: `update.config.json`, `app.config.js`, `App.tsx`, `src/version.ts`, `src/UpdatePanel.tsx`, `.gitignore`
- Create (nhánh `gh-pages`): `.nojekyll`, `probe/hello.js`, `probe/hello.png`

**Interfaces:**
- Consumes: không có
- Produces:
  - `update.config.json` với các khóa `githubUser`, `repoName`, `channel`, `runtimeVersion`, `platform`
  - `src/version.ts` export `BANNER_TEXT: string` và `BANNER_COLOR: string`

- [ ] **Step 1: Set `ANDROID_HOME`**

Chưa được set trên máy này; `expo run:android` sẽ thất bại nếu thiếu.

Đặt vĩnh viễn (PowerShell, chạy một lần):

```powershell
setx ANDROID_HOME "C:\Users\HOANG\AppData\Local\Android\Sdk"
```

Sau `setx` phải **mở terminal mới** thì biến mới có hiệu lực. Cho phiên Git Bash đang mở:

```bash
export ANDROID_HOME="/c/Users/HOANG/AppData/Local/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
```

Xác nhận:

```bash
adb devices
```

Kỳ vọng: thấy `R3CM80Z2SDD	device`.

- [ ] **Step 2: Tạo app Expo vào thư mục tạm rồi chuyển lên gốc**

Thư mục gốc đã có `docs/` và `.git/`, mà `create-expo-app` từ chối chạy trong thư mục không rỗng. Nên scaffold vào thư mục tạm rồi chuyển lên.

Chạy trong Git Bash:

```bash
npx create-expo-app@latest .tmp-scaffold --template blank-typescript --no-install

# create-expo-app tự chạy git init trong thư mục đích. Phải xóa .git đó trước
# khi di chuyển, nếu không lệnh mv sẽ đụng vào .git của repo hiện tại.
rm -rf .tmp-scaffold/.git

mv .tmp-scaffold/* .
mv .tmp-scaffold/.[!.]* . 2>/dev/null || true
rm -rf .tmp-scaffold
npm install
npx expo install expo-updates expo-constants
npm i -D tsx vitest
```

Xác nhận: `ls assets/*.png` liệt kê ít nhất hai file PNG (Task 6 cần hai ảnh khác nhau). Ghi lại tên chúng.

- [ ] **Step 3: Viết `update.config.json`**

```json
{
  "githubUser": "hoanghdtv",
  "repoName": "expo-app-update",
  "channel": "production",
  "runtimeVersion": "1.0.0",
  "platform": "android"
}
```

Đây là nguồn sự thật duy nhất. Đổi channel hay runtimeVersion nghĩa là sửa file này — không có biến môi trường nào cả.

- [ ] **Step 4: Viết `app.config.js`**

Xóa `app.json` mà template sinh ra, thay bằng file này.

```js
const cfg = require('./update.config.json');

const BASE_URL = `https://${cfg.githubUser}.github.io/${cfg.repoName}`;

module.exports = {
  expo: {
    name: 'expo-app-update',
    slug: 'expo-app-update',
    version: '1.0.0',
    orientation: 'portrait',
    android: { package: 'com.hoanghdtv.expoappupdate' },
    runtimeVersion: cfg.runtimeVersion,
    updates: {
      url: `${BASE_URL}/${cfg.channel}/${cfg.runtimeVersion}/${cfg.platform}/manifest.json`,
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    extra: {
      updateChannel: cfg.channel,
      baseUrl: BASE_URL,
    },
  },
};
```

`runtimeVersion` cố ý là chuỗi lấy từ file, không dùng policy `appVersion` — kịch bản gating ở Task 9 cần đổi giá trị này có kiểm soát.

- [ ] **Step 5: Viết `.gitignore`**

```
node_modules/
.expo/
dist/
site/
android/
ios/
.tmp-scaffold/
*.log
.DS_Store
```

`site/` bắt buộc phải có: từ Task 5 nó là một git worktree của nhánh `gh-pages`, không được để nhánh `main` theo dõi. `android/` cũng bỏ qua vì được sinh lại từ `app.config.js` mỗi lần prebuild.

- [ ] **Step 6: Viết `src/version.ts`**

```ts
export const BANNER_TEXT = 'v1 — EMBEDDED';
export const BANNER_COLOR = '#1e3a8a';
```

- [ ] **Step 7: Viết `src/UpdatePanel.tsx`**

`Updates.channel` **luôn `undefined`** với custom server — nó chỉ được điền khi dùng EAS Update. Channel đọc từ `expo-constants`.

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

- [ ] **Step 8: Viết `App.tsx`**

```tsx
import UpdatePanel from './src/UpdatePanel';

export default function App() {
  return <UpdatePanel />;
}
```

- [ ] **Step 9: Đổi tên nhánh thành `main`, tạo repo trên GitHub và push**

Repo local hiện đang ở nhánh `master`, trong khi cả kế hoạch lẫn GitHub đều dùng `main`. Đổi tên trước — nhánh chưa có remote nên thao tác này hoàn toàn cục bộ và an toàn.

```bash
git branch -m master main
git add -A
git commit -m "feat: scaffold app Expo với expo-updates"
gh repo create hoanghdtv/expo-app-update --public --source=. --remote=origin --push
```

Xác nhận: `git branch --show-current` in ra `main`.

Xác nhận: `git remote -v` hiển thị `origin`.

- [ ] **Step 10: Tạo nhánh `gh-pages` và bật GitHub Pages**

Cần một file PNG thật để kiểm tra Content-Type, nên copy một icon ra ngoài repo trước khi chuyển nhánh. Chạy trong Git Bash:

```bash
cp "$(ls assets/*.png | head -1)" ../probe-image.png

git checkout --orphan gh-pages
git rm -rf .
touch .nojekyll
mkdir -p probe
echo 'console.log("probe");' > probe/hello.js
cp ../probe-image.png probe/hello.png
git add -A
git commit -m "chore: khởi tạo update site"
git push -u origin gh-pages
git checkout main
```

Bật Pages không cần vào giao diện web:

```bash
gh api -X POST repos/hoanghdtv/expo-app-update/pages \
  -f "source[branch]=gh-pages" -f "source[path]=/"
```

Đường dẫn endpoint **không có dấu `/` đứng đầu**: Git Bash sẽ viết lại `/repos/...` thành đường dẫn filesystem và `gh` báo `invalid API endpoint`.

Nếu trả về lỗi `409 Conflict` nghĩa là Pages đã bật rồi — bỏ qua, đi tiếp.

- [ ] **Step 11: XÁC MINH HOSTING — CỔNG CHẶN RỦI RO**

Chờ Pages deploy (~1–2 phút). Kiểm tra tiến độ:

```bash
gh api repos/hoanghdtv/expo-app-update/pages/builds/latest --jq '.status'
```

Kỳ vọng `built`. Rồi:

```bash
curl -I https://hoanghdtv.github.io/expo-app-update/probe/hello.js
curl -I https://hoanghdtv.github.io/expo-app-update/probe/hello.png
```

Kỳ vọng: cả hai trả `HTTP/2 200`. `hello.js` có `content-type: application/javascript` hoặc `text/javascript`; `hello.png` có `content-type: image/png`.

Nếu nhận 404: gần như chắc chắn thiếu `.nojekyll` hoặc Pages chưa deploy xong. **Không đi tiếp cho tới khi cả hai trả 200** — toàn bộ thiết kế phụ thuộc vào điều này.

- [ ] **Step 12: Build release và chạy trên máy Android**

```bash
npx expo run:android --variant release
```

Bản debug bỏ qua `expo-updates` hoàn toàn — bắt buộc release. Bản release dùng keystore debug mặc định của template nên không cần cấu hình ký; nếu gặp lỗi ký thì xem `android/app/build.gradle`, mục `buildTypes.release.signingConfig`.

Kỳ vọng: app chạy trên máy `R3CM80Z2SDD`, banner ghi `v1 — EMBEDDED`, `isEmbeddedLaunch: true`, `channel (từ extra): production`.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: cấu hình update site và xác minh hosting GitHub Pages"
git push
```

---

### Task 2: Hàm băm và sinh UUID

**Files:**
- Create: `tools/hashing.ts`
- Test: `tools/hashing.test.ts`
- Modify: `package.json`

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
      const out = sha256Base64Url(Buffer.from(`mau-${i}`));
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
  - `type ManifestLaunchAsset = { hash: string; key: string; contentType: string; url: string }`
  - `type ManifestAsset = ManifestLaunchAsset & { fileExtension: string }`
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
    expect(storeUrl('https://hoanghdtv.github.io/expo-app-update', image)).toBe(
      'https://hoanghdtv.github.io/expo-app-update/store/aa11.png'
    );
  });
});

describe('buildManifest', () => {
  const manifest = buildManifest({
    id: '11111111-2222-3333-4444-555555555555',
    createdAt: '2026-09-07T00:00:00.000Z',
    runtimeVersion: '1.0.0',
    baseUrl: 'https://hoanghdtv.github.io/expo-app-update',
    launch, assets: [image],
    expoClient: { name: 'demo' },
  });

  it('launchAsset khai báo application/javascript và không có fileExtension', () => {
    expect(manifest.launchAsset.contentType).toBe('application/javascript');
    expect(manifest.launchAsset.url).toBe(
      'https://hoanghdtv.github.io/expo-app-update/store/ff00.js'
    );
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

Task đầu tiên chứng minh vòng lặp hot update chạy thật.

**Files:**
- Create: `tools/config.ts`, `tools/io.ts`, `tools/releases.ts`, `tools/expo-config.ts`, `tools/publish.ts`
- Test: `tools/config.test.ts`, `tools/releases.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: toàn bộ interface của Task 2–4
- Produces:
  - `type UpdateConfigFile = { githubUser: string; repoName: string; channel: string; runtimeVersion: string; platform: string }`
  - `type PublishConfig = UpdateConfigFile & { baseUrl: string; siteDir: string; distDir: string }`
  - `resolveConfig(file: UpdateConfigFile): PublishConfig`
  - `readConfig(cwd: string): PublishConfig`
  - `manifestPathFor(cfg: PublishConfig): string`
  - `releasesPathFor(cfg: PublishConfig): string`
  - `writeJson(absPath: string, value: unknown): void`
  - `gitSha(): string`
  - `type ReleaseEntry = { id: string; createdAt: string; gitSha: string; rollbackOf?: string; manifest: UpdateManifest }`
  - `type ReleasesFile = { channel: string; runtimeVersion: string; platform: string; releases: ReleaseEntry[] }`
  - `readReleases(absPath: string, defaults: Omit<ReleasesFile, 'releases'>): ReleasesFile`
  - `appendRelease(file: ReleasesFile, entry: ReleaseEntry): ReleasesFile`
  - `findRelease(file: ReleasesFile, id: string): ReleaseEntry`

- [ ] **Step 1: Viết test thất bại cho config và releases**

`tools/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { manifestPathFor, releasesPathFor, resolveConfig } from './config';

const FILE = {
  githubUser: 'hoanghdtv',
  repoName: 'expo-app-update',
  channel: 'production',
  runtimeVersion: '1.0.0',
  platform: 'android',
};

describe('resolveConfig', () => {
  it('dựng baseUrl từ githubUser và repoName', () => {
    expect(resolveConfig(FILE).baseUrl).toBe('https://hoanghdtv.github.io/expo-app-update');
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
```

`tools/releases.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { UpdateManifest } from './manifest';
import { appendRelease, findRelease, readReleases } from './releases';

const DEFAULTS = { channel: 'production', runtimeVersion: '1.0.0', platform: 'android' };
const MISSING = 'khong/ton/tai/releases.json';

function entry(id: string) {
  return {
    id, createdAt: '2026-09-07T00:00:00.000Z', gitSha: 'deadbeef',
    manifest: { id } as unknown as UpdateManifest,
  };
}

describe('readReleases', () => {
  it('trả về file rỗng khi chưa tồn tại', () => {
    expect(readReleases(MISSING, DEFAULTS).releases).toEqual([]);
  });
});

describe('appendRelease', () => {
  it('đặt bản mới nhất lên đầu', () => {
    const f = appendRelease(appendRelease(readReleases(MISSING, DEFAULTS), entry('a')), entry('b'));
    expect(f.releases.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('findRelease', () => {
  const f = appendRelease(readReleases(MISSING, DEFAULTS), entry('a'));

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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type UpdateConfigFile = {
  githubUser: string;
  repoName: string;
  channel: string;
  runtimeVersion: string;
  platform: string;
};

export type PublishConfig = UpdateConfigFile & {
  baseUrl: string;
  siteDir: string;
  distDir: string;
};

const REQUIRED_KEYS: (keyof UpdateConfigFile)[] = [
  'githubUser', 'repoName', 'channel', 'runtimeVersion', 'platform',
];

export function resolveConfig(file: UpdateConfigFile): PublishConfig {
  for (const key of REQUIRED_KEYS) {
    if (!file[key]) {
      throw new Error(`update.config.json thiếu khóa bắt buộc hoặc để rỗng: ${key}`);
    }
  }
  return {
    ...file,
    baseUrl: `https://${file.githubUser}.github.io/${file.repoName}`,
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

Dùng chung cho `publish.ts`, `rollback.ts` và `expo-config.ts`.

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
    // gitSha chỉ để tra cứu — không có thì cũng không chặn việc publish
    return 'unknown';
  }
}
```

- [ ] **Step 7: Viết `tools/expo-config.ts`**

`expo export` **không** sinh `expoConfig.json`, mà `manifest.extra.expoClient` lại cần nội dung đó. Sinh nó bằng script riêng thay vì chuyển hướng stdout của `expo config` — CLI có thể in log lẫn vào JSON.

```ts
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
```

- [ ] **Step 8: Viết `tools/publish.ts`**

```ts
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
```

- [ ] **Step 9: Thêm script vào `package.json`**

```json
"scripts": {
  "test:tools": "vitest run tools",
  "export:android": "expo export --platform android && tsx tools/expo-config.ts",
  "publish:update": "tsx tools/publish.ts"
}
```

- [ ] **Step 10: Chạy export và xác nhận đầu vào đúng như mong đợi**

```bash
npm run export:android
cat dist/metadata.json
cat dist/expoConfig.json
```

Kỳ vọng: `metadata.json` có `fileMetadata.android.bundle` (đường dẫn kết thúc bằng `.hbc`) và mảng `assets` gồm các mục `{ path, ext }`. `expoConfig.json` là object JSON có `name`, `slug` và `extra.updateChannel`.

- [ ] **Step 11: Tạo worktree `site/` và publish lần đầu**

```bash
git worktree add site gh-pages
npm run publish:update
cd site
git add -A
git commit -m "publish: update dau tien"
git push
cd ..
```

Dùng `git worktree` để `site/` là checkout thật của `gh-pages`, nên `store/` giữ nguyên file cũ giữa các lần publish — đúng yêu cầu merge-không-replace ở spec mục 4.1.

- [ ] **Step 12: Xác minh manifest phục vụ được**

```bash
curl -s https://hoanghdtv.github.io/expo-app-update/production/1.0.0/android/manifest.json
```

Kỳ vọng: JSON manifest, `id` đúng dạng UUID, `launchAsset.url` trỏ vào `/store/`.

- [ ] **Step 13: KỊCH BẢN E2E #1 — update JS**

1. Sửa `src/version.ts`: `BANNER_TEXT = 'v2 — OTA'`, `BANNER_COLOR = '#166534'`
2. `npm run export:android`
3. `npm run publish:update`
4. `cd site && git add -A && git commit -m "publish: v2" && git push && cd ..`
5. Chờ ~1–2 phút cho Pages deploy
6. Trên app: bấm **Kiểm tra update** → log ghi `available=true`
7. Bấm **Tải update** → log ghi `new=true`
8. Bấm **Restart để áp dụng**

Kỳ vọng: banner đổi thành `v2 — OTA` màu xanh lá, `isEmbeddedLaunch: false`, `updateId` khớp `id` trong manifest.

Nếu app báo `checkError`: kiểm tra bản build là release chứ không phải debug, và `EXPO_UPDATE_URL` trong `android/app/src/main/AndroidManifest.xml` trỏ đúng.

- [ ] **Step 14: Commit**

```bash
git add tools/ package.json src/version.ts
git commit -m "feat(tools): CLI publish + xác minh hot update JS end-to-end"
git push
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

Dùng luôn icon mà template sinh ra làm ảnh demo. Nếu `assets/icon.png` không tồn tại, dùng tên file đã ghi lại ở Task 1 Step 2 — cần hai file PNG khác nhau rõ rệt: một cho bước này, một cho Step 5.

- [ ] **Step 2: Hiển thị ảnh và font trong `src/UpdatePanel.tsx`**

Thêm import (`useFonts` lấy từ `expo-font`, không lấy từ package font — tránh phụ thuộc vào việc package có re-export hay không):

```tsx
import { Inter_700Bold } from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Image } from 'react-native';
```

Thêm ngay sau `const [log, setLog] = ...`:

```tsx
const [fontsLoaded] = useFonts({ Inter_700Bold });
```

Thêm vào JSX, ngay dưới khối banner:

```tsx
<Image source={require('../assets/demo/photo.png')} style={styles.demo} />
<Text style={fontsLoaded ? styles.fontDemo : undefined}>
  Mau font tuy chinh 0123456789
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
npm run publish:update
cd site && git add -A && git commit -m "publish: them assets" && git push && cd ..
```

- [ ] **Step 4: Xác nhận assets nằm trong manifest và tải được**

```bash
curl -s https://expo-app-update.pages.dev/production/1.0.0/android/manifest.json
```

Chọn một `url` trong `/store/` có đuôi `.png` hoặc `.ttf` rồi:

```bash
curl -I <url-vừa-chọn>
```

Kỳ vọng: `HTTP/2 200`. Đây là chỗ rủi ro của spec mục 9 — nếu ra 404 thì dừng lại, kiểm tra `.nojekyll` và xem file đã được commit lên `gh-pages` chưa.

- [ ] **Step 5: KỊCH BẢN E2E #2 — update asset**

1. Trên app: check → fetch → restart. Xác nhận ảnh và font mới xuất hiện.
2. Thay bằng ảnh khác hẳn: `cp assets/splash-icon.png assets/demo/photo.png` (hoặc file PNG thứ hai đã chọn ở Step 1).
3. `npm run export:android` rồi `npm run publish:update`, commit và push trong `site/`.
4. Trên app: check → fetch → restart.

Kỳ vọng: ảnh đổi sang ảnh mới. Đây là bằng chứng asset thực sự được cập nhật qua OTA chứ không phải chỉ có JS.

- [ ] **Step 6: Commit**

```bash
git add assets/ src/UpdatePanel.tsx package.json package-lock.json
git commit -m "feat: demo update assets (ảnh + font) qua OTA"
git push
```

---

### Task 7: Rollback tự động — kịch bản E2E #3

Lớp L1 của spec mục 6. Không viết code — task này xác minh `expo-updates` thực sự tự phục hồi.

**Files:**
- Modify: `src/version.ts` (tạm thời, sẽ hoàn nguyên)
- Create: `docs/rollback-notes.md`

**Interfaces:**
- Consumes: pipeline publish của Task 5
- Produces: không có

- [ ] **Step 1: Ghi lại trạng thái hiện tại**

Mở app, ghi lại `updateId` đang chạy. Đây là bản mà app phải quay về.

- [ ] **Step 2: Tạo bundle crash ngay lúc khởi động**

Thêm vào **đầu** `src/version.ts`, ở cấp module (không nằm trong hàm nào):

```ts
throw new Error('CRASH CO Y — kiem tra rollback tu dong');
```

Phải ở cấp module thì lỗi mới xảy ra trong lúc nạp bundle, tức là lúc `expo-updates` còn đang theo dõi và có thể can thiệp.

- [ ] **Step 3: Publish bản hỏng**

```bash
npm run export:android
npm run publish:update
cd site && git add -A && git commit -m "publish: bundle hong co y" && git push && cd ..
```

- [ ] **Step 4: KỊCH BẢN E2E #3 — rollback tự động**

1. Trên app: check → fetch → restart
2. App sẽ crash hoặc chớp màn hình lỗi
3. Mở lại app

Kỳ vọng: app chạy lại được bằng bản **trước** đó (hoặc bản embedded). `isEmergencyLaunch` có thể là `true`. `updateId` **không phải** id của bản hỏng.

- [ ] **Step 5: Ghi lại quan sát vào `docs/rollback-notes.md`**

Ghi rõ: id bản hỏng, id bản app quay về, giá trị `isEmbeddedLaunch` và `isEmergencyLaunch` quan sát được. Hành vi chính xác (quay về bản trước hay về embedded) phụ thuộc trạng thái cache trên máy, và biết chắc điều này là cần thiết để diễn giải kết quả Task 8 và 9.

- [ ] **Step 6: Hoàn nguyên và publish bản lành**

```bash
# xóa dòng throw khỏi src/version.ts
npm run export:android
npm run publish:update
cd site && git add -A && git commit -m "publish: khoi phuc bundle lanh" && git push && cd ..
```

Xác nhận trên app: check → fetch → restart, app chạy bình thường trở lại.

- [ ] **Step 7: Commit**

```bash
git add src/version.ts docs/rollback-notes.md
git commit -m "docs: xác minh rollback tự động khi bundle crash lúc khởi động"
git push
```

---

### Task 8: Rollback thủ công — kịch bản E2E #4

Lớp L2 của spec mục 6.

**Files:**
- Create: `tools/rollback.ts`
- Test: `tools/rollback.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `findRelease`, `appendRelease`, `readReleases`, `readConfig`, `UpdateManifest`, `uuidFromSha256Hex`, `sha256Hex`, `writeJson`, `gitSha`
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

Id đích nhận qua **tham số dòng lệnh**, không qua biến môi trường — chạy giống nhau trên mọi shell.

```ts
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
```

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

1. Đồng bộ worktree và xem danh sách bản đã phát hành:

```bash
cd site && git pull && cd ..
cat site/production/1.0.0/android/releases.json
```

2. Chọn `id` của một bản **cũ** (ví dụ bản `v1 — EMBEDDED` hoặc `v2 — OTA`), rồi:

```bash
npm run rollback:update -- <id-cũ>
cd site && git add -A && git commit -m "rollback" && git push && cd ..
```

Dấu `--` là bắt buộc để npm chuyển tham số xuống script.

3. Trên app: check → fetch → restart

Kỳ vọng: app hiện lại nội dung của bản cũ (banner và ảnh của bản đó), nhưng `updateId` là một UUID **mới** chứ không phải id cũ. Đây chính là điểm "phát hành lại như update mới" ở spec mục 4.4.

- [ ] **Step 7: Commit**

```bash
git add tools/rollback.ts tools/rollback.test.ts package.json
git commit -m "feat(tools): rollback thủ công bằng cách phát lại bản cũ như update mới"
git push
```

---

### Task 9: Version gating và channel gating — kịch bản E2E #5

**Files:**
- Modify: `update.config.json` (tạm thời, hoàn nguyên ở cuối task)
- Create: `docs/gating-notes.md`

**Interfaces:**
- Consumes: `readConfig`, `manifestPathFor`
- Produces: không có

- [ ] **Step 1: Đưa app về trạng thái "không còn update nào chờ"**

Trước khi kiểm tra gating, app phải đã áp dụng bản mới nhất của channel `production` / runtimeVersion `1.0.0`. Nếu không, kết quả `available=true` sẽ đến từ bản còn tồn đọng chứ không phải từ bản gating, và phép thử trở nên vô nghĩa.

Trên app: check → fetch → restart, lặp cho tới khi **Kiểm tra update** cho `available=false`.

- [ ] **Step 2: Publish vào một runtimeVersion khác**

Sửa `update.config.json`, đổi `"runtimeVersion": "1.0.0"` thành `"2.0.0"`, rồi:

```bash
npm run export:android
npm run publish:update
cd site && git add -A && git commit -m "publish: runtimeVersion 2.0.0" && git push && cd ..
```

- [ ] **Step 3: Xác nhận hai manifest tồn tại ở hai đường dẫn riêng**

```bash
curl -sI https://expo-app-update.pages.dev/production/2.0.0/android/manifest.json
curl -sI https://expo-app-update.pages.dev/production/1.0.0/android/manifest.json
```

Kỳ vọng: cả hai trả 200.

- [ ] **Step 4: KỊCH BẢN E2E #5a — version gating**

App đang chạy được build ở Task 1 với `runtimeVersion` `1.0.0`, nên URL của nó trỏ tới `.../1.0.0/android/manifest.json`. Bản build native **không** đổi theo `update.config.json` — chỉ bản build mới mới đọc giá trị mới.

Trên app: bấm **Kiểm tra update**.

Kỳ vọng: `available=false`. App **không** nhìn thấy bản `2.0.0` vì nó không có đường nào để nhìn tới đường dẫn đó. Đây là bằng chứng gating theo path hoạt động (spec mục 3.2, quyết định B).

- [ ] **Step 5: KỊCH BẢN E2E #5b — channel gating**

Sửa `update.config.json`: đưa `runtimeVersion` về `"1.0.0"` và đổi `"channel"` thành `"staging"`, rồi:

```bash
npm run export:android
npm run publish:update
cd site && git add -A && git commit -m "publish: channel staging" && git push && cd ..
```

Trên app (được build ở channel `production`): bấm **Kiểm tra update**.

Kỳ vọng: `available=false`.

- [ ] **Step 6: Hoàn nguyên `update.config.json`**

Đưa về `"channel": "production"` và `"runtimeVersion": "1.0.0"`. Xác nhận bằng cách so với nội dung ở Task 1 Step 3 — phải giống hệt.

- [ ] **Step 7: Ghi kết quả vào `docs/gating-notes.md`**

Ghi rõ hai kịch bản, URL manifest cụ thể đã dùng, và kết quả `available` quan sát được ở mỗi kịch bản.

- [ ] **Step 8: Commit**

```bash
git add update.config.json docs/gating-notes.md
git commit -m "docs: xác minh gating theo runtimeVersion và channel"
git push
```

---

### Task 10: Tự động hóa CI và tài liệu

**Files:**
- Create: `.github/workflows/publish.yml`, `.github/workflows/rollback.yml`, `README.md`

**Interfaces:**
- Consumes: `tools/publish.ts`, `tools/rollback.ts` qua npm script
- Produces: không có

- [ ] **Step 1: Viết `.github/workflows/publish.yml`**

CI ghi đè `update.config.json` từ input trước khi chạy, giữ đúng nguyên tắc "một nguồn sự thật".

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
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Áp input vào update.config.json
        run: |
          node -e "
            const fs = require('fs');
            const c = JSON.parse(fs.readFileSync('update.config.json', 'utf-8'));
            c.channel = process.env.CHANNEL;
            c.runtimeVersion = process.env.RUNTIME_VERSION;
            fs.writeFileSync('update.config.json', JSON.stringify(c, null, 2) + '\n');
          "
          cat update.config.json
        env:
          CHANNEL: ${{ inputs.channel }}
          RUNTIME_VERSION: ${{ inputs.runtimeVersion }}

      - run: npm run export:android
      - run: npm run publish:update

      - name: Commit lên gh-pages
        working-directory: site
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "publish: ${{ inputs.channel }} ${{ inputs.runtimeVersion }} (${{ github.sha }})"
          git push
```

Hai lần `actions/checkout` là chủ ý: `site/` phải là checkout thật của `gh-pages` để `store/` giữ lại toàn bộ file cũ. Đây là yêu cầu merge-không-replace ở spec mục 4.1 — thay bằng action publish kiểu "xóa và thay toàn bộ" sẽ làm hỏng rollback.

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
          node-version: 24
          cache: npm

      - run: npm ci

      - name: Áp input vào update.config.json
        run: |
          node -e "
            const fs = require('fs');
            const c = JSON.parse(fs.readFileSync('update.config.json', 'utf-8'));
            c.channel = process.env.CHANNEL;
            c.runtimeVersion = process.env.RUNTIME_VERSION;
            fs.writeFileSync('update.config.json', JSON.stringify(c, null, 2) + '\n');
          "
        env:
          CHANNEL: ${{ inputs.channel }}
          RUNTIME_VERSION: ${{ inputs.runtimeVersion }}

      - run: npm run rollback:update -- "${{ inputs.targetUpdateId }}"

      - name: Commit lên gh-pages
        working-directory: site
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "rollback: ve ${{ inputs.targetUpdateId }}"
          git push
```

- [ ] **Step 3: Chạy thử workflow publish**

```bash
git add .github/
git commit -m "feat: workflow CI publish/rollback"
git push
gh workflow run "Publish update" -f channel=production -f runtimeVersion=1.0.0
gh run watch
```

Kỳ vọng: job xanh, có commit mới trên `gh-pages`. Trên app: check → fetch → restart, nhận được update.

- [ ] **Step 4: Viết `README.md`**

Nội dung bắt buộc có:

- Kiến trúc trong một đoạn, kèm link tới spec
- `update.config.json` là nguồn sự thật duy nhất; đổi channel/runtimeVersion nghĩa là sửa file này
- Cách build: `npx expo run:android --variant release`, và **lý do bản debug không dùng được**
- Cách publish thủ công (`npm run export:android` rồi `npm run publish:update`, commit trong `site/`) và qua CI
- Cách rollback: đọc `releases.json` lấy id, rồi `npm run rollback:update -- <id>`
- **Độ trễ CDN ~10 phút** của `manifest.json` trên GitHub Pages — đúng như thiết kế, không phải lỗi
- Những gì cố ý không hỗ trợ: iOS, code signing, directive `rollBackToEmbedded`, đổi channel lúc runtime (kèm lý do: xung đột với rollback tự động)

- [ ] **Step 5: Chạy toàn bộ test lần cuối**

```bash
npm run test:tools
```

Kỳ vọng: PASS, 34 test.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: README hướng dẫn vận hành"
git push
```

---

## Đối chiếu với spec

| Mục spec | Task |
|---|---|
| 2.1 manifest JSON thuần | 5 (Step 12) |
| 2.2 gating theo path | 1 (Step 4), 9 |
| 2.3 không có directive | 10 (Step 4, ghi rõ trong README) |
| 2.4 "không có update mới" bằng cách so id | 9 (Step 4) |
| 3.0 tham số cấu hình tập trung | 1 (Step 3), 5 (Step 3) |
| 3.2 store content-addressed | 4 |
| 3.2 `.nojekyll` | 1 (Step 10) |
| 3.3 định dạng manifest | 2, 4 |
| 4.1 sync merge-không-replace | 5 (Step 11), 10 (Step 1) |
| 4.2 `releases.json` | 5 |
| 4.3 GitHub Actions | 10 |
| 4.4 rollback = update mới | 8 |
| 5.1 cấu hình app | 1 |
| 5.2 màn hình POC | 1, 6 |
| 6 rollback L1 | 7 |
| 6 rollback L2 | 8 |
| 8.1 unit test | 2, 3, 4, 5, 8 |
| 8.2 E2E #1–#5 | 5, 6, 7, 8, 9 |
| 9 spike hosting sớm | 1 (Step 11) |
