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
