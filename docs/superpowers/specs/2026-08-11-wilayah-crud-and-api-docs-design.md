# Design: CRUD Wilayah + Dokumentasi API untuk App Eksternal

## Konteks

Aplikasi multi-dropdown alamat Indonesia (lihat spec sebelumnya:
`2026-08-11-multi-dropdown-alamat-design.md`) sudah punya API baca-saja
(`GET /api/wilayah`, `GET /api/wilayah/search`) dan UI dropdown publik.
Sekarang ditambahkan:

1. Endpoint CRUD (create/update/delete) untuk tabel `wilayah`, dilindungi API key.
2. Halaman admin di frontend React untuk mengelola data lewat CRUD tersebut.
3. Dokumen `instruksi-api.md` di root project untuk memandu app lain (Node, PHP, dll) mengonsumsi seluruh API.

## Aturan Format Kode (berlaku di seluruh validasi CRUD)

| Level | Contoh | Pola |
|-------|--------|------|
| 1 Provinsi | `11` | `^\d{2}$` |
| 2 Kabupaten/Kota | `11.01` | `^\d{2}\.\d{2}$` |
| 3 Kecamatan | `11.01.01` | `^\d{2}\.\d{2}\.\d{2}$` |
| 4 Desa/Kelurahan | `11.01.01.2001` | `^\d{2}\.\d{2}\.\d{2}\.\d{4}$` |

Level ditentukan dari jumlah titik pada kode (0-3 titik = level 1-4). Kode
di luar tabel pola ini (dot count > 3, atau segmen tidak sesuai lebar
digit) dianggap format tidak valid.

## Backend

### Perluasan `wilayah.service.ts`

Ubah tipe `QueryablePool.query` return dari `Promise<[unknown[], unknown]>`
menjadi `Promise<[unknown, unknown]>` — mysql2 mengembalikan array baris
untuk SELECT tapi objek `ResultSetHeader` (punya `affectedRows`) untuk
INSERT/UPDATE/DELETE, jadi elemen pertama tidak selalu array. Cast ke tipe
yang sesuai di titik pemakaian masing-masing (`as WilayahItem[]` untuk
SELECT, `as { affectedRows: number }` untuk mutasi). `getChildren` dan
`searchWilayah` yang sudah ada disesuaikan castnya tapi perilakunya tidak
berubah.

Tiga fungsi baru, semua mengembalikan discriminated result (tidak throw
untuk error domain — hanya throw untuk error DB tak terduga, ditangkap
Express error handler seperti biasa):

```ts
export type WilayahMutationError =
  | 'invalid_kode_format'
  | 'parent_not_found'
  | 'duplicate_kode'
  | 'not_found'
  | 'has_children';

export type WilayahMutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: WilayahMutationError };

export async function createWilayah(
  pool: QueryablePool,
  input: { kode: string; nama: string }
): Promise<WilayahMutationResult<WilayahItem>>;

export async function updateWilayahNama(
  pool: QueryablePool,
  kode: string,
  nama: string
): Promise<WilayahMutationResult<WilayahItem>>;

export async function deleteWilayah(
  pool: QueryablePool,
  kode: string
): Promise<WilayahMutationResult<null>>;
```

**`createWilayah`:**
1. Validasi format kode sesuai pola levelnya → `invalid_kode_format` jika gagal.
2. Jika level > 1: kode induk = kode minus segmen terakhir. Cek `SELECT 1 FROM wilayah WHERE kode = ?` → `parent_not_found` jika tidak ada.
3. `INSERT INTO wilayah (kode, nama) VALUES (?, ?)`. Tangkap error dengan `code === 'ER_DUP_ENTRY'` → `duplicate_kode`.
4. Sukses → `{ ok: true, data: { kode, nama } }`.

**`updateWilayahNama`:**
1. `UPDATE wilayah SET nama = ? WHERE kode = ?`.
2. `affectedRows === 0` → `not_found`.
3. Sukses → `{ ok: true, data: { kode, nama } }`.

**`deleteWilayah`:**
1. Cek turunan: `SELECT 1 FROM wilayah WHERE kode LIKE CONCAT(?, '.%') LIMIT 1`. Ada baris → `has_children`.
2. `DELETE FROM wilayah WHERE kode = ?`. `affectedRows === 0` → `not_found`.
3. Sukses → `{ ok: true, data: null }`.

