#!/usr/bin/env bash
# Cài bộ hot-update-qua-GitHub-Pages vào một dự án Expo khác.
#
#   bash kit/install.sh <duong-dan-du-an-dich> [--with-panel] [--force]
#
#   --with-panel  chép thêm màn hình chẩn đoán UpdatePanel.tsx (khuyên dùng khi
#                 kiểm thử lần đầu — không có nó thì không nhìn thấy updateId)
#   --force       cho phép ghi đè file đã tồn tại ở dự án đích
#
# Script này CHỈ chép file và thêm script vào package.json. Nó cố ý KHÔNG chạy
# npm install, không tạo nhánh gh-pages, không sinh bản vá — những việc đó cần
# quyết định của con người và được liệt kê ở phần việc còn lại khi chạy xong.
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_ROOT="$(dirname "$KIT_DIR")"

# Phiên bản expo-updates mà bản vá mẫu trong patches/ được sinh ra cho.
PATCH_FOR_VERSION="57.0.21"

TARGET=""
WITH_PANEL=0
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --with-panel) WITH_PANEL=1 ;;
    --force) FORCE=1 ;;
    -*) echo "Tham số lạ: $arg" >&2; exit 1 ;;
    *) TARGET="$arg" ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "Dùng: bash kit/install.sh <duong-dan-du-an-dich> [--with-panel] [--force]" >&2
  exit 1
fi

if [ ! -f "$TARGET/package.json" ]; then
  echo "LỖI: $TARGET không có package.json — đây không phải thư mục gốc dự án." >&2
  exit 1
fi

if ! grep -q '"expo"' "$TARGET/package.json"; then
  echo "LỖI: $TARGET/package.json không thấy phụ thuộc \"expo\". Đây có phải dự án Expo không?" >&2
  exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"
echo "Dự án đích: $TARGET"
echo ""

# ---------------------------------------------------------------- chép file --

copy() {
  local src="$1" dest="$2"
  if [ -e "$dest" ] && [ "$FORCE" -eq 0 ]; then
    echo "  BỎ QUA (đã tồn tại): ${dest#$TARGET/}   — dùng --force để ghi đè"
    return
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "  chép: ${dest#$TARGET/}"
}

