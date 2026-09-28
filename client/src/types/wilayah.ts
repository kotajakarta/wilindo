export interface WilayahItem {
  kode: string;
  nama: string;
  kodepos?: string | null;
}

export interface WilayahSearchResult extends WilayahItem {
  path: WilayahItem[];
}

export type WilayahLevel = 1 | 2 | 3 | 4;