Validasi `nama` non-empty dilakukan di route layer (sebelum memanggil
service), bukan di service — menghindari duplikasi karena baik create
maupun update butuh cek yang sama persis.

### Auth: `server/src/auth.ts`

```ts
import type { Request, Response, NextFunction } from 'express';
import './env';

if (!process.env.API_KEY) {
  throw new Error('API_KEY is not set (expected in root .env)');
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('X-API-Key');
  if (!key || key !== process.env.API_KEY) {
    res.status(401).json({ error: 'API key tidak valid' });
    return;
  }
  next();
}
```

Env loading diekstrak ke `server/src/env.ts` (dipakai `db.ts` dan
`auth.ts` sebagai side-effect import) supaya tidak duplikasi:

```ts
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
```

`API_KEY` digenerate acak (32 byte hex) dan ditambahkan ke `.env` root
saat implementasi.

### Route baru di `wilayah.routes.ts`

```
POST   /api/wilayah          (requireApiKey) body {kode, nama} → 201 WilayahItem
PATCH  /api/wilayah/:kode    (requireApiKey) body {nama}       → 200 WilayahItem
DELETE /api/wilayah/:kode    (requireApiKey)                    → 204 (no body)
```

Mapping error domain → HTTP status + pesan Indonesia:

| error | status | pesan |
|-------|--------|-------|
| `invalid_kode_format` | 400 | "Format kode tidak valid untuk level ini" |
| `parent_not_found` | 404 | "Kode induk tidak ditemukan" |
| `duplicate_kode` | 409 | "Kode sudah terdaftar" |
| `not_found` | 404 | "Wilayah tidak ditemukan" |
| `has_children` | 409 | "Tidak bisa dihapus, masih ada wilayah di bawahnya" |
| `nama` kosong (validasi route) | 400 | "nama wajib diisi" |
| API key salah/kosong | 401 | "API key tidak valid" |

`app.ts` menambahkan `app.use(express.json())` sebelum router (dibutuhkan
untuk parse body POST/PATCH yang belum ada sebelumnya, karena endpoint
lama semuanya GET).

### Testing

Unit test (vitest, mocked `QueryablePool`) untuk `createWilayah`,
`updateWilayahNama`, `deleteWilayah` — mencakup: sukses, format kode
salah, induk tidak ada, kode duplikat, not found, dan masih punya anak.
Mengikuti pola TDD yang sama dengan `getChildren`/`searchWilayah`.

## Frontend

### Routing

Tambah dependency `react-router-dom`. `client/src/main.tsx` membungkus
`<App />` dengan `<BrowserRouter>`. `App.tsx` jadi layout: nav bar
("Alamat" / "Admin Wilayah") + `<Routes>`:
- `/` → `pages/AddressPage.tsx` (isi `App.tsx` yang sekarang, dipindah apa adanya)
- `/admin` → `pages/AdminPage.tsx` (baru)

### `hooks/useWilayahSelection.ts`

Ekstrak logika cascading state (reset kabupaten/kecamatan/desa saat
provinsi berubah, dst., plus tiga fungsi auto-fill dari breadcrumb
search) dari `WilayahDropdown.tsx` jadi hook bersama, dipakai baik oleh
`WilayahDropdown` (refactor, perilaku tidak berubah) maupun
`WilayahAdminManager` (baru).

```ts
export interface WilayahSelection {
  provinsi: WilayahItem | null;
  kabupaten: WilayahItem | null;
  kecamatan: WilayahItem | null;
  desa: WilayahItem | null;
}

export function useWilayahSelection(onChange?: (s: WilayahSelection) => void): {
  selection: WilayahSelection;
  setProvinsi: (item: WilayahItem | null) => void;
  setKabupaten: (item: WilayahItem | null) => void;
  setKecamatan: (item: WilayahItem | null) => void;
  setDesa: (item: WilayahItem | null) => void;
  autoFillFromKabupaten: (path: WilayahItem[]) => void;
  autoFillFromKecamatan: (path: WilayahItem[]) => void;
  autoFillFromDesa: (path: WilayahItem[]) => void;
};
```

