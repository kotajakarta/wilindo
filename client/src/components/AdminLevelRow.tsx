import { useState } from 'react';
import { AddressCombobox } from './AddressCombobox';
import type { WilayahItem, WilayahLevel } from '../types/wilayah';
import { updateWilayahNama, deleteWilayah } from '../api/wilayahAdmin';

interface AdminLevelRowProps {
  label: string;
  level: WilayahLevel;
  parentKode?: string;
  selected: WilayahItem | null;
  onSelect: (item: WilayahItem | null) => void;
  apiKey: string;
  refreshToken: number;
  onMutated: () => void;
}

const btnGhost =
  'rounded-md border border-hairline px-2.5 py-1 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50';
const btnDanger =
  'rounded-md border border-hairline px-2.5 py-1 text-xs font-medium text-danger hover:border-danger/40 hover:bg-danger-tint disabled:opacity-50';
const btnPrimary =
  'rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50';
const fieldSm =
  'rounded-md border border-hairline bg-surface px-2 py-1 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

export function AdminLevelRow({
  label,
  level,
  parentKode,
  selected,
  onSelect,
  apiKey,
  refreshToken,
  onMutated,
}: AdminLevelRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [pendingNama, setPendingNama] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSaveEdit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWilayahNama(selected.kode, pendingNama, apiKey);
      onSelect(updated);
      onMutated();
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan, coba lagi');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(`Hapus "${selected.nama}" (${selected.kode})?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWilayah(selected.kode, apiKey);
      onSelect(null);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan, coba lagi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-hairline pt-5 pb-5 first:pt-0 last:border-0 last:pb-0">
      <AddressCombobox
        label={label}
        level={level}
        parentKode={parentKode}
        value={selected}
        onChange={(item) => {
          onSelect(item);
          setIsEditing(false);
        }}
        refreshToken={refreshToken}
      />

      {selected && !isEditing && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-brand-tint px-1.5 py-0.5 font-mono text-[11px] font-medium text-brand">
              {selected.kode}
            </span>
            <span className="truncate text-sm font-medium text-ink">{selected.nama}</span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                setPendingNama(selected.nama);
                setIsEditing(true);
              }}
            >
              Ubah
            </button>
            <button type="button" className={btnDanger} onClick={handleDelete}>
              Hapus
            </button>
          </div>
        </div>
      )}

      {selected && isEditing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-canvas px-3 py-2">
          <span className="shrink-0 rounded bg-brand-tint px-1.5 py-0.5 font-mono text-[11px] font-medium text-brand">
            {selected.kode}
          </span>
          <input
            type="text"
            className={`${fieldSm} flex-1`}
            value={pendingNama}
            onChange={(e) => setPendingNama(e.target.value)}
            autoFocus
          />
          <button type="button" className={btnPrimary} disabled={busy} onClick={handleSaveEdit}>
            Simpan
          </button>
          <button type="button" className={btnGhost} onClick={() => setIsEditing(false)}>
            Batal
          </button>
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}
