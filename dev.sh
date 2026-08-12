#!/bin/bash
# Sync perubahan lokal ke GitHub dulu (commit + push, dengan konfirmasi),
# baru jalankan server + client untuk development lokal. Sinkronisasi
# dilakukan di awal (bukan saat sesi dihentikan) supaya GitHub selalu
# jadi cermin kondisi lokal sebelum mulai kerja.
#
# Pakai: ./dev.sh ["pesan commit custom"]
set -e

cd "$(dirname "$0")"

COMMIT_MSG="${1:-Dev sync: $(date '+%Y-%m-%d %H:%M:%S')}"
PORT="$(grep -m1 '^PORT=' .env 2>/dev/null | cut -d= -f2)"
PORT="${PORT:-3001}"

echo "=== Sinkronisasi ke GitHub ==="
if [ -z "$(git status --porcelain)" ]; then
  echo "Tidak ada perubahan untuk di-commit."
else
  git status --short
  git add -A
  git commit -m "$COMMIT_MSG"
  git fetch origin master
  git push --force-with-lease origin master
  echo "Perubahan berhasil di-push ke GitHub (lokal jadi acuan, menimpa GitHub)."
fi

# Install dependency kalau belum ada
[ -d server/node_modules ] || npm install --prefix server
[ -d client/node_modules ] || npm install --prefix client

echo ""
echo "=== Menjalankan dev server ==="

npm run dev --prefix server &
SERVER_PID=$!

npm run dev --prefix client &
CLIENT_PID=$!

cleanup() {
  echo ""
  echo "=== Menghentikan dev server ==="
  kill "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true
  wait "$SERVER_PID" "$CLIENT_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo ""
echo "Server API   : http://localhost:${PORT}"
echo "Client (Vite): http://localhost:5173 (proxy /api ke server)"
echo "Tekan Ctrl+C untuk berhenti."
echo ""

wait
