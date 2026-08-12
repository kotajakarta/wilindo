# Instruksi Penggunaan API Wilayah

API ini menyediakan data wilayah administratif Indonesia (provinsi,
kabupaten/kota, kecamatan, desa/kelurahan) berjenjang, dengan endpoint
baca (publik) dan endpoint kelola data (butuh API key). Dokumen ini untuk
developer **atau AI coding assistant** yang mengintegrasikan aplikasi lain
(Node.js, PHP, bahasa apa pun yang bisa melakukan HTTP request) dengan API
ini — dokumen ini dibuat agar bisa dibaca dan langsung dieksekusi tanpa
konteks tambahan.

## Ringkasan Cepat

Untuk kasus paling umum — **dropdown/combobox alamat bertingkat** (pilih
provinsi → kabupaten/kota → kecamatan → desa) di aplikasi lain — cukup 2
endpoint baca, **tidak perlu API key sama sekali**:

1. `GET /api/wilayah?parent=<kode>` — isi pilihan tiap level (children dari kode yang dipilih di level atasnya; tanpa `parent` = semua provinsi).
2. `GET /api/wilayah/search?level=<1-4>&q=<teks>` — untuk pencarian/typeahead per level, hasilnya sudah termasuk `path` (breadcrumb) untuk auto-isi level di atasnya kalau user langsung pilih dari hasil pencarian.

Lihat bagian **"Pola Integrasi Dropdown Bertingkat"** di bawah untuk alur
lengkapnya. Endpoint `POST`/`PATCH`/`DELETE` (butuh `X-API-Key`) hanya
relevan kalau aplikasi lain juga perlu mengelola (tambah/ubah/hapus) data
wilayah, bukan sekadar menampilkan dropdown.

**Sebelum mulai:** pastikan tahu (1) base URL server ini yang bisa dijangkau
aplikasi lain — **jangan asumsikan `localhost:3001`** kalau kedua aplikasi
tidak berjalan di mesin/jaringan yang sama, tanyakan ke user kalau tidak
yakin — dan (2) apakah butuh API key (hanya untuk endpoint mutasi).

## Base URL

Jalankan server dari root project ini:

```bash
npm run build
npm run start
```

Default `http://localhost:3001` saat dijalankan lokal. **Ganti sesuai
alamat aktual server ini bisa diakses** dari aplikasi yang mengintegrasikan
(mis. `http://192.168.x.x:3001`, domain internal, dst — tanyakan ke user
jika tidak diberi tahu). Semua path di bawah relatif terhadap base URL ini.

CORS diizinkan untuk semua origin, jadi endpoint `GET` bisa dipanggil
langsung dari browser (frontend JS) tanpa proxy tambahan.

## Autentikasi

Endpoint yang mengubah data (`POST`, `PATCH`, `DELETE`) wajib mengirim
header:

```
X-API-Key: <nilai API_KEY dari .env server>
```

Tanpa header ini atau dengan nilai yang salah, server membalas
`401 { "error": "API key tidak valid" }`. Endpoint `GET` tidak butuh key.

## Format Kode Wilayah

Kode berjenjang, dipisah titik, level ditentukan dari jumlah titik:

| Level | Contoh | Pola |
|-------|--------|------|
| 1 Provinsi | `11` | `^\d{2}$` |
| 2 Kabupaten/Kota | `11.01` | `^\d{2}\.\d{2}$` |
| 3 Kecamatan | `11.01.01` | `^\d{2}\.\d{2}\.\d{2}$` |
| 4 Desa/Kelurahan | `11.01.01.2001` | `^\d{2}\.\d{2}\.\d{2}\.\d{4}$` |

`kode` bersifat permanen setelah dibuat (primary key) — endpoint update
hanya bisa mengubah `nama`.

## Pola Integrasi Dropdown Bertingkat

Alur standar untuk membangun 4 dropdown/combobox alamat (Provinsi →
Kabupaten/Kota → Kecamatan → Desa) di aplikasi lain:

1. **Saat mount / dropdown Provinsi dibuka:** panggil `GET /api/wilayah`
   (tanpa `parent`) untuk isi daftar provinsi.
2. **User pilih Provinsi:** simpan kode-nya, panggil
   `GET /api/wilayah?parent=<kode_provinsi>` untuk isi daftar Kabupaten/Kota.
   Reset pilihan Kecamatan & Desa yang mungkin sudah terisi sebelumnya.
3. **User pilih Kabupaten/Kota:** sama, `parent=<kode_kabupaten>` untuk isi
   Kecamatan, reset Desa.
