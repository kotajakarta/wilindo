import { useState } from 'react';
import { AddressCombobox } from './AddressCombobox';
import type { WilayahItem, WilayahLevel } from '../types/wilayah';
import { getChildren } from '../api/wilayah';
import { createWilayah, updateWilayahNama, deleteWilayah } from '../api/wilayahAdmin';

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

function segmentWidth(level: WilayahLevel): number {
  return level === 4 ? 4 : 2;
}

function segmentPlaceholder(level: WilayahLevel): string {
  return level === 4 ? '4 digit (mis. 2001)' : '2 digit (mis. 01)';
}

async function suggestNextSegment(parentKode: string | undefined, level: WilayahLevel): Promise<string> {
  const width = segmentWidth(level);
  try {
    const siblings = await getChildren(parentKode);
    const maxNumber = siblings.reduce((max, item) => {
      const lastSegment = item.kode.split('.').pop() ?? '';
      const num = parseInt(lastSegment, 10);
      return Number.isFinite(num) && num > max ? num : max;
    }, 0);
    return String(maxNumber + 1).padStart(width, '0');
  } catch {
    return ''; // fetch failed; let the admin type the segment manually
  }
}

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
  const [mode, setMode] = useState<'idle' | 'editing' | 'adding'>('idle');
  const [pendingNama, setPendingNama] = useState('');
  const [newSegment, setNewSegment] = useState('');
  const [newNama, setNewNama] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = level === 1 || Boolean(parentKode);

  async function handleSaveEdit() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWilayahNama(selected.kode, pendingNama, apiKey);
      onSelect(updated);
      onMutated();
      setMode('idle');
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

  async function handleOpenAdd() {
    setMode('adding');
    setNewNama('');
    setNewSegment(await suggestNextSegment(parentKode, level));
  }

  async function handleCreate() {
    const kode = parentKode ? `${parentKode}.${newSegment}` : newSegment;
    setBusy(true);
    setError(null);
    try {
      const created = await createWilayah(kode, newNama, apiKey);
      onSelect(created);
      onMutated();
      setNewSegment('');
      setNewNama('');
      setMode('idle');
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
          setMode('idle');
        }}
        refreshToken={refreshToken}
      />

      {selected && mode === 'idle' && (
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
                setMode('editing');
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

      {selected && mode === 'editing' && (
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
          <button type="button" className={btnGhost} onClick={() => setMode('idle')}>
            Batal
          </button>
        </div>
      )}

      {canAdd && (
        <div className="mt-2">
          {mode !== 'adding' ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline py-2 text-xs font-medium text-muted hover:border-brand hover:text-brand"
              onClick={handleOpenAdd}
            >
              + Tambah {label}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-canvas px-3 py-2">
              {parentKode && (
                <span className="font-mono text-xs text-faint">{parentKode}.</span>
              )}
              <input
                type="text"
                placeholder={segmentPlaceholder(level)}
                className={`${fieldSm} w-28 font-mono`}
                value={newSegment}
                onChange={(e) => setNewSegment(e.target.value)}
              />
              <input
                type="text"
                placeholder="Nama"
                className={`${fieldSm} flex-1`}
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
              />
              <button type="button" className={btnPrimary} disabled={busy} onClick={handleCreate}>
                Simpan
              </button>
              <button type="button" className={btnGhost} onClick={() => setMode('idle')}>
                Batal
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}
