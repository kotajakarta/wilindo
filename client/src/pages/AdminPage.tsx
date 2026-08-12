import { useEffect, useState } from 'react';
import { WilayahAdminManager } from '../components/WilayahAdminManager';

const API_KEY_STORAGE_KEY = 'wilindo_admin_api_key';

export function AdminPage() {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) setApiKey(stored);
  }, []);

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    localStorage.setItem(API_KEY_STORAGE_KEY, value);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs font-medium tracking-wide text-brand uppercase">Admin</p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
        Kelola Data Wilayah
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Tambah, ubah, atau hapus data wilayah administratif berjenjang. Perubahan berlaku
        langsung pada database production.
      </p>

      <div className="mt-6 rounded-xl border border-hairline bg-surface p-6 shadow-sm">
        <label className="text-sm font-medium text-ink" htmlFor="admin-api-key">
          Kunci API
        </label>
        <input
          id="admin-api-key"
          type="password"
          className="mt-1.5 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:font-sans placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="Masukkan kunci API untuk tambah/ubah/hapus"
        />
        <p className="mt-1.5 text-xs text-faint">
          Diperlukan hanya untuk menambah, mengubah, atau menghapus data. Disimpan di browser
          Anda saja, tidak dikirim ke pihak lain.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-hairline bg-surface p-6 shadow-sm">
        <WilayahAdminManager apiKey={apiKey} />
      </div>
    </div>
  );
}
