#!/bin/bash
# Script untuk deploy Wilindo (API + frontend React, monolitik) menggunakan Podman Quadlet
set -e

APP_DIR="/webku/appsku/wilindo"

# Pastikan berada di direktori aplikasi
cd "$APP_DIR" || exit 1

echo "=== 1. Hapus versi Compose (jika sebelumnya dipakai) ==="
podman-compose down 2>/dev/null || true
podman rm -f wilindo 2>/dev/null || true

echo "=== 2. Build Aplikasi ==="
# Build menggunakan container sementara (ephemeral) untuk memastikan kompatibilitas.
# client/ dan server/ adalah package npm terpisah, masing-masing perlu install sendiri
# sebelum "npm run build" di root (yang membangun client lalu server).
podman run --rm -v "$APP_DIR":/app:Z -w /app docker.io/library/node:24-alpine sh -c "
  npm install --prefix client &&
  npm install --prefix server &&
  npm run build
"

echo "=== 3. Setup Quadlet Container ==="
mkdir -p ~/.config/containers/systemd
cp wilindo.container ~/.config/containers/systemd/

echo "=== 4. Reload & Restart Systemd ==="
systemctl --user daemon-reload
systemctl --user restart wilindo.service

echo "=== Deployment Selesai! ==="
systemctl --user status wilindo.service --no-pager
