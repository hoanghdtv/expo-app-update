# Kit: hot update Expo qua GitHub Pages — hướng dẫn port sang dự án khác

Mang cơ chế OTA của repo này sang một dự án Expo khác: bundle JS + assets tải qua CDN tĩnh, rollback hai lớp, gating theo channel/runtimeVersion, **không EAS Update, không server động**.

Phạm vi kit: **Android**, host **GitHub Pages**. iOS chưa nằm trong phạm vi (xem [Giới hạn](#2-giới-hạn-phải-biết-trước-khi-cam-kết)).

Tài liệu này viết để port được **kể cả khi không chạy script cài** — mục [Cài bằng tay](#4-cài-bằng-tay) liệt kê đủ từng file và vai trò.

---

## 1. Cài nhanh

Từ thư mục gốc repo này:

```bash
bash kit/install.sh /duong/dan/toi/du-an-dich --with-panel
```

Script chỉ chép file và thêm script vào `package.json`. Nó **cố ý không** chạy `npm install`, không tạo nhánh `gh-pages`, không sinh bản vá — đó là những việc cần quyết định của con người, và được in ra ở cuối như một checklist.

Sau khi chạy xong, đọc tiếp mục 5 (bản vá) và mục 6 (dựng site) — hai mục đó là phần dễ hỏng nhất.

**Kit này đã được kiểm chứng bằng cách port thật:** tạo một app Expo trống bằng `create-expo-app`, chạy `install.sh`, rồi chạy hết `verify:patch` → `test:tools` (37/37 pass) → `export:android` → `publish:update` hai lần → `rollback:update`. Manifest sinh ra đúng shape, bản rollback mang `id` mới và trỏ đúng `launchAsset` cũ. Phần duy nhất **chưa** kiểm chứng ở dự án mới là build native và chạy trên thiết bị — phần đó đã được kiểm chứng đầy đủ ở repo gốc ([`../docs/rollback-notes.md`](../docs/rollback-notes.md)).

---

## 2. Giới hạn phải biết trước khi cam kết

Bốn điều dưới đây là **giới hạn cứng của kiến trúc host tĩnh**, không phải thiếu sót cài đặt. Nếu một trong số đó không chấp nhận được với dự án của bạn thì đừng port — hãy cân nhắc EAS Update hoặc một server thật.

| Giới hạn | Hệ quả thực tế |
|---|---|
| **Phải vá `expo-updates`** | Client bắt buộc nhận header `expo-protocol-version`; GitHub Pages không đặt được header tùy chỉnh. Mỗi lần nâng SDK Expo phải kiểm lại bản vá (mục 5). |
| **Rollback mất 6–9 phút mới tới thiết bị** | GitHub Pages trả `Cache-Control: max-age=600` và không ép hết hạn sớm được. Không dùng làm nút cứu hoả tức thì. |
| **Không gửi được directive** | `rollBackToEmbedded` chỉ tồn tại trong response `multipart/mixed`, host tĩnh không tạo được. Rollback chỉ có L1 (tự động) và L2 (phát lại bản cũ). |
| **Không đổi channel lúc runtime** | API `setUpdateURLAndRequestHeadersOverride()` đòi bật `disableAntiBrickingMeasures`, cờ này giết luôn rollback tự động L1. Channel chốt lúc build native. |

Nếu **rollback phải tức thì** hoặc **cần đổi channel lúc runtime**, dừng ở đây.

Nếu chỉ vướng mỗi chuyện phải vá client: cân nhắc [đổi host sang Cloudflare Pages](#10-phương-án-không-cần-vá-cloudflare-pages) — bỏ được hoàn toàn bản vá, phần còn lại của kit giữ nguyên.

---

## 3. Kiến trúc trong ba câu

Một nhánh `gh-pages` chứa cây thư mục tĩnh thuần: `<channel>/<runtimeVersion>/<platform>/manifest.json` cộng với `store/<sha256>.<ext>` giữ bundle và asset.

Mọi quyết định "thiết bị nào nhận bản nào" được **đóng băng thành đường dẫn URL lúc publish**, vì bản build native chỉ biết đúng một URL nhúng sẵn và host tĩnh không đọc được header.

`store/` là content-addressed và **không bao giờ bị xóa hay ghi đè**, nên rollback chỉ là ghi lại `manifest.json` để trỏ về bundle cũ — không build lại, không upload lại.

Thiết kế đầy đủ: [`../docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md`](../docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md).

---

## 4. Cài bằng tay

Nếu không dùng `install.sh`, chép đúng những thứ sau vào dự án đích:

| Nguồn | Đích | Vai trò |
|---|---|---|
| `tools/*.ts` (7 module + 7 file test) | `tools/` | Toàn bộ logic publish/rollback. Generic — chỉ đọc `update.config.json`, không hardcode gì của repo này |
| `kit/verify-updates-patch.sh` | `scripts/verify-updates-patch.sh` | Chặn build/CI khi bản vá biến mất |
| `kit/templates/publish.yml`, `rollback.yml` | `.github/workflows/` | Publish và rollback qua CI, trigger tay |
| `kit/templates/update.config.json` | `update.config.json` | **Nguồn sự thật duy nhất** cho channel/runtimeVersion/baseUrl |
| `kit/templates/app.config.snippet.js` | `app.config.js` | Nhúng URL manifest vào bản build native |
| `kit/templates/UpdatePanel.tsx` (tùy chọn) | `src/UpdatePanel.tsx` | Màn hình chẩn đoán: hiện `updateId`, nút check/fetch/restart |
| `patches/expo-updates+<version>.patch` | `patches/` | **Chỉ chép nếu phiên bản khớp tuyệt đối**, nếu không phải sinh lại (mục 5) |

Thêm vào `package.json`:

```jsonc
"scripts": {
  "postinstall": "patch-package",
  "test:tools": "vitest run tools",
  "export:android": "expo export --platform android && tsx tools/expo-config.ts",
  "publish:update": "tsx tools/publish.ts",
  "rollback:update": "tsx tools/rollback.ts",
  "verify:patch": "bash scripts/verify-updates-patch.sh"
},
"devDependencies": {
  "@types/node": "^26.4.1",
  "patch-package": "^8.0.1",
  "tsx": "^4.23.13",
  "vitest": "^5.0.0"
}
```

Thêm vào `.gitignore`: `site/`, `dist/`, `android/`, `ios/`.

> `site/` **bắt buộc** phải bị ignore ở nhánh chính: nó là worktree của `gh-pages`, để nhánh chính theo dõi nó sẽ tạo ra một mớ lồng nhau khó gỡ.

### Nếu dự án đích đang dùng `app.json`

Phải chuyển sang `app.config.js`. Bộ tool đọc cấu hình Expo bằng `import()` file đó (`tools/expo-config.ts`), và URL manifest phải sinh động từ `update.config.json` — `app.json` tĩnh không làm được.

Cách chuyển: xóa `app.json`, bê nguyên nội dung khóa `expo` của nó vào `app.config.js` theo mẫu trong `kit/templates/app.config.snippet.js`, rồi thêm khối `updates` và `runtimeVersion`.

### `runtimeVersion` phải là chuỗi, không dùng policy

```js
runtimeVersion: cfg.runtimeVersion,          // ĐÚNG
runtimeVersion: { policy: 'appVersion' },    // SAI với kit này
```

Lý do: tool publish ghi manifest vào path `<channel>/<runtimeVersion>/...` lấy từ `update.config.json`. Nếu app tự suy runtimeVersion theo policy, hai bên có thể lệch nhau và manifest sẽ nằm ở path mà app không bao giờ hỏi tới — **không có thông báo lỗi nào**.

---

## 5. Sinh lại bản vá `expo-updates`

**Đây là bước dễ hỏng nhất của cả quy trình.** Bản vá mẫu trong `patches/` được sinh cho `expo-updates@57.0.21`. Với phiên bản khác, gần như chắc chắn phải làm lại.

### 5.1 Kiểm tra xem có còn cần vá không

Trước hết, xem chốt chặn mà ta cần đi vòng qua còn tồn tại không:

```bash
grep -rn "Legacy manifests are no longer supported" node_modules/expo-updates/android/
```

- **Còn** → vẫn phải vá, làm tiếp 5.2.
- **Không còn** → upstream đã bỏ chốt chặn (chính họ để `TODO: remove error in a few major releases after SDK 51`). Khi đó **không cần vá gì cả**: bỏ `patches/`, bỏ script `postinstall`, bỏ bước verify trong hai workflow, và xóa `scripts/verify-updates-patch.sh`. Kiểm chứng bằng cách chạy thật một lần publish → thiết bị nhận được update.

### 5.2 Tìm đúng chỗ vá

```bash
grep -rn "protocolVersion" node_modules/expo-updates/android/src/main/java/ | head
```

Tìm file định nghĩa `protocolVersion` từ header thô — ở SDK 57 là:

```
node_modules/expo-updates/android/src/main/java/expo/modules/updates/manifest/ResponseHeaderData.kt
```

Đường dẫn này **có thể đổi** ở phiên bản khác; dùng kết quả `grep` làm chuẩn, đừng tin đường dẫn chép sẵn.

### 5.3 Sửa một dòng

```diff
- val protocolVersion = protocolVersionRaw?.let { Integer.valueOf(it) }
+ val protocolVersion = protocolVersionRaw?.let { Integer.valueOf(it) } ?: 1
```

Nghĩa: response thiếu header `expo-protocol-version` thì coi như protocol v1, thay vì `null` (mà `null` sẽ bị ném lỗi ở `UpdateFactory.kt`).

**Bán kính ảnh hưởng — đọc trước khi tưởng đây là một dòng vô hại:** `protocolVersion` còn được đọc ở `FileDownloader.kt`, nhánh xử lý response `204 No Content`. Sau bản vá, một response rỗng bất thường sẽ bị coi là "không có update mới" và im lặng bỏ qua, thay vì ném lỗi rõ ràng. Với GitHub Pages đây là đường chết (Pages luôn trả `200` kèm body). Nhưng nếu host của bạn có thể trả `204`, hãy vá ở `UpdateFactory.kt` thay vì ở đây.

### 5.4 Sinh file patch

```bash
npx patch-package expo-updates
```

Tạo ra `patches/expo-updates+<version>.patch`. Commit file này.

### 5.5 Kiểm chứng patch thật sự sống sót

Đừng tin patch cho tới khi thấy nó tự áp lại sau khi xóa sạch `node_modules`:

```bash
rm -rf node_modules
npm ci
npm run verify:patch      # phải in "Bản vá expo-updates: OK"
```

Nếu `patch-package` báo xung đột ở bước `npm ci`, nghĩa là nội dung file upstream khác với lúc bạn sinh patch — quay lại 5.2.

> **Vì sao phải có bước verify riêng:** nếu patch không được áp, app **không tải được update và không báo lỗi gì cả** — nhìn từ ngoài y hệt như "chưa có bản mới". Đó là lý do cả hai workflow CI đều chạy `verify-updates-patch.sh` ngay sau `npm ci`, và bạn nên chạy nó trước mỗi lần build release.

### 5.6 Nhớ cập nhật kit

Nếu định dùng lại `install.sh` cho dự án sau, sửa `PATCH_FOR_VERSION` ở đầu file cho khớp phiên bản mới.

---

## 6. Dựng update site

### 6.1 Tạo nhánh `gh-pages` rỗng

```bash
git switch --orphan gh-pages
git rm -rf . 2>/dev/null || true
touch .nojekyll
git add .nojekyll
git commit -m "chore: khoi tao update site"
git push -u origin gh-pages
git switch main
```

`.nojekyll` là **bắt buộc**: thiếu nó, GitHub Pages chạy Jekyll và **nuốt im lặng** mọi file/thư mục bắt đầu bằng `_`.

### 6.2 Bật GitHub Pages

Settings → Pages → Source: `Deploy from a branch` → Branch: `gh-pages` / `(root)`.

Kiểm tra hosting hoạt động trước khi viết thêm bất cứ thứ gì — đây là cổng chặn rủi ro:

```bash
curl -sI https://<user>.github.io/<repo>/.nojekyll   # kỳ vọng 200
```

Lần bật đầu tiên có thể mất vài phút mới lên.

### 6.3 Tạo worktree `site/`

```bash
git fetch origin gh-pages
git worktree add site gh-pages
git worktree list          # phải thấy site/ gắn với gh-pages
```

Worktree **không đi kèm khi clone** — mỗi máy mới phải tự tạo lại. Thiếu bước này, `npm run publish:update` sẽ ghi vào một thư mục `site/` thường và không có gì để push.

---

## 7. Publish và rollback

### Publish thủ công

```bash
npm run verify:patch
npm run export:android     # expo export → dist/, kèm expoConfig.json
npm run publish:update     # dist/ → store/ + manifest.json + releases.json trong site/
cd site && git add -A && git commit -m "publish: <channel> <rv>" && git push && cd ..
```

`publish:update` **không tự commit hay push**. Quên bước cuối thì update chỉ tồn tại trên máy.

### Rollback thủ công

```bash
# 1. tìm id trong site/<channel>/<rv>/<platform>/releases.json
npm run rollback:update -- <updateId>
cd site && git add -A && git commit -m "rollback: ve <updateId>" && git push && cd ..
```

Rollback giữ nguyên `launchAsset` + `assets` của bản cũ nhưng **cấp `id` mới**. Bắt buộc phải vậy: client nhớ id đã chạy *và* id đã bị đánh dấu lỗi, nên phát lại manifest y nguyên sẽ bị bỏ qua hoặc bị từ chối thẳng.

### Qua CI

```bash
gh workflow run "Publish update"  -f channel=production -f runtimeVersion=1.0.0
gh workflow run "Rollback update" -f channel=production -f runtimeVersion=1.0.0 -f targetUpdateId=<id>
```

Cả hai workflow checkout `main` và `gh-pages` (vào `site/`) trong cùng một job, **cố ý dùng hai lần `actions/checkout`** thay vì action publish kiểu "xóa và thay toàn bộ": `store/` phải được cộng dồn, xóa nó là mất khả năng rollback.

---

## 8. Bốn cái bẫy — tất cả đều hỏng im lặng

Không cái nào trong bốn cái này báo lỗi. Chúng chỉ làm update "không xuất hiện", và bạn sẽ mất hàng giờ nghi ngờ nhầm chỗ.

### 8.1 Bản vá không được áp

Triệu chứng: app luôn `available=false`, hoặc lỗi `Legacy manifests are no longer supported` trong logcat.
Phòng: `npm run verify:patch` trước mỗi build release; CI đã tự chạy.

### 8.2 Bundle embedded mới hơn bản đang publish

`expo-updates` chọn bản có `createdAt` **mới nhất**, và bundle nhúng trong APK cũng có `createdAt` riêng. Vừa build APK xong thì bundle embedded thường mới hơn manifest trên server → app báo `available=false` dù server có bản mới hoàn toàn hợp lệ.

Triệu chứng: cài bản mới xong, bấm kiểm tra ra `available=false`, tưởng publish hỏng.
Xử lý: publish lại **sau khi** build APK, để `createdAt` của manifest mới hơn bundle embedded.

### 8.3 Publish nhầm channel hoặc nhầm runtimeVersion

File lên đúng chỗ nó được bảo, CI xanh, chỉ là không thiết bị nào hỏi tới đường dẫn đó.

Phòng: sau mỗi lần publish, kiểm tra `id` tại chính URL mà bản build đang hỏi:

```bash
curl -sS https://<user>.github.io/<repo>/production/1.0.0/android/manifest.json | grep -o '"id":"[^"]*"'
```

Muốn chắc chắn URL nào đang được nhúng, đọc thẳng trong bản build:

```bash
grep EXPO_UPDATE_URL android/app/src/main/AndroidManifest.xml
```

### 8.4 Dùng bản debug để kiểm thử

Bản debug nạp JS trực tiếp từ Metro và **bỏ qua hoàn toàn `expo-updates`** — app không bao giờ gọi tới `manifest.json`. Mọi hành vi publish/rollback đều vô hình.

Luôn kiểm thử bằng `npx expo run:android --variant release`.

### 8.5 (Không phải bẫy, nhưng hay bị tưởng là lỗi) Độ trễ CDN

`curl` từ máy bạn thấy manifest mới sau ~15 giây; **thiết bị có thể phải đợi 6–9 phút** vì edge CDN khác giữ bản cũ gần hết `max-age=600`. Số đo thật từ một phiên kiểm thử: 16 giây trên máy so với 451 giây trên thiết bị, cùng một lần publish.

Khi kiểm thử, dùng nút bấm trong app để ép check lại thay vì đợi chu kỳ `ON_LOAD`, và đừng kết luận trước 10 phút.

---

## 9. Kiểm thử chấp nhận

Port xong thì chạy đủ năm kịch bản này trên thiết bị/emulator thật, bản `release`:

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Sửa một chuỗi JS → publish → check/fetch/restart | Thấy chuỗi mới |
| 2 | Thêm ảnh hoặc font → publish → check/fetch/restart | Asset mới hiển thị |
| 3 | Publish bundle có `throw` ở cấp module → fetch → restart | App crash, **mở lại hai lần** thì tự chạy bằng bản trước đó, `isEmbeddedLaunch: false` |
| 4 | `npm run rollback:update -- <id bản lành>` | App nhận **id mới**, nội dung bản cũ |
| 5 | Publish sang `runtimeVersion` khác và sang channel khác | App báo `available=false` cả hai lần |

Kết quả tham chiếu của repo này (kèm log và số đo thật): [`../docs/rollback-notes.md`](../docs/rollback-notes.md), [`../docs/gating-notes.md`](../docs/gating-notes.md).

Với kịch bản 3, hai điều dễ hiểu lầm: **lần mở lại app đầu tiên vẫn là màn hình trắng** dù log đã ghi `falling back to older update`, và `isEmergencyLaunch` **không** bật `true` — đừng dùng cờ đó để phát hiện rollback L1.

---

## 10. Phương án không cần vá: Cloudflare Pages

Nếu chi phí bảo trì bản vá (mục 5) lớn hơn lợi ích của việc "chỉ dùng GitHub":

1. Giữ nguyên `gh-pages` làm nguồn sự thật và nơi lưu lịch sử.
2. Thêm file `_headers` ở gốc site:

   ```
   /*
     expo-protocol-version: 1
   ```

3. Deploy bằng `npx wrangler pages deploy site/ --project-name=<ten>`.
4. Đổi `baseUrl` trong `update.config.json` sang domain `*.pages.dev`.
5. Bỏ `patches/`, bỏ `postinstall`, bỏ bước verify trong hai workflow.

Đổi lại: thêm một nhà cung cấp vào chuỗi phụ thuộc. Cấu trúc site, định dạng manifest, `store/`, toàn bộ `tools/` và cơ chế rollback **không đổi một dòng nào**.

---

## 11. Sự cố hay gặp lúc cài

### `vitest` chết với "Cannot find native binding"

```
Error: Cannot find native binding. npm has a bug related to optional dependencies
Cannot find module '@rolldown/binding-wasm32-wasi'
```

Đây là [lỗi đã biết của npm với optional dependency](https://github.com/npm/cli/issues/4828), không phải lỗi của kit. Nó xuất hiện khi `node_modules` được cài **tăng dần** (ví dụ chạy `npx expo install ...` sau khi đã có `vitest`): npm bỏ sót binary gốc dành cho nền tảng của bạn.

Cách chữa — cài lại sạch:

```bash
rm -rf node_modules package-lock.json
npm install
```

Đã gặp thật khi kiểm chứng kit này trên một dự án Expo mới tinh, và khỏi hoàn toàn sau khi cài lại sạch.

### Đừng "sửa" lockfile bằng `npm install --package-lock-only`

Nếu cần sửa tay `package-lock.json` (ví dụ đổi tên package), **sửa đúng dòng cần sửa**. Chạy `npm install --package-lock-only` trên máy macOS sẽ **cắt bỏ toàn bộ optional binary của nền tảng khác** (`linux-x64-gnu`, `musl`, `freebsd`…) khỏi lockfile. Máy bạn vẫn chạy tốt, còn CI trên `ubuntu-latest` thì hỏng — kiểu lỗi chỉ nổ ở nơi không ai nhìn.

## 12. Bảo trì khi nâng SDK Expo

Mỗi lần nâng `expo-updates`:

1. `npm ci` — nếu `patch-package` báo xung đột, dừng lại, sinh lại patch (mục 5).
2. `npm run verify:patch` — phải OK.
3. Chạy lại kịch bản 1 và 3 ở mục 9 trên thiết bị thật. Kịch bản 3 quan trọng hơn cả: nó là thứ duy nhất chứng minh cơ chế cứu app vẫn còn hoạt động.
4. Kiểm tra lại 5.1 — nếu upstream đã bỏ chốt chặn, gỡ luôn bản vá thay vì tiếp tục nuôi nó.
