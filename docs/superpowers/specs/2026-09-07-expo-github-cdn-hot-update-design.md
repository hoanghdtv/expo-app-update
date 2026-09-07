# Hot update cho app Expo qua CDN GitHub — Thiết kế

Ngày: 2026-09-07
Trạng thái: đã duyệt hướng đi, chờ review spec

## 1. Mục tiêu

Xây một POC chứng minh cơ chế hot update (OTA) cho app Expo, với toàn bộ hạ tầng phát hành nằm trên GitHub, không dùng EAS Update và không dùng bất kỳ máy chủ nào khác.

POC phải chứng minh được bốn điều:

1. Tải và áp dụng bundle JS mới
2. Update cả assets (ảnh, font)
3. Rollback khi bản mới lỗi
4. Channel và version gating

Phạm vi: **Android**, build local (`npx expo run:android`). iOS không nằm trong POC nhưng thiết kế không được chặn đường mở rộng sang iOS.

Nền tảng: Expo SDK 57, `expo-updates`.

### Không thuộc phạm vi

- iOS
- Code signing manifest (protocol cho phép bỏ qua; thêm sau được, không đổi kiến trúc)
- Directive `rollBackToEmbedded` (bất khả thi trên host tĩnh — xem mục 3.3)
- Đổi channel lúc runtime (có đánh đổi, bị loại có chủ đích — xem mục 7)
- Staged rollout theo phần trăm
- Thống kê, telemetry, dashboard

## 2. Kết quả kiểm chứng ràng buộc

Ràng buộc "chỉ GitHub, không server khác" là rủi ro lớn nhất của dự án, vì giao thức Expo Updates thường được mô tả như đòi hỏi một server động. Đã kiểm chứng và kết luận là **khả thi**, với hai giới hạn cứng.

### 2.1 Manifest dạng JSON thuần được chấp nhận

Spec giao thức Expo Updates v1 nêu server MAY hỗ trợ `application/json` / `application/expo+json` hoặc `multipart/mixed`. Multipart là tùy chọn, không bắt buộc.

Xác nhận ở phía code client: trong `FileDownloader.kt` của `expo-updates` (Android), việc phân nhánh dựa trên

```kotlin
val isMultipart = responseBody.contentType()?.type == "multipart"
```

Nhánh không-multipart parse thẳng body thành manifest. Nghĩa là một file `manifest.json` tĩnh do GitHub Pages phục vụ là hợp lệ.

Code signing chỉ chạy khi `configuration.codeSigningConfiguration` tồn tại — tùy chọn, không bắt buộc.

### 2.2 Giới hạn cứng 1: host tĩnh không đọc được request header

Client gửi `expo-protocol-version`, `expo-platform`, `expo-runtime-version` và thông tin channel qua HTTP header. GitHub Pages không thể phản ứng theo header.

**Cách xử lý:** mã hóa channel, runtimeVersion và platform vào **đường dẫn URL**, chốt cứng lúc build native. Xem mục 3.2.

### 2.3 Giới hạn cứng 2: không gửi được directive

Directive (bao gồm `rollBackToEmbedded`) chỉ tồn tại trong response `multipart/mixed`. GitHub Pages đặt `Content-Type` theo phần mở rộng file và không cho phép khai báo tham số `boundary`, nên không thể tạo response multipart hợp lệ.

**Hệ quả:** rollback do server chủ động đẩy về bản embedded là bất khả thi. Hai dạng rollback còn lại vẫn khả dụng và đủ cho yêu cầu (mục 6).

### 2.3b GIỚI HẠN CỨNG 3 — phát hiện khi chạy thật, đã lật ràng buộc "chỉ GitHub"

**Ngày phát hiện: 2026-09-07, trong lúc thực thi Task 5.**

Client `expo-updates` **bắt buộc** phải nhận được response header `expo-protocol-version` trên mọi response manifest. Thiếu nó là ném lỗi ngay lập tức, không có cờ cấu hình nào tắt được.

Bằng chứng từ chính mã nguồn đang cài, `expo-updates/android/.../manifest/UpdateFactory.kt`:

