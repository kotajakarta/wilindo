# Design: API & Komponen Multi Dropdown Alamat Indonesia

## Konteks

Database `wilindo` sudah punya tabel `wilayah` (lihat `struktur.sql`) berisi seluruh kode wilayah Indonesia (provinsi/kabupaten-kota/kecamatan/desa-kelurahan) dalam satu tabel flat:

```sql
CREATE TABLE `wilayah` (
  `kode` varchar(13) NOT NULL,
  `nama` varchar(100) NOT NULL,
  PRIMARY KEY (`kode`),
  KEY `wilayah_name_idx` (`nama`)
) ENGINE=MyISAM;
```

Kode berjenjang dengan pemisah titik, ditentukan dari jumlah titik:

| Level | Contoh kode      | Jumlah titik |
|-------|-------------------|--------------|
| 1 Provinsi          | `11`             | 0 |
| 2 Kabupaten/Kota     | `11.01`          | 1 |
| 3 Kecamatan          | `11.01.01`       | 2 |
| 4 Desa/Kelurahan     | `11.01.01.2001`  | 3 |

Kredensial koneksi ada di `.env` root (`DATABASE_URL=mysql://...`).

Tujuan: bangun API (Express) + komponen dropdown alamat bertingkat (React/Vite/Tailwind) yang mendukung cascading select dan pencarian nama (searchable combobox) lintas seluruh Indonesia, dengan breadcrumb untuk membedakan nama wilayah yang duplikat.

## Arsitektur & Struktur Proyek

Monorepo dua folder di root `wilindo/`:

```
wilindo/
├── .env                    # sudah ada, tetap di root (DATABASE_URL)
├── struktur.sql             # sudah ada
├── server/                  # Express + TypeScript
│   ├── src/
│   │   ├── db.ts             # mysql2 pool, baca DATABASE_URL dari root .env
│   │   ├── wilayah.service.ts   # query logic (children, search+breadcrumb)
│   │   ├── wilayah.routes.ts
│   │   ├── app.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
└── client/                  # React + Vite + TypeScript + Tailwind
    ├── src/
    │   ├── api/wilayah.ts
    │   ├── components/
    │   │   ├── AddressCombobox.tsx   # 1 combobox generik, dipakai 4x
    │   │   └── WilayahDropdown.tsx   # orchestrator: state 4 level + cascading
    │   ├── types/wilayah.ts
    │   └── App.tsx
    ├── tailwind.config.js
    └── vite.config.ts
```

Server dan client berjalan sebagai dua proses terpisah saat dev. Vite dev server mem-proxy path `/api` ke Express (hindari masalah CORS saat dev). Server membaca `DATABASE_URL` dari `.env` di root repo (bukan di dalam `server/`).

**Stack:** React + Vite, Express, Tailwind CSS, TypeScript di kedua sisi, driver `mysql2` (raw SQL + connection pool, tanpa ORM — skema hanya 1 tabel sederhana).

## API Endpoints

### 1. `GET /api/wilayah?parent=<kode>`

Mengambil anak langsung dari sebuah kode (untuk mengisi daftar default dropdown saat dibuka tanpa pencarian).

- Tanpa query `parent` → return semua provinsi (level 1).
- Dengan `parent` → return anak langsung saja (bukan cucu).

Query (tidak perlu tahu lebar segmen per level):
```sql
-- top-level (provinsi)
SELECT kode, nama FROM wilayah WHERE kode NOT LIKE '%.%' ORDER BY nama;

-- children dari :parent
SELECT kode, nama FROM wilayah
WHERE kode LIKE CONCAT(?, '.%')
  AND kode NOT LIKE CONCAT(?, '.%.%')
ORDER BY nama;
```

Response:
```json
[{ "kode": "11.01", "nama": "Kabupaten Simeulue" }, ...]
```

Validasi: jika `parent` diberikan tapi tidak ditemukan di tabel (tidak ada baris dengan `kode = parent`), tetap return `[]` (bukan error) — kasus ini bisa terjadi kalau `parent` bukan kode valid.

### 2. `GET /api/wilayah/search?level=<1-4>&q=<text>&limit=<n>`

Search nama wilayah global (lintas seluruh Indonesia) dalam satu level, dengan breadcrumb ancestor untuk disambiguasi nama duplikat & auto-fill dropdown di atasnya.

- `level` wajib, integer 1-4.
- `q` wajib, non-empty setelah di-trim.
- `limit` opsional, default 20, clamp maksimum 50.

Query dasar (filter level via jumlah titik, pola sama seperti children):
```sql
-- level 1
WHERE kode NOT LIKE '%.%' AND nama LIKE CONCAT('%', ?, '%')
-- level 2
WHERE kode LIKE '%.%' AND kode NOT LIKE '%.%.%' AND nama LIKE CONCAT('%', ?, '%')
-- level 3
WHERE kode LIKE '%.%.%' AND kode NOT LIKE '%.%.%.%' AND nama LIKE CONCAT('%', ?, '%')
-- level 4
WHERE kode LIKE '%.%.%.%' AND nama LIKE CONCAT('%', ?, '%')
```
`ORDER BY CHAR_LENGTH(nama), nama LIMIT ?`

