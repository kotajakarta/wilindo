# Wilayah CRUD + API Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add API-key-protected create/update/delete endpoints for the `wilayah` table, an admin UI in the React app to use them, and `instruksi-api.md` documenting the full API for external Node/PHP/etc. consumers.

**Architecture:** Backend: 3 new Express routes (`POST /api/wilayah`, `PATCH /api/wilayah/:kode`, `DELETE /api/wilayah/:kode`) behind an `X-API-Key` middleware, backed by new `wilayah.service.ts` functions returning discriminated results (no throwing for domain errors). Frontend: `react-router-dom` splits the app into `/` (existing dropdown demo) and `/admin` (new CRUD manager reusing `AddressCombobox` with a `refreshToken` prop to force list reloads after mutations). Cascading-selection logic is extracted into a shared `useWilayahSelection` hook used by both the existing `WilayahDropdown` and the new admin manager.

**Tech Stack:** Same as before (Express, mysql2, TypeScript, Vitest backend tests; React, Vite, Tailwind, TypeScript) plus `react-router-dom`.

## Global Constraints

- Kode format per level (validated server-side, no DB constraint enforces it): provinsi `^\d{2}$`, kabupaten/kota `^\d{2}\.\d{2}$`, kecamatan `^\d{2}\.\d{2}\.\d{2}$`, desa `^\d{2}\.\d{2}\.\d{2}\.\d{4}$`.
- `UPDATE` only changes `nama` — `kode` is immutable once created.
- `DELETE` is rejected with 409 if the kode has any descendant row (`kode LIKE 'X.%'`).
- `POST`/`PATCH`/`DELETE` require header `X-API-Key` matching `API_KEY` in root `.env`; `GET` endpoints stay public.
- Error response shape stays `{ "error": "<pesan>" }`; mapping is fixed: `invalid_kode_format`→400, `parent_not_found`→404, `duplicate_kode`→409, `not_found`→404, `has_children`→409, missing/empty `nama`→400, bad API key→401.
- No automated tests for the new frontend admin UI — manual browser verification only, consistent with the existing project convention. Backend mutation logic gets Vitest unit tests with a mocked pool.
- `instruksi-api.md` goes at the repo root (not under `docs/superpowers/`) since it's a deliverable for external API consumers.

---

### Task 1: Env module, API key auth middleware, generate `API_KEY`

**Files:**
- Create: `server/src/env.ts`
- Create: `server/src/auth.ts`
- Modify: `server/src/db.ts`
- Modify: `/mnt/d/htdocs/wilindo/.env` (append `API_KEY`)

**Interfaces:**
- Produces: side-effect module `server/src/env.ts` (loads root `.env`); `requireApiKey(req, res, next)` Express middleware exported from `server/src/auth.ts`, used by Task 3.

- [ ] **Step 1: Write `server/src/env.ts`**

```ts
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
```

- [ ] **Step 2: Update `server/src/db.ts` to use it**

Replace the file contents with:

```ts
import { createPool } from 'mysql2/promise';
import './env';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (expected in root .env)');
}

export const pool = createPool(process.env.DATABASE_URL);
```

- [ ] **Step 3: Write `server/src/auth.ts`**

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

- [ ] **Step 4: Generate and append `API_KEY` to the root `.env`**

```bash
cd /mnt/d/htdocs/wilindo
node -e "console.log('API_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
cat .env
```

Expected: `.env` now has two lines — the existing `DATABASE_URL` and a new `API_KEY=<64 hex chars>`. Report the generated key value in the task report (needed later for smoke tests and for the human partner to use with external apps).

- [ ] **Step 5: Verify it typechecks**

```bash
cd /mnt/d/htdocs/wilindo/server
npx tsc -p tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add server/src/env.ts server/src/auth.ts server/src/db.ts .env
git commit -m "Add env module and API key auth middleware"
```

---

### Task 2: Extend `wilayah.service.ts` with create/update/delete (TDD)

**Files:**
- Modify: `server/src/wilayah.service.ts`
- Modify: `server/src/wilayah.service.test.ts`

**Interfaces:**
- Consumes: nothing new (still pure, pool injected via `QueryablePool`).
- Produces (used by Task 3):
  - `QueryablePool.query` return type changes to `Promise<[unknown, unknown]>` (was `Promise<[unknown[], unknown]>` — mysql2 returns a `ResultSetHeader` object, not an array, for INSERT/UPDATE/DELETE).
  - `type WilayahMutationError = 'invalid_kode_format' | 'parent_not_found' | 'duplicate_kode' | 'not_found' | 'has_children'`
  - `type WilayahMutationResult<T> = { ok: true; data: T } | { ok: false; error: WilayahMutationError }`
  - `createWilayah(pool: QueryablePool, input: { kode: string; nama: string }): Promise<WilayahMutationResult<WilayahItem>>`
  - `updateWilayahNama(pool: QueryablePool, kode: string, nama: string): Promise<WilayahMutationResult<WilayahItem>>`
  - `deleteWilayah(pool: QueryablePool, kode: string): Promise<WilayahMutationResult<null>>`

