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
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Admin Wilayah</h1>
      <div className="mb-6 flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">API Key</label>
        <input
          type="password"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="Masukkan API key untuk tambah/ubah/hapus"
        />
      </div>
      <WilayahAdminManager apiKey={apiKey} />
    </div>
  );
}
