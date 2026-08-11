import { useState } from 'react';
import { AddressCombobox } from './AddressCombobox';
import type { WilayahItem, WilayahLevel } from '../types/wilayah';
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

function segmentPlaceholder(level: WilayahLevel): string {
  return level === 4 ? '4 digit (mis. 2001)' : '2 digit (mis. 01)';
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
    <div className="border-b border-gray-100 pb-4">
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
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="text-sm text-blue-600 underline"
            onClick={() => {
              setPendingNama(selected.nama);
              setMode('editing');
            }}
          >
            Ubah Nama
          </button>
          <button type="button" className="text-sm text-red-600 underline" onClick={handleDelete}>
            Hapus
          </button>
        </div>
      )}

      {selected && mode === 'editing' && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            value={pendingNama}
            onChange={(e) => setPendingNama(e.target.value)}
          />
          <button
            type="button"
            className="text-sm text-blue-600 underline disabled:opacity-50"
            disabled={busy}
            onClick={handleSaveEdit}
          >
            Simpan
          </button>
          <button
            type="button"
            className="text-sm text-gray-500 underline"
            onClick={() => setMode('idle')}
          >
            Batal
          </button>
        </div>
      )}

      {canAdd && (
        <div className="mt-2">
          {mode !== 'adding' ? (
            <button
              type="button"
              className="text-sm text-green-700 underline"
              onClick={() => setMode('adding')}
            >
              + Tambah {label}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {parentKode && <span className="text-sm text-gray-500">{parentKode}.</span>}
              <input
                type="text"
                placeholder={segmentPlaceholder(level)}
                className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={newSegment}
                onChange={(e) => setNewSegment(e.target.value)}
              />
              <input
                type="text"
                placeholder="Nama"
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={newNama}
                onChange={(e) => setNewNama(e.target.value)}
              />
              <button
                type="button"
                className="text-sm text-blue-600 underline disabled:opacity-50"
                disabled={busy}
                onClick={handleCreate}
              >
                Simpan
              </button>
              <button
                type="button"
                className="text-sm text-gray-500 underline"
                onClick={() => setMode('idle')}
              >
                Batal
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