- [ ] **Step 1: Replace `server/src/wilayah.service.test.ts` with the full updated test file (adds new tests, updates `mockPool`'s type)**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  getChildren,
  searchWilayah,
  createWilayah,
  updateWilayahNama,
  deleteWilayah,
  type QueryablePool,
} from './wilayah.service';

function mockPool(responses: Array<[unknown, unknown]>): QueryablePool {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  return { query };
}

describe('getChildren', () => {
  it('returns provinsi list when no parent given', async () => {
    const pool = mockPool([[[{ kode: '11', nama: 'Aceh' }], []]]);
    const result = await getChildren(pool, undefined);
    expect(result).toEqual([{ kode: '11', nama: 'Aceh' }]);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("NOT LIKE '%.%'"));
  });

  it('returns direct children only for a given parent', async () => {
    const pool = mockPool([[[{ kode: '11.01', nama: 'Kabupaten Simeulue' }], []]]);
    const result = await getChildren(pool, '11');
    expect(result).toEqual([{ kode: '11.01', nama: 'Kabupaten Simeulue' }]);
    expect(pool.query).toHaveBeenCalledWith(expect.any(String), ['11', '11']);
  });
});

describe('searchWilayah', () => {
  it('returns empty array when no matches found', async () => {
    const pool = mockPool([[[], []]]);
    const result = await searchWilayah(pool, 4, 'zzz');
    expect(result).toEqual([]);
  });

  it('attaches ancestor path to each result', async () => {
    const pool = mockPool([
      [[{ kode: '32.03.05.2001', nama: 'Sukamaju' }], []],
      [
        [
          { kode: '32', nama: 'Jawa Barat' },
          { kode: '32.03', nama: 'Kabupaten Cianjur' },
          { kode: '32.03.05', nama: 'Kecamatan Cianjur' },
        ],
        [],
      ],
    ]);
    const result = await searchWilayah(pool, 4, 'sukamaju');
    expect(result).toEqual([
      {
        kode: '32.03.05.2001',
        nama: 'Sukamaju',
        path: [
          { kode: '32', nama: 'Jawa Barat' },
          { kode: '32.03', nama: 'Kabupaten Cianjur' },
          { kode: '32.03.05', nama: 'Kecamatan Cianjur' },
        ],
      },
    ]);
  });
});

