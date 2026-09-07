#!/usr/bin/env bash
# Xác minh bản vá expo-updates đã được áp vào node_modules.
#
# Vì sao cần: GitHub Pages không đặt được header `expo-protocol-version`, mà
# client expo-updates bắt buộc phải có header đó. Bản vá làm nó mặc định coi
# response thiếu header là protocol v1. Nếu patch không được áp (thường là do
# xung đột sau khi nâng SDK), app sẽ KHÔNG tải được update và lỗi hoàn toàn im
# lặng phía client — nên phải chặn ngay tại đây, cả khi build lẫn trong CI.
#
# Dùng: bash scripts/verify-updates-patch.sh
set -euo pipefail

FILE="node_modules/expo-updates/android/src/main/java/expo/modules/updates/manifest/ResponseHeaderData.kt"
SENTINEL="?: 1"

if [ ! -d node_modules/expo-updates ]; then
  echo "LỖI: chưa cài expo-updates. Chạy 'npm install' trước." >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "LỖI: không tìm thấy $FILE" >&2
  echo "" >&2
  echo "Upstream đã đổi vị trí hoặc tên file. Bản vá hiện tại chắc chắn không còn đúng." >&2
  echo "Đọc lại mục 'Sinh lại bản vá' trong kit/README.md trước khi build tiếp." >&2
  exit 1
fi

if ! grep -q -- "$SENTINEL" "$FILE"; then
  echo "LỖI: bản vá expo-updates CHƯA được áp." >&2
  echo "" >&2
  echo "  File : $FILE" >&2
  echo "  Thiếu: dòng có '$SENTINEL' (mặc định protocolVersion = 1)" >&2
  echo "" >&2
  echo "Nguyên nhân thường gặp:" >&2
  echo "  - postinstall chưa chạy      → chạy 'npx patch-package'" >&2
  echo "  - patch xung đột sau nâng SDK → sinh lại patch, xem kit/README.md" >&2
  exit 1
fi

echo "Bản vá expo-updates: OK"
