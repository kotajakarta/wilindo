import { useEffect, useState } from 'react';
import { WilayahAdminManager } from '../components/WilayahAdminManager';
import { BpsSyncSection } from '../components/BpsSyncSection';

const API_KEY_STORAGE_KEY = 'wilindo_admin_api_key';

export function AdminPage() {
  const [apiKey, setApiKey] = useState('');
  const [syncRefreshToken, setSyncRefreshToken] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) setApiKey(stored);
  }, []);

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    localStorage.setItem(API_KEY_STORAGE_KEY, value);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-brand uppercase">Admin</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
          Kelola Data Wilayah
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Sinkronisasi data resmi BPS per semester atau kelola (ubah nama dan hapus) wilayah administratif
          berjenjang. Perubahan berlaku langsung pada database production.
        </p>
      </div>

      <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
        <label className="text-sm font-medium text-ink" htmlFor="admin-api-key">
          Kunci API Admin
        </label>
        <input
          id="admin-api-key"
          type="password"
          className="mt-1.5 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="Masukkan kunci API untuk mengaktifkan aksi admin"
        />
        <p className="mt-1.5 text-xs text-faint">
          Diperlukan untuk sinkronisasi BPS, mengubah, atau menghapus data. Disimpan di browser
          Anda saja (localStorage).
        </p>
      </div>

      {/* Bagian Pembaruan Data BPS Online */}
      <BpsSyncSection
        apiKey={apiKey}
        onSyncCompleted={() => setSyncRefreshToken((t) => t + 1)}
      />

      {/* Bagian Penelusuran & Manajemen Data Wilayah */}
      <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
        <h2 className="mb-4 font-display text-base font-semibold text-ink border-b border-hairline pb-3">
          Hierarki & Perubahan Manual Wilayah
        </h2>
        <WilayahAdminManager apiKey={apiKey} externalRefreshToken={syncRefreshToken} />
      </div>
    </div>
  );
}
