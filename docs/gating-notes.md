# Quan sát gating theo runtimeVersion và channel

Kết quả chạy kịch bản E2E #5a và #5b trên thiết bị, ngày 2026-09-07. Đọc cùng spec mục 3.2 (quyết định B: gating bằng path, không bằng header) và mục 7.

**Môi trường**: Android emulator `Resizable_Experimental` (Android 16 / API 36), bản build `release` tạo ở Task 1 với `channel = production`, `runtimeVersion = 1.0.0`.

## Vì sao phép thử này là bằng chứng cấu trúc, không phải phép kiểm tra runtime

Giá trị channel và runtimeVersion được **đóng băng vào bản build native**, không phải gửi kèm mỗi request. Kiểm chứng trực tiếp trong thư mục `android/` do prebuild sinh ra:

```
android/app/src/main/AndroidManifest.xml
  <meta-data android:name="expo.modules.updates.EXPO_UPDATE_URL"
             android:value="https://hoanghdtv.github.io/expo-app-update/production/1.0.0/android/manifest.json"/>

android/app/src/main/res/values/strings.xml
  <string name="expo_runtime_version">1.0.0</string>
```

App chỉ biết đúng **một** URL. Nó không có tham số, không có header, không có nhánh code nào để hỏi sang đường dẫn khác. Vì vậy gating ở đây không phải một phép so sánh có thể sai sót lúc chạy, mà là một bất biến: bản build này **không có khả năng** nhìn thấy bundle nằm ở path khác.

Hai kịch bản dưới đây kiểm chứng bất biến đó bằng quan sát thực tế.

## E2E #5a — version gating

Publish vào một runtimeVersion khác, với banner khác hẳn (`v5 — RUNTIME 2.0.0`, nền xanh lá) để nếu gating rò rỉ thì nhìn là thấy ngay.

| | |
|---|---|
| Đường dẫn publish | `production/2.0.0/android/manifest.json` |
| Update id | `c014988e-a743-868f-a02c-444ebd11e608` |
| URL app đang hỏi | `production/1.0.0/android/manifest.json` |
| Bản app đang chạy | `b5f43b51-076f-b51e-2216-0872eeda51e9` (`v4 — BAN LANH`) |

**Kết quả**: bấm "Kiểm tra update" hai lần (12:40:07 và 12:41:20 UTC) → **`available=false`** cả hai lần. Banner vẫn là `v4` màu tím; bản `v5` màu xanh không hề xuất hiện.

## E2E #5b — channel gating

Publish vào channel khác, cùng runtimeVersion `1.0.0`, banner `v6 — CHANNEL STAGING` nền cam.

| | |
|---|---|
| Đường dẫn publish | `staging/1.0.0/android/manifest.json` |
| Update id | `512944a1-a526-4ea9-880e-a4394369e868` |
| Channel của bản build | `production` |

**Kết quả**: bấm "Kiểm tra update" hai lần (12:42:44 và 12:42:52 UTC) → **`available=false`** cả hai lần. Banner vẫn `v4`, không có bản cam nào.

## Ba đường dẫn cùng tồn tại, độc lập nhau

```
production/1.0.0   HTTP 200   id b5f43b51   rv 1.0.0
production/2.0.0   HTTP 200   id c014988e   rv 2.0.0
staging/1.0.0      HTTP 200   id 512944a1   rv 1.0.0
```

Cả ba đều phục vụ được, ba `id` khác nhau. Nói cách khác `available=false` **không phải** vì bản mới chưa lên — nó lên rồi, chỉ là app không có đường tới.

## Store dùng chung — đo được, không phải suy đoán

Mỗi lần publish sang path mới chỉ thêm **đúng một file** vào `store/`:

| Commit | Nội dung thêm vào |
|---|---|
| `8f35834` (2.0.0) | 1 bundle JS mới + 2 file JSON |
| `457b239` (staging) | 1 bundle JS mới + 2 file JSON |

Toàn bộ **19 asset** (18 font `.ttf` + 1 ảnh `.png`) được tái sử dụng nguyên vẹn từ `store/` đã có, không tải lên lại lần nào. Đây là bằng chứng cho thiết kế content-addressed dùng chung giữa mọi channel và runtimeVersion (spec mục 3.2).

## Hai điều cần nhớ khi vận hành

1. **Đổi channel hay runtimeVersion trong `update.config.json` không tác động tới app đã cài.** Nó chỉ đổi *nơi publish tới*. Muốn một thiết bị chuyển sang channel khác thì phải build lại native và cài lại — không có đường tắt lúc runtime (lý do đầy đủ ở README mục 10).

2. **Publish nhầm channel là một lỗi im lặng.** Nếu quên đổi `update.config.json` về `production`, bản phát hành sẽ nằm ở `staging/` và không thiết bị nào nhận được, mà cũng **không có thông báo lỗi nào** — CI chạy xanh, file lên đúng chỗ, chỉ là sai chỗ. Sau mỗi lần publish nên kiểm tra lại `id` tại chính đường dẫn mà bản build đang hỏi:

   ```bash
   curl -sS https://hoanghdtv.github.io/expo-app-update/production/1.0.0/android/manifest.json | grep -o '"id":"[^"]*"'
   ```

## Ghi chú về kế hoạch gốc

Task 9 Step 3 trong file kế hoạch dùng URL `https://expo-app-update.pages.dev/...` — đó là dấu vết của giai đoạn kiến trúc dùng Cloudflare Pages, đã bị lật lại sau đó (spec mục 2.3b). Host thực tế là `hoanghdtv.github.io`; các lệnh trên đã dùng URL đúng.
