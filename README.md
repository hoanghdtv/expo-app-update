# expo-app-update — POC hot update qua CDN GitHub

POC chứng minh cơ chế hot update (OTA) cho app Expo (Android), với toàn bộ hạ tầng phát hành nằm trên GitHub — không dùng EAS Update, không dùng bất kỳ máy chủ động nào khác.

Tài liệu này viết cho người tiếp quản dự án mà không có mặt tác giả ban đầu. Đọc hết trước khi build, publish hay rollback lần đầu — đặc biệt mục "Bản vá `expo-updates`" bên dưới, đó là điểm dễ hỏng nhất.

## 1. Kiến trúc

Repo dùng một repo, hai nhánh: `main` chứa app Expo và bộ công cụ publish (`tools/`), `gh-pages` là **update site** — một cây thư mục tĩnh thuần, không có logic gì cả (host trên GitHub Pages tại `https://hoanghdtv.github.io/expo-app-update`). Mọi quyết định "thiết bị nào nhận bản nào" (channel, runtimeVersion, platform) được đóng băng thành **đường dẫn URL** tại thời điểm publish, vì client build sẵn không có cách nào gửi các thông tin đó qua request header tới một host tĩnh. Bundle và asset được lưu content-addressed trong `store/<sha256>.<ext>`, dùng chung cho mọi channel/runtimeVersion, nên rollback gần như miễn phí (không build lại, chỉ ghi lại `manifest.json`).

Thiết kế đầy đủ, kể cả các giới hạn cứng đã kiểm chứng và các quyết định có đánh đổi, nằm ở [`docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md`](docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md). Đọc file đó trước khi thay đổi kiến trúc.

## 2. `update.config.json` là nguồn sự thật duy nhất

```json
{
  "githubUser": "hoanghdtv",
  "repoName": "expo-app-update",
  "baseUrl": "https://hoanghdtv.github.io/expo-app-update",
  "channel": "production",
  "runtimeVersion": "1.0.0",
  "platform": "android"
}
```

Cả `app.config.js` (native build) lẫn toàn bộ `tools/` (publish, rollback) đều đọc trực tiếp từ file này. **Muốn đổi channel hay runtimeVersion, sửa file này** — không có biến môi trường nào thay thế được nó.

Đây là quyết định có chủ đích, không phải thiếu sót: cú pháp đặt biến môi trường trước lệnh (`UPDATE_CHANNEL=x npm run ...`) chỉ chạy trên bash, không chạy trên PowerShell hay `cmd.exe`. Dự án này chạy trên Windows, nên một file JSON tường minh là cách duy nhất không phụ thuộc shell.

Đổi `channel`/`runtimeVersion` trong `update.config.json` rồi build lại native (`app.config.js` nhúng URL manifest vào bản build) là cách duy nhất đổi channel — xem thêm mục 10 vì sao không hỗ trợ đổi lúc runtime.

**Cảnh báo vận hành:** sửa file này chỉ đổi *nơi publish tới*, không tác động gì tới app đã cài. Publish nhầm channel hoặc nhầm runtimeVersion là một **lỗi hoàn toàn im lặng** — CI chạy xanh, file lên đúng chỗ nó được bảo, chỉ là không thiết bị nào nhận được. Sau mỗi lần publish, kiểm tra lại `id` tại chính đường dẫn mà bản build đang hỏi:

```bash
curl -sS https://hoanghdtv.github.io/expo-app-update/production/1.0.0/android/manifest.json | grep -o '"id":"[^"]*"'
```

Bằng chứng gating hoạt động (đã kiểm chứng trên thiết bị) nằm ở [`docs/gating-notes.md`](docs/gating-notes.md).

## 3. Bản vá `expo-updates` — đọc kỹ mục này

### Vì sao cần vá

Client `expo-updates` (Android) **bắt buộc** nhận được response header `expo-protocol-version` trên mọi response manifest, không có cờ cấu hình nào tắt được yêu cầu này. GitHub Pages là host tĩnh thuần túy: nó đặt `Content-Type` theo phần mở rộng file và **không có cách nào đặt thêm header tùy chỉnh**. Do đó mọi response manifest từ GitHub Pages thiếu đúng header mà client đòi hỏi, và app sẽ ném lỗi ngay khi cố tải update.

### Bản vá làm gì

