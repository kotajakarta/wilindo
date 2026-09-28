export interface WilayahItem {
  kode: string;
  nama: string;
  kodepos?: string | null;
}

export interface WilayahSearchResult extends WilayahItem {
  path: WilayahItem[];
}

export type WilayahLevel = 1 | 2 | 3 | 4;

export interface QueryablePool {
  query(sql: string, params?: unknown[]): Promise<[unknown, unknown]>;
}

export async function getChildren(
  pool: QueryablePool,
  parentKode?: string
): Promise<WilayahItem[]> {
  if (!parentKode) {
    const [rows] = await pool.query(
      "SELECT w.kode, w.nama, k.kodepos FROM wilayah w LEFT JOIN wilayah_kodepos k ON w.kode = k.kode WHERE w.kode NOT LIKE '%.%' ORDER BY w.nama"
    );
    return rows as WilayahItem[];
  }
  const [rows] = await pool.query(
    "SELECT w.kode, w.nama, k.kodepos FROM wilayah w LEFT JOIN wilayah_kodepos k ON w.kode = k.kode WHERE w.kode LIKE CONCAT(?, '.%') AND w.kode NOT LIKE CONCAT(?, '.%.%') ORDER BY w.nama",
    [parentKode, parentKode]
  );
  return rows as WilayahItem[];
}

function levelWhereClause(level: WilayahLevel): string {
  if (level === 1) return "w.kode NOT LIKE '%.%'";
  if (level === 2) return "w.kode LIKE '%.%' AND w.kode NOT LIKE '%.%.%'";
  if (level === 3) return "w.kode LIKE '%.%.%' AND w.kode NOT LIKE '%.%.%.%'";
  return "w.kode LIKE '%.%.%.%'";
}

function ancestorKodes(kode: string): string[] {
  const parts = kode.split('.');
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push(parts.slice(0, i).join('.'));
  }
  return result;
}

export async function searchWilayah(
  pool: QueryablePool,
  level: WilayahLevel,
  q: string,
  limit = 20
): Promise<WilayahSearchResult[]> {
  const where = levelWhereClause(level);
  const [rows] = await pool.query(
    `SELECT w.kode, w.nama, k.kodepos FROM wilayah w LEFT JOIN wilayah_kodepos k ON w.kode = k.kode WHERE ${where} AND w.nama LIKE CONCAT('%', ?, '%') ORDER BY CHAR_LENGTH(w.nama), w.nama LIMIT ?`,
    [q, limit]
  );
  const items = rows as WilayahItem[];
  if (items.length === 0) return [];

  const ancestorSet = new Set<string>();
  for (const item of items) {
    for (const anc of ancestorKodes(item.kode)) ancestorSet.add(anc);
  }
  const ancestorKodeList = Array.from(ancestorSet);

  const ancestorMap = new Map<string, string>();
  if (ancestorKodeList.length > 0) {
    const [ancestorRows] = await pool.query(
      `SELECT kode, nama FROM wilayah WHERE kode IN (${ancestorKodeList.map(() => '?').join(',')})`,
      ancestorKodeList
    );
    for (const row of ancestorRows as WilayahItem[]) {
      ancestorMap.set(row.kode, row.nama);
    }
  }

  return items.map((item) => ({
    ...item,
    path: ancestorKodes(item.kode)
      .map((kode) => ({ kode, nama: ancestorMap.get(kode) ?? '' }))
      .filter((a) => a.nama !== ''),
  }));
}

export interface QuickSearchResult extends WilayahItem {
  level: 3 | 4;
  path: WilayahItem[];
}

