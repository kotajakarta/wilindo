import { useEffect, useState } from 'react';
import { WilayahAdminManager } from '../components/WilayahAdminManager';
import { BpsSyncSection } from '../components/BpsSyncSection';
import { AllowedDomainsSection } from '../components/AllowedDomainsSection';
import { verifyAdminApiKey } from '../api/wilayahAdmin';

const API_KEY_STORAGE_KEY = 'wilindo_admin_api_key';

export function AdminPage() {
  const [inputKey, setInputKey] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);

  // Periksa kunci yang tersimpan saat pertama kali dibuka
  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      setInputKey(stored);
      setChecking(true);
      verifyAdminApiKey(stored)
        .then((valid) => {
          if (valid) {
            setApiKey(stored);
            setIsAuthenticated(true);
          } else {
            localStorage.removeItem(API_KEY_STORAGE_KEY);
          }
        })
        .catch(() => {
          // Abaikan kegagalan koneksi awal
        })
        .finally(() => {
          setChecking(false);
        });
    }
  }, []);

  async function handleVerify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setErrorMsg('Silakan masukkan Kunci API Admin terlebih dahulu.');
      return;
    }

    setChecking(true);
    setErrorMsg(null);

    try {
      const isValid = await verifyAdminApiKey(trimmed);
      if (isValid) {
        setApiKey(trimmed);
        setIsAuthenticated(true);
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
      } else {
        setErrorMsg('Kunci API tidak valid. Akses ditolak.');
        setIsAuthenticated(false);
      }
    } catch {
      setErrorMsg('Gagal memverifikasi Kunci API. Pastikan server aktif dan coba lagi.');
    } finally {
      setChecking(false);
    }
  }

  function handleLogout() {
    setApiKey('');
    setInputKey('');
    setIsAuthenticated(false);
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-brand uppercase">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
          Kelola Data Wilayah
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Pembaruan data resmi BPS berkala semesteran dan pengelolaan data administratif berjenjang.
        </p>
      </div>

      {/* Kotak Input API Key & Tombol OK (Untuk Publik / Belum Terverifikasi) */}
      {!isAuthenticated ? (
        <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-ink block" htmlFor="admin-api-key">
                Kunci API Admin
              </label>
              <p className="mt-1 text-xs text-muted">
                Halaman ini dilindungi. Masukkan Kunci API Admin untuk mengakses kontrol sinkronisasi BPS dan kelola data wilayah.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  id="admin-api-key"
                  type="password"
                  className="flex-1 rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  value={inputKey}
                  onChange={(e) => {
                    setInputKey(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Masukkan kunci API admin..."
                  autoFocus
                  disabled={checking}
                />
                <button
                  type="submit"
                  id="btn-admin-auth-ok"
                  disabled={checking || !inputKey.trim()}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checking ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Memverifikasi...</span>
                    </>
                  ) : (
                    'OK'
                  )}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-danger-tint p-3 text-xs text-danger flex items-center justify-between">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  className="text-xs font-semibold underline hover:opacity-80"
                  onClick={() => setErrorMsg(null)}
                >
                  Tutup
                </button>
              </div>
            )}
          </form>
        </div>
      ) : (
        /* Status Bar Saat Terautentikasi */
        <div className="rounded-xl border border-hairline bg-surface p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-success"></span>
            <div>
              <span className="text-xs font-semibold text-ink">Mode Admin Aktif</span>
              <p className="text-[11px] font-mono text-muted">
                Kunci: {apiKey.slice(0, 6)}••••••••{apiKey.slice(-4)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="self-start sm:self-auto rounded-md border border-hairline px-3 py-1.5 text-xs font-medium text-muted hover:border-danger/40 hover:bg-danger-tint hover:text-danger transition-colors"
          >
            Kunci Kembali / Keluar
          </button>
        </div>
      )}

      {/* Bagian BPS dan Hierarki HANYA MUNCUL JIKA SUDAH TERVERIFIKASI */}
      {isAuthenticated && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Bagian Pembaruan Data BPS Online */}
          <BpsSyncSection
            apiKey={apiKey}
            onSyncCompleted={() => setSyncRefreshToken((t) => t + 1)}
          />

          {/* Bagian Whitelist Domain API */}
          <AllowedDomainsSection apiKey={apiKey} />

          {/* Bagian Penelusuran & Manajemen Data Wilayah */}
          <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
            <h2 className="mb-4 font-display text-base font-semibold text-ink border-b border-hairline pb-3">
              Hierarki & Perubahan Manual Wilayah
            </h2>
            <WilayahAdminManager apiKey={apiKey} externalRefreshToken={syncRefreshToken} />
          </div>
        </div>
      )}
    </div>
  );
}
