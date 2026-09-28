import { pool } from './db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export interface AllowedDomain {
  id: number;
  domain: string;
  keterangan: string | null;
  created_at: string;
}

// Built-in domains yang selalu diizinkan (domain internal Wilindo & domain induk)
const DEFAULT_ALLOWED_DOMAINS = ['nri.my.id', 'wil.nri.my.id'];

let cachedDomains: AllowedDomain[] = [];
let cachedDomainBases: string[] = [...DEFAULT_ALLOWED_DOMAINS];
let isInitialized = false;

/**
 * Membersihkan format domain agar hanya menyisakan hostname dasar lowercase.
 * Contoh input: 'https://App.TokoSaya.Com:8080/path' -> 'tokosaya.com'
 * Contoh input: '*.tokoku.id' -> 'tokoku.id'
 */
export function cleanDomainInput(input: string): string {
  if (!input) return '';
  let cleaned = input.trim().toLowerCase();

  // Buang protokol (http://, https://, //)
  cleaned = cleaned.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
  cleaned = cleaned.replace(/^\/\//, '');

  // Buang path dan query string
  cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];

  // Buang port (:3000)
  cleaned = cleaned.split(':')[0];

  // Buang wildcard prefix (*.example.com -> example.com)
  cleaned = cleaned.replace(/^\*\./, '');

  // Buang leading/trailing dot
  cleaned = cleaned.replace(/^\.+|\.+$/g, '');

  return cleaned;
}

/**
 * Validasi apakah string adalah nama domain yang valid
 */
export function isValidDomainFormat(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  // Format standar domain: label dipisah titik, tiap label 1-63 karakter alfanumerik atau tanda hubung
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
  // Bolehkan juga localhost
  if (domain === 'localhost') return true;
  return domainRegex.test(domain);
}

/**
 * Ekstrak hostname dari string Origin atau URL
 */
export function extractHostname(originOrUrl: string): string {
  if (!originOrUrl) return '';
  let target = originOrUrl.trim().toLowerCase();
  try {
    if (target.includes('://')) {
      const url = new URL(target);
      return url.hostname;
    }
  } catch {
    // Fallback jika bukan URL standar
  }
  // Bersihkan manual
  return cleanDomainInput(target);
}

/**
 * Cek apakah hostname diizinkan berdasarkan basis domain di whitelist.
 * Jika base = 'tokosaya.com':
 * - 'tokosaya.com' -> true (exact)
 * - 'app.tokosaya.com' -> true (.tokosaya.com)
 * - 'api.sub.tokosaya.com' -> true (.tokosaya.com)
 * - 'eviltokosaya.com' -> false
 * - 'tokosaya.com.evil.com' -> false
 */
export function isHostnameAllowed(hostname: string, allowedBases: string[] = cachedDomainBases): boolean {
  if (!hostname) return false;
  const cleanHost = hostname.trim().toLowerCase();

  // Mode development: otomatis izinkan localhost & IP lokal
  if (process.env.NODE_ENV !== 'production') {
    if (
      cleanHost === 'localhost' ||
      cleanHost === '127.0.0.1' ||
      cleanHost.startsWith('192.168.') ||
      cleanHost.startsWith('10.') ||
      cleanHost.endsWith('.localhost')
    ) {
      return true;
    }
  }

  for (const base of allowedBases) {
    const cleanBase = base.trim().toLowerCase();
    if (!cleanBase) continue;
    if (cleanHost === cleanBase || cleanHost.endsWith('.' + cleanBase)) {
      return true;
    }
  }

  return false;
}

/**
 * Inisialisasi tabel allowed_domains di database
 */
export async function initAllowedDomainsTable(): Promise<void> {
  if (isInitialized) return;

  const sql = `
    CREATE TABLE IF NOT EXISTS allowed_domains (
      id INT AUTO_INCREMENT PRIMARY KEY,
      domain VARCHAR(255) NOT NULL UNIQUE,
      keterangan VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  await pool.query(sql);
  await refreshAllowedDomainsCache();
  isInitialized = true;
}

/**
 * Muat ulang data domain ke in-memory cache
 */
export async function refreshAllowedDomainsCache(): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, domain, keterangan, created_at FROM allowed_domains ORDER BY id DESC'
    );

    cachedDomains = (rows as AllowedDomain[]).map(r => ({
      id: r.id,
      domain: r.domain,
      keterangan: r.keterangan,
      created_at: r.created_at,
    }));

    const baseSet = new Set<string>(DEFAULT_ALLOWED_DOMAINS);
    for (const d of cachedDomains) {
      if (d.domain) {
        baseSet.add(cleanDomainInput(d.domain));
      }
    }

    cachedDomainBases = Array.from(baseSet);
  } catch (err) {
    console.error('Gagal memperbarui cache allowed_domains:', err);
    // Tetap gunakan default domains jika query gagal
    cachedDomainBases = [...DEFAULT_ALLOWED_DOMAINS];
  }
}

/**
 * Dapatkan seluruh daftar domain yang diizinkan
 */
export async function getAllowedDomains(): Promise<AllowedDomain[]> {
  if (!isInitialized) {
    await initAllowedDomainsTable();
  }
  return cachedDomains;
}

/**
 * Tambah domain baru ke whitelist
 */
export async function addAllowedDomain(rawDomain: string, keterangan?: string): Promise<AllowedDomain> {
  const domain = cleanDomainInput(rawDomain);

  if (!domain) {
    throw new Error('Nama domain tidak boleh kosong');
  }

  if (!isValidDomainFormat(domain)) {
    throw new Error('Format domain tidak valid. Contoh yang benar: tokosaya.com atau mitra.co.id');
  }

  if (!isInitialized) {
    await initAllowedDomainsTable();
  }

  // Cek duplikasi
  const [existing] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM allowed_domains WHERE domain = ? LIMIT 1',
    [domain]
  );
  if (existing.length > 0) {
    throw new Error(`Domain "${domain}" sudah terdaftar di whitelist`);
  }

  const [res] = await pool.query<ResultSetHeader>(
    'INSERT INTO allowed_domains (domain, keterangan) VALUES (?, ?)',
    [domain, keterangan ? keterangan.trim() : null]
  );

  await refreshAllowedDomainsCache();

  return {
    id: res.insertId,
    domain,
    keterangan: keterangan?.trim() || null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Hapus domain dari whitelist berdasarkan id
 */
export async function deleteAllowedDomain(id: number): Promise<boolean> {
  if (!isInitialized) {
    await initAllowedDomainsTable();
  }

  const [res] = await pool.query<ResultSetHeader>(
    'DELETE FROM allowed_domains WHERE id = ?',
    [id]
  );

  await refreshAllowedDomainsCache();
  return res.affectedRows > 0;
}
