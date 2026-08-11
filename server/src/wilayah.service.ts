export interface WilayahItem {
  kode: string;
  nama: string;
}

export interface WilayahSearchResult extends WilayahItem {
  path: WilayahItem[];
}

export type WilayahLevel = 1 | 2 | 3 | 4;

export interface QueryablePool {
  query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
}

export async function getChildren(
  pool: QueryablePool,
  parentKode?: string
): Promise<WilayahItem[]> {
  if (!parentKode) {
    const [rows] = await pool.query(
      "SELECT kode, nama FROM wilayah WHERE kode NOT LIKE '%.%' ORDER BY nama"
    );
    return rows as WilayahItem[];
  }
  const [rows] = await pool.query(
    "SELECT kode, nama FROM wilayah WHERE kode LIKE CONCAT(?, '.%') AND kode NOT LIKE CONCAT(?, '.%.%') ORDER BY nama",
    [parentKode, parentKode]
  );
  return rows as WilayahItem[];
}

function levelWhereClause(level: WilayahLevel): string {
  if (level === 1) return "kode NOT LIKE '%.%'";
  if (level === 2) return "kode LIKE '%.%' AND kode NOT LIKE '%.%.%'";
  if (level === 3) return "kode LIKE '%.%.%' AND kode NOT LIKE '%.%.%.%'";
  return "kode LIKE '%.%.%.%'";
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
    `SELECT kode, nama FROM wilayah WHERE ${where} AND nama LIKE CONCAT('%', ?, '%') ORDER BY CHAR_LENGTH(nama), nama LIMIT ?`,
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
