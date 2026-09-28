import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db';

const BPS_BASE_URL = 'https://sig.bps.go.id/rest-bridging/getwilayah';
const DELAY_MS = 80;
const CONCURRENCY = 5;

const BPS_DIR = path.resolve(__dirname, '../../bps');
const DATA_DIR = path.resolve(__dirname, '../data');

export type BpsSyncStage =
  | 'idle'
  | 'fetching_provinces'
  | 'fetching_regencies'
  | 'fetching_districts'
  | 'fetching_villages'
  | 'syncing_db'
  | 'done'
  | 'error';

export interface BpsSyncProgress {
  isRunning: boolean;
  stage: BpsSyncStage;
  stageLabel: string;
  percent: number;
  currentStep: number;
  totalSteps: number;
  message: string;
  logs: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  summary?: {
    periode: string;
    sourceTotal: number;
    currentTotal: number;
    insertCount: number;
    updateCount: number;
    deleteCount: number;
  };
}

const LEVEL_PATTERNS: Record<number, RegExp> = {
  1: /^\d{2}$/,
  2: /^\d{2}\.\d{2}$/,
  3: /^\d{2}\.\d{2}\.\d{2}$/,
  4: /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/,
};

function titleCase(str: string): string {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBpsWithRetry(url: string, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WilindoBpsSync/1.0)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(300 * attempt);
    }
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onItemDone?: (completedCount: number, total: number) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;
  let completed = 0;

  async function worker() {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
      completed++;
      if (onItemDone) onItemDone(completed, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

class BpsSyncManager {
  private state: BpsSyncProgress = {
    isRunning: false,
    stage: 'idle',
    stageLabel: 'Siap',
    percent: 0,
    currentStep: 0,
    totalSteps: 0,
    message: 'Belum ada proses sinkronisasi yang berjalan',
    logs: [],
  };

  private listeners = new Set<(progress: BpsSyncProgress) => void>();

  public getProgress(): BpsSyncProgress {
    return { ...this.state, logs: [...this.state.logs] };
  }

  public subscribe(listener: (progress: BpsSyncProgress) => void): () => void {
    this.listeners.add(listener);
    listener(this.getProgress());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private broadcast() {
    const snapshot = this.getProgress();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in progress listener:', err);
      }
    }
  }

  private addLog(msg: string) {
    const time = new Date().toLocaleTimeString('id-ID');
    const logEntry = `[${time}] ${msg}`;
    this.state.logs.push(logEntry);
    if (this.state.logs.length > 100) {
      this.state.logs.shift();
    }
  }

  private update(partial: Partial<BpsSyncProgress>) {
    Object.assign(this.state, partial);
    this.broadcast();
  }

  public async startSync(mode: 'online' | 'local', periode: string = '2025_2.2025'): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('Proses sinkronisasi sedang berjalan!');
    }

    this.state = {
      isRunning: true,
      stage: 'idle',
      stageLabel: 'Memulai...',
      percent: 0,
      currentStep: 0,
      totalSteps: 0,
      message: 'Mempersiapkan proses sinkronisasi...',
      logs: [],
      startedAt: new Date().toISOString(),
    };
    this.addLog(`Memulai sinkronisasi (Mode: ${mode}, Periode: ${periode})`);
    this.broadcast();

    // Jalankan di background agar request tidak blocking
    (async () => {
      try {
        let provinces: any[] = [];
        let regencies: any[] = [];
        let districts: any[] = [];
        let villages: any[] = [];

        if (mode === 'online') {
          // ================= 1. PROVINSI (0% - 2%) =================
          this.update({
            stage: 'fetching_provinces',
            stageLabel: 'Mengunduh Provinsi',
            percent: 1,
            message: 'Mengambil daftar Provinsi dari BPS...',
          });
          this.addLog('1. Mengambil daftar Provinsi...');
          provinces = await fetchBpsWithRetry(
            `${BPS_BASE_URL}?level=provinsi&parent=0&periode_merge=${periode}`
          );
          this.addLog(`   -> Berhasil mendapatkan ${provinces.length} provinsi`);

          // ================= 2. KABUPATEN/KOTA (2% - 8%) =================
          this.update({
            stage: 'fetching_regencies',
            stageLabel: 'Mengunduh Kab/Kota',
            percent: 3,
            currentStep: 0,
            totalSteps: provinces.length,
            message: `Mengambil Kab/Kota dari ${provinces.length} provinsi...`,
          });
          this.addLog('2. Mengambil Kab/Kota...');

          const regencyBatches = await mapPool(
            provinces,
            CONCURRENCY,
            async (prov) => {
              await sleep(DELAY_MS);
              const list = await fetchBpsWithRetry(
                `${BPS_BASE_URL}?level=kabupaten&parent=${prov.kode_bps}&periode_merge=${periode}`
              );
              return list.map((r: any) => ({
                ...r,
                parent_bps: prov.kode_bps,
                parent_name: prov.nama_bps,
              }));
            },
            (done, total) => {
              const pct = 3 + Math.round((done / total) * 5); // 3% -> 8%
              this.update({
                percent: pct,
                currentStep: done,
                totalSteps: total,
                message: `Mengambil Kab/Kota: ${done}/${total} provinsi selesai`,
              });
            }
          );
          regencyBatches.forEach((batch) => regencies.push(...batch));
          this.addLog(`   -> Total ${regencies.length} kab/kota`);

          // ================= 3. KECAMATAN (8% - 25%) =================
          this.update({
            stage: 'fetching_districts',
            stageLabel: 'Mengunduh Kecamatan',
            percent: 8,
            currentStep: 0,
            totalSteps: regencies.length,
            message: `Mengambil Kecamatan dari ${regencies.length} kab/kota...`,
          });
          this.addLog('3. Mengambil Kecamatan...');

          let lastDistLog = 0;
          const districtBatches = await mapPool(
            regencies,
            CONCURRENCY,
            async (kab) => {
              await sleep(DELAY_MS);
              const list = await fetchBpsWithRetry(
                `${BPS_BASE_URL}?level=kecamatan&parent=${kab.kode_bps}&periode_merge=${periode}`
              );
              return list.map((d: any) => ({
                ...d,
                parent_bps: kab.kode_bps,
                parent_name: kab.nama_bps,
                province_bps: kab.parent_bps,
              }));
            },
            (done, total) => {
              const pct = 8 + Math.round((done / total) * 17); // 8% -> 25%
              this.update({
                percent: pct,
                currentStep: done,
                totalSteps: total,
                message: `Mengambil Kecamatan: ${done}/${total} kab/kota selesai`,
              });
              if (done - lastDistLog >= 100 || done === total) {
                this.addLog(`   Progress Kecamatan: ${done}/${total} kab/kota`);
                lastDistLog = done;
              }
            }
          );
          districtBatches.forEach((batch) => districts.push(...batch));
          this.addLog(`   -> Total ${districts.length} kecamatan`);

          // ================= 4. DESA/KELURAHAN (25% - 85%) =================
          this.update({
            stage: 'fetching_villages',
            stageLabel: 'Mengunduh Desa/Kelurahan',
            percent: 25,
            currentStep: 0,
            totalSteps: districts.length,
            message: `Mengambil Desa/Kelurahan dari ${districts.length} kecamatan...`,
          });
          this.addLog('4. Mengambil Desa/Kelurahan (~80k+ data)...');

          let lastVillLog = 0;
          const villageBatches = await mapPool(
            districts,
            CONCURRENCY,
            async (kec) => {
              await sleep(DELAY_MS);
              const list = await fetchBpsWithRetry(
                `${BPS_BASE_URL}?level=desa&parent=${kec.kode_bps}&periode_merge=${periode}`
              );
              return list.map((v: any) => ({
                ...v,
                parent_bps: kec.kode_bps,
                parent_name: kec.nama_bps,
                regency_bps: kec.parent_bps,
                province_bps: kec.province_bps,
              }));
            },
            (done, total) => {
              const pct = 25 + Math.round((done / total) * 60); // 25% -> 85%
              this.update({
                percent: pct,
                currentStep: done,
                totalSteps: total,
                message: `Mengambil Desa/Kelurahan: ${done}/${total} kecamatan selesai`,
              });
              if (done - lastVillLog >= 500 || done === total) {
                this.addLog(`   Progress Desa: ${done}/${total} kecamatan (${pct}%)`);
                lastVillLog = done;
              }
            }
          );
          villageBatches.forEach((batch) => villages.push(...batch));
          this.addLog(`   -> Total ${villages.length} desa/kelurahan`);

          // Simpan hasil ekstraksi ke folder bps/
          fs.mkdirSync(BPS_DIR, { recursive: true });
          fs.writeFileSync(path.join(BPS_DIR, 'provinces.json'), JSON.stringify(provinces, null, 2));
          fs.writeFileSync(path.join(BPS_DIR, 'regencies.json'), JSON.stringify(regencies, null, 2));
          fs.writeFileSync(path.join(BPS_DIR, 'districts.json'), JSON.stringify(districts, null, 2));
          fs.writeFileSync(path.join(BPS_DIR, 'villages.json'), JSON.stringify(villages, null, 2));

          // Hierarchical tree (dioptimasi menggunakan Map lookup)
          const villagesByKec = new Map<string, any[]>();
          for (const v of villages) {
            if (!villagesByKec.has(v.parent_bps)) villagesByKec.set(v.parent_bps, []);
            villagesByKec.get(v.parent_bps)!.push(v);
          }
          const districtsByKab = new Map<string, any[]>();
          for (const d of districts) {
            if (!districtsByKab.has(d.parent_bps)) districtsByKab.set(d.parent_bps, []);
            districtsByKab.get(d.parent_bps)!.push(d);
          }
          const regenciesByProv = new Map<string, any[]>();
          for (const r of regencies) {
            if (!regenciesByProv.has(r.parent_bps)) regenciesByProv.set(r.parent_bps, []);
            regenciesByProv.get(r.parent_bps)!.push(r);
          }

          const tree = provinces.map((prov) => {
            const kabList = regenciesByProv.get(prov.kode_bps) || [];
            return {
              ...prov,
              kabkota: kabList.map((kab) => {
                const kecList = districtsByKab.get(kab.kode_bps) || [];
                return {
                  ...kab,
                  kecamatan: kecList.map((kec) => {
                    const desaList = villagesByKec.get(kec.kode_bps) || [];
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
            path.join(BPS_DIR, 'wilayah-hierarchical.json'),
            JSON.stringify(tree, null, 2)
          );

          const summary = {
            periode,
            extracted_at: new Date().toISOString(),
            counts: {
              provinsi: provinces.length,
              kabkota: regencies.length,
              kecamatan: districts.length,
              desa: villages.length,
            },
          };
          fs.writeFileSync(path.join(BPS_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
          this.addLog('   -> Berkas bps/*.json berhasil diperbarui');
        } else {
          // Mode local: baca dari file bps/*.json yang ada
          this.update({
            stage: 'syncing_db',
            stageLabel: 'Membaca File Lokal',
            percent: 50,
            message: 'Membaca berkas bps/*.json lokal...',
          });
          this.addLog('Membaca berkas bps/*.json lokal...');
          provinces = JSON.parse(fs.readFileSync(path.join(BPS_DIR, 'provinces.json'), 'utf8'));
          regencies = JSON.parse(fs.readFileSync(path.join(BPS_DIR, 'regencies.json'), 'utf8'));
          districts = JSON.parse(fs.readFileSync(path.join(BPS_DIR, 'districts.json'), 'utf8'));
          villages = JSON.parse(fs.readFileSync(path.join(BPS_DIR, 'villages.json'), 'utf8'));
        }

        // ================= 5. SINKRONISASI DATABASE (85% - 100%) =================
        this.update({
          stage: 'syncing_db',
          stageLabel: 'Sinkronisasi Database',
          percent: 86,
          message: 'Menghubungkan ke database MySQL & backup tabel wilayah...',
        });
        this.addLog('5. Sinkronisasi tabel wilayah di database MySQL...');

        // Normalisasi flat data dari data BPS
        const flat: Array<{ kode: string; nama: string; level: number }> = [];
        const seen = new Map<string, string>();

        function addRow(level: number, kode: string, namaDagri: string) {
          if (!kode || !namaDagri) return;
          const nama = titleCase(namaDagri);
          if (!LEVEL_PATTERNS[level].test(kode)) return;
          seen.set(kode, nama);
          flat.push({ kode, nama, level });
        }

        provinces.forEach((p) => addRow(1, p.kode_dagri, p.nama_dagri));

        const districtsByRegencyBps = new Map<string, any[]>();
        for (const d of districts) {
          if (!districtsByRegencyBps.has(d.parent_bps)) districtsByRegencyBps.set(d.parent_bps, []);
          districtsByRegencyBps.get(d.parent_bps)!.push(d);
        }

        for (const kab of regencies) {
          const kecList = districtsByRegencyBps.get(kab.kode_bps) || [];
          const kabKode =
            kecList.length > 0 ? kecList[0].kode_dagri.split('.').slice(0, 2).join('.') : kab.kode_dagri;
          addRow(2, kabKode, kab.nama_dagri);
        }

        districts.forEach((d) => addRow(3, d.kode_dagri, d.nama_dagri));
        villages.forEach((v) => addRow(4, v.kode_dagri, v.nama_dagri));

        const sourceMap = new Map(flat.map((r) => [r.kode, r.nama]));
        this.addLog(`   -> Total ${sourceMap.size} wilayah dari sumber BPS/Dagri`);

        // Baca tabel wilayah saat ini
        const [currentRows]: any = await pool.query('SELECT kode, nama FROM wilayah');
        const currentMap = new Map<string, string>(currentRows.map((r: any) => [r.kode, r.nama]));
        this.addLog(`   -> ${currentMap.size} baris wilayah saat ini di database`);

        // Simpan backup otomatis
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const backupFile = path.join(
          DATA_DIR,
          `wilayah-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        );
        fs.writeFileSync(backupFile, JSON.stringify(currentRows));
        this.addLog(`   -> Backup database disimpan di server/data/`);

        // Hitung Diff
        const toInsert: Array<{ kode: string; nama: string }> = [];
        const toUpdate: Array<{ kode: string; namaLama: string; namaBaru: string }> = [];
        const toDelete: Array<{ kode: string; nama: string }> = [];

        for (const [kode, nama] of sourceMap) {
          if (!currentMap.has(kode)) {
            toInsert.push({ kode, nama });
          } else if (currentMap.get(kode) !== nama) {
            toUpdate.push({ kode, namaLama: currentMap.get(kode)!, namaBaru: nama });
          }
        }
        for (const [kode, nama] of currentMap) {
          if (!sourceMap.has(kode)) {
            toDelete.push({ kode, nama });
          }
        }

        this.addLog(
          `   -> Ringkasan diff: Tambah=${toInsert.length}, Ubah=${toUpdate.length}, Hapus=${toDelete.length}`
        );

        // Eksekusi Upsert (Insert + Update)
        const upserts = [...toInsert, ...toUpdate.map((u) => ({ kode: u.kode, nama: u.namaBaru }))];
        function chunk<T>(arr: T[], size: number): T[][] {
          const out: T[][] = [];
          for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
          return out;
        }

        const upsertBatches = chunk(upserts, 500);
        let upsertedCount = 0;

        for (let i = 0; i < upsertBatches.length; i++) {
          const batch = upsertBatches[i];
          const placeholders = batch.map(() => '(?, ?)').join(', ');
          const params = batch.flatMap((r) => [r.kode, r.nama]);
          await pool.query(
            `INSERT INTO wilayah (kode, nama) VALUES ${placeholders} ON DUPLICATE KEY UPDATE nama = VALUES(nama)`,
            params
          );
          upsertedCount += batch.length;
          const pct = 88 + Math.round((upsertedCount / Math.max(1, upserts.length)) * 7); // 88% -> 95%
          this.update({
            percent: pct,
            message: `Menyimpan perubahan ke DB: ${upsertedCount}/${upserts.length} baris`,
          });
        }

        // Eksekusi Delete berjenjang dari level 4 ke level 1
        const deleteByLevelDesc = [4, 3, 2, 1].map((lvl) =>
          toDelete.filter((r) => (r.kode.match(/\./g) || []).length + 1 === lvl)
        );
        let deletedCount = 0;

        for (const levelRows of deleteByLevelDesc) {
          for (const batch of chunk(levelRows, 500)) {
            const placeholders = batch.map(() => '?').join(', ');
            await pool.query(
              `DELETE FROM wilayah WHERE kode IN (${placeholders})`,
              batch.map((r) => r.kode)
            );
            deletedCount += batch.length;
          }
        }

        // Simpan report diff
        const report = {
          periode,
          generated_at: new Date().toISOString(),
          counts: {
            source_total: sourceMap.size,
            current_total: currentMap.size,
            insert: toInsert.length,
            update: toUpdate.length,
            delete: toDelete.length,
          },
        };
        fs.writeFileSync(path.join(DATA_DIR, 'bps-sync-report.json'), JSON.stringify(report, null, 2));

        this.addLog(`✅ Selesai! Upsert: ${upserts.length}, Delete: ${deletedCount}`);

        this.update({
          isRunning: false,
          stage: 'done',
          stageLabel: 'Selesai',
          percent: 100,
          currentStep: sourceMap.size,
          totalSteps: sourceMap.size,
          message: `Sinkronisasi BPS berhasil selesai (${upserts.length} tersinkron, ${deletedCount} dihapus).`,
          completedAt: new Date().toISOString(),
          summary: {
            periode,
            sourceTotal: sourceMap.size,
            currentTotal: currentMap.size,
            insertCount: toInsert.length,
            updateCount: toUpdate.length,
            deleteCount: toDelete.length,
          },
        });
      } catch (err: any) {
        console.error('BPS Sync Error:', err);
        this.addLog(`❌ ERROR: ${err.message || 'Terjadi kesalahan sistem'}`);
        this.update({
          isRunning: false,
          stage: 'error',
          stageLabel: 'Gagal',
          message: err.message || 'Terjadi kesalahan saat sinkronisasi',
          error: err.message || 'Unknown error',
          completedAt: new Date().toISOString(),
        });
      }
    })();
  }
}

export const bpsSyncManager = new BpsSyncManager();
