# Multi Dropdown Alamat Indonesia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Express API (2 endpoints) over the existing `wilayah` table and a React/Vite/Tailwind cascading, searchable combobox component for selecting Indonesian addresses (provinsi/kabupaten-kota/kecamatan/desa-kelurahan).

**Architecture:** Two independent npm packages in `server/` (Express + TypeScript + mysql2, CommonJS) and `client/` (React + Vite + TypeScript + Tailwind v4). Backend exposes `GET /api/wilayah?parent=` (children of a kode) and `GET /api/wilayah/search?level=&q=` (global name search with ancestor breadcrumb). Frontend has one generic `AddressCombobox` used 4 times, orchestrated by `WilayahDropdown` which holds cascading state and applies breadcrumb auto-fill when a global search result is picked.

**Tech Stack:** Express, mysql2 (raw SQL, connection pool, no ORM), TypeScript, Vitest (backend unit tests only), React 19, Vite, Tailwind CSS v4, TypeScript.

## Global Constraints

- Kode wilayah levels are determined by dot count: 0 dots = provinsi, 1 = kabupaten/kota, 2 = kecamatan, 3 = desa/kelurahan.
- `DATABASE_URL` lives in the **root** `.env` (`/mnt/d/htdocs/wilindo/.env`), not inside `server/`.
- Backend uses raw SQL via `mysql2` — no ORM.
- Only 2 API endpoints in scope: children-by-parent and search-by-level-with-breadcrumb. No auth, no caching layer, no CRUD/mutation endpoints (spec: out of scope).
- Search is **global** (not scoped to a selected parent) and must return an ancestor `path` array for breadcrumb display and auto-fill.
- No automated frontend or e2e tests — manual browser verification only (spec: out of scope). Backend service logic (`wilayah.service.ts`) is covered by Vitest unit tests with a mocked pool (no real DB needed for tests).
- Error responses: `400 { error }` for invalid input, `500 { error: "Terjadi kesalahan, coba lagi" }` for DB/server errors (details logged server-side only).

---

### Task 1: Scaffold Express server with a health check

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`

**Interfaces:**
- Produces: `app` (Express `Application` instance) exported from `server/src/app.ts`, used by `server/src/index.ts` and later by Task 3.

- [ ] **Step 1: Init the server package and install dependencies**

```bash
mkdir -p /mnt/d/htdocs/wilindo/server/src
cd /mnt/d/htdocs/wilindo/server
npm init -y
npm install express mysql2 cors dotenv
npm install -D typescript tsx @types/express @types/node @types/cors vitest
```

- [ ] **Step 2: Write `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Edit `server/package.json` scripts**

Replace the generated `"scripts"` block with:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc -p tsconfig.json",
  "start": "node dist/index.js",
  "test": "vitest run"
}
```

- [ ] **Step 4: Write `server/src/app.ts` (health check only for now)**

```ts
import express from 'express';
import cors from 'cors';

export const app = express();

app.use(cors());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
```

- [ ] **Step 5: Write `server/src/index.ts`**

```ts
import { app } from './app';

const port = process.env.PORT ? Number(process.env.PORT) : 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
```

- [ ] **Step 6: Verify it builds and runs**

```bash
cd /mnt/d/htdocs/wilindo/server
npx tsc -p tsconfig.json --noEmit
npm run dev &
sleep 1
curl -s http://localhost:3001/api/health
kill %1
```

Expected: `npx tsc --noEmit` prints nothing (no errors); curl prints `{"ok":true}`.

- [ ] **Step 7: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add server/package.json server/package-lock.json server/tsconfig.json server/src/app.ts server/src/index.ts
git commit -m "Scaffold Express server with health check"
```

---

### Task 2: `wilayah.service.ts` — children & search-with-breadcrumb logic (TDD)

**Files:**
- Create: `server/src/wilayah.service.ts`
- Test: `server/src/wilayah.service.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (pure module, DB access injected via a `QueryablePool` parameter — no dependency on `server/src/db.ts`).
- Produces (used by Task 3):
  - `interface WilayahItem { kode: string; nama: string }`
  - `interface WilayahSearchResult extends WilayahItem { path: WilayahItem[] }`
  - `type WilayahLevel = 1 | 2 | 3 | 4`
  - `interface QueryablePool { query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]> }`
  - `getChildren(pool: QueryablePool, parentKode?: string): Promise<WilayahItem[]>`
  - `searchWilayah(pool: QueryablePool, level: WilayahLevel, q: string, limit?: number): Promise<WilayahSearchResult[]>`

- [ ] **Step 1: Write the failing tests**

Create `server/src/wilayah.service.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getChildren, searchWilayah, type QueryablePool } from './wilayah.service';