export async function quickSearchWilayah(
  pool: QueryablePool,
  q: string,
  limit = 15
): Promise<QuickSearchResult[]> {
  const isNumeric = /^\d+$/.test(q);
  let rows: unknown[];

  if (isNumeric) {
    const [result] = await pool.query(
      `SELECT w.kode, w.nama, k.kodepos
       FROM wilayah w
       LEFT JOIN wilayah_kodepos k ON w.kode = k.kode
       WHERE (w.kode LIKE '%.%.%' OR w.kode LIKE '%.%.%.%')
         AND (k.kodepos LIKE CONCAT(?, '%') OR w.nama LIKE CONCAT('%', ?, '%'))
       ORDER BY (k.kodepos = ?) DESC, CHAR_LENGTH(w.nama), w.nama
       LIMIT ?`,
      [q, q, q, limit]
    );
    rows = result as unknown[];
  } else {
    const [result] = await pool.query(
      `SELECT w.kode, w.nama, k.kodepos
       FROM wilayah w
       LEFT JOIN wilayah_kodepos k ON w.kode = k.kode
       WHERE w.kode LIKE '%.%.%'
         AND w.nama LIKE CONCAT('%', ?, '%')
       ORDER BY (w.nama LIKE CONCAT(?, '%')) DESC, CHAR_LENGTH(w.nama), w.nama
       LIMIT ?`,
      [q, q, limit]
    );
    rows = result as unknown[];
  }

  const items = rows as WilayahItem[];
  if (items.length === 0) return [];

  const ancestorSet = new Set<string>();
  for (const item of items) {
    for (const anc of ancestorKodes(item.kode)) ancestorSet.add(anc);
  }
  const ancestorKodeList = Array.from(ancestorSet);

  const ancestorMap = new Map<string, string>();
  if (ancestorKodeList.length > 0) {
    const [ancestorRows] = await pool.query(
      `SELECT kode, nama FROM wilayah WHERE kode IN (${ancestorKodeList.map(() => '?').join(',')})`,
      ancestorKodeList
    );
    for (const row of ancestorRows as WilayahItem[]) {
      ancestorMap.set(row.kode, row.nama);
    }
  }

  return items.map((item) => {
    const dotCount = (item.kode.match(/\./g) ?? []).length;
    const level = (dotCount + 1) as 3 | 4;
    return {
      ...item,
      level,
      path: ancestorKodes(item.kode)
        .map((kode) => ({ kode, nama: ancestorMap.get(kode) ?? '' }))
        .filter((a) => a.nama !== ''),
    };
  });
}

const LEVEL_PATTERNS: Record<WilayahLevel, RegExp> = {
  1: /^\d{2}$/,
  2: /^\d{2}\.\d{2}$/,
  3: /^\d{2}\.\d{2}\.\d{2}$/,
  4: /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/,
};

function detectLevel(kode: string): WilayahLevel | null {
  const dotCount = (kode.match(/\./g) ?? []).length;
  const level = dotCount + 1;
  if (level < 1 || level > 4) return null;
  return level as WilayahLevel;
}

function isValidKodeFormat(kode: string): boolean {
  const level = detectLevel(kode);
  if (!level) return false;
  return LEVEL_PATTERNS[level].test(kode);
}

function parentKodeOf(kode: string): string | null {
  const parts = kode.split('.');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('.');
}

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
): Promise<WilayahMutationResult<WilayahItem>> {
  const { kode, nama } = input;
  if (!isValidKodeFormat(kode)) {
    return { ok: false, error: 'invalid_kode_format' };
  }
  const parent = parentKodeOf(kode);
  if (parent) {
    const [parentRows] = await pool.query('SELECT 1 FROM wilayah WHERE kode = ? LIMIT 1', [
      parent,
    ]);
    if ((parentRows as unknown[]).length === 0) {
      return { ok: false, error: 'parent_not_found' };
    }
  }
  try {
    await pool.query('INSERT INTO wilayah (kode, nama) VALUES (?, ?)', [kode, nama]);
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
      return { ok: false, error: 'duplicate_kode' };
    }
    throw err;
  }
  return { ok: true, data: { kode, nama } };
}

export async function updateWilayahNama(
  pool: QueryablePool,
  kode: string,
  nama: string
): Promise<WilayahMutationResult<WilayahItem>> {
  const [result] = await pool.query('UPDATE wilayah SET nama = ? WHERE kode = ?', [nama, kode]);
  const affectedRows = (result as { affectedRows: number }).affectedRows;
  if (affectedRows === 0) {
    return { ok: false, error: 'not_found' };
  }
  return { ok: true, data: { kode, nama } };
}

export async function deleteWilayah(
  pool: QueryablePool,
  kode: string
): Promise<WilayahMutationResult<null>> {
  const [childRows] = await pool.query(
    "SELECT 1 FROM wilayah WHERE kode LIKE CONCAT(?, '.%') LIMIT 1",
    [kode]
  );
  if ((childRows as unknown[]).length > 0) {
    return { ok: false, error: 'has_children' };
  }
  const [result] = await pool.query('DELETE FROM wilayah WHERE kode = ?', [kode]);
  const affectedRows = (result as { affectedRows: number }).affectedRows;
  if (affectedRows === 0) {
    return { ok: false, error: 'not_found' };
  }
  return { ok: true, data: null };
}
