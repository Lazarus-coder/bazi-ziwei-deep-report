#!/usr/bin/env bash
# render-pdf.sh — 用本机 Chrome/Chromium 无头模式把报告 HTML 打成 PDF
# 用法: ./render-pdf.sh <report.html> <out.pdf>
set -euo pipefail
HTML="$1"; OUT="$2"

CHROME="${CHROME_PATH:-}"
if [ -z "$CHROME" ]; then
  for c in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    "$(command -v google-chrome 2>/dev/null || true)" \
    "$(command -v chromium 2>/dev/null || true)" \
    "$(command -v chromium-browser 2>/dev/null || true)"; do
    if [ -n "$c" ] && [ -x "$c" ]; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ]; then
  echo "未找到 Chrome/Chromium/Edge；可用 CHROME_PATH=/path/to/chrome 指定。" >&2
  exit 1
fi

ABS_HTML="$(cd "$(dirname "$HTML")" && pwd)/$(basename "$HTML")"
OUT_DIR="$(cd "$(dirname "$OUT")" && pwd)"
OUT_ABS="$OUT_DIR/$(basename "$OUT")"

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --no-pdf-header-footer --print-to-pdf-no-header \
  --virtual-time-budget=20000 \
  --print-to-pdf="$OUT_ABS" "file://$ABS_HTML" >/dev/null 2>&1

if [ ! -s "$OUT_ABS" ]; then
  echo "PDF 生成失败：$OUT_ABS" >&2
  exit 1
fi
echo "PDF -> $OUT_ABS ($(du -h "$OUT_ABS" | cut -f1))"