echo "Bộ công cụ publish/rollback:"
for f in "$SRC_ROOT"/tools/*.ts; do
  copy "$f" "$TARGET/tools/$(basename "$f")"
done

echo ""
echo "Script xác minh bản vá:"
copy "$KIT_DIR/verify-updates-patch.sh" "$TARGET/scripts/verify-updates-patch.sh"
chmod +x "$TARGET/scripts/verify-updates-patch.sh" 2>/dev/null || true

echo ""
echo "Workflow CI:"
copy "$KIT_DIR/templates/publish.yml" "$TARGET/.github/workflows/publish.yml"
copy "$KIT_DIR/templates/rollback.yml" "$TARGET/.github/workflows/rollback.yml"

echo ""
echo "Cấu hình:"
# Đoán githubUser/repoName từ git remote của dự án đích; đoán sai thì sửa tay,
# thà điền sẵn còn hơn để placeholder mà người dùng quên thay.
GH_USER="__GITHUB_USER__"
REPO_NAME="__REPO_NAME__"
REMOTE="$(git -C "$TARGET" remote get-url origin 2>/dev/null || true)"
if [[ "$REMOTE" =~ github\.com[:/]([^/]+)/([^/.]+) ]]; then
  GH_USER="${BASH_REMATCH[1]}"
  REPO_NAME="${BASH_REMATCH[2]}"
  echo "  đoán từ git remote: githubUser=$GH_USER repoName=$REPO_NAME"
fi

if [ -e "$TARGET/update.config.json" ] && [ "$FORCE" -eq 0 ]; then
  echo "  BỎ QUA (đã tồn tại): update.config.json"
else
  sed -e "s/__GITHUB_USER__/$GH_USER/g" -e "s/__REPO_NAME__/$REPO_NAME/g" \
    "$KIT_DIR/templates/update.config.json" > "$TARGET/update.config.json"
  echo "  chép: update.config.json"
fi

if [ -f "$TARGET/app.config.js" ]; then
  copy "$KIT_DIR/templates/app.config.snippet.js" "$TARGET/app.config.kit-example.js"
  echo "  → đã có app.config.js sẵn: xem app.config.kit-example.js rồi ghép khối updates vào tay"
else
  copy "$KIT_DIR/templates/app.config.snippet.js" "$TARGET/app.config.js"
  echo "  → nhớ điền name/slug/package thật vào app.config.js"
fi

if [ -f "$TARGET/app.json" ]; then
  echo ""
  echo "  ⚠️  Dự án đích đang có app.json."
  echo "     Phải bê nội dung khóa \"expo\" của nó vào app.config.js RỒI XÓA app.json."
  echo "     Để cả hai thì app.config.js thắng, và mọi cấu hình chỉ nằm trong app.json"
  echo "     (icon, splash, permissions...) sẽ biến mất khỏi bản build mà không báo lỗi."
fi

if [ "$WITH_PANEL" -eq 1 ]; then
  echo ""
  echo "Màn hình chẩn đoán:"
  copy "$KIT_DIR/templates/UpdatePanel.tsx" "$TARGET/src/UpdatePanel.tsx"
fi

# ------------------------------------------------------------ bản vá client --

echo ""
echo "Bản vá expo-updates:"
INSTALLED_VERSION="$(node -e "
  try {
    const p = require('$TARGET/node_modules/expo-updates/package.json');
    process.stdout.write(p.version);
  } catch { process.stdout.write(''); }
" 2>/dev/null || true)"

if [ -z "$INSTALLED_VERSION" ]; then
  echo "  chưa cài expo-updates ở dự án đích — không kiểm tra được phiên bản."
  echo "  Chạy 'npx expo install expo-updates' rồi đọc mục 'Sinh lại bản vá' trong kit/README.md."
elif [ "$INSTALLED_VERSION" = "$PATCH_FOR_VERSION" ]; then
  copy "$SRC_ROOT/patches/expo-updates+$PATCH_FOR_VERSION.patch" \
       "$TARGET/patches/expo-updates+$PATCH_FOR_VERSION.patch"
  echo "  phiên bản khớp ($INSTALLED_VERSION) — bản vá mẫu dùng lại được nguyên xi."
else
  echo "  expo-updates ở dự án đích là $INSTALLED_VERSION, bản vá mẫu dành cho $PATCH_FOR_VERSION."
  echo "  KHÔNG chép bản vá mẫu. Phải sinh lại — xem mục 'Sinh lại bản vá' trong kit/README.md."
fi

# -------------------------------------------------------------- package.json --

echo ""
echo "package.json:"
node - "$TARGET" <<'NODE'
const fs = require('fs');
const path = require('path');
const target = process.argv[2];
const p = path.join(target, 'package.json');
const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));

const scripts = {
  postinstall: 'patch-package',
  'test:tools': 'vitest run tools',
  'export:android': 'expo export --platform android && tsx tools/expo-config.ts',
  'publish:update': 'tsx tools/publish.ts',
  'rollback:update': 'tsx tools/rollback.ts',
  'verify:patch': 'bash scripts/verify-updates-patch.sh',
};

const devDeps = {
  '@types/node': '^26.4.1',
  'patch-package': '^8.0.1',
  tsx: '^4.23.13',
  vitest: '^5.0.0',
};

pkg.scripts ??= {};
pkg.devDependencies ??= {};
const added = [], kept = [];

for (const [k, v] of Object.entries(scripts)) {
  if (pkg.scripts[k] && pkg.scripts[k] !== v) { kept.push(`scripts.${k}`); continue; }
  if (!pkg.scripts[k]) added.push(`scripts.${k}`);
  pkg.scripts[k] = v;
}
for (const [k, v] of Object.entries(devDeps)) {
  if (pkg.devDependencies[k]) { kept.push(`devDependencies.${k}`); continue; }
  pkg.devDependencies[k] = v;
  added.push(`devDependencies.${k}`);
}

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
if (added.length) console.log('  thêm: ' + added.join(', '));
if (kept.length) console.log('  GIỮ NGUYÊN (đã có, tự đối chiếu lấy): ' + kept.join(', '));
NODE

# ------------------------------------------------------------------ hướng dẫn --

cat <<'EOF'

================================================================================
Đã chép xong. Việc còn lại phải làm bằng tay (theo đúng thứ tự):

  1. npm install
       Kéo tsx/vitest/patch-package về. postinstall sẽ chạy patch-package.

  2. npx expo install expo-updates expo-constants
       Nếu dự án chưa có. expo-constants chỉ cần khi dùng UpdatePanel.

  3. Sinh bản vá expo-updates nếu phiên bản không khớp
       Xem mục "Sinh lại bản vá" trong kit/README.md. BỎ QUA BƯỚC NÀY
       LÀ APP KHÔNG BAO GIỜ TẢI ĐƯỢC UPDATE, mà không báo lỗi gì.

  4. npm run verify:patch
       Phải in "Bản vá expo-updates: OK" mới đi tiếp.

  5. Sửa update.config.json và app.config.js cho khớp dự án

  6. Tạo nhánh gh-pages rỗng + bật GitHub Pages + tạo worktree site/
       Xem mục "Dựng update site" trong kit/README.md.

  7. npm run test:tools     → phải 37/37 pass
  8. npx expo run:android --variant release
       KHÔNG dùng bản debug: nó nạp JS từ Metro và bỏ qua expo-updates hoàn toàn.

Đọc kit/README.md trước khi publish lần đầu — đặc biệt mục "Bốn cái bẫy".
================================================================================
EOF
