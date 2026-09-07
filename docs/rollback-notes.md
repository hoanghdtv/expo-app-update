# Quan sát rollback trên thiết bị thật

Ghi lại kết quả chạy hai kịch bản rollback trên máy, không phải suy luận từ tài liệu. Đọc cùng README mục 6 (cách vận hành) và spec mục 6 (thiết kế ba lớp).

**Môi trường**: Android emulator `Resizable_Experimental` (`sdk_gphone64_arm64`, Android 16 / API 36), bản build `release` (`npx expo run:android --variant release`), Expo SDK 57, `expo-updates` 57.0.21 đã áp bản vá `patches/expo-updates+57.0.21.patch`. Ngày chạy: 2026-09-07.

## L1 — rollback tự động khi bundle crash lúc khởi động

### Các bản liên quan

| Vai trò | Update id | Ghi chú |
|---|---|---|
| Bản embedded trong APK | `7c453669-aa9d-4417-b212-6bde9e0fe481` | `createdAt 2026-09-07T11:37:49.854Z` |
| Bản lành đang chạy trước khi hỏng | `89ed467c-15c3-1819-dfa7-ff8989ffd39c` | banner `v4 — BAN LANH`, đã tải qua OTA |
| Bản hỏng cố ý | `d2cb9240-97a8-1abc-b69c-decd02e2fcaa` | thêm `throw new Error(...)` ở cấp module trong `src/version.ts` |

### Diễn biến quan sát được

1. **`reloadAsync()` nạp bản hỏng** (vẫn trong tiến trình cũ): màn hình trắng, tiến trình **không chết**. Log: `[runtime not ready]: Error: CRASH CO Y — kiem tra rollback tu dong`, kèm `Invariant Violation: "main" has not been registered`.

2. **Mở lại app lần 1** (`am force-stop` rồi khởi động lại): app vẫn nạp bản hỏng và crash, nhưng lần này `expo-updates` can thiệp. Trình tự log:

   ```
   ErrorRecovery: exception encountered: [runtime not ready]: Error: CRASH CO Y ...
   UpdatesErrorRecovery: attempting to fetch a new update, waiting
   ErrorRecovery: remote load status changed: IDLE
   UpdatesErrorRecovery: falling back to older update
   Updates state change: Restart
   ```

   **Màn hình vẫn trắng sau bước này.** Thư viện có restart React host, nhưng giao diện không dựng lại được trong cùng tiến trình đó.

3. **Mở lại app lần 2**: app chạy bình thường bằng `89ed467c` (`v4 — BAN LANH`), với `isEmbeddedLaunch: false`, `isEmergencyLaunch: false`.

### Kết luận L1

- **L1 hoạt động thật.** App tự thoát khỏi bundle hỏng mà không cần can thiệp từ server, không cần cài lại.
- **Quay về bản OTA trước đó, không phải bản embedded.** `isEmbeddedLaunch: false` chứng minh điều này. Bản embedded chỉ là chốt cuối cùng khi không còn bản OTA lành nào trong cache.
- **`isEmergencyLaunch` không bao giờ bật `true`** trong kịch bản này. Đừng dùng cờ đó làm tín hiệu phát hiện rollback L1 — nó dành cho tình huống khác (lỗi ở tầng khởi tạo native).
- **Phải mở lại app HAI lần mới thấy giao diện lành.** Lần mở đầu tiên sau crash vẫn trắng, dù log cho thấy fallback đã chạy. Với người dùng thật, đây là "app hỏng, tắt mở lại một lần nữa mới chạy" — nghĩa là L1 không phải một cơ chế vô hình.
- **L1 không tự dọn được nguồn lỗi.** Chừng nào `manifest.json` trên server vẫn trỏ bản hỏng, mỗi lần khởi động app lại tải nó về (trạng thái hiện `có bản mới · chờ restart`). L1 chỉ giữ cho app chạy được; muốn dứt điểm phải publish bản lành hoặc chạy rollback L2. Đây chính là lý do L2 tồn tại chứ không thừa.

## L2 — rollback thủ công

Chạy đúng lệnh trong README mục 6:

```bash
npx tsx tools/rollback.ts 89ed467c-15c3-1819-dfa7-ff8989ffd39c
```

Kết quả: phát hành `b5f43b51-076f-b51e-2216-0872eeda51e9`, với `rollbackOf: 89ed467c-...` trong `releases.json`.

Xác minh nội dung manifest mới so với bản gốc:

| Trường | Kết quả |
|---|---|
| `launchAsset` | **giống hệt** bản `89ed467c` (`33d338dc...js`) |
| `assets` (19 file) | **giống hệt** |
| `id` | **mới** — `b5f43b51-...` |
| `createdAt` | mới |

Commit rollback trên `gh-pages` chỉ đụng **hai file JSON** (`manifest.json`, `releases.json`), không thêm một byte nào vào `store/`. Đây là bằng chứng thực nghiệm cho tính chất "rollback gần như miễn phí" của store content-addressed (spec mục 3.2).

### Kết quả trên thiết bị

Sau khi push, bấm "Kiểm tra update" → "Tải update" → "Restart để áp dụng":

- `updateId: b5f43b51-076f-b51e-2216-0872eeda51e9` — **id của bản rollback, không phải `89ed467c`**
- `createdAt: 2026-09-07T12:14:55.341Z`
- Giao diện hiện lại đúng `v4 — BAN LANH`
- `isEmbeddedLaunch: false`, `isEmergencyLaunch: false`
- Trạng thái về `rảnh` — app không còn bị bản hỏng kéo về nữa

**Đây là điểm mấu chốt của thiết kế L2**: client nhận bản rollback như một update hoàn toàn mới cần tải, dù nội dung giống hệt bản nó đã chạy trước đó. Nếu `tools/rollback.ts` giữ nguyên `id` cũ, client sẽ bỏ qua manifest này (nó nhớ id đã chạy) và rollback sẽ im lặng không có tác dụng.

## Độ trễ CDN đo được

Ba lần publish liên tiếp trong cùng phiên, đo từ lúc `git push` tới lúc **emulator** nhìn thấy manifest mới (bấm "Kiểm tra update" mỗi 45 giây):

| Lần publish | Máy chạy `curl` thấy sau | Emulator thấy sau |
|---|---|---|
| v4 bản lành | 16 giây | 451 giây (~7,5 phút) |
| bản hỏng | < 150 giây | 541 giây (~9 phút) |

Hai con số chênh nhau rất xa và đó là điều đáng nhớ nhất: **origin cập nhật gần như tức thì, nhưng edge CDN mà thiết bị kết nối tới giữ bản cũ gần hết `max-age=600`**. Khi kiểm thử, đừng kết luận "publish hỏng" chỉ vì `curl` từ máy thấy bản mới mà thiết bị thì không.

Hệ quả vận hành cho rollback: **một lần rollback khẩn cấp có thể mất tới ~10 phút mới tới được thiết bị người dùng**, và không có cách nào ép edge hết hạn sớm từ phía GitHub Pages. Nếu yêu cầu là "gỡ bản hỏng trong vòng vài phút", kiến trúc host tĩnh hiện tại không đáp ứng được — đó là lúc cân nhắc phương án Cloudflare Pages đã chuẩn bị sẵn (README mục 9), nơi có thể đặt `Cache-Control` ngắn hơn cho riêng `manifest.json`.
