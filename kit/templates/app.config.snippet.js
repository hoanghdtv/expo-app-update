// Mẫu app.config.js cho dự án đích.
//
// Nếu dự án đang dùng app.json: PHẢI chuyển sang app.config.js. Bộ tool đọc
// cấu hình Expo bằng cách import() file này (tools/expo-config.ts), và
// update.config.json phải là nguồn duy nhất sinh ra URL manifest — app.json
// tĩnh không làm được điều đó.
//
// Cách chuyển: xóa app.json, bê nguyên nội dung khóa "expo" của nó vào chỗ
// `...expoCuaBan` bên dưới, rồi thêm khối `updates` và `runtimeVersion`.

const cfg = require('./update.config.json');

const BASE_URL = cfg.baseUrl.replace(/\/$/, '');

module.exports = {
  expo: {
    // ---- giữ nguyên toàn bộ cấu hình sẵn có của dự án ở đây ----
    name: 'ten-app',
    slug: 'slug-app',
    version: '1.0.0',
    android: { package: 'com.example.app' },
    // -------------------------------------------------------------

    // runtimeVersion cố ý là CHUỖI lấy từ update.config.json, không dùng
    // policy kiểu { policy: 'appVersion' }. Lý do: publish và app phải chốt
    // cùng một giá trị tại cùng một chỗ, nếu không manifest sẽ nằm ở path mà
    // app không bao giờ hỏi tới — và lỗi đó hoàn toàn im lặng.
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