File [`patches/expo-updates+57.0.21.patch`](patches/expo-updates+57.0.21.patch), áp bằng `patch-package` (chạy tự động qua script `postinstall`), sửa một dòng trong `ResponseHeaderData.kt`:

```diff
- val protocolVersion = protocolVersionRaw?.let { Integer.valueOf(it) }
+ val protocolVersion = protocolVersionRaw?.let { Integer.valueOf(it) } ?: 1
```

Nói cách khác: nếu response không có header `expo-protocol-version`, mặc định coi đó là protocol v1 thay vì `null`.

### Vì sao chấp nhận được, không phải một mẹo lách luật

Chốt chặn gốc nằm ở `UpdateFactory.kt` (`node_modules/expo-updates/android/.../manifest/UpdateFactory.kt`):

```kotlin
when (val expoProtocolVersion = responseHeaderData.protocolVersion) {
  null -> { throw Exception("Legacy manifests are no longer supported") }
  0, 1 -> { ... }
}
```

Ngay phía trên dòng `throw` đó, chính Expo để lại comment:

```kotlin
// TODO(wschurman): remove error in a few major releases after SDK 51
// when it's unlikely classic updates may erroneously be served
```

Chốt chặn này tồn tại để chặn *classic manifest* (định dạng thời trước SDK 50) bị phục vụ nhầm — không phải vì giao thức thật sự đòi hỏi header đó cho manifest v1. Manifest mà `tools/publish.ts` sinh ra là manifest v1 thật, đúng shape theo protocol spec. `expo-updates` cũng được biên dịch từ mã nguồn Kotlin lúc build (không phải AAR dựng sẵn), nên sửa file này có tác dụng thật và `patch-package` giữ được thay đổi qua mỗi lần `npm install`.

### Bán kính ảnh hưởng — đọc trước khi tưởng đây chỉ là một dòng vô hại

`protocolVersion` được đọc ở **hai nơi** trong `expo-updates`, không chỉ ở `UpdateFactory.kt`:

1. `UpdateFactory.kt` — nơi ta cần vá.
2. `FileDownloader.kt` — nhánh xử lý response `204 No Content`, với điều kiện `protocolVersion != null && > 0`.

Vì bản vá đặt tại `ResponseHeaderData.kt` (điểm chuyển đổi header thô sang số, dùng chung cho cả hai nơi đọc), nó cũng đổi ngữ nghĩa nhánh 204: trước đây một response rỗng bất thường (lỗi mạng, CDN trả sai) sẽ ném lỗi rõ ràng vì `protocolVersion` là `null`; sau bản vá nó bị coi là "không có update mới" và im lặng bỏ qua.

Với kiến trúc hiện tại đây là **đường chết** — GitHub Pages luôn trả `200 OK` kèm body, không bao giờ trả `204`. Nhưng nếu sau này đổi sang một server thật có thể trả `204`, cân nhắc vá tại `UpdateFactory.kt` thay vì ở `ResponseHeaderData.kt` để tránh đổi ngữ nghĩa nhánh 204.

### Bảo trì

- **Phải kiểm lại bản vá mỗi lần nâng cấp SDK Expo.** Nếu upstream sửa `ResponseHeaderData.kt`, patch sẽ xung đột (`patch-package` sẽ báo lỗi khi apply) và build sẽ dừng lại cho tới khi vá lại thủ công.
- CI (cả hai workflow) chạy một bước xác minh ngay sau `npm ci` để đảm bảo patch không âm thầm biến mất — xem mục "Qua CI" bên dưới.
- **iOS** chưa nằm trong phạm vi POC, nhưng khi mở rộng sẽ cần một bản vá tương đương ở phía Swift (cùng vấn đề: client iOS cũng đòi header đó).

## 4. Cách build

```bash
npx expo run:android --variant release
```

**Không dùng bản debug để kiểm thử hot update.** Bản debug (`expo run:android` mặc định, hoặc `expo start`) nạp JavaScript trực tiếp từ Metro bundler qua kết nối dev, và **bỏ qua hoàn toàn `expo-updates`** — app không bao giờ gọi tới `manifest.json`, nên mọi hành vi publish/rollback đều vô hình đối với bản debug. Chỉ bản `release` (dùng bundle đã đóng gói, chạy qua `expo-updates` thật) mới phản ánh đúng hành vi OTA.

## 5. Cách publish

### Thủ công

