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
