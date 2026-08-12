/**
 * extract-wilayah-bps.js
 * Ekstrak data wilayah Indonesia dari sig.bps.go.id
 * Level: Provinsi → Kab/Kota → Kecamatan → Desa/Kelurahan
 *
 * Usage: node extract-wilayah-bps.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://sig.bps.go.id/rest-bridging/getwilayah';
const PERIODE = '2025_2.2025';
const DELAY_MS = 100;          // delay antar request (ms)
const CONCURRENCY = 5;         // max concurrent request
const OUTPUT_DIR = __dirname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWilayah(level, parent) {
  const url = `${BASE_URL}?level=${level}&parent=${parent}&periode_merge=${PERIODE}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WilayahExtractor/1.0)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} – ${url}`);
  }
  return res.json();
}

/** Simple concurrency pool */
async function mapPool(items, concurrency, fn) {
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('1. Mengambil daftar Provinsi...');
  const provinces = await fetchWilayah('provinsi', '0');
  console.log(`   → ${provinces.length} provinsi`);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'provinces.json'),
    JSON.stringify(provinces, null, 2)
  );

  const allRegencies = [];
  const allDistricts = [];
  const allVillages = [];

  // ========== Kab/Kota ==========
  console.log('\n2. Mengambil Kab/Kota...');
  const regencyBatches = await mapPool(provinces, CONCURRENCY, async (prov) => {
    await sleep(DELAY_MS);
    const list = await fetchWilayah('kabupaten', prov.kode_bps);
    console.log(`   ${prov.nama_bps}: ${list.length} kab/kota`);
    return list.map((r) => ({
      ...r,
      parent_bps: prov.kode_bps,
      parent_name: prov.nama_bps,
    }));
  });
  regencyBatches.forEach((batch) => allRegencies.push(...batch));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'regencies.json'),
    JSON.stringify(allRegencies, null, 2)
  );
  console.log(`   Total kab/kota: ${allRegencies.length}`);

  // ========== Kecamatan ==========
  console.log('\n3. Mengambil Kecamatan...');
  const districtBatches = await mapPool(allRegencies, CONCURRENCY, async (kab) => {
    await sleep(DELAY_MS);
    const list = await fetchWilayah('kecamatan', kab.kode_bps);
    process.stdout.write(`   ${kab.nama_bps}: ${list.length}\r`);
    return list.map((d) => ({
      ...d,
      parent_bps: kab.kode_bps,
      parent_name: kab.nama_bps,
      province_bps: kab.parent_bps,
    }));
  });
  districtBatches.forEach((batch) => allDistricts.push(...batch));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'districts.json'),
    JSON.stringify(allDistricts, null, 2)
  );
  console.log(`\n   Total kecamatan: ${allDistricts.length}`);

  // ========== Desa/Kelurahan ==========
  console.log('\n4. Mengambil Desa/Kelurahan (ini lama, ~80k+ data)...');
  let done = 0;
  const villageBatches = await mapPool(allDistricts, CONCURRENCY, async (kec) => {
    await sleep(DELAY_MS);
    const list = await fetchWilayah('desa', kec.kode_bps);
    done++;
    if (done % 50 === 0) {
      console.log(`   Progress: ${done}/${allDistricts.length} kecamatan`);
    }
    return list.map((v) => ({
      ...v,
      parent_bps: kec.kode_bps,
      parent_name: kec.nama_bps,
      regency_bps: kec.parent_bps,
      province_bps: kec.province_bps,
    }));
  });
  villageBatches.forEach((batch) => allVillages.push(...batch));
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'villages.json'),
    JSON.stringify(allVillages, null, 2)
  );
  console.log(`   Total desa/kelurahan: ${allVillages.length}`);

  // ========== Hierarchical tree (opsional, file besar) ==========
  console.log('\n5. Membuat struktur hierarchical...');
  const tree = provinces.map((prov) => {
    const kabList = allRegencies.filter((r) => r.parent_bps === prov.kode_bps);
    return {
      ...prov,
      kabkota: kabList.map((kab) => {
        const kecList = allDistricts.filter((d) => d.parent_bps === kab.kode_bps);
        return {
          ...kab,
          kecamatan: kecList.map((kec) => {
            const desaList = allVillages.filter((v) => v.parent_bps === kec.kode_bps);
            return {
              ...kec,
              desa: desaList,
            };
          }),
        };
      }),
    };
  });

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'wilayah-hierarchical.json'),
    JSON.stringify(tree, null, 2)
  );

  // Summary
  const summary = {
    periode: PERIODE,
    extracted_at: new Date().toISOString(),
    counts: {
      provinsi: provinces.length,
      kabkota: allRegencies.length,
      kecamatan: allDistricts.length,
      desa: allVillages.length,
    },
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log('\n✅ Selesai!');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nFile disimpan di folder: ${OUTPUT_DIR}/`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});