4. **User pilih Kecamatan:** `parent=<kode_kecamatan>` untuk isi Desa.
5. **(Opsional) Search-as-you-type:** kalau dropdown butuh fitur cari nama
   (terutama penting untuk Kecamatan/Desa yang jumlahnya sangat banyak),
   panggil `GET /api/wilayah/search?level=<1-4>&q=<ketikan_user>` alih-alih
   endpoint `parent=` di atas saat user mengetik. Setiap hasil punya
   field `path` (array `{kode, nama}` dari provinsi turun ke induk
   langsungnya) — pakai ini untuk auto-isi dropdown level di atasnya kalau
   user langsung memilih hasil pencarian tanpa memilih level di atasnya
   dulu (mis. langsung cari & pilih nama desa).
6. **Submit form:** kirim `kode` level terdalam yang dipilih (biasanya
   kode desa) — kode ini sudah unik dan cukup untuk merepresentasikan
   alamat lengkap karena mengandung seluruh hierarki di atasnya (lihat
   "Format Kode Wilayah" di atas). Simpan `nama` di masing-masing level
   juga kalau aplikasi perlu menampilkan ulang alamat tanpa query API lagi.

Tidak perlu `X-API-Key` untuk seluruh alur ini — hanya endpoint baca yang
dipakai.

## Daftar Endpoint

### 1. `GET /api/wilayah?parent=<kode>`

Ambil daftar anak langsung dari sebuah kode. Tanpa `parent`, hasilnya
semua provinsi.

**Response `200`:**
```json
[{ "kode": "11", "nama": "Aceh" }, { "kode": "12", "nama": "Sumatera Utara" }]
```

### 2. `GET /api/wilayah/search?level=<1-4>&q=<teks>&limit=<n>`

Cari nama wilayah secara global (lintas seluruh Indonesia) dalam satu
level. `level` wajib (1-4), `q` wajib (non-empty), `limit` opsional
(default 20, maksimum 50).

**Response `200`:**
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

**Error `400`:** `level` di luar 1-4, atau `q` kosong.

### 3. `POST /api/wilayah` (butuh `X-API-Key`)

Buat wilayah baru.

**Body:**
```json
{ "kode": "11.02", "nama": "Kabupaten Aceh Selatan" }
```

**Response `201`:**
```json
{ "kode": "11.02", "nama": "Kabupaten Aceh Selatan" }
```

**Error:**
- `400` — format `kode` tidak valid untuk levelnya, atau `nama` kosong.
- `404` — kode induk tidak ditemukan (mis. buat `11.99` tapi `11` belum ada — tidak berlaku untuk provinsi level 1, yang tidak butuh induk).
- `409` — kode sudah terdaftar.
- `401` — API key tidak valid/kosong.

### 4. `PATCH /api/wilayah/:kode` (butuh `X-API-Key`)

Ubah nama wilayah. `kode` tidak bisa diubah lewat endpoint ini.

**Body:**
```json
{ "nama": "Nama Baru" }
```

**Response `200`:**
```json
{ "kode": "11.02", "nama": "Nama Baru" }
```

**Error:** `400` nama kosong, `404` kode tidak ditemukan, `401` API key tidak valid.

### 5. `DELETE /api/wilayah/:kode` (butuh `X-API-Key`)

Hapus satu wilayah. Ditolak jika masih ada wilayah di bawahnya (harus
hapus dari level terbawah dulu).

**Response `204`** (tanpa body).

**Error:** `404` kode tidak ditemukan, `409` masih ada wilayah di bawahnya
(`{"error": "Tidak bisa dihapus, masih ada wilayah di bawahnya"}`), `401`
API key tidak valid.

## Contoh Pemakaian

### curl

```bash
# Baca semua provinsi
curl "http://localhost:3001/api/wilayah"

# Cari nama desa
curl "http://localhost:3001/api/wilayah/search?level=4&q=sukamaju&limit=5"

# Tambah data (butuh API key)
curl -X POST "http://localhost:3001/api/wilayah" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: GANTI_DENGAN_API_KEY_ANDA" \
  -d '{"kode":"11.02","nama":"Kabupaten Aceh Selatan"}'

# Ubah nama
curl -X PATCH "http://localhost:3001/api/wilayah/11.02" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: GANTI_DENGAN_API_KEY_ANDA" \
  -d '{"nama":"Nama Baru"}'

# Hapus
curl -X DELETE "http://localhost:3001/api/wilayah/11.02" \
  -H "X-API-Key: GANTI_DENGAN_API_KEY_ANDA"
```

### Node.js (`fetch`, built-in sejak Node 18)

