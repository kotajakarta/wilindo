/**
 * sync-bps.js
 * Sinkronkan tabel `wilayah` di database Wilindo dengan data resmi
 * BPS/Kemendagri, dibaca dari file lokal bps/*.json (hasil ekstraksi
 * bps/bps.js — jalankan itu dulu kalau file belum ada / mau data terbaru).
 *
 * PENTING soal sumber field: bps/*.json punya DUA sistem kode per baris —
 * `kode_bps` (nomor urut BPS sendiri, dipakai sebagai join key parent_bps/
 * province_bps/regency_bps antar level) dan `kode_dagri` (nomor urut
 * Kemendagri, format berjenjang dgn titik). Kode yang dipakai live di
 * tabel `wilayah` Wilindo cocok dengan `kode_dagri` (sudah diverifikasi
 * manual terhadap data production) — kode_bps urutannya beda dan TIDAK
 * boleh dipakai sebagai kode wilayah Wilindo.
 *
 * kode_dagri level kabupaten (2 segmen) di regencies.json kadang
 * kehilangan trailing zero (mis. "11.1" alih-alih "11.10" — BPS di suatu
 * titik memperlakukan kode 2-segmen "PP.KK" sebagai angka desimal, dan
 * 11.10 sebagai float sama dengan 11.1). Prefix 2-segmen pada kode_dagri
 * level kecamatan TIDAK kena masalah ini, jadi dipakai sebagai sumber
 * kebenaran untuk kode kabupaten alih-alih kode_dagri kabupaten itu
 * sendiri.
 *
 * Mode:
 *   node sync-bps.js            -> dry run: baca bps/*.json, backup tabel
 *                                   wilayah saat ini, hitung diff
 *                                   (insert/update/delete), simpan
 *                                   laporan, TIDAK mengubah database.
 *   node sync-bps.js --apply    -> jalankan hasil diff dari mode dry run
 *                                   (baca ulang bps/*.json, tidak fetch
 *                                   apa pun).
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

const BPS_DIR = path.resolve(__dirname, '../bps');

const DATA_DIR = path.resolve(__dirname, 'data');
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

function readBpsJson(filename) {
  const filePath = path.join(BPS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `File sumber tidak ditemukan: ${filePath}\n` +
        `Jalankan "node bps/bps.js" dulu untuk mengekstrak data BPS terbaru.`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Baca & gabung seluruh hierarki dari bps/*.json, kembalikan flat list {kode, nama, level} pakai field dagri. */
function buildFlatFromLocalFiles() {
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
  const provinces = readBpsJson('provinces.json');
  provinces.forEach((p) => addRow(1, p.kode_dagri, p.nama_dagri));
  console.log(`   -> ${provinces.length} provinsi`);

  console.log('2. Kabupaten/Kota (koreksi kode dari kecamatan)...');
  const regencies = readBpsJson('regencies.json');
  const districts = readBpsJson('districts.json');

  const districtsByRegencyBps = new Map();
  for (const d of districts) {
    if (!districtsByRegencyBps.has(d.parent_bps)) districtsByRegencyBps.set(d.parent_bps, []);
    districtsByRegencyBps.get(d.parent_bps).push(d);
  }

  for (const kab of regencies) {
    const kecList = districtsByRegencyBps.get(kab.kode_bps) || [];
    const kabKode =
      kecList.length > 0 ? kecList[0].kode_dagri.split('.').slice(0, 2).join('.') : kab.kode_dagri;
    if (kecList.length === 0) {
      console.warn(`  ! Kabupaten tanpa kecamatan, pakai kode_dagri mentah: ${kab.kode_dagri} (${kab.nama_dagri})`);
    }
    addRow(2, kabKode, kab.nama_dagri);
  }
  console.log(`   -> ${regencies.length} kabupaten/kota`);

  console.log('3. Kecamatan...');
  districts.forEach((d) => addRow(3, d.kode_dagri, d.nama_dagri));
  console.log(`   -> ${districts.length} kecamatan`);

  console.log('4. Desa/Kelurahan...');
  const villages = readBpsJson('villages.json');
  villages.forEach((v) => addRow(4, v.kode_dagri, v.nama_dagri));
  console.log(`   -> ${villages.length} desa/kelurahan`);

  console.log(`   -> total baris: ${flat.length}`);

  return flat;
}

function loadSource() {
  const summary = readBpsJson('summary.json');
  console.log(`Sumber: bps/*.json (periode ${summary.periode}, diekstrak ${summary.extracted_at})`);
  return { source: buildFlatFromLocalFiles(), periode: summary.periode };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const pool = mysql.createPool(process.env.DATABASE_URL);

  const { source, periode } = loadSource();
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
    periode,
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