```kotlin
when (val expoProtocolVersion = responseHeaderData.protocolVersion) {
  null -> { throw Exception("Legacy manifests are no longer supported") }
  0, 1 -> { ... }
}
```

GitHub Pages trả về đúng hai header và không có cơ chế nào thêm header tùy ý:

```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
```

Đã xác nhận không tồn tại đường thuần GitHub: Pages, `raw.githubusercontent`, Releases (`objects.githubusercontent`), jsDelivr — không nơi nào đặt được header tùy chỉnh.

**Đây là sai sót kiểm chứng ở mục 2.1.** Lúc thiết kế đã xác minh phần *thân* response (protocol cho phép `application/json` thay vì `multipart/mixed` — kết luận đó vẫn đúng) nhưng không kiểm tra rằng có một *response header* bắt buộc.

Chỉ `expo-protocol-version` là bắt buộc. `expo-server-defined-headers` và `expo-manifest-filters` đều tùy chọn (kiểu nullable trong `ResponseHeaderData`).

#### Quyết định cuối: vá một dòng trong client, giữ GitHub thuần

**Đây là hướng đang dùng.** Phương án Cloudflare Pages bên dưới được giữ lại làm dự phòng đã kiểm chứng.

Ba dữ kiện khiến việc vá client là lựa chọn hợp lý chứ không phải một mẹo lách:

1. **`expo-updates` được biên dịch từ mã nguồn.** 92 file Kotlin trong `node_modules/expo-updates/android/src` được Gradle compile trong lúc build app — không phải AAR dựng sẵn. Nên sửa mã nguồn ở đó có tác dụng thật, và `patch-package` giữ được thay đổi qua mỗi lần `npm install`.

2. **Chốt chặn được chính Expo đánh dấu là tạm thời.** Ngay trên dòng `throw` trong `UpdateFactory.kt`:

   ```kotlin
   // TODO(wschurman): remove error in a few major releases after SDK 51
   // when it's unlikely classic updates may erroneously be served
   ```

   Nó tồn tại để chặn *classic manifest* thời trước SDK 50 bị phục vụ nhầm, không phải vì protocol đòi header đó. Manifest ta sinh ra là manifest v1 thật.

3. **Bản vá là một dòng, ở điểm sạch nhất** — `ResponseHeaderData.kt`, nơi header thô được chuyển thành số:

   ```kotlin
   val protocolVersion = protocolVersionRaw?.let { Integer.valueOf(it) } ?: 1
   ```

   Vá ở đây thay vì ở `UpdateFactory.kt` khiến `FileDownloader.kt:457` (nhánh xử lý `204 No Content`) cũng nhận đúng protocol version, thay vì phải vá hai chỗ.

**Chi phí phải chấp nhận, nêu rõ để không ai bất ngờ về sau:**

- Đây là thay đổi trên thư viện bên thứ ba. Phải kiểm tra lại **mỗi lần nâng SDK Expo** — nếu upstream sửa file đó, patch sẽ xung đột và build sẽ báo lỗi.
- CI bắt buộc chạy `patch-package` (qua script `postinstall`).
- iOS sau này cần bản vá tương đương bên Swift.
- Kết luận trung thực của POC là: *hot update qua CDN GitHub thuần chạy được, với điều kiện vá một dòng trong `expo-updates`* — không phải "chạy được nguyên trạng".

Nếu chi phí bảo trì này trở nên phiền, phương án Cloudflare Pages dưới đây đã được kiểm chứng và chuyển sang chỉ tốn một dòng cấu hình `baseUrl`.

#### Phương án dự phòng: Cloudflare Pages làm tầng phục vụ

File vẫn nằm trong GitHub (nhánh `gh-pages` là nguồn sự thật và là nơi lưu lịch sử để rollback). Cloudflare Pages đứng trước làm CDN, và nó hỗ trợ file `_headers` đặt header tùy ý — xác nhận từ tài liệu Cloudflare: cho phép header tùy ý, không giới hạn ở header bảo mật; trần 100 rule, 2000 ký tự mỗi dòng.