Lalu resolve breadcrumb: untuk tiap hasil, turunkan kode ancestor dari `kode` (split by `.`, ambil prefix kumulatif tanpa kode itu sendiri), kumpulkan semua kode ancestor unik dari seluruh hasil, lalu satu query batch:
```sql
SELECT kode, nama FROM wilayah WHERE kode IN (?, ?, ...)
```
Gabungkan hasilnya di kode aplikasi (Node) menjadi `path` per item, urut dari provinsi ke bawah.

Response:
```json
[{
  "kode": "32.03.05.2001",
  "nama": "Sukamaju",
  "path": [
    { "kode": "32", "nama": "Jawa Barat" },
    { "kode": "32.03", "nama": "Kabupaten Cianjur" },
    { "kode": "32.03.05", "nama": "Kecamatan Cianjur" }
  ]
}]
```

### Error handling (backend)

- Param invalid (`level` di luar 1-4, `q` kosong) → `400 { "error": "..." }` dengan pesan spesifik.
- Error database → log detail lengkap di server (console/stderr), response `500 { "error": "Terjadi kesalahan, coba lagi" }` (tidak bocorkan detail internal ke client).
- Ditangani via satu Express error-handling middleware terpusat di `app.ts`.

## Frontend

### `types/wilayah.ts`
```ts
export interface WilayahItem { kode: string; nama: string }
export interface WilayahSearchResult extends WilayahItem { path: WilayahItem[] }
export type WilayahLevel = 1 | 2 | 3 | 4;
```

### `api/wilayah.ts`
Fetch wrapper tipis: `getChildren(parentKode?: string): Promise<WilayahItem[]>` dan `searchWilayah(level: WilayahLevel, q: string, limit?: number): Promise<WilayahSearchResult[]>`.

### `components/AddressCombobox.tsx`
Komponen generik custom headless (tanpa dependency tambahan), dipakai 4x (Provinsi/Kabupaten-Kota/Kecamatan/Desa-Kelurahan).

Props: `label: string`, `level: WilayahLevel`, `parentKode: string | undefined`, `value: WilayahItem | null`, `onChange: (item: WilayahItem | null) => void`, `onAutoFillAncestors?: (path: WilayahItem[]) => void`.

Perilaku:
- Mount / `parentKode` berubah → fetch children, jadi daftar default saat dropdown dibuka tanpa ketikan aktif.
- User mengetik (debounce ~300ms) → beralih ke `searchWilayah(level, q)`, tampilkan hasil dengan breadcrumb kecil (dari `path`) di bawah tiap nama opsi untuk disambiguasi.
- Pilih hasil search yang punya `path` (artinya ancestor-nya belum tentu sama dengan yang sedang dipilih user) → panggil `onAutoFillAncestors(path)`.
- State lokal: daftar opsi, loading, error (+ tombol retry) — error di satu combobox tidak mengganggu combobox lain.
- Styling Tailwind, keyboard nav dasar (arrow up/down, enter, escape).

### `components/WilayahDropdown.tsx`
Orchestrator, state 4 level: `{ provinsi, kabupaten, kecamatan, desa }`, masing-masing `WilayahItem | null`.

- Cascading reset manual: ganti provinsi → reset kabupaten/kecamatan/desa ke `null`. Ganti kabupaten → reset kecamatan/desa. Ganti kecamatan → reset desa.
- Global search auto-fill: saat salah satu combobox memanggil `onAutoFillAncestors(path)`, isi state level-level di atasnya dari `path` (tanpa reset manual, override langsung).
- Setelah auto-fill, perilaku cascading normal tetap berlaku untuk perubahan selanjutnya (mis. user ganti provinsi lagi → reset ke bawah seperti biasa).
- Expose `onChange(selected: { provinsi, kabupaten, kecamatan, desa })` ke parent, agar bisa dipasang di form alamat manapun.

### `App.tsx`
Demo halaman sederhana yang merender `WilayahDropdown` dan menampilkan hasil pilihan (untuk verifikasi manual).

## Testing

Unit test untuk `server/src/wilayah.service.ts` (logic query-building untuk children/search level filter, dan logic resolve breadcrumb path dari kode) dengan mock pool `mysql2` — tidak perlu koneksi database asli. Ditulis mengikuti TDD saat tahap implementasi.

Tidak ada test e2e/integrasi untuk scope ini (YAGNI) — verifikasi manual via browser untuk UI.

## Di luar scope

- Autentikasi/otorisasi API.
- Caching layer (data statis tapi dataset kecil, query sudah cukup cepat tanpa cache untuk scope ini).
- Endpoint CRUD/mutasi data wilayah (dataset read-only, sudah ada di DB).
- Deployment/production build config di luar `npm run build` standar Vite & tsc.