```js
const BASE_URL = 'http://localhost:3001';
const API_KEY = process.env.WILAYAH_API_KEY; // simpan API key di env, jangan hardcode

// Baca
async function getProvinsiList() {
  const res = await fetch(`${BASE_URL}/api/wilayah`);
  if (!res.ok) throw new Error(`Gagal: ${res.status}`);
  return res.json();
}

// Cari
async function searchDesa(q) {
  const params = new URLSearchParams({ level: '4', q, limit: '10' });
  const res = await fetch(`${BASE_URL}/api/wilayah/search?${params}`);
  return res.json();
}

// Tambah
async function createWilayah(kode, nama) {
  const res = await fetch(`${BASE_URL}/api/wilayah`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({ kode, nama }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Gagal: ${res.status}`);
  }
  return res.json();
}

// Ubah
async function updateNama(kode, nama) {
  const res = await fetch(`${BASE_URL}/api/wilayah/${encodeURIComponent(kode)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body: JSON.stringify({ nama }),
  });
  if (!res.ok) throw new Error(`Gagal: ${res.status}`);
  return res.json();
}

// Hapus
async function deleteWilayah(kode) {
  const res = await fetch(`${BASE_URL}/api/wilayah/${encodeURIComponent(kode)}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) throw new Error(`Gagal: ${res.status}`);
}
```

### PHP

```php
<?php

define('BASE_URL', 'http://localhost:3001');
define('API_KEY', getenv('WILAYAH_API_KEY')); // simpan API key di env, jangan hardcode

// Baca (GET sederhana, tanpa header khusus)
function getProvinsiList(): array {
    $json = file_get_contents(BASE_URL . '/api/wilayah');
    if ($json === false) {
        throw new RuntimeException('Gagal menghubungi API');
    }
    return json_decode($json, true);
}

// Cari
function searchDesa(string $q): array {
    $url = BASE_URL . '/api/wilayah/search?' . http_build_query([
        'level' => 4,
        'q' => $q,
        'limit' => 10,
    ]);
    $json = file_get_contents($url);
    return json_decode($json, true);
}

// Tambah (pakai curl karena butuh method POST + header custom)
function createWilayah(string $kode, string $nama): array {
    $ch = curl_init(BASE_URL . '/api/wilayah');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'POST',
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-API-Key: ' . API_KEY,
        ],
        CURLOPT_POSTFIELDS => json_encode(['kode' => $kode, 'nama' => $nama]),
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $body = json_decode($response, true);
    if ($status >= 400) {
        throw new RuntimeException($body['error'] ?? "Gagal: $status");
    }
    return $body;
}

// Ubah
function updateNama(string $kode, string $nama): array {
    $ch = curl_init(BASE_URL . '/api/wilayah/' . urlencode($kode));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'PATCH',
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'X-API-Key: ' . API_KEY,
        ],
        CURLOPT_POSTFIELDS => json_encode(['nama' => $nama]),
    ]);
    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status >= 400) {
        throw new RuntimeException("Gagal: $status");
    }
    return json_decode($response, true);
}

// Hapus
function deleteWilayah(string $kode): void {
    $ch = curl_init(BASE_URL . '/api/wilayah/' . urlencode($kode));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => 'DELETE',
        CURLOPT_HTTPHEADER => ['X-API-Key: ' . API_KEY],
    ]);
    curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status >= 400) {
        throw new RuntimeException("Gagal: $status");
    }
}
```

## Checklist Integrasi

Untuk AI/developer yang mengadaptasi aplikasi lain agar pakai API ini:

1. Konfirmasi base URL server ini (bukan `localhost:3001` kecuali memang satu mesin) — simpan sebagai env var di aplikasi yang mengintegrasikan (mis. `WILAYAH_API_BASE_URL`), jangan hardcode.
2. Kalau cuma butuh dropdown/tampilan alamat (kasus paling umum): implementasikan fetch wrapper untuk `GET /api/wilayah` dan `GET /api/wilayah/search` saja, ikuti "Pola Integrasi Dropdown Bertingkat" di atas. Tidak perlu API key.
3. Kalau juga butuh kelola data wilayah (tambah/ubah/hapus): minta `API_KEY` dari `.env` project ini ke user, simpan sebagai secret/env var di aplikasi lain (jangan pernah expose ke frontend/browser — panggil endpoint mutasi dari backend, bukan langsung dari client-side JS).
4. Tangani response non-2xx secara seragam: body selalu `{"error": "<pesan>"}` pada kegagalan, tampilkan/log pesan ini apa adanya (sudah dalam Bahasa Indonesia, siap ditampilkan ke user).
5. Uji alur lengkap dengan data asli sebelum menganggap selesai (mis. pilih provinsi nyata → pastikan kabupaten/kecamatan/desa ter-load benar).
