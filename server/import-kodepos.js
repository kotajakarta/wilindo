/**
 * import-kodepos.js
 * Impor dataset kodepos (cahyadsn/wilayah_kodepos) ke database MySQL Wilindo.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function main() {
  const sqlFile = path.resolve(__dirname, 'data/wilayah_kodepos.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error(`Berkas ${sqlFile} tidak ditemukan!`);
    process.exit(1);
  }

  console.log('Membaca berkas SQL...');
  let sqlContent = fs.readFileSync(sqlFile, 'utf8').replace(/^\uFEFF/, '');

  console.log('Menghubungkan ke database MySQL...');
  const connection = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
  });

  console.log('Mengeksekusi SQL impor wilayah_kodepos...');
  const startTime = Date.now();
  await connection.query(sqlContent);

  const [rows] = await connection.query('SELECT COUNT(*) as total FROM wilayah_kodepos');
  const total = rows[0].total;
  console.log(`✅ Sukses! ${total} baris data kode pos berhasil diimpor dalam ${((Date.now() - startTime) / 1000).toFixed(2)}s.`);

  // Contoh data
  const [sample] = await connection.query('SELECT * FROM wilayah_kodepos LIMIT 5');
  console.log('Contoh data:', sample);

  await connection.end();
}

main().catch((err) => {
  console.error('Error saat impor kode pos:', err);
  process.exit(1);
});
