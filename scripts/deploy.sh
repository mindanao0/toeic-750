#!/usr/bin/env bash
# ============================================================
# deploy.sh — build แล้ว push ขึ้น GitHub Pages
# ใช้: bash scripts/deploy.sh ["ข้อความ commit"]
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="toeic-750"
MSG="${1:-update content}"

echo "▶ ตรวจเนื้อหา"
node tools/validate.js

echo
echo "▶ build"
node build.js

echo
echo "▶ ทดสอบหน้าจอ"
if command -v node >/dev/null; then
  (node tools/serve.js >/dev/null 2>&1 & echo $! > /tmp/toeic-serve.pid) || true
  sleep 2
  node tools/smoke.js || { kill "$(cat /tmp/toeic-serve.pid)" 2>/dev/null || true; exit 1; }
  node tools/flow.js  || { kill "$(cat /tmp/toeic-serve.pid)" 2>/dev/null || true; exit 1; }
  kill "$(cat /tmp/toeic-serve.pid)" 2>/dev/null || true
  rm -f /tmp/toeic-serve.pid
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
echo "   (ครั้งแรกอาจใช้เวลา 1-3 นาทีกว่าจะเปิดได้)"
