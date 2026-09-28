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

export interface WilayahMeta {
  periode: string;
  year: string;
  semester: string;
  label: string;
  updatedAt?: string;
}

export async function getWilayahMeta(): Promise<WilayahMeta> {
  const res = await fetch('/api/wilayah/meta');
  if (!res.ok) throw new Error('Gagal memuat info wilayah');
  return res.json();
}

