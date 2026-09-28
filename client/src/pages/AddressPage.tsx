import { useEffect, useState } from 'react';
import { WilayahDropdown, type WilayahSelection } from '../components/WilayahDropdown';
import { getWilayahMeta, type WilayahMeta } from '../api/wilayah';

function selectedPath(selection: WilayahSelection) {
  return [selection.provinsi, selection.kabupaten, selection.kecamatan, selection.desa].filter(
    (item): item is NonNullable<typeof item> => item !== null
  );
}

export function AddressPage() {
  const [selection, setSelection] = useState<WilayahSelection | null>(null);
  const [meta, setMeta] = useState<WilayahMeta | null>(null);
  const path = selection ? selectedPath(selection) : [];
  const deepest = path.at(-1);

  useEffect(() => {
    getWilayahMeta()
      .then((data) => setMeta(data))
      .catch(() => {
        // Abaikan jika gagal memuat, gunakan fallback default
      });
  }, []);

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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted uppercase">
                Kode Wilayah Terpilih
              </p>
              <p className="mt-1.5 font-mono text-lg font-medium text-ink">{deepest.kode}</p>
              <p className="mt-1 text-sm text-muted">
                {path.map((item) => item.nama).join(' › ')}
              </p>
            </div>

            {deepest.kodepos && (
              <div className="rounded-xl border border-brand/20 bg-brand-tint/60 px-5 py-3 sm:text-right shrink-0">
                <p className="text-xs font-medium tracking-wide text-brand uppercase">
                  Kode Pos
                </p>
                <p className="mt-0.5 font-mono text-2xl font-bold tracking-wider text-brand">
                  {deepest.kodepos}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-faint">
        Sumber data:{' '}
        <a
          href="https://sig.bps.go.id/bridging-kode/index"
          target="_blank"
          rel="noreferrer"
          className="text-brand underline decoration-brand/30 hover:decoration-brand"
        >
          sig.bps.go.id/bridging-kode
        </a>{' '}
        — Badan Pusat Statistik - Kemendagri, {meta?.label ?? 'Tahun 2025 Semester 2'}.
      </p>
    </div>
  );
}