describe('createWilayah', () => {
  it('rejects invalid kode format', async () => {
    const pool = mockPool([]);
    const result = await createWilayah(pool, { kode: '1', nama: 'Invalid' });
    expect(result).toEqual({ ok: false, error: 'invalid_kode_format' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('rejects when parent kode does not exist', async () => {
    const pool = mockPool([[[], []]]);
    const result = await createWilayah(pool, { kode: '11.99', nama: 'Kabupaten Baru' });
    expect(result).toEqual({ ok: false, error: 'parent_not_found' });
  });

  it('creates a top-level provinsi without needing a parent check', async () => {
    const pool = mockPool([[{ affectedRows: 1 }, undefined]]);
    const result = await createWilayah(pool, { kode: '99', nama: 'Provinsi Baru' });
    expect(result).toEqual({ ok: true, data: { kode: '99', nama: 'Provinsi Baru' } });
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('creates a child when parent exists', async () => {
    const pool = mockPool([
      [[{ 1: 1 }], []],
      [{ affectedRows: 1 }, undefined],
    ]);
    const result = await createWilayah(pool, { kode: '11.02', nama: 'Kabupaten Aceh Selatan' });
    expect(result).toEqual({
      ok: true,
      data: { kode: '11.02', nama: 'Kabupaten Aceh Selatan' },
    });
  });

  it('rejects duplicate kode', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ 1: 1 }], []])
      .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
    const pool: QueryablePool = { query };
    const result = await createWilayah(pool, { kode: '11.01', nama: 'Duplikat' });
    expect(result).toEqual({ ok: false, error: 'duplicate_kode' });
  });
});

describe('updateWilayahNama', () => {
  it('updates nama when kode exists', async () => {
    const pool = mockPool([[{ affectedRows: 1 }, undefined]]);
    const result = await updateWilayahNama(pool, '11', 'Aceh Baru');
    expect(result).toEqual({ ok: true, data: { kode: '11', nama: 'Aceh Baru' } });
  });

  it('returns not_found when kode does not exist', async () => {
    const pool = mockPool([[{ affectedRows: 0 }, undefined]]);
    const result = await updateWilayahNama(pool, '99', 'Tidak Ada');
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('deleteWilayah', () => {
  it('deletes when kode has no children', async () => {
    const pool = mockPool([
      [[], []],
      [{ affectedRows: 1 }, undefined],
    ]);
    const result = await deleteWilayah(pool, '11.99');
    expect(result).toEqual({ ok: true, data: null });
  });

  it('rejects deletion when kode still has children', async () => {
    const pool = mockPool([[[{ 1: 1 }], []]]);
    const result = await deleteWilayah(pool, '11');
    expect(result).toEqual({ ok: false, error: 'has_children' });
  });

  it('returns not_found when kode does not exist', async () => {
    const pool = mockPool([
      [[], []],
      [{ affectedRows: 0 }, undefined],
    ]);
    const result = await deleteWilayah(pool, '99');
    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});
```

- [ ] **Step 2: Run tests, verify the new ones fail**

```bash
cd /mnt/d/htdocs/wilindo/server
npx vitest run
```

Expected: FAIL — `createWilayah`, `updateWilayahNama`, `deleteWilayah` are not exported yet.

- [ ] **Step 3: Replace `server/src/wilayah.service.ts` with the full updated file**

```ts
export interface WilayahItem {
  kode: string;
  nama: string;
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
```

- [ ] **Step 4: Run tests, verify all pass; typecheck**

```bash
cd /mnt/d/htdocs/wilindo/server
npx vitest run
npx tsc -p tsconfig.json --noEmit
```

Expected: all tests PASS (13 total: 2 getChildren + 2 searchWilayah + 4 createWilayah + 2 updateWilayahNama + 3 deleteWilayah), no type errors.

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add server/src/wilayah.service.ts server/src/wilayah.service.test.ts
git commit -m "Add createWilayah/updateWilayahNama/deleteWilayah with tests"
```

---

### Task 3: Wire CRUD routes, `express.json()`, smoke test against real DB

**Files:**
- Modify: `server/src/wilayah.routes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `requireApiKey` from `server/src/auth.ts` (Task 1); `createWilayah`, `updateWilayahNama`, `deleteWilayah`, `WilayahMutationError` from `server/src/wilayah.service.ts` (Task 2).

- [ ] **Step 1: Replace `server/src/wilayah.routes.ts` with the full updated file**

```ts
import { Router } from 'express';
import { pool } from './db';
import { requireApiKey } from './auth';
import {
  getChildren,
  searchWilayah,
  createWilayah,
  updateWilayahNama,
  deleteWilayah,
  type WilayahLevel,
  type WilayahMutationError,
} from './wilayah.service';

export const wilayahRouter = Router();

function mutationErrorStatus(error: WilayahMutationError): number {
  switch (error) {
    case 'invalid_kode_format':
      return 400;
    case 'parent_not_found':
      return 404;
    case 'duplicate_kode':
      return 409;
    case 'not_found':
      return 404;
    case 'has_children':
      return 409;
  }
}

function mutationErrorMessage(error: WilayahMutationError): string {
  switch (error) {
    case 'invalid_kode_format':
      return 'Format kode tidak valid untuk level ini';
    case 'parent_not_found':
      return 'Kode induk tidak ditemukan';
    case 'duplicate_kode':
      return 'Kode sudah terdaftar';
    case 'not_found':
      return 'Wilayah tidak ditemukan';
    case 'has_children':
      return 'Tidak bisa dihapus, masih ada wilayah di bawahnya';
  }
}

wilayahRouter.get('/wilayah', async (req, res, next) => {
  try {
    const parent = typeof req.query.parent === 'string' ? req.query.parent : undefined;
    const result = await getChildren(pool, parent);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.get('/wilayah/search', async (req, res, next) => {
  try {
    const levelRaw = Number(req.query.level);
    if (![1, 2, 3, 4].includes(levelRaw)) {
      res.status(400).json({ error: 'level harus bernilai 1, 2, 3, atau 4' });
      return;
    }
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.status(400).json({ error: 'q wajib diisi' });
      return;
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

    const result = await searchWilayah(pool, levelRaw as WilayahLevel, q, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.post('/wilayah', requireApiKey, async (req, res, next) => {
  try {
    const kode = typeof req.body?.kode === 'string' ? req.body.kode.trim() : '';
    const nama = typeof req.body?.nama === 'string' ? req.body.nama.trim() : '';
    if (!nama) {
      res.status(400).json({ error: 'nama wajib diisi' });
      return;
    }
    const result = await createWilayah(pool, { kode, nama });
    if (!result.ok) {
      res
        .status(mutationErrorStatus(result.error))
        .json({ error: mutationErrorMessage(result.error) });
      return;
    }
    res.status(201).json(result.data);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.patch('/wilayah/:kode', requireApiKey, async (req, res, next) => {
  try {
    const nama = typeof req.body?.nama === 'string' ? req.body.nama.trim() : '';
    if (!nama) {
      res.status(400).json({ error: 'nama wajib diisi' });
      return;
    }
    const result = await updateWilayahNama(pool, req.params.kode, nama);
    if (!result.ok) {
      res
        .status(mutationErrorStatus(result.error))
        .json({ error: mutationErrorMessage(result.error) });
      return;
    }
    res.json(result.data);
  } catch (err) {
    next(err);
  }
});

wilayahRouter.delete('/wilayah/:kode', requireApiKey, async (req, res, next) => {
  try {
    const result = await deleteWilayah(pool, req.params.kode);
    if (!result.ok) {
      res
        .status(mutationErrorStatus(result.error))
        .json({ error: mutationErrorMessage(result.error) });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Add `express.json()` in `server/src/app.ts`**

Insert right after `app.use(cors());`:

```ts
app.use(express.json());
```

- [ ] **Step 3: Verify tests and typecheck**

```bash
cd /mnt/d/htdocs/wilindo/server
npx vitest run
npx tsc -p tsconfig.json --noEmit
```

Expected: all pass, no errors.

- [ ] **Step 4: Smoke test full CRUD lifecycle against the real database, then clean up**

Use the `API_KEY` value generated in Task 1 (call it `$KEY` below).

```bash
cd /mnt/d/htdocs/wilindo/server
npx tsx src/index.ts &
sleep 3
KEY="<paste the API_KEY value from Task 1's .env>"

echo "--- POST without key (expect 401) ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/wilayah \
  -H "Content-Type: application/json" -d '{"kode":"98","nama":"Provinsi Uji Coba"}'

echo "--- POST with key (expect 201) ---"
curl -s -m 5 -X POST http://localhost:3001/api/wilayah \
  -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"kode":"98","nama":"Provinsi Uji Coba"}'; echo

echo "--- POST duplicate (expect 409) ---"
curl -s -m 5 -X POST http://localhost:3001/api/wilayah \
  -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"kode":"98","nama":"Provinsi Uji Coba"}'; echo

echo "--- POST child (expect 201) ---"
curl -s -m 5 -X POST http://localhost:3001/api/wilayah \
  -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"kode":"98.01","nama":"Kabupaten Uji Coba"}'; echo

echo "--- PATCH parent nama (expect 200) ---"
curl -s -m 5 -X PATCH http://localhost:3001/api/wilayah/98 \
  -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"nama":"Provinsi Uji Coba Baru"}'; echo

echo "--- DELETE parent with child present (expect 409) ---"
curl -s -m 5 -X DELETE http://localhost:3001/api/wilayah/98 -H "X-API-Key: $KEY"; echo

echo "--- DELETE child (expect 204, empty body) ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3001/api/wilayah/98.01 -H "X-API-Key: $KEY"

echo "--- DELETE parent now (expect 204) ---"
curl -s -m 5 -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3001/api/wilayah/98 -H "X-API-Key: $KEY"

echo "--- confirm cleanup: GET wilayah does not include 98 ---"
curl -s -m 5 "http://localhost:3001/api/wilayah" | grep -o '"98"' || echo "confirmed removed"

kill %1
```

Expected sequence: `401`, `201` body, `409` duplicate error, `201` child, `200` updated nama, `409` has_children, `204`, `204`, and the final grep prints "confirmed removed" — leaving the real database exactly as it was before this smoke test (no leftover `98`/`98.01` test rows).

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add server/src/wilayah.routes.ts server/src/app.ts
git commit -m "Wire CRUD routes for wilayah with API key protection"
```

---

### Task 4: Frontend routing scaffold (`react-router-dom`, pages, layout)

**Files:**
- Create: `client/src/pages/AddressPage.tsx`
- Create: `client/src/pages/AdminPage.tsx` (placeholder, replaced fully in Task 8)
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`

**Interfaces:**
- Produces: routes `/` and `/admin`. `AddressPage` exports nothing new (same content `App.tsx` had). `AdminPage` placeholder exported as `AdminPage()`.

- [ ] **Step 1: Install `react-router-dom`**

```bash
cd /mnt/d/htdocs/wilindo/client
npm install react-router-dom
```

- [ ] **Step 2: Create `client/src/pages/AddressPage.tsx` with the content currently in `App.tsx`**

```tsx
import { useState } from 'react';
import { WilayahDropdown, type WilayahSelection } from '../components/WilayahDropdown';

export function AddressPage() {
  const [selection, setSelection] = useState<WilayahSelection | null>(null);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Alamat</h1>
      <WilayahDropdown onChange={setSelection} />
      {selection && (
        <pre className="mt-6 rounded-md bg-gray-50 p-4 text-xs text-gray-700">
          {JSON.stringify(selection, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder `client/src/pages/AdminPage.tsx`**

```tsx
export function AdminPage() {
  return <div className="mx-auto max-w-2xl p-6">Admin Wilayah</div>;
}
```

- [ ] **Step 4: Replace `client/src/App.tsx` with the routed layout**

```tsx
import { NavLink, Route, Routes } from 'react-router-dom';
import { AddressPage } from './pages/AddressPage';
import { AdminPage } from './pages/AdminPage';

function App() {
  return (
    <div>
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl gap-4 p-4">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`
            }
          >
            Alamat
          </NavLink>
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600'}`
            }
          >
            Admin Wilayah
          </NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<AddressPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  );
}

export default App;
```

- [ ] **Step 5: Read `client/src/main.tsx`, then wrap `<App />` with `<BrowserRouter>`**

Read the file first to match its exact current content, then apply this shape (keep `StrictMode` and the `createRoot` call as they are — only add the `BrowserRouter` import and wrapper):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 6: Verify typecheck and build**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: no errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/package.json client/package-lock.json client/src/pages client/src/App.tsx client/src/main.tsx
git commit -m "Add react-router routing with Alamat and Admin Wilayah pages"
```

---

### Task 5: `useWilayahSelection` hook + refactor `WilayahDropdown`

**Files:**
- Create: `client/src/hooks/useWilayahSelection.ts`
- Modify: `client/src/components/WilayahDropdown.tsx`

**Interfaces:**
- Produces (used by Task 8):
  - `export interface WilayahSelection { provinsi: WilayahItem | null; kabupaten: WilayahItem | null; kecamatan: WilayahItem | null; desa: WilayahItem | null }`
  - `useWilayahSelection(onChange?: (s: WilayahSelection) => void)` returning `{ selection, setProvinsi, setKabupaten, setKecamatan, setDesa, autoFillFromKabupaten, autoFillFromKecamatan, autoFillFromDesa }`
- `WilayahDropdown` keeps exporting `WilayahSelection` (re-exported from the hook module) so `client/src/pages/AddressPage.tsx`'s existing `import { WilayahDropdown, type WilayahSelection } from '../components/WilayahDropdown'` keeps working unchanged.

- [ ] **Step 1: Write `client/src/hooks/useWilayahSelection.ts`**

```ts
import { useState } from 'react';
import type { WilayahItem } from '../types/wilayah';

export interface WilayahSelection {
  provinsi: WilayahItem | null;
  kabupaten: WilayahItem | null;
  kecamatan: WilayahItem | null;
  desa: WilayahItem | null;
}

const EMPTY_SELECTION: WilayahSelection = {
  provinsi: null,
  kabupaten: null,
  kecamatan: null,
  desa: null,
};

export function useWilayahSelection(onChange?: (selection: WilayahSelection) => void) {
  const [selection, setSelection] = useState<WilayahSelection>(EMPTY_SELECTION);

  function update(next: WilayahSelection) {
    setSelection(next);
    onChange?.(next);
  }

  function setProvinsi(item: WilayahItem | null) {
    update({ provinsi: item, kabupaten: null, kecamatan: null, desa: null });
  }

  function setKabupaten(item: WilayahItem | null) {
    update({ ...selection, kabupaten: item, kecamatan: null, desa: null });
  }

  function setKecamatan(item: WilayahItem | null) {
    update({ ...selection, kecamatan: item, desa: null });
  }

  function setDesa(item: WilayahItem | null) {
    update({ ...selection, desa: item });
  }

  function autoFillFromKabupaten(path: WilayahItem[]) {
    const [provinsi] = path;
    update({ ...selection, provinsi: provinsi ?? null, kecamatan: null, desa: null });
  }

  function autoFillFromKecamatan(path: WilayahItem[]) {
    const [provinsi, kabupaten] = path;
    update({
      ...selection,
      provinsi: provinsi ?? null,
      kabupaten: kabupaten ?? null,
      desa: null,
    });
  }

  function autoFillFromDesa(path: WilayahItem[]) {
    const [provinsi, kabupaten, kecamatan] = path;
    update({
      ...selection,
      provinsi: provinsi ?? null,
      kabupaten: kabupaten ?? null,
      kecamatan: kecamatan ?? null,
    });
  }

  return {
    selection,
    setProvinsi,
    setKabupaten,
    setKecamatan,
    setDesa,
    autoFillFromKabupaten,
    autoFillFromKecamatan,
    autoFillFromDesa,
  };
}
```

- [ ] **Step 2: Replace `client/src/components/WilayahDropdown.tsx` with the refactored version**

```tsx
import { AddressCombobox } from './AddressCombobox';
import { useWilayahSelection, type WilayahSelection } from '../hooks/useWilayahSelection';

export type { WilayahSelection };

interface WilayahDropdownProps {
  onChange?: (selection: WilayahSelection) => void;
}

export function WilayahDropdown({ onChange }: WilayahDropdownProps) {
  const {
    selection,
    setProvinsi,
    setKabupaten,
    setKecamatan,
    setDesa,
    autoFillFromKabupaten,
    autoFillFromKecamatan,
    autoFillFromDesa,
  } = useWilayahSelection(onChange);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AddressCombobox
        label="Provinsi"
        level={1}
        value={selection.provinsi}
        onChange={setProvinsi}
      />
      <AddressCombobox
        label="Kabupaten/Kota"
        level={2}
        parentKode={selection.provinsi?.kode}
        value={selection.kabupaten}
        onChange={setKabupaten}
        onAutoFillAncestors={autoFillFromKabupaten}
      />
      <AddressCombobox
        label="Kecamatan"
        level={3}
        parentKode={selection.kabupaten?.kode}
        value={selection.kecamatan}
        onChange={setKecamatan}
        onAutoFillAncestors={autoFillFromKecamatan}
      />
      <AddressCombobox
        label="Kelurahan/Desa"
        level={4}
        parentKode={selection.kecamatan?.kode}
        value={selection.desa}
        onChange={setDesa}
        onAutoFillAncestors={autoFillFromDesa}
      />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck and build**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: no errors — `AddressPage.tsx`'s import of `WilayahDropdown`/`WilayahSelection` keeps compiling unchanged.

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/hooks/useWilayahSelection.ts client/src/components/WilayahDropdown.tsx
git commit -m "Extract useWilayahSelection hook, refactor WilayahDropdown to use it"
```

---

### Task 6: `AddressCombobox` `refreshToken` prop + `api/wilayahAdmin.ts`

**Files:**
- Modify: `client/src/components/AddressCombobox.tsx`
- Create: `client/src/api/wilayahAdmin.ts`

**Interfaces:**
- Produces (used by Tasks 7-8):
  - `AddressComboboxProps` gains optional `refreshToken?: number` (default `0`) — incrementing it forces the combobox to refetch its current view.
  - `createWilayah(kode: string, nama: string, apiKey: string): Promise<WilayahItem>`
  - `updateWilayahNama(kode: string, nama: string, apiKey: string): Promise<WilayahItem>`
  - `deleteWilayah(kode: string, apiKey: string): Promise<void>`
  - All three throw `Error` with the server's `{error}` message (or a generic fallback) on non-2xx response.

- [ ] **Step 1: Add `refreshToken` prop to `client/src/components/AddressCombobox.tsx`**

In the props interface, add:

```ts
  refreshToken?: number;
```

In the function signature's destructuring, add a default:

```ts
  refreshToken = 0,
```

Change the debounce/fetch effect's dependency array from `[query, open]` to `[query, open, refreshToken]` (the effect body itself is unchanged):

```ts
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      fetchOptions(query);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchOptions(query), 300);
    return () => window.clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, refreshToken]);
```

- [ ] **Step 2: Write `client/src/api/wilayahAdmin.ts`**

```ts
import type { WilayahItem } from '../types/wilayah';

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === 'string') return body.error;
  } catch {
    // response body wasn't JSON; fall through to generic message
  }
  return 'Terjadi kesalahan, coba lagi';
}

export async function createWilayah(
  kode: string,
  nama: string,
  apiKey: string
): Promise<WilayahItem> {
  const res = await fetch('/api/wilayah', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ kode, nama }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function updateWilayahNama(
  kode: string,
  nama: string,
  apiKey: string
): Promise<WilayahItem> {
  const res = await fetch(`/api/wilayah/${encodeURIComponent(kode)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({ nama }),
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res.json();
}

export async function deleteWilayah(kode: string, apiKey: string): Promise<void> {
  const res = await fetch(`/api/wilayah/${encodeURIComponent(kode)}`, {
    method: 'DELETE',
    headers: { 'X-API-Key': apiKey },
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}
```

- [ ] **Step 3: Verify typecheck and build**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/components/AddressCombobox.tsx client/src/api/wilayahAdmin.ts
git commit -m "Add refreshToken to AddressCombobox and admin mutation API wrapper"
```

---

### Task 7: `AdminLevelRow.tsx`

**Files:**
- Create: `client/src/components/AdminLevelRow.tsx`

**Interfaces:**
- Consumes: `AddressCombobox` (Task 6's `refreshToken` prop); `createWilayah`, `updateWilayahNama`, `deleteWilayah` from `client/src/api/wilayahAdmin.ts` (Task 6); `WilayahItem`, `WilayahLevel` from `client/src/types/wilayah.ts`.
- Produces (used by Task 8): `interface AdminLevelRowProps { label: string; level: WilayahLevel; parentKode?: string; selected: WilayahItem | null; onSelect: (item: WilayahItem | null) => void; apiKey: string; refreshToken: number; onMutated: () => void }` and `AdminLevelRow(props: AdminLevelRowProps): JSX.Element`.

- [ ] **Step 1: Write `client/src/components/AdminLevelRow.tsx`**

```tsx
import { useState } from 'react';
import { AddressCombobox } from './AddressCombobox';
import type { WilayahItem, WilayahLevel } from '../types/wilayah';
import { createWilayah, updateWilayahNama, deleteWilayah } from '../api/wilayahAdmin';

interface AdminLevelRowProps {
  label: string;
  level: WilayahLevel;
  parentKode?: string;
  selected: WilayahItem | null;
  onSelect: (item: WilayahItem | null) => void;
  apiKey: string;
  refreshToken: number;
  onMutated: () => void;
}

function segmentPlaceholder(level: WilayahLevel): string {
  return level === 4 ? '4 digit (mis. 2001)' : '2 digit (mis. 01)';
}

export function AdminLevelRow({
  label,
  level,
  parentKode,
  selected,
  onSelect,
  apiKey,
  refreshToken,
  onMutated,
}: AdminLevelRowProps) {
  const [mode, setMode] = useState<'idle' | 'editing' | 'adding'>('idle');
  const [pendingNama, setPendingNama] = useState('');
  const [newSegment, setNewSegment] = useState('');
  const [newNama, setNewNama] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = level === 1 || Boolean(parentKode);

  async function handleSaveEdit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWilayahNama(selected.kode, pendingNama, apiKey);
      onSelect(updated);
      onMutated();
      setMode('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan, coba lagi');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(`Hapus "${selected.nama}" (${selected.kode})?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWilayah(selected.kode, apiKey);
      onSelect(null);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan, coba lagi');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const kode = parentKode ? `${parentKode}.${newSegment}` : newSegment;
    setBusy(true);
    setError(null);
    try {
      const created = await createWilayah(kode, newNama, apiKey);
      onSelect(created);
      onMutated();
      setNewSegment('');
      setNewNama('');
      setMode('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan, coba lagi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-gray-100 pb-4">
      <AddressCombobox
        label={label}
        level={level}
        parentKode={parentKode}
        value={selected}
        onChange={(item) => {
          onSelect(item);
          setMode('idle');
        }}
        refreshToken={refreshToken}
      />

      {selected && mode === 'idle' && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="text-sm text-blue-600 underline"
            onClick={() => {
              setPendingNama(selected.nama);
              setMode('editing');
            }}
          >
            Ubah Nama
          </button>
          <button type="button" className="text-sm text-red-600 underline" onClick={handleDelete}>
            Hapus
          </button>
        </div>
      )}

      {selected && mode === 'editing' && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={pendingNama}
            onChange={(e) => setPendingNama(e.target.value)}
          />
          <button
            type="button"
            className="text-sm text-blue-600 underline disabled:opacity-50"
            disabled={busy}
            onClick={handleSaveEdit}
          >
            Simpan
          </button>
          <button
            type="button"
            className="text-sm text-gray-500 underline"
            onClick={() => setMode('idle')}
          >
            Batal
          </button>
        </div>
      )}

      {canAdd && (
        <div className="mt-2">
          {mode !== 'adding' ? (
            <button
              type="button"
              className="text-sm text-green-700 underline"
              onClick={() => setMode('adding')}
            >
              + Tambah {label}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {parentKode && <span className="text-sm text-gray-500">{parentKode}.</span>}
              <input
                type="text"
                placeholder={segmentPlaceholder(level)}
                className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={newSegment}
                onChange={(e) => setNewSegment(e.target.value)}
              />
              <input
                type="text"
                placeholder="Nama"
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
              />
              <button
                type="button"
                className="text-sm text-blue-600 underline disabled:opacity-50"
                disabled={busy}
                onClick={handleCreate}
              >
                Simpan
              </button>
              <button
                type="button"
                className="text-sm text-gray-500 underline"
                onClick={() => setMode('idle')}
              >
                Batal
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit -p tsconfig.app.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/components/AdminLevelRow.tsx
git commit -m "Add AdminLevelRow component with inline edit/delete/add forms"
```

---

### Task 8: `WilayahAdminManager.tsx` + full `AdminPage.tsx`

**Files:**
- Create: `client/src/components/WilayahAdminManager.tsx`
- Modify: `client/src/pages/AdminPage.tsx` (replace Task 4's placeholder)

**Interfaces:**
- Consumes: `AdminLevelRow` (Task 7); `useWilayahSelection` (Task 5).
- Produces: `WilayahAdminManager({ apiKey }: { apiKey: string })` and the full `AdminPage()`.

- [ ] **Step 1: Write `client/src/components/WilayahAdminManager.tsx`**

```tsx
import { useState } from 'react';
import { AdminLevelRow } from './AdminLevelRow';
import { useWilayahSelection } from '../hooks/useWilayahSelection';

interface WilayahAdminManagerProps {
  apiKey: string;
}

export function WilayahAdminManager({ apiKey }: WilayahAdminManagerProps) {
  const { selection, setProvinsi, setKabupaten, setKecamatan, setDesa } = useWilayahSelection();
  const [refreshToken, setRefreshToken] = useState(0);

  function handleMutated() {
    setRefreshToken((t) => t + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <AdminLevelRow
        label="Provinsi"
        level={1}
        selected={selection.provinsi}
        onSelect={setProvinsi}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
      <AdminLevelRow
        label="Kabupaten/Kota"
        level={2}
        parentKode={selection.provinsi?.kode}
        selected={selection.kabupaten}
        onSelect={setKabupaten}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
      <AdminLevelRow
        label="Kecamatan"
        level={3}
        parentKode={selection.kabupaten?.kode}
        selected={selection.kecamatan}
        onSelect={setKecamatan}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
      <AdminLevelRow
        label="Kelurahan/Desa"
        level={4}
        parentKode={selection.kecamatan?.kode}
        selected={selection.desa}
        onSelect={setDesa}
        apiKey={apiKey}
        refreshToken={refreshToken}
        onMutated={handleMutated}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace `client/src/pages/AdminPage.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { WilayahAdminManager } from '../components/WilayahAdminManager';

const API_KEY_STORAGE_KEY = 'wilindo_admin_api_key';

export function AdminPage() {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) setApiKey(stored);
  }, []);

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    localStorage.setItem(API_KEY_STORAGE_KEY, value);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Admin Wilayah</h1>
      <div className="mb-6 flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">API Key</label>
        <input
          type="password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="Masukkan API key untuk tambah/ubah/hapus"
        />
      </div>
      <WilayahAdminManager apiKey={apiKey} />
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck and build**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Expected: no errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/components/WilayahAdminManager.tsx client/src/pages/AdminPage.tsx
git commit -m "Add WilayahAdminManager and wire it into AdminPage"
```

---

### Task 9: `instruksi-api.md`

**Files:**
- Create: `/mnt/d/htdocs/wilindo/instruksi-api.md`

- [ ] **Step 1: Write `instruksi-api.md`**

```markdown
# Instruksi Penggunaan API Wilayah

API ini menyediakan data wilayah administratif Indonesia (provinsi,
kabupaten/kota, kecamatan, desa/kelurahan) berjenjang, dengan endpoint
baca (publik) dan endpoint kelola data (butuh API key). Dokumen ini untuk
developer yang mengonsumsi API ini dari aplikasi lain (Node.js, PHP,
bahasa apa pun yang bisa melakukan HTTP request).

## Base URL

Jalankan server dari root project:

```bash
npm run build
npm run start
```

Server berjalan di `http://localhost:3001` (atau host/port sesuai deployment
Anda). Semua path di bawah relatif terhadap base URL ini.

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
```

- [ ] **Step 2: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add instruksi-api.md
git commit -m "Add instruksi-api.md documenting all endpoints for external consumers"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full rebuild**

```bash
cd /mnt/d/htdocs/wilindo
npm run build
```

Expected: client and server both build without errors.

- [ ] **Step 2: Run the monolithic server**

```bash
cd /mnt/d/htdocs/wilindo
npm run start &
sleep 3
```

- [ ] **Step 3: Automated smoke checks**

```bash
KEY=$(grep API_KEY .env | cut -d= -f2)

echo "--- health ---"
curl -s -m 5 http://localhost:3001/api/health; echo

echo "--- GET provinsi still works ---"
curl -s -m 5 "http://localhost:3001/api/wilayah" | head -c 150; echo

echo "--- / and /admin both serve the SPA shell ---"
curl -s -m 5 -o /dev/null -w "root=%{http_code}\n" http://localhost:3001/
curl -s -m 5 -o /dev/null -w "admin=%{http_code}\n" http://localhost:3001/admin

echo "--- CRUD lifecycle one more time end-to-end, with cleanup ---"
curl -s -m 5 -X POST http://localhost:3001/api/wilayah \
  -H "Content-Type: application/json" -H "X-API-Key: $KEY" \
  -d '{"kode":"97","nama":"Provinsi Verifikasi Akhir"}'; echo
curl -s -m 5 -o /dev/null -w "delete=%{http_code}\n" -X DELETE http://localhost:3001/api/wilayah/97 -H "X-API-Key: $KEY"
curl -s -m 5 "http://localhost:3001/api/wilayah" | grep -o '"97"' || echo "confirmed removed"
```

Expected: health OK, provinsi list returned, both `/` and `/admin` return `200` (SPA fallback serving `index.html` for the client-side route), CRUD create/delete succeed and the cleanup grep confirms no leftover test row.

- [ ] **Step 4: Stop the server**

```bash
kill %1
```

- [ ] **Step 5: Manual browser check (human required)**

Open `http://localhost:3001` (or `npm run dev` in `server/` and `client/`
separately for hot-reload during manual testing) and verify:
1. Nav bar switches between "Alamat" and "Admin Wilayah".
2. On `/admin`, entering the `API_KEY` value from `.env` into the API Key field enables mutations.
3. "+ Tambah Provinsi" creates a new provinsi; it appears when reopening the Provinsi combobox.
4. Selecting that provinsi, then "+ Tambah Kabupaten/Kota" under it creates a child with the correct kode prefix.
5. "Ubah Nama" on a selected item updates its name; "Hapus" removes it (with a confirm dialog), and is rejected with a clear error message if the item still has children.
6. Clean up any test data created during this manual check.

**Note:** step 5 requires a human — there is no browser-automation tool available in this environment to verify it visually. Report the automated results and ask the user to confirm step 5 themselves.