`_headers` ở gốc site chỉ cần:

```
/*
  expo-protocol-version: 1
```

Tinh thần "không có logic phía server" của thiết kế được giữ nguyên: Cloudflare Pages là host tĩnh, y hệt GitHub Pages, chỉ khác ở chỗ cho phép khai báo header bằng một file cấu hình. Không viết một dòng code server nào.

Phát hành bằng `wrangler pages deploy site/`, tức tải trực tiếp từ máy hoặc từ CI — không cần cấp quyền OAuth cho Cloudflare truy cập repo GitHub.

**Những gì KHÔNG đổi:** cây thư mục tĩnh, gating theo path, `store/` content-addressed, định dạng manifest, cơ chế rollback, toàn bộ bộ tool publish. Chỉ đổi tên miền gốc trong cấu hình và thêm một file `_headers`.

**Hệ quả với `update.config.json`:** `baseUrl` không còn suy ra được từ `githubUser` + `repoName`, nên nó trở thành một trường khai báo tường minh.

### 2.4 Cơ chế "không có update mới"

Server động trả `204 No Content`. Host tĩnh luôn trả 200 kèm manifest.

Điều này vẫn đúng đắn: client so `id` trong manifest với `id` của bản đang chạy, và bỏ qua nếu trùng. Không có request thừa nào ngoài chính việc tải `manifest.json` (một file nhỏ).

## 3. Kiến trúc

### 3.0 Tham số cấu hình

Trong toàn bộ tài liệu, `<user>` và `expo-app-update` là chỗ dành cho tài khoản GitHub và tên repo thực tế. Chúng là tham số cấu hình, không phải hạng mục còn bỏ ngỏ — chốt giá trị cụ thể ở bước khởi tạo repo và đặt tập trung tại một chỗ duy nhất (`app.config.js` cho phía app, biến môi trường cho phía tooling) để không rải rác trong code.

### 3.1 Ba thành phần

| Thành phần | Vị trí | Trách nhiệm | Phụ thuộc |
|---|---|---|---|
| App Expo | nhánh `main` | Chạy app, UI quan sát và điều khiển update | `expo-updates` |
| Bộ publish | `tools/` trên `main` | Biến output `expo export` thành cây tĩnh đúng giao thức | output `expo export` |
| Update site | nhánh `gh-pages` | Host tĩnh thuần, không logic | không |

Nguyên tắc trung tâm: **update site không chứa logic nào**. Mọi quyết định "thiết bị nào nhận bản nào" được đóng băng thành đường dẫn tại thời điểm publish. Đây chính là lý do một host tĩnh làm được việc này.

Dùng một repo duy nhất, hai nhánh. `gh-pages` được cấu hình làm nguồn cho GitHub Pages.

### 3.2 Bố cục thư mục trên `gh-pages`

```
/.nojekyll
/<channel>/<runtimeVersion>/<platform>/manifest.json
/<channel>/<runtimeVersion>/<platform>/releases.json
/store/<sha256>.js            ← launch asset (Hermes bytecode)
/store/<sha256>.<ext>         ← asset (png, ttf, ...)
```

Ví dụ URL manifest mà app trỏ tới:

```
https://<user>.github.io/expo-app-update/production/1.0.0/android/manifest.json
```

#### Quyết định A: `store/` content-addressed, dùng chung toàn cục

Tên file bằng SHA-256 của nội dung, không phân theo channel hay runtimeVersion.

Lý do và hệ quả:

- Publish chỉ upload file thực sự thay đổi. Sửa một dòng JS thì chỉ thêm một bundle; toàn bộ ảnh và font được tái sử dụng.
- **Rollback gần như miễn phí**: bundle cũ vẫn nằm nguyên trong `store/`, rollback chỉ là ghi lại `manifest.json` để trỏ về nó. Không build lại, không upload lại.
- File nội dung không bao giờ bị ghi đè, nên CDN cache vĩnh viễn cũng vô hại. `manifest.json` là file duy nhất bị ghi đè và là file duy nhất chịu độ trễ cache.

