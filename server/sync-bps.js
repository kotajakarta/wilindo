/**
 * sync-bps.js
 * Sinkronkan tabel `wilayah` di database Wilindo dengan data resmi
 * BPS/Kemendagri (bridging-kode, sig.bps.go.id).
 *
 * PENTING soal sumber field: endpoint BPS mengembalikan DUA sistem kode
 * dalam satu response — `kode_bps` (nomor urut BPS sendiri) dan
 * `kode_dagri` (nomor urut Kemendagri, format berjenjang dgn titik).
 * Traversal parent->child endpoint BPS memakai `kode_bps`, TAPI kode yang
 * sudah dipakai live di tabel `wilayah` Wilindo cocok dengan `kode_dagri`
 * (sudah diverifikasi manual terhadap data production sebelum script ini
 * ditulis — kode_bps urutannya beda dan TIDAK boleh dipakai sebagai kode
 * wilayah Wilindo). Jadi: traversal pakai kode_bps, tapi kode & nama yang
 * disimpan ke Wilindo pakai kode_dagri & nama_dagri.
 *
 * Mode:
 *   node sync-bps.js            -> dry run: fetch BPS (atau pakai cache),
 *                                   backup tabel wilayah saat ini, hitung
 *                                   diff (insert/update/delete), simpan
 *                                   laporan, TIDAK mengubah database.
 *   node sync-bps.js --apply    -> jalankan hasil diff dari mode dry run
 *                                   (baca cache, tidak fetch ulang ke BPS).
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const BASE_URL = 'https://sig.bps.go.id/rest-bridging/getwilayah';
const PERIODE = '2025_2.2025';
const DELAY_MS = 100;
const CONCURRENCY = 5;

const DATA_DIR = path.resolve(__dirname, 'data');
const SOURCE_CACHE = path.join(DATA_DIR, 'bps-source-2025-2.json');
const BACKUP_FILE = path.join(
  DATA_DIR,
  `wilayah-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
);
const REPORT_FILE = path.join(DATA_DIR, 'bps-sync-report.json');

const LEVEL_PATTERNS = {
  1: /^\d{2}$/,
  2: /^\d{2}\.\d{2}$/,
  3: /^\d{2}\.\d{2}\.\d{2}$/,
  4: /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function titleCase(str) {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
        .join('-')
    )
    .join(' ');
}

async function fetchWilayah(level, parentKodeBps) {
  const url = `${BASE_URL}?level=${level}&parent=${parentKodeBps}&periode_merge=${PERIODE}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WilindoSync/1.0)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.json();
}

async function mapPool(items, concurrency, fn) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** Fetch seluruh hierarki dari BPS, kembalikan flat list {kode, nama, level} pakai field dagri. */
async function fetchAllFromBps() {
  const flat = [];
  const seen = new Map();

  function addRow(level, kode, namaDagri) {
    const nama = titleCase(namaDagri);
    if (!LEVEL_PATTERNS[level].test(kode)) {
      console.warn(`  ! Lewati (format kode_dagri tidak sesuai level ${level}): ${kode} (${nama})`);
      return;
    }
    if (seen.has(kode) && seen.get(kode) !== nama) {
      console.warn(`  ! Kode dagri dobel dengan nama beda: ${kode} ("${seen.get(kode)}" vs "${nama}")`);
    }
    seen.set(kode, nama);
    flat.push({ kode, nama, level });
  }

  console.log('1. Provinsi...');
  const provinces = await fetchWilayah('provinsi', '0');
  provinces.forEach((p) => addRow(1, p.kode_dagri, p.nama_dagri));
  console.log(`   -> ${provinces.length} provinsi`);

  console.log('2. Kabupaten/Kota...');
  const allRegencies = [];
  const regencyBatches = await mapPool(provinces, CONCURRENCY, async (prov) => {
    await sleep(DELAY_MS);
    return fetchWilayah('kabupaten', prov.kode_bps);
  });
  regencyBatches.forEach((list) => allRegencies.push(...list));
  console.log(`   -> ${allRegencies.length} kabupaten/kota`);

  // kode_dagri di level kabupaten kadang kehilangan trailing zero (mis.
  // "11.1" alih-alih "11.10" — kemungkinan besar karena BPS di suatu titik
  // memperlakukan kode 2-segmen "PP.KK" sebagai angka desimal, dan 11.10
  // sebagai float sama dengan 11.1). Prefix 2-segmen pada kode_dagri level
  // kecamatan TIDAK kena masalah ini (sudah diverifikasi manual ke data
  // live production), jadi dipakai sebagai sumber kebenaran untuk kode
  // kabupaten alih-alih kode_dagri kabupaten itu sendiri.
  console.log('3. Kecamatan (sekaligus koreksi kode kabupaten)...');
  const allDistricts = [];
  let doneReg = 0;
  const districtBatches = await mapPool(allRegencies, CONCURRENCY, async (kab) => {
    await sleep(DELAY_MS);
    const list = await fetchWilayah('kecamatan', kab.kode_bps);
    doneReg++;
    if (doneReg % 100 === 0) console.log(`   progress kab/kota: ${doneReg}/${allRegencies.length}`);
    return list;
  });
  districtBatches.forEach((list, i) => {
    const kab = allRegencies[i];
    const kabKode =
      list.length > 0 ? list[0].kode_dagri.split('.').slice(0, 2).join('.') : kab.kode_dagri;
    if (list.length === 0) {
      console.warn(`  ! Kabupaten tanpa kecamatan, pakai kode_dagri mentah: ${kab.kode_dagri} (${kab.nama_dagri})`);
    }
    addRow(2, kabKode, kab.nama_dagri);
    list.forEach((d) => addRow(3, d.kode_dagri, d.nama_dagri));
    allDistricts.push(...list);
  });
  console.log(`   -> ${allDistricts.length} kecamatan`);

  console.log('4. Desa/Kelurahan (paling lama)...');
  let doneKec = 0;
  await mapPool(allDistricts, CONCURRENCY, async (kec) => {
    await sleep(DELAY_MS);
    const list = await fetchWilayah('desa', kec.kode_bps);
    list.forEach((v) => addRow(4, v.kode_dagri, v.nama_dagri));
    doneKec++;
    if (doneKec % 200 === 0) console.log(`   progress kecamatan: ${doneKec}/${allDistricts.length}`);
    return list;
  });
  console.log(`   -> total baris: ${flat.length}`);

  return flat;
}

