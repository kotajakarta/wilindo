# Wilindo — API Wilayah Administratif Indonesia

Wilindo (**Wilayah Indonesia**) adalah aplikasi web full-stack yang
menyediakan data wilayah administratif Indonesia secara berjenjang —
**Provinsi → Kabupaten/Kota → Kecamatan → Desa/Kelurahan** — lewat REST
API, lengkap dengan antarmuka contekan (dropdown alamat bertingkat) dan
halaman admin untuk kelola data.

Live: **https://wilindo.aithendi.my.id**

## Fitur Utama

- **Endpoint baca publik** (tanpa API key) untuk mengambil daftar wilayah
  per level (`?parent=<kode>`) dan pencarian nama lintas seluruh Indonesia
  (`/search?level=&q=`) — cocok untuk dropdown/combobox alamat bertingkat.
- **Endpoint kelola data** (`POST`/`PATCH`/`DELETE`, butuh header
  `X-API-Key`) untuk menambah, mengubah nama, dan menghapus wilayah.
- **Kode wilayah berjenjang** berbasis titik (mis. `32.03.05.2001`) yang
  levelnya bisa ditentukan dari jumlah titik, dan bersifat permanen
  sebagai primary key.
- **Halaman "Alamat"** (`/`) — contoh dropdown/combobox alamat bertingkat
  siap pakai (`AddressCombobox`, `WilayahDropdown`).
- **Halaman "Admin CRUD"** (`/admin`) — kelola (tambah/ubah/hapus) data
  wilayah lewat UI.

## Teknologi

| Bagian   | Stack |
|----------|-------|
| Server   | Node.js, Express 5, TypeScript, MySQL2 (MariaDB), Vitest |
| Client   | React 19, React Router 7, Vite, Tailwind CSS 4, TypeScript |
| Database | MariaDB — satu tabel `wilayah` (`kode`, `nama`) |
| Deploy   | Podman Quadlet (rootless container), reverse proxy ke `wilindo.aithendi.my.id` |

Server dan client dibangun terpisah lalu digabung: hasil build client
(`client/dist`) disajikan sebagai static file oleh server Express yang
sama, sehingga production berjalan sebagai satu proses monolitik.

## Struktur Proyek

```
wilindo/
├── client/                 # Frontend React + Vite
│   └── src/
│       ├── api/             # Wrapper fetch ke API (wilayah.ts, wilayahAdmin.ts)
│       ├── components/      # AddressCombobox, WilayahDropdown, WilayahAdminManager, dst.
│       ├── hooks/            # useWilayahSelection
│       └── pages/            # AddressPage (/), AdminPage (/admin)
├── server/                 # Backend Express + TypeScript
│   └── src/
│       ├── app.ts             # Setup Express, CORS, static file, error handler
│       ├── wilayah.routes.ts  # Route /api/wilayah*
│       ├── wilayah.service.ts # Logika bisnis + query database
│       ├── auth.ts            # Middleware validasi X-API-Key
│       ├── db.ts              # Koneksi MySQL/MariaDB
│       └── env.ts             # Baca & validasi environment variable
├── struktur.sql             # Skema tabel `wilayah`
├── wilindo.sql               # Dump data wilayah lengkap
├── dev.sh                    # Jalankan server+client dev, auto commit/push ke GitHub saat berhenti
├── dep.sh                    # Script deploy production (build via container, Podman Quadlet)
├── wilindo.container         # Definisi Podman Quadlet untuk production
├── instruksi-api.md           # Dokumentasi API lengkap (untuk developer/AI yang integrasi)
└── instruksi-api-produksi.md  # Versi dokumentasi API khusus production
```

## Menjalankan di Lokal

Prasyarat: Node.js 24+, akses ke database MariaDB/MySQL (impor
`struktur.sql` dan/atau `wilindo.sql` untuk data awal).

1. Salin `.env-example` menjadi `.env` dan isi sesuai environment lokal:

   ```
   DATABASE_URL=mysql://root:password@hostname:3306/wilindo
   API_KEY=<isi dengan key rahasia untuk endpoint mutasi>
   PORT=3076
   ```

2. Jalankan lewat script `dev.sh` (menjalankan server + client sekaligus):

   ```bash
   ./dev.sh
   ```

   - Server API: `http://localhost:<PORT dari .env, default 3001>`
   - Client (Vite dev server): `http://localhost:5173`
   - Tekan `Ctrl+C` untuk berhenti — script akan menampilkan perubahan git
     dan minta konfirmasi sebelum commit & push ke GitHub.

   Atau jalankan manual tanpa script:

   ```bash
   npm install --prefix server
   npm install --prefix client
   npm run dev --prefix server   # terminal 1
   npm run dev --prefix client   # terminal 2
   ```

## Build & Deploy Production

```bash
npm run build   # build client lalu server (lihat package.json root)
npm run start   # jalankan server hasil build, sekaligus menyajikan client/dist
```

Untuk deploy ke server production (Podman Quadlet, rootless), gunakan
`dep.sh` — script ini build aplikasi dalam container Node sementara, lalu
memasang `wilindo.container` sebagai systemd unit dan me-restart service.

## Dokumentasi API

Dokumentasi lengkap seluruh endpoint (format kode wilayah, autentikasi,
pola integrasi dropdown bertingkat, contoh kode curl/Node.js/PHP) ada di
[`instruksi-api.md`](./instruksi-api.md) — dibuat agar bisa langsung
dipakai oleh developer maupun AI coding assistant yang mengintegrasikan
aplikasi lain dengan API ini.

Ringkasan endpoint:

| Method | Path | Butuh API Key | Deskripsi |
|--------|------|:---:|-----------|
| GET | `/api/health` | Tidak | Health check |
| GET | `/api/wilayah?parent=<kode>` | Tidak | Daftar anak langsung dari `kode` (tanpa `parent` = semua provinsi) |
| GET | `/api/wilayah/search?level=&q=&limit=` | Tidak | Cari nama wilayah lintas Indonesia dalam satu level |
| POST | `/api/wilayah` | Ya | Buat wilayah baru |
| PATCH | `/api/wilayah/:kode` | Ya | Ubah nama wilayah |
| DELETE | `/api/wilayah/:kode` | Ya | Hapus wilayah (harus dari level terbawah dulu) |

## Testing

```bash
npm test --prefix server   # Vitest untuk server/src/wilayah.service.test.ts
```