#### Quyết định B: gating bằng path, không bằng header

Một bản build native chỉ biết đúng một URL, được nhúng lúc build. Nó **không có đường nào** để nhìn thấy bundle thuộc runtimeVersion khác.

Version gating do đó là một bất biến cấu trúc, không phải một phép kiểm tra tại runtime có thể sai sót. Đây là điểm mà thiết kế tĩnh mạnh hơn thiết kế dựa trên header.

#### Bắt buộc: `.nojekyll`

GitHub Pages chạy Jekyll mặc định và **bỏ qua mọi file hoặc thư mục bắt đầu bằng `_`**. Thiếu file này thì một phần output biến mất im lặng, không có thông báo lỗi. Bố cục `store/` hiện tại đã làm phẳng tên file nên không có thư mục `_`, nhưng vẫn giữ `.nojekyll` để phòng thay đổi về sau.

### 3.3 Định dạng manifest

Tuân theo Expo Updates protocol v1, đối chiếu với server mẫu chính thức `expo/custom-expo-updates-server`.

```jsonc
{
  "id": "<UUID>",
  "createdAt": "<ISO-8601>",
  "runtimeVersion": "1.0.0",
  "launchAsset": {
    "hash": "<sha256, base64url>",
    "key": "<md5 hex>",
    "contentType": "application/javascript",
    "url": "https://<user>.github.io/expo-app-update/store/<sha256>.js"
  },
  "assets": [
    {
      "hash": "<sha256, base64url>",
      "key": "<md5 hex>",
      "contentType": "image/png",
      "fileExtension": ".png",
      "url": "https://<user>.github.io/expo-app-update/store/<sha256>.png"
    }
  ],
  "metadata": {},
  "extra": { "expoClient": { /* nội dung expoConfig.json */ } }
}
```

Quy tắc cần chính xác tuyệt đối, sai là client từ chối update:

- `hash`: SHA-256 mã hóa **base64url** — base64 tiêu chuẩn rồi đổi `+`→`-`, `/`→`_`, bỏ ký tự đệm `=`. Client verify hash sau khi tải, nên đây cũng là lớp phát hiện file hỏng hoặc CDN trả sai nội dung.
- `key`: MD5 dạng hex.
- `fileExtension`: có dấu chấm đứng đầu.
- `id`: phải ở **dạng UUID** (8-4-4-4-12). Dẫn xuất tất định từ SHA-256 của `metadata.json` rồi format lại. Tính tất định quan trọng vì `id` chính là cách client nhận ra "bản này tôi đã chạy rồi".
- Launch asset lưu trong `store/` với đuôi `.js` để `Content-Type` do GitHub Pages trả về khớp với `contentType` khai báo trong manifest.

## 4. Pipeline publish

`tools/publish.ts`, chạy được cả local lẫn trong GitHub Actions.

1. `npx expo export --platform android` → thư mục `dist/`
2. Đọc `dist/metadata.json` để lấy đường dẫn launch bundle và danh sách assets
3. Với mỗi file: tính SHA-256 (base64url) và MD5 (hex), copy vào `store/<sha256>.<ext>`
4. Sinh `manifest.json` theo mục 3.3
5. Cập nhật `releases.json` — lịch sử publish của cặp (channel, runtimeVersion)
6. Sync lên `gh-pages`

### 4.1 Sync phải là merge, không phải replace

Nếu mỗi lần publish xóa sạch nội dung `gh-pages` thì bundle cũ biến mất và rollback chết theo. `store/` chỉ được cộng thêm, không bao giờ bị xóa trong quy trình bình thường.

Cụ thể: checkout `gh-pages`, copy đè phần mới lên, commit. Không dùng cơ chế publish kiểu "xóa và thay toàn bộ".

### 4.2 `releases.json`