```bash
npm run export:android    # expo export --platform android → dist/, kèm expoConfig.json
npm run publish:update    # đọc dist/, sinh store/ + manifest.json + releases.json vào site/
```

`site/` là một **git worktree** trỏ tới nhánh `gh-pages`. Worktree không đi kèm khi clone repo — máy mới phải tự tạo một lần:

```bash
git fetch origin gh-pages
git worktree add site gh-pages
```

Kiểm tra bằng `git worktree list`: phải thấy `site/` gắn với `gh-pages`. Thiếu bước này thì `npm run publish:update` sẽ ghi vào một thư mục `site/` thường, không nằm trong nhánh nào, và không có gì để push.

Sau khi `publish:update` chạy xong, commit và push trong `site/`:

```bash
cd site
git add -A
git commit -m "publish: <channel> <runtimeVersion>"
git push
cd ..
```

`npm run publish:update` chỉ ghi file vào `site/` — nó **không tự commit hay push**. Đừng quên bước này, nếu không update sẽ chỉ tồn tại trên máy local.

### Qua CI

Workflow [`.github/workflows/publish.yml`](.github/workflows/publish.yml), trigger bằng tay:

```bash
gh workflow run "Publish update" -f channel=production -f runtimeVersion=1.0.0
gh run watch
```

Workflow checkout `main` và `gh-pages` (vào thư mục `site/`) trong cùng một job — **cố ý dùng hai lần `actions/checkout`**, không dùng action publish kiểu "xóa và thay toàn bộ". Lý do: `store/` phải được cộng dồn (merge), không bao giờ bị xóa, nếu không rollback sẽ mất dữ liệu để dựng lại bản cũ (xem mục 4.1 của spec thiết kế).

Ngay sau `npm ci`, workflow chạy một bước xác minh patch:

```yaml
- name: Xác minh bản vá expo-updates đã được áp
  run: grep -q "?: 1" node_modules/expo-updates/android/src/main/java/expo/modules/updates/manifest/ResponseHeaderData.kt
```

Đây là điểm hỏng nguy hiểm nhất của kiến trúc hiện tại: nếu vì lý do gì đó `patch-package` không áp được patch (ví dụ patch xung đột sau khi nâng SDK), job phải dừng lại ngay ở đây thay vì publish ra một manifest mà không thiết bị nào tải được — lỗi đó sẽ hoàn toàn im lặng phía client (xem mục 3).

## 6. Cách rollback

1. Đọc `site/<channel>/<runtimeVersion>/<platform>/releases.json`, tìm `id` của bản muốn quay về.
2. Chạy:

```bash
npm run rollback:update -- <updateId>
```

(id truyền qua **tham số dòng lệnh**, không phải biến môi trường — cùng lý do nêu ở mục 2.)

3. Commit và push trong `site/` như khi publish. Hoặc qua CI: [`.github/workflows/rollback.yml`](.github/workflows/rollback.yml), trigger bằng `gh workflow run "Rollback update" -f channel=... -f runtimeVersion=... -f targetUpdateId=...`.

### Vì sao rollback phát hành bản cũ như một update MỚI

Client `expo-updates` ghi nhớ `id` của các bản đã từng chạy thành công, **và ghi nhớ cả `id` của các bản đã bị đánh dấu lỗi** (crash lúc khởi động → rollback tự động L1). Nếu rollback chỉ đơn giản ghi lại y nguyên manifest cũ (cùng `id`), client sẽ bỏ qua nó vì tưởng đã chạy rồi — hoặc tệ hơn, nếu bản đó từng bị đánh dấu lỗi, client sẽ từ chối nó thẳng tay.

Vì vậy `tools/rollback.ts` giữ nguyên `launchAsset` và `assets` của bản cũ (không build lại, không upload lại — đây là lý do `store/` content-addressed khiến rollback gần như miễn phí) nhưng cấp một `id` mới (dẫn xuất tất định từ `id` gốc + thời điểm rollback) và `createdAt` mới. Với client, đây là một update hoàn toàn mới cần tải về, dù nội dung giống hệt bản đã chạy trước đó.

Đã kiểm chứng trên thiết bị: commit rollback chỉ đụng **hai file JSON**, không thêm byte nào vào `store/`, và app nhận bản rollback dưới một `id` mới rồi chạy đúng nội dung cũ. Chi tiết ở [`docs/rollback-notes.md`](docs/rollback-notes.md).

