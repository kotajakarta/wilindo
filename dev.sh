#!/bin/bash
# Jalankan server + client untuk development lokal. Saat dev session
# dihentikan (Ctrl+C), tampilkan perubahan yang terjadi dan minta
# konfirmasi sebelum commit & push ke GitHub — supaya perubahan tak
# terduga (mis. dari tool lain yang mengubah file di folder ini) tidak
# ikut ter-push tanpa disadari.
#
# Pakai: ./dev.sh ["pesan commit custom"]
set -e

cd "$(dirname "$0")"

COMMIT_MSG="${1:-Dev sync: $(date '+%Y-%m-%d %H:%M:%S')}"
PORT="$(grep -m1 '^PORT=' .env 2>/dev/null | cut -d= -f2)"
PORT="${PORT:-3001}"

# Install dependency kalau belum ada
[ -d server/node_modules ] || npm install --prefix server
[ -d client/node_modules ] || npm install --prefix client

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

  echo ""
  echo "=== Perubahan yang terdeteksi ==="
  if [ -z "$(git status --porcelain)" ]; then
    echo "Tidak ada perubahan untuk di-commit."
    return
  fi
  git status --short

  read -r -p "Commit & push perubahan di atas ke GitHub? [y/N] " REPLY
  if [[ "$REPLY" =~ ^[Yy]$ ]]; then
    git add -A
    git commit -m "$COMMIT_MSG"
    git fetch origin master
    git push --force-with-lease origin master
    echo "Perubahan berhasil di-push ke GitHub (lokal jadi acuan, menimpa GitHub)."
  else
    echo "Dibatalkan — tidak ada yang di-commit/push."
  fi
}
trap cleanup EXIT

echo ""
echo "Server API   : http://localhost:${PORT}"
echo "Client (Vite): http://localhost:5173 (proxy /api ke server)"
echo "Tekan Ctrl+C untuk berhenti dan sync ke GitHub."
echo ""

wait