async function loadSource() {
  if (fs.existsSync(SOURCE_CACHE)) {
    console.log(`Pakai cache: ${SOURCE_CACHE}`);
    return JSON.parse(fs.readFileSync(SOURCE_CACHE, 'utf8'));
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const flat = await fetchAllFromBps();
  fs.writeFileSync(SOURCE_CACHE, JSON.stringify(flat));
  console.log(`Cache disimpan: ${SOURCE_CACHE}`);
  return flat;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = mysql.createPool(process.env.DATABASE_URL);

  const source = await loadSource();
  const sourceMap = new Map(source.map((r) => [r.kode, r.nama]));

  console.log('\nMembaca tabel wilayah saat ini...');
  const [currentRows] = await pool.query('SELECT kode, nama FROM wilayah');
  const currentMap = new Map(currentRows.map((r) => [r.kode, r.nama]));
  console.log(`   -> ${currentMap.size} baris di database`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BACKUP_FILE, JSON.stringify(currentRows));
  console.log(`Backup tabel wilayah saat ini disimpan: ${BACKUP_FILE}`);

  const toInsert = [];
  const toUpdate = [];
  const toDelete = [];

  for (const [kode, nama] of sourceMap) {
    if (!currentMap.has(kode)) {
      toInsert.push({ kode, nama });
    } else if (currentMap.get(kode) !== nama) {
      toUpdate.push({ kode, namaLama: currentMap.get(kode), namaBaru: nama });
    }
  }
  for (const [kode, nama] of currentMap) {
    if (!sourceMap.has(kode)) {
      toDelete.push({ kode, nama });
    }
  }

  const byLevel = (rows) => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const r of rows) counts[(r.kode.match(/\./g) || []).length + 1]++;
    return counts;
  };

  const report = {
    periode: PERIODE,
    generated_at: new Date().toISOString(),
    counts: {
      source_total: source.length,
      current_total: currentMap.size,
      insert: toInsert.length,
      update: toUpdate.length,
      delete: toDelete.length,
    },
    insert_by_level: byLevel(toInsert),
    update_by_level: byLevel(toUpdate),
    delete_by_level: byLevel(toDelete),
    sample_insert: toInsert.slice(0, 10),
    sample_update: toUpdate.slice(0, 10),
    sample_delete: toDelete.slice(0, 10),
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log('\n=== RINGKASAN DIFF ===');
  console.log(JSON.stringify(report.counts, null, 2));
  console.log('Tambah per level:', report.insert_by_level);
  console.log('Update per level:', report.update_by_level);
  console.log('Hapus per level:', report.delete_by_level);
  console.log(`\nLaporan lengkap: ${REPORT_FILE}`);

  if (!apply) {
    console.log('\nDRY RUN — tidak ada perubahan ke database. Jalankan ulang dengan --apply untuk eksekusi.');
    await pool.end();
    return;
  }

  console.log('\n=== APPLY: menulis ke database ===');

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  // Insert + update digabung lewat ON DUPLICATE KEY UPDATE.
  const upserts = [...toInsert, ...toUpdate.map((u) => ({ kode: u.kode, nama: u.namaBaru }))];
  let upserted = 0;
  for (const batch of chunk(upserts, 500)) {
    const placeholders = batch.map(() => '(?, ?)').join(', ');
    const params = batch.flatMap((r) => [r.kode, r.nama]);
    await pool.query(
      `INSERT INTO wilayah (kode, nama) VALUES ${placeholders} ON DUPLICATE KEY UPDATE nama = VALUES(nama)`,
      params
    );
    upserted += batch.length;
    console.log(`   upsert: ${upserted}/${upserts.length}`);
  }

  // Hapus dari level terdalam ke terluar supaya tidak ada sisa anak yatim.
  const deleteByLevelDesc = [4, 3, 2, 1].map((lvl) =>
    toDelete.filter((r) => (r.kode.match(/\./g) || []).length + 1 === lvl)
  );
  let deleted = 0;
  for (const levelRows of deleteByLevelDesc) {
    for (const batch of chunk(levelRows, 500)) {
      const placeholders = batch.map(() => '?').join(', ');
      await pool.query(`DELETE FROM wilayah WHERE kode IN (${placeholders})`, batch.map((r) => r.kode));
      deleted += batch.length;
      console.log(`   delete: ${deleted}/${toDelete.length}`);
    }
  }

  console.log(`\nSelesai. Upsert: ${upserts.length}, Delete: ${deleted}.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
