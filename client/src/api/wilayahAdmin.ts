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