### `api/wilayahAdmin.ts`

```ts
export async function createWilayah(kode: string, nama: string, apiKey: string): Promise<WilayahItem>;
export async function updateWilayahNama(kode: string, nama: string, apiKey: string): Promise<WilayahItem>;
export async function deleteWilayah(kode: string, apiKey: string): Promise<void>;
```

Semua kirim header `X-API-Key`. Kalau response tidak ok, lempar `Error`
dengan pesan dari body JSON `{error}` server (fallback pesan generik jika
body tidak bisa di-parse).

### `AddressCombobox` — tambah prop `refreshToken`

Prop opsional baru `refreshToken?: number` (default 0), ditambahkan ke
dependency array `useEffect` yang mengatur fetch children/search, supaya
parent bisa memaksa refresh daftar setelah mutasi tanpa mengubah
`parentKode`.

### `pages/AdminPage.tsx`

- Input "API Key" di atas, value tersimpan/dibaca dari `localStorage`
  (key `wilindo_admin_api_key`), auto-terisi dari localStorage saat mount.
- Merender `WilayahAdminManager` dengan `apiKey` dari state di atas.

### `components/WilayahAdminManager.tsx`

Pakai `useWilayahSelection` + state `refreshToken` (number, di-increment
tiap mutasi sukses). Merender 4× `AdminLevelRow` (Provinsi, Kabupaten,
Kecamatan, Desa) dengan `parentKode` berantai seperti `WilayahDropdown`.

### `components/AdminLevelRow.tsx`

Props: `label`, `level`, `parentKode`, `selected`, `onSelect`, `apiKey`,
`refreshToken`, `onMutated`.

- Render `AddressCombobox` (mode navigasi/pilih) dengan `refreshToken`
  diteruskan.
- Jika `selected` ada: tombol **Ubah Nama** (buka input inline → simpan
  via `updateWilayahNama` → `onSelect` dengan nama baru + `onMutated()`)
  dan **Hapus** (`window.confirm` → `deleteWilayah` → `onSelect(null)` +
  `onMutated()`; kalau gagal karena `has_children`/error lain, tampilkan
  pesan error dari exception, jangan optimistic-clear).
- Jika level 1, atau level > 1 dan `parentKode` terisi: tombol **+
  Tambah** membuka form inline — menampilkan prefix kode induk sebagai
  teks statis (mis. `11.01.`) + input untuk sisa digit (2 digit untuk
  level 1-3, 4 digit untuk level 4) + input nama → `createWilayah` →
  `onMutated()` dan reset form.
- Semua aksi mutasi: tombol disabled selagi request berjalan, tampilkan
  pesan error inline (dari `Error.message`) kalau gagal.

Admin **tidak** memakai `onAutoFillAncestors` dari `AddressCombobox`
(pencarian di admin hanya untuk memilih, tidak auto-isi level di
atasnya) — sengaja disederhanakan karena alur admin biasanya top-down.

### Testing

Tidak ada test otomatis untuk UI admin (konsisten dengan keputusan spec
sebelumnya: verifikasi manual di browser). Backend tetap unit-test
seperti dijelaskan di atas.

## `instruksi-api.md`

File baru di root project (`/mnt/d/htdocs/wilindo/instruksi-api.md`),
untuk dipakai app lain (Node, PHP, dll) yang mengonsumsi API ini secara
langsung (bukan lewat frontend React). Isi:

1. **Base URL** & cara menjalankan server (`npm run build && npm run start` dari root, default `http://localhost:3001`).
2. **Autentikasi** — header `X-API-Key: <key>` wajib untuk `POST`/`PATCH`/`DELETE`; `GET` publik.
3. **Format kode wilayah** — tabel level & pola yang sama seperti di atas.
4. **Referensi tiap endpoint** (5 total): method, path, query/body params, contoh response sukses (JSON), semua kombinasi status error dengan contoh body `{error}`.
5. **Contoh pemakaian** per endpoint dalam 3 bahasa: `curl`, Node.js (`fetch`), PHP (`file_get_contents` dengan stream context, atau `curl_init`).

## Di luar scope

- Rotasi/multi API key, rate limiting.
- Audit log perubahan data.
- Bulk import/export.
- Undo/soft-delete.
