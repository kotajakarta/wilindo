import { useState, useEffect, useRef } from 'react';
import { quickSearchWilayah } from '../api/wilayah';
import type { QuickSearchResult } from '../types/wilayah';

interface QuickSearchBoxProps {
  onSelect: (result: QuickSearchResult) => void;
}

export function QuickSearchBox({ onSelect }: QuickSearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await quickSearchWilayah(trimmed, 15);
        setResults(data);
        setHighlightedIndex(0);
        setOpen(true);
      } catch (err) {
        console.error('Quick search error:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  function handleSelect(item: QuickSearchResult) {
    onSelect(item);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[highlightedIndex]) {
        handleSelect(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <label htmlFor="quick-search-input" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
        Pencarian Cepat
      </label>
      <div className="relative flex items-center">
        {/* Search icon */}
        <div className="pointer-events-none absolute left-3.5 flex items-center text-muted">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <input
          id="quick-search-input"
          type="text"
          className="w-full rounded-xl border border-hairline bg-canvas py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-faint focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all shadow-xs"
          placeholder="Cari nama Kecamatan, Desa/Kelurahan, atau Kode Pos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />

        {/* Right side loader / clear button */}
        <div className="absolute right-3 flex items-center">
          {loading ? (
            <svg className="animate-spin h-4 w-4 text-brand" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          ) : query ? (
            <button
              type="button"
              className="text-muted hover:text-ink text-sm px-1"
              onClick={() => {
                setQuery('');
                setResults([]);
                setOpen(false);
              }}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* Autocomplete Dropdown List */}
      {open && (
        <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-hairline bg-surface p-1.5 shadow-xl">
          {results.length === 0 && !loading ? (
            <li className="px-4 py-3 text-center text-xs text-muted">
              Tidak ditemukan kecamatan, kelurahan, atau kode pos untuk &ldquo;{query}&rdquo;
            </li>
          ) : (
            results.map((item, index) => {
              const isSelected = index === highlightedIndex;
              return (
                <li
                  key={item.kode}
                  className={`cursor-pointer rounded-lg px-3.5 py-2.5 transition-colors ${
                    isSelected ? 'bg-brand-tint' : 'hover:bg-canvas'
                  }`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(item);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-ink">{item.nama}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          item.level === 4
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.level === 4 ? 'Kel/Desa' : 'Kecamatan'}
                      </span>
                    </div>

                    {item.kodepos && (
                      <span className="rounded-md bg-brand-tint border border-brand/20 px-2 py-0.5 font-mono text-xs font-semibold text-brand shrink-0">
                        📮 {item.kodepos}
                      </span>
                    )}
                  </div>

                  {item.path && item.path.length > 0 && (
                    <div className="mt-1 text-xs text-muted truncate">
                      {item.path.map((p) => p.nama).join(' › ')}
                    </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
