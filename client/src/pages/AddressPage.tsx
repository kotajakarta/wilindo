import { useState } from 'react';
import { WilayahDropdown, type WilayahSelection } from '../components/WilayahDropdown';

function selectedPath(selection: WilayahSelection) {
  return [selection.provinsi, selection.kabupaten, selection.kecamatan, selection.desa].filter(
    (item): item is NonNullable<typeof item> => item !== null
  );
}

export function AddressPage() {
  const [selection, setSelection] = useState<WilayahSelection | null>(null);
  const path = selection ? selectedPath(selection) : [];
  const deepest = path.at(-1);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-medium tracking-wide text-brand uppercase">Alamat</p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
        Pencarian Alamat
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Pilih atau cari wilayah administratif secara berjenjang, dari provinsi hingga
        desa/kelurahan.
      </p>

      <div className="mt-6 rounded-xl border border-hairline bg-surface p-6 shadow-sm">
        <WilayahDropdown onChange={setSelection} />
      </div>

      {deepest && (
        <div className="mt-4 rounded-xl border border-hairline bg-surface p-6 shadow-sm">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            Kode Wilayah Terpilih
          </p>
          <p className="mt-2 font-mono text-lg font-medium text-ink">{deepest.kode}</p>
          <p className="mt-1 text-sm text-muted">
            {path.map((item) => item.nama).join(' › ')}
          </p>
        </div>
      )}
    </div>
  );
}