```jsonc
{
  "channel": "production",
  "runtimeVersion": "1.0.0",
  "platform": "android",
  "releases": [
    {
      "id": "<UUID>",
      "createdAt": "<ISO-8601>",
      "gitSha": "<commit tạo ra bản này>",
      "launchAssetHash": "<sha256 base64url>",
      "launchAssetUrl": "https://.../store/<sha256>.js",
      "assets": [ /* các entry asset đầy đủ, để dựng lại manifest */ ]
    }
  ]
}
```

Đây là dữ liệu để rollback dựng lại manifest cũ mà không cần build lại. Mọi thứ cần thiết đều đã có trong entry.

### 4.3 GitHub Actions

**`publish.yml`** — trigger `workflow_dispatch` (input: `channel`, `runtimeVersion`) và push lên `main`. Chạy `tools/publish.ts`, commit kết quả lên `gh-pages`.

**`rollback.yml`** — trigger `workflow_dispatch` (input: `channel`, `runtimeVersion`, `targetUpdateId`). Đọc `releases.json`, dựng lại manifest trỏ về bản chỉ định, ghi đè `manifest.json`, append entry mới vào `releases.json`.

### 4.4 Chi tiết then chốt: rollback phải phát hành như update mới

Client ghi nhớ `id` của các bản đã chạy, **và ghi nhớ cả `id` của bản đã fail**. Nếu rollback trả lại nguyên manifest cũ, client sẽ bỏ qua nó — hoặc tệ hơn, coi nó là bản đã bị đánh dấu lỗi.

Vì vậy rollback phát hành bản cũ như một update mới: giữ nguyên `launchAsset` và `assets`, nhưng cấp `id` mới và `createdAt` mới. Ghi rõ trong `releases.json` rằng entry này là rollback và trỏ tới entry gốc nào.

## 5. Phía app

### 5.1 Cấu hình

`app.config.js` (không dùng `app.json` tĩnh, vì cần đọc biến môi trường):

```js
const channel = process.env.UPDATE_CHANNEL ?? 'production';
const runtimeVersion = '1.0.0';
const platform = process.env.EAS_BUILD_PLATFORM ?? 'android';
const base = 'https://<user>.github.io/expo-app-update';

// updates.url = `${base}/${channel}/${runtimeVersion}/${platform}/manifest.json`
```

- `runtimeVersion`: chuỗi cố định, tăng thủ công khi thay đổi native. Cố ý không dùng policy `appVersion`, để kịch bản demo gating được rõ ràng và có kiểm soát.
- `updates.checkAutomatically`: `ON_LOAD`
- `updates.fallbackToCacheTimeout`: `0` — không chặn khởi động; bản mới được áp dụng ở lần mở app kế tiếp hoặc khi gọi `reloadAsync()` thủ công.

### 5.2 Màn hình POC

Một màn hình duy nhất, đóng vai bảng điều khiển:

- **Banner phiên bản**: khối chữ lớn kèm màu nền, sửa một dòng là đổi. Đây là tín hiệu thị giác để biết ngay bundle nào đang chạy.
- **Một ảnh và một font tùy chỉnh**: chứng minh asset thực sự được cập nhật, không chỉ mỗi JS.
- **Thông tin runtime** từ `useUpdates()`: `currentlyRunning.updateId`, `createdAt`, `channel`, `runtimeVersion`, `isEmbeddedLaunch`.
- **Nút thủ công**: `checkForUpdateAsync()`, `fetchUpdateAsync()`, `reloadAsync()`.
- **Nhật ký sự kiện**: hiển thị các trạng thái từ `useUpdates()` để quan sát được toàn bộ vòng đời update.

## 6. Rollback

Ba lớp, hai lớp nằm trong phạm vi POC.

| Lớp | Cơ chế | Trạng thái |
|---|---|---|
| L1 — tự động | App crash lúc khởi động → `expo-updates` đánh dấu bản lỗi và quay về bản trước hoặc bản embedded | Có sẵn trong thư viện, không cần viết code |
| L2 — thủ công | Workflow `rollback.yml` phát hành lại bundle cũ như update mới | Cơ chế rollback vận hành chính |
| L3 — directive | `rollBackToEmbedded` | **Ngoài phạm vi** — host tĩnh không gửi được directive (mục 2.3) |

