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
