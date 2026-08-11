import { useEffect, useRef, useState } from 'react';
import type { WilayahItem, WilayahLevel, WilayahSearchResult } from '../types/wilayah';
import { getChildren, searchWilayah } from '../api/wilayah';

interface AddressComboboxProps {
  label: string;
  level: WilayahLevel;
  parentKode?: string;
  value: WilayahItem | null;
  onChange: (item: WilayahItem | null) => void;
  onAutoFillAncestors?: (path: WilayahItem[]) => void;
}

export function AddressCombobox({
  label,
  level,
  parentKode,
  value,
  onChange,
  onAutoFillAncestors,
}: AddressComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<WilayahItem[]>([]);
  const [searchResults, setSearchResults] = useState<WilayahSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  const isSearching = query.trim().length > 0;
  const visibleOptions: WilayahItem[] = isSearching ? searchResults : options;

  async function fetchOptions(currentQuery: string) {
    const trimmed = currentQuery.trim();
    if (!trimmed && level > 1 && !parentKode) {
      setOptions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (trimmed) {
        const results = await searchWilayah(level, trimmed);
        setSearchResults(results);
      } else {
        const items = await getChildren(parentKode);
        setOptions(items);
      }
    } catch {
      setError(trimmed ? 'Gagal mencari wilayah' : 'Gagal memuat daftar wilayah');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOptions([]);
    setSearchResults([]);
    setQuery('');
    setHighlightedIndex(0);
    if (open) fetchOptions('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentKode]);

  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      fetchOptions(query);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => fetchOptions(query), 300);
    return () => window.clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectItem(item: WilayahItem) {
    onChange(item);
    if (isSearching) {
      const result = searchResults.find((r) => r.kode === item.kode);
      if (result && onAutoFillAncestors) onAutoFillAncestors(result.path);
    }
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, visibleOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = visibleOptions[highlightedIndex];
      if (item) selectItem(item);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-1" ref={containerRef}>
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type="text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={value ? value.nama : 'Pilih atau cari...'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlightedIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {open && (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
            {loading && <li className="px-3 py-2 text-sm text-gray-500">Memuat...</li>}
            {!loading && error && (
              <li className="flex items-center justify-between px-3 py-2 text-sm text-red-600">
                {error}
                <button
                  type="button"
                  className="ml-2 text-blue-600 underline"
                  onClick={() => fetchOptions(query)}
                >
                  Coba lagi
                </button>
              </li>
            )}
            {!loading && !error && visibleOptions.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">
                {!isSearching && level > 1 && !parentKode
                  ? 'Pilih level di atasnya dulu, atau ketik untuk mencari'
                  : 'Tidak ada hasil'}
              </li>
            )}
            {!loading &&
              !error &&
              visibleOptions.map((item, index) => {
                const result = isSearching
                  ? searchResults.find((r) => r.kode === item.kode)
                  : undefined;
                return (
                  <li
                    key={item.kode}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      index === highlightedIndex ? 'bg-blue-50' : ''
                    }`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectItem(item);
                    }}
                  >
                    <div>{item.nama}</div>
                    {result && result.path.length > 0 && (
                      <div className="text-xs text-gray-400">
                        {result.path.map((p) => p.nama).join(', ')}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
