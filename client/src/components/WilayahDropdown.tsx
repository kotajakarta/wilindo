import { AddressCombobox } from './AddressCombobox';
import { QuickSearchBox } from './QuickSearchBox';
import { useWilayahSelection, type WilayahSelection } from '../hooks/useWilayahSelection';
import type { QuickSearchResult } from '../types/wilayah';

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
    selectFullLocation,
  } = useWilayahSelection(onChange);

  function handleQuickSelect(item: QuickSearchResult) {
    selectFullLocation(item, item.path, item.level);
  }

  return (
    <div className="space-y-5">
      {/* Kotak Pencarian Cepat */}
      <QuickSearchBox onSelect={handleQuickSelect} />

      {/* Pembatas Visual */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-hairline"></div>
        </div>
        <span className="relative bg-surface px-3 text-[11px] font-medium text-faint uppercase tracking-wider">
          atau telusuri berjenjang
        </span>
      </div>

      {/* 4 Kolom Dropdown Berjenjang */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  );
}

