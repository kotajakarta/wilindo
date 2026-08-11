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
