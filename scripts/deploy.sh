#!/usr/bin/env bash
# ============================================================
# deploy.sh — ตรวจ → build → ทดสอบ → push ขึ้น GitHub Pages
# ใช้: bash scripts/deploy.sh ["ข้อความ commit"]
#      SKIP_TESTS=1 bash scripts/deploy.sh "..."   # ข้ามการทดสอบเบราว์เซอร์
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="toeic-750"
MSG="${1:-update content}"
PORT="${PORT:-8081}"
SERVE_PID=""

cleanup() {
  if [ -n "$SERVE_PID" ] && kill -0 "$SERVE_PID" 2>/dev/null; then
    kill "$SERVE_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "▶ ตรวจโครงสร้างเนื้อหา"
node tools/validate.js

echo
echo "▶ ตรวจคุณภาพเฉลย"
node tools/audit.js

echo
echo "▶ ตรวจความพร้อมของแผน 30 วัน"
node tools/plan-check.js | tail -20

echo
echo "▶ build"
node build.js

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  echo
  echo "▶ ทดสอบบนเบราว์เซอร์"
  PORT="$PORT" node tools/serve.js > /dev/null 2>&1 &
  SERVE_PID=$!
  sleep 3
  node tools/smoke.js "http://localhost:$PORT/"
  node tools/flow.js  "http://localhost:$PORT/"
  node tools/parts.js
  cleanup
  SERVE_PID=""
fi

echo
echo "▶ git"
if [ ! -d .git ]; then
  git init -q
  git branch -M main
fi

git add -A
if git diff --cached --quiet; then
  echo "  ไม่มีอะไรเปลี่ยน"
else
  git commit -q -m "$MSG

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
  echo "  commit แล้ว"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "▶ สร้าง repo บน GitHub"
  gh repo create "$REPO" --public --source=. --remote=origin --push \
    --description "ติว TOEIC 750+ ใน 30 วัน สำหรับคนไทยที่เริ่มจากศูนย์"
else
  git push -q origin main
fi

echo
echo "▶ อัปเดต GitHub Pages (branch gh-pages จาก dist/web)"
TMP="$(mktemp -d)"
cp -r dist/web/. "$TMP/"
touch "$TMP/.nojekyll"

git -C "$TMP" init -q
git -C "$TMP" checkout -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.email="noreply@github.com" -c user.name="deploy" commit -q -m "deploy: $MSG"
git -C "$TMP" remote add origin "$(git remote get-url origin)"
git -C "$TMP" push -q --force origin gh-pages
rm -rf "$TMP"

OWNER="$(gh repo view --json owner --jq .owner.login)"
gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || \
gh api -X PUT  "repos/$OWNER/$REPO/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true

echo
echo "✅ เสร็จ"
echo "   เว็บ: https://$OWNER.github.io/$REPO/"
echo "   (ผู้ใช้ที่ติดตั้งเป็นแอปไว้จะเห็นแถบ 'มีเวอร์ชันใหม่' ให้กดอัปเดต)"