L1 hoạt động được là điều kiện tiên quyết để mục 7 giữ nguyên quyết định của nó.

## 7. Channel và version gating

Channel là một đoạn trong đường dẫn, chốt lúc build native qua biến môi trường `UPDATE_CHANNEL`.

### Quyết định có đánh đổi: không hỗ trợ đổi channel lúc runtime

Đổi channel tại runtime cần `Updates.setUpdateURLAndRequestHeadersOverride()`, mà API này bắt buộc bật cờ `disableAntiBrickingMeasures` trong app config. Cờ đó vô hiệu hóa embedded update, và do đó vô hiệu hóa chính cơ chế rollback tự động L1.

Rollback là một trong bốn yêu cầu của POC; channel-surfing thì không. Nên giữ rollback, bỏ channel-surfing. Channel cố định tại thời điểm build.

## 8. Nghiệm thu

### 8.1 Unit test

Chỉ `tools/` có logic thuần túy, nên đây là nơi duy nhất cần unit test tự động:

- Mã hóa hash đúng chuẩn base64url (kiểm cả trường hợp có ký tự `+` và `/` trong base64 gốc)
- `id` sinh ra đúng dạng UUID và có tính tất định
- Manifest sinh ra khớp shape ở mục 3.3
- Merge `store/` không làm mất file đã có
- Dựng lại manifest từ một entry `releases.json` cho ra `launchAsset` và `assets` đúng như bản gốc

### 8.2 Kịch bản E2E thủ công

Mỗi kịch bản ứng đúng một yêu cầu ở mục 1.

1. **Update JS** — đổi banner, publish, mở lại app, thấy banner mới
2. **Update asset** — đổi ảnh và font, publish, thấy ảnh và font mới
3. **Rollback tự động (L1)** — publish một bundle cố ý throw ở top-level module, app crash lúc khởi động, tự quay về bản cũ
4. **Rollback thủ công (L2)** — chạy `rollback.yml`, app nhận về bản được chỉ định
5. **Gating** — publish vào `runtimeVersion` khác với bản build đang chạy, xác nhận app không nhận được gì

## 9. Rủi ro

| Rủi ro | Ảnh hưởng | Xử lý |
|---|---|---|
| Lỗi tải asset khi host trên GitHub Pages (có báo cáo trong expo/expo discussion #16859) | Có thể phá vỡ toàn bộ thiết kế | **Spike ở bước đầu tiên** của kế hoạch: publish một update tối giản, xác nhận Android tải được cả bundle lẫn một asset từ Pages, trước khi xây bất cứ thứ gì khác |
| CDN của GitHub Pages cache `manifest.json` khoảng 10 phút | Độ trễ phát hành | Chấp nhận với POC. Ghi rõ trong README. `store/` không bị ảnh hưởng vì content-addressed |
| `id` không đúng dạng UUID khiến client từ chối im lặng | Update không bao giờ được áp dụng, khó chẩn đoán | Đưa vào unit test; kiểm ngay trong spike |
| Sai encoding hash (base64 thường thay vì base64url) | Client tải xong rồi từ chối vì hash không khớp | Đưa vào unit test, gồm cả ca có `+` và `/` |
| Quên `.nojekyll` | File bị Jekyll nuốt im lặng | Tạo ngay ở bước khởi tạo `gh-pages` |

## 10. Tài liệu tham khảo

- [Expo Updates v1 protocol spec](https://docs.expo.dev/technical-specs/expo-updates-1/)
- [`FileDownloader.kt` — expo/expo](https://github.com/expo/expo/blob/main/packages/expo-updates/android/src/main/java/expo/modules/updates/loader/FileDownloader.kt)
- [expo/custom-expo-updates-server](https://github.com/expo/custom-expo-updates-server)
- [Override update configuration at runtime](https://docs.expo.dev/eas-update/override/)
- [Custom updates server — Expo docs](https://docs.expo.dev/distribution/custom-updates-server/)
- [expo/expo discussion #16859 — lỗi tải asset khi self-host](https://github.com/expo/expo/discussions/16859)