### Rollback KHÔNG tức thì — đọc trước khi coi đây là nút cứu hoả

Ba điều đo được khi chạy thật, không có cái nào hiển nhiên từ tài liệu Expo:

1. **Bản rollback mất 6–9 phút mới tới thiết bị.** Nguyên nhân là cache edge của GitHub Pages (mục 7), và **không có cách nào ép nó hết hạn sớm**. Nếu yêu cầu vận hành là "gỡ bản hỏng trong vài phút", kiến trúc host tĩnh hiện tại không đáp ứng được — đó là lúc dùng đường lui Cloudflare Pages ở mục 9, nơi đặt được `Cache-Control` riêng cho `manifest.json`.

2. **Rollback tự động L1 không vô hình với người dùng.** Khi bundle crash lúc khởi động, `expo-updates` đúng là tự quay về bản OTA lành trước đó (không phải bản embedded), nhưng **phải mở lại app hai lần** mới thấy giao diện: lần mở đầu tiên sau crash vẫn là màn hình trắng, dù log đã ghi `UpdatesErrorRecovery: falling back to older update`.

3. **L1 không tự dọn nguồn lỗi.** Chừng nào `manifest.json` trên server còn trỏ bản hỏng, mỗi lần khởi động app lại tải nó về. L1 chỉ giữ cho app chạy được; muốn dứt điểm buộc phải publish bản lành hoặc chạy rollback L2. Đừng thấy app "tự khỏi" mà tưởng sự cố đã xong.

`isEmergencyLaunch` **không** bật `true` trong kịch bản này — đừng dùng cờ đó để phát hiện rollback L1 đã xảy ra.

## 7. Độ trễ CDN ~10 phút — đúng thiết kế, không phải lỗi

Sau khi publish, có thể mất tới khoảng 10 phút để thiết bị nhận được `manifest.json` mới. Đây là hành vi đúng thiết kế của GitHub Pages, không phải một lỗi cần vá:

- GitHub Pages trả `Cache-Control: max-age=600` trên các response tĩnh.
- Đây là cache **theo edge của server**, không phải cache trên thiết bị. Số đo trong một phiên kiểm thử, tính từ lúc `git push` tới lúc thấy manifest mới:

  | Lần publish | Máy chạy `curl` thấy sau | Thiết bị thấy sau |
  |---|---|---|
  | bản lành v4 | 16 giây | 451 giây |
  | bản hỏng | < 150 giây | 541 giây |
  | rollback | — | 361 giây |

  Chênh lệch này là cái bẫy lớn nhất khi kiểm thử: **`curl` từ máy bạn thấy bản mới không có nghĩa là thiết bị thấy**. Đừng kết luận "publish hỏng" trước khi đợi đủ 10 phút.

`store/` không bị ảnh hưởng bởi độ trễ này vì nó content-addressed và không bao giờ bị ghi đè — chỉ `manifest.json` (file duy nhất bị ghi đè mỗi lần publish) chịu độ trễ cache.

**Mẹo vận hành:** đừng chờ CDN tự hết hạn khi cần kiểm tra ngay sau publish. Dùng nút bấm thủ công trên màn hình POC của app (`checkForUpdateAsync()` → `fetchUpdateAsync()` → `reloadAsync()`) để ép app hỏi lại server ngay lập tức, thay vì đợi chu kỳ `checkAutomatically: ON_LOAD` tiếp theo trùng với lúc CDN vẫn còn cache bản cũ.

## 8. Bài học về dung lượng asset

Dòng import sau trong `src/UpdatePanel.tsx`:

```ts
import { Inter_700Bold } from '@expo-google-fonts/inter';
```

kéo theo **toàn bộ 18 file `.ttf`** của gói `@expo-google-fonts/inter` (tổng cộng 6.217.596 byte) vào mỗi bản export, dù giao diện thực tế chỉ dùng đúng một weight (`Inter_700Bold`). Đây là cách gói font của Expo hoạt động: import một named export kéo theo cả package.

`store/` content-addressed giúp giảm nhẹ vấn đề khi *phát hành lại* — các file font không đổi giữa các lần publish nên chỉ tải lên một lần, các lần publish sau tái sử dụng lại đúng file đã có trong `store/`. Nhưng điều đó không giúp gì cho **thiết bị cài mới** hoặc **thiết bị đổi channel/runtimeVersion lần đầu**: chúng vẫn phải tải đủ cả 18 file trong `manifest.json.assets`, dù chỉ một file thực sự được dùng.