function mockPool(responses: Array<[unknown[], unknown]>): QueryablePool {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  return { query };
}

describe('getChildren', () => {
  it('returns provinsi list when no parent given', async () => {
    const pool = mockPool([[[{ kode: '11', nama: 'Aceh' }], []]]);
    const result = await getChildren(pool, undefined);
    expect(result).toEqual([{ kode: '11', nama: 'Aceh' }]);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("NOT LIKE '%.%'"),
      undefined
    );
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
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd /mnt/d/htdocs/wilindo/server
npx vitest run
```

Expected: FAIL — `wilayah.service` module not found (it doesn't exist yet).

- [ ] **Step 3: Write `server/src/wilayah.service.ts`**

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
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd /mnt/d/htdocs/wilindo/server
npx vitest run
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add server/src/wilayah.service.ts server/src/wilayah.service.test.ts
git commit -m "Add wilayah.service with children/search-with-breadcrumb logic"
```

---

### Task 3: DB pool, routes, validation, error handling — wire into the API

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/wilayah.routes.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: `getChildren`, `searchWilayah`, `WilayahLevel` from `server/src/wilayah.service.ts` (Task 2); `app` from `server/src/app.ts` (Task 1).
- Produces: `pool` (mysql2 `Pool`) exported from `server/src/db.ts`; `wilayahRouter` (Express `Router`) exported from `server/src/wilayah.routes.ts`, mounted at `/api` in `app.ts`.

- [ ] **Step 1: Write `server/src/db.ts`**

```ts
import { createPool } from 'mysql2/promise';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (expected in root .env)');
}

export const pool = createPool(process.env.DATABASE_URL);
```

- [ ] **Step 2: Write `server/src/wilayah.routes.ts`**

```ts
import { Router } from 'express';
import { pool } from './db';
import { getChildren, searchWilayah, type WilayahLevel } from './wilayah.service';

export const wilayahRouter = Router();

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
```

- [ ] **Step 3: Wire the router and an error handler into `server/src/app.ts`**

Replace the file contents with:

```ts
import express from 'express';
import cors from 'cors';
import { wilayahRouter } from './wilayah.routes';

export const app = express();

app.use(cors());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', wilayahRouter);

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Terjadi kesalahan, coba lagi' });
  }
);
```

- [ ] **Step 4: Verify the full test suite still passes and the app builds**

```bash
cd /mnt/d/htdocs/wilindo/server
npx vitest run
npx tsc -p tsconfig.json --noEmit
```

Expected: tests still PASS (unaffected — they test `wilayah.service.ts` directly, not the routes), no type errors.

- [ ] **Step 5: Manual smoke test against the real database**

```bash
cd /mnt/d/htdocs/wilindo/server
npm run dev &
sleep 1
curl -s http://localhost:3001/api/health
curl -s "http://localhost:3001/api/wilayah" | head -c 300
curl -s "http://localhost:3001/api/wilayah/search?level=4&q=sukamaju&limit=5"
curl -s "http://localhost:3001/api/wilayah/search?level=5&q=x"
kill %1
```

Expected: `/api/health` → `{"ok":true}`; `/api/wilayah` → JSON array of provinsi; `/api/wilayah/search?level=4&q=sukamaju` → JSON array with `path` breadcrumbs; `level=5` request → `400 {"error":"level harus bernilai 1, 2, 3, atau 4"}`.

**Note:** the database is reachable via Tailscale at `100.106.18.101`. If curl hangs or connection is refused, the sandbox this task runs in likely can't reach that host — flag this to the user rather than treating it as a code bug; the `/api/wilayah/search?level=5&q=x` validation check (which needs no DB access) should still pass regardless.

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add server/src/db.ts server/src/wilayah.routes.ts server/src/app.ts
git commit -m "Wire wilayah API routes with validation and error handling"
```

---

### Task 4: Scaffold React + Vite + Tailwind client

**Files:**
- Create: `client/` (via `npm create vite`)
- Modify: `client/vite.config.ts`
- Modify: `client/src/index.css`

**Interfaces:**
- Produces: a running Vite dev server on port 5173 proxying `/api` to `http://localhost:3001`, with Tailwind utility classes available in any component.

- [ ] **Step 1: Scaffold the Vite React-TS app**

```bash
cd /mnt/d/htdocs/wilindo
npm create vite@latest client -- --template react-ts
cd client
npm install
```

- [ ] **Step 2: Install and wire up Tailwind CSS v4 (Vite plugin, no config file needed)**

```bash
cd /mnt/d/htdocs/wilindo/client
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Write `client/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
```

- [ ] **Step 4: Replace `client/src/index.css` contents**

```css
@import "tailwindcss";
```

- [ ] **Step 5: Verify the dev server starts and Tailwind is active**

```bash
cd /mnt/d/htdocs/wilindo/client
npm run build
npm run dev &
sleep 1
curl -s http://localhost:5173/ | head -c 200
kill %1
```

Expected: `npm run build` succeeds; curl returns the Vite HTML shell (200 OK, contains `<div id="root">`).

- [ ] **Step 6: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client
git commit -m "Scaffold React/Vite/Tailwind client"
```

---

### Task 5: `types/wilayah.ts` and `api/wilayah.ts`

**Files:**
- Create: `client/src/types/wilayah.ts`
- Create: `client/src/api/wilayah.ts`

**Interfaces:**
- Consumes: nothing (calls the proxied `/api/wilayah*` endpoints from Task 3 at runtime).
- Produces (used by Task 6):
  - `interface WilayahItem { kode: string; nama: string }`
  - `interface WilayahSearchResult extends WilayahItem { path: WilayahItem[] }`
  - `type WilayahLevel = 1 | 2 | 3 | 4`
  - `getChildren(parentKode?: string): Promise<WilayahItem[]>`
  - `searchWilayah(level: WilayahLevel, q: string, limit?: number): Promise<WilayahSearchResult[]>`

- [ ] **Step 1: Write `client/src/types/wilayah.ts`**

```ts
export interface WilayahItem {
  kode: string;
  nama: string;
}

export interface WilayahSearchResult extends WilayahItem {
  path: WilayahItem[];
}

export type WilayahLevel = 1 | 2 | 3 | 4;
```

- [ ] **Step 2: Write `client/src/api/wilayah.ts`**

```ts
import type { WilayahItem, WilayahSearchResult, WilayahLevel } from '../types/wilayah';

export async function getChildren(parentKode?: string): Promise<WilayahItem[]> {
  const url = parentKode
    ? `/api/wilayah?parent=${encodeURIComponent(parentKode)}`
    : '/api/wilayah';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gagal memuat data wilayah');
  return res.json();
}

export async function searchWilayah(
  level: WilayahLevel,
  q: string,
  limit = 20
): Promise<WilayahSearchResult[]> {
  const params = new URLSearchParams({ level: String(level), q, limit: String(limit) });
  const res = await fetch(`/api/wilayah/search?${params.toString()}`);
  if (!res.ok) throw new Error('Gagal mencari wilayah');
  return res.json();
}
```

- [ ] **Step 3: Verify it type-checks**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/types/wilayah.ts client/src/api/wilayah.ts
git commit -m "Add wilayah types and fetch wrapper for client"
```

---

### Task 6: `AddressCombobox.tsx` — generic searchable combobox

**Files:**
- Create: `client/src/components/AddressCombobox.tsx`

**Interfaces:**
- Consumes: `WilayahItem`, `WilayahLevel`, `WilayahSearchResult` from `client/src/types/wilayah.ts`; `getChildren`, `searchWilayah` from `client/src/api/wilayah.ts` (Task 5).
- Produces (used by Task 7):
  - `interface AddressComboboxProps { label: string; level: WilayahLevel; parentKode?: string; value: WilayahItem | null; onChange: (item: WilayahItem | null) => void; onAutoFillAncestors?: (path: WilayahItem[]) => void }`
  - `AddressCombobox(props: AddressComboboxProps): JSX.Element`

- [ ] **Step 1: Write `client/src/components/AddressCombobox.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { WilayahItem, WilayahLevel, WilayahSearchResult } from '../types/wilayah';
import { getChildren, searchWilayah } from '../api/wilayah';

interface AddressComboboxProps {
  label: string;
  level: WilayahLevel;
  parentKode?: string;
  value: WilayahItem | null;
  onChange: (item: WilayahItem | null) => void;
  onAutoFillAncestors?: (path: WilayahItem[]) => void;
}

export function AddressCombobox({
  label,
  level,
  parentKode,
  value,
  onChange,
  onAutoFillAncestors,
}: AddressComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<WilayahItem[]>([]);
  const [searchResults, setSearchResults] = useState<WilayahSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const isSearching = query.trim().length > 0;
  const visibleOptions: WilayahItem[] = isSearching ? searchResults : options;

  async function fetchOptions(currentQuery: string) {
    const trimmed = currentQuery.trim();
    if (!trimmed && level > 1 && !parentKode) {
      setOptions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (trimmed) {
        const results = await searchWilayah(level, trimmed);
        setSearchResults(results);
      } else {
        const items = await getChildren(parentKode);
        setOptions(items);
      }
    } catch {
      setError(trimmed ? 'Gagal mencari wilayah' : 'Gagal memuat daftar wilayah');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOptions([]);
    setSearchResults([]);
    setQuery('');
    setHighlightedIndex(0);
    if (open) fetchOptions('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKode]);

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
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectItem(item: WilayahItem) {
    onChange(item);
    if (isSearching) {
      const result = searchResults.find((r) => r.kode === item.kode);
      if (result && onAutoFillAncestors) onAutoFillAncestors(result.path);
    }
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, visibleOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = visibleOptions[highlightedIndex];
      if (item) selectItem(item);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type="text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={value ? value.nama : 'Pilih atau cari...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {open && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {loading && <li className="px-3 py-2 text-sm text-gray-500">Memuat...</li>}
            {!loading && error && (
              <li className="flex items-center justify-between px-3 py-2 text-sm text-red-600">
                {error}
                <button
                  type="button"
                  className="ml-2 text-blue-600 underline"
                  onClick={() => fetchOptions(query)}
                >
                  Coba lagi
                </button>
              </li>
            )}
            {!loading && !error && visibleOptions.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">
                {!isSearching && level > 1 && !parentKode
                  ? 'Pilih level di atasnya dulu, atau ketik untuk mencari'
                  : 'Tidak ada hasil'}
              </li>
            )}
            {!loading &&
              !error &&
              visibleOptions.map((item, index) => {
                const result = isSearching
                  ? searchResults.find((r) => r.kode === item.kode)
                  : undefined;
                return (
                  <li
                    key={item.kode}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      index === highlightedIndex ? 'bg-blue-50' : ''
                    }`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectItem(item);
                    }}
                  >
                    <div>{item.nama}</div>
                    {result && result.path.length > 0 && (
                      <div className="text-xs text-gray-400">
                        {result.path.map((p) => p.nama).join(', ')}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/components/AddressCombobox.tsx
git commit -m "Add generic AddressCombobox component"
```

---

### Task 7: `WilayahDropdown.tsx` orchestrator + wire into `App.tsx`

**Files:**
- Create: `client/src/components/WilayahDropdown.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `AddressCombobox` from `client/src/components/AddressCombobox.tsx` (Task 6); `WilayahItem` from `client/src/types/wilayah.ts` (Task 5).
- Produces: `interface WilayahSelection { provinsi: WilayahItem | null; kabupaten: WilayahItem | null; kecamatan: WilayahItem | null; desa: WilayahItem | null }` and `WilayahDropdown(props: { onChange?: (s: WilayahSelection) => void }): JSX.Element`.

- [ ] **Step 1: Write `client/src/components/WilayahDropdown.tsx`**

```tsx
import { useState } from 'react';
import { AddressCombobox } from './AddressCombobox';
import type { WilayahItem } from '../types/wilayah';

export interface WilayahSelection {
  provinsi: WilayahItem | null;
  kabupaten: WilayahItem | null;
  kecamatan: WilayahItem | null;
  desa: WilayahItem | null;
}

interface WilayahDropdownProps {
  onChange?: (selection: WilayahSelection) => void;
}

export function WilayahDropdown({ onChange }: WilayahDropdownProps) {
  const [selection, setSelection] = useState<WilayahSelection>({
    provinsi: null,
    kabupaten: null,
    kecamatan: null,
    desa: null,
  });

  function update(next: WilayahSelection) {
    setSelection(next);
    onChange?.(next);
  }

  function handleProvinsiChange(item: WilayahItem | null) {
    update({ provinsi: item, kabupaten: null, kecamatan: null, desa: null });
  }

  function handleKabupatenChange(item: WilayahItem | null) {
    update({ ...selection, kabupaten: item, kecamatan: null, desa: null });
  }

  function handleKecamatanChange(item: WilayahItem | null) {
    update({ ...selection, kecamatan: item, desa: null });
  }

  function handleDesaChange(item: WilayahItem | null) {
    update({ ...selection, desa: item });
  }

  function handleAutoFillFromKabupaten(path: WilayahItem[]) {
    const [provinsi] = path;
    update({ ...selection, provinsi: provinsi ?? null, kecamatan: null, desa: null });
  }

  function handleAutoFillFromKecamatan(path: WilayahItem[]) {
    const [provinsi, kabupaten] = path;
    update({
      ...selection,
      provinsi: provinsi ?? null,
      kabupaten: kabupaten ?? null,
      desa: null,
    });
  }

  function handleAutoFillFromDesa(path: WilayahItem[]) {
    const [provinsi, kabupaten, kecamatan] = path;
    update({
      ...selection,
      provinsi: provinsi ?? null,
      kabupaten: kabupaten ?? null,
      kecamatan: kecamatan ?? null,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AddressCombobox
        label="Provinsi"
        level={1}
        value={selection.provinsi}
        onChange={handleProvinsiChange}
      />
      <AddressCombobox
        label="Kabupaten/Kota"
        level={2}
        parentKode={selection.provinsi?.kode}
        value={selection.kabupaten}
        onChange={handleKabupatenChange}
        onAutoFillAncestors={handleAutoFillFromKabupaten}
      />
      <AddressCombobox
        label="Kecamatan"
        level={3}
        parentKode={selection.kabupaten?.kode}
        value={selection.kecamatan}
        onChange={handleKecamatanChange}
        onAutoFillAncestors={handleAutoFillFromKecamatan}
      />
      <AddressCombobox
        label="Kelurahan/Desa"
        level={4}
        parentKode={selection.kecamatan?.kode}
        value={selection.desa}
        onChange={handleDesaChange}
        onAutoFillAncestors={handleAutoFillFromDesa}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace `client/src/App.tsx`**

```tsx
import { useState } from 'react';
import { WilayahDropdown, type WilayahSelection } from './components/WilayahDropdown';

function App() {
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

export default App;
```

- [ ] **Step 3: Verify it type-checks and builds**

```bash
cd /mnt/d/htdocs/wilindo/client
npx tsc --noEmit
npm run build
```

Expected: no type errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /mnt/d/htdocs/wilindo
git add client/src/components/WilayahDropdown.tsx client/src/App.tsx
git commit -m "Add WilayahDropdown orchestrator and wire into App"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start both servers**

```bash
cd /mnt/d/htdocs/wilindo/server && npm run dev &
cd /mnt/d/htdocs/wilindo/client && npm run dev &
```

- [ ] **Step 2: Automated smoke checks**

```bash
sleep 1
curl -s http://localhost:3001/api/health
curl -s "http://localhost:3001/api/wilayah" | head -c 200
curl -s http://localhost:5173/ | head -c 200
```

Expected: health check OK, provinsi list returned (if DB reachable — see Task 3 Step 5 note), Vite HTML shell returned.

- [ ] **Step 3: Manual browser check (human required)**

Open `http://localhost:5173` in a browser and verify:
1. Provinsi dropdown opens on focus and lists all provinces.
2. Selecting a provinsi enables the Kabupaten/Kota dropdown and loads its children.
3. Changing provinsi resets Kabupaten/Kecamatan/Desa.
4. Typing in the Desa/Kelurahan box (without picking a provinsi first) returns global search results with a breadcrumb line under each name, and picking one auto-fills Provinsi/Kabupaten/Kecamatan.
5. The JSON preview at the bottom of the page reflects the final selection.

**Note:** this task's automated steps can be run directly, but step 3 requires a human to look at the rendered page in a browser — there is no browser-automation tool available in this environment to verify it visually. Report the automated results and ask the user to confirm step 3 themselves.

- [ ] **Step 4: Stop dev servers**

```bash
kill %1 %2
```
