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