Bài học cho ứng dụng thật (không phải POC): nhúng đúng file `.ttf` của weight cần dùng (ví dụ tải file font trực tiếp thay vì qua `@expo-google-fonts/*`), thay vì import cả package.

## 9. File `site/_headers`

File này tồn tại trong `gh-pages` nhưng **vô tác dụng trên GitHub Pages** — `_headers` là quy ước riêng của Netlify và Cloudflare Pages để khai báo header tùy chỉnh cho response tĩnh, GitHub Pages không đọc file này. Nếu không giải thích, nó trông như rác còn sót lại.

Nó được **giữ lại có chủ đích làm đường lui**: kiến trúc hiện tại chấp nhận chi phí bảo trì bản vá `expo-updates` (mục 3) để giữ toàn bộ hạ tầng thuần GitHub. Nếu chi phí đó về sau trở nên phiền hà hơn lợi ích (ví dụ nâng SDK Expo liên tục làm patch xung đột), phương án dự phòng đã được kiểm chứng là chuyển sang **Cloudflare Pages** làm tầng phục vụ phía trước — nó hỗ trợ `_headers` để đặt `expo-protocol-version: 1` mà không cần vá client. Khi đó chỉ cần đổi một dòng `baseUrl` trong `update.config.json`, `_headers` đã sẵn sàng, không phải viết lại gì khác trong `tools/` hay app.

## 10. Cố ý không hỗ trợ

| Hạng mục | Lý do |
|---|---|
| iOS | Ngoài phạm vi POC. Cần bản vá tương đương phía Swift trước khi mở rộng (xem mục 3). |
| Code signing manifest | Giao thức Expo Updates cho phép bỏ qua (tùy chọn, không bắt buộc). Có thể thêm sau mà không đổi kiến trúc. |
| Directive `rollBackToEmbedded` | Directive chỉ tồn tại trong response `multipart/mixed`. GitHub Pages đặt `Content-Type` theo phần mở rộng file, không cho khai báo tham số `boundary`, nên không thể tạo response multipart hợp lệ trên host tĩnh. Rollback vẫn khả dụng qua cơ chế L1 (tự động, khi app crash lúc khởi động) và L2 (thủ công, `rollback.yml`) — xem mục 6. |
| Đổi channel lúc runtime | Cần gọi `Updates.setUpdateURLAndRequestHeadersOverride()`, mà API này bắt buộc bật cờ `disableAntiBrickingMeasures`. Cờ đó vô hiệu hóa embedded update — tức vô hiệu hóa luôn cơ chế rollback tự động L1. Rollback là một yêu cầu bắt buộc của POC; đổi channel lúc runtime thì không. Channel do đó cố định lúc build native, chỉ đổi được qua `update.config.json` + build lại (mục 2). |

## Tham khảo thêm

- Thiết kế đầy đủ: [`docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md`](docs/superpowers/specs/2026-09-07-expo-github-cdn-hot-update-design.md)
- Kết quả kiểm chứng rollback trên thiết bị: [`docs/rollback-notes.md`](docs/rollback-notes.md)
- Kết quả kiểm chứng gating trên thiết bị: [`docs/gating-notes.md`](docs/gating-notes.md)
- Bản vá: [`patches/expo-updates+57.0.21.patch`](patches/expo-updates+57.0.21.patch)
- Bộ công cụ publish/rollback: [`tools/`](tools/) — chạy test bằng `npm run test:tools`

## Nội dung nhánh `gh-pages`

| Đường dẫn | Là gì |
|---|---|
| `production/1.0.0/android/` | Update site đang phục vụ thật — `manifest.json` + `releases.json` |
| `store/` | Bundle và asset content-addressed, dùng chung mọi channel/runtimeVersion. **Không bao giờ xóa** — rollback dựa vào đây |
| `probe/` | Hai file tĩnh từ bước xác minh hosting ban đầu (Task 1). Giữ lại làm mốc kiểm tra nhanh xem Pages còn phục vụ được không |
| `_headers` | Vô tác dụng trên GitHub Pages — giữ làm đường lui sang Cloudflare Pages, xem mục 9 |
| `.nojekyll` | Bắt buộc: nếu thiếu, Jekyll sẽ nuốt mọi file/thư mục bắt đầu bằng `_` mà không báo lỗi |
