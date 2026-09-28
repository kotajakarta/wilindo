import { useEffect, useState } from 'react';
import {
  fetchAllowedDomains,
  createAllowedDomain,
  removeAllowedDomain,
  type AllowedDomainItem,
} from '../api/wilayahAdmin';

interface AllowedDomainsSectionProps {
  apiKey: string;
}

export function AllowedDomainsSection({ apiKey }: AllowedDomainsSectionProps) {
  const [domains, setDomains] = useState<AllowedDomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form input
  const [inputDomain, setInputDomain] = useState('');
  const [inputKeterangan, setInputKeterangan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Deleting state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    loadDomains();
  }, [apiKey]);

  async function loadDomains() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllowedDomains(apiKey);
      setDomains(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat daftar domain');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault();
    const cleanInput = inputDomain.trim();
    if (!cleanInput) {
      setFormError('Nama domain tidak boleh kosong');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setSuccessMsg(null);

    try {
      const created = await createAllowedDomain(cleanInput, inputKeterangan.trim() || undefined, apiKey);
      setDomains((prev) => [created, ...prev]);
      setInputDomain('');
      setInputKeterangan('');
      setSuccessMsg(`Domain "${created.domain}" dan seluruh subdomainnya berhasil diizinkan!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menambahkan domain');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(item: AllowedDomainItem) {
    const confirmDelete = window.confirm(
      `Yakin ingin menghapus domain "${item.domain}"? Website dan seluruh subdomain dari domain ini tidak akan bisa mengakses API Wilindo lagi.`
    );
    if (!confirmDelete) return;

    setDeletingId(item.id);
    try {
      await removeAllowedDomain(item.id, apiKey);
      setDomains((prev) => prev.filter((d) => d.id !== item.id));
      setSuccessMsg(`Domain "${item.domain}" telah dihapus dari whitelist.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(`Gagal menghapus domain: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-ink">
              Whitelist Domain & Subdomain API
            </h2>
            <span className="rounded bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
              Mode Ketat (Strict)
            </span>
          </div>
          <p className="mt-1 text-xs text-muted max-w-2xl leading-relaxed">
            Hanya website dari domain yang terdaftar yang dapat memanggil API Wilindo dari browser. Cukup daftarkan domain utama (misal <span className="font-mono text-brand font-medium">tokosaya.com</span>), maka seluruh subdomain (<span className="font-mono text-muted">app.tokosaya.com</span>, <span className="font-mono text-muted">admin.tokosaya.com</span>) otomatis diizinkan.
          </p>
        </div>
      </div>

      {/* Info Box Default Permitted */}
      <div className="mt-4 rounded-lg border border-brand/20 bg-brand-tint/40 p-3 text-xs text-ink/80 flex items-start gap-2.5">
        <svg className="h-4 w-4 text-brand shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="leading-relaxed">
          <span className="font-semibold text-ink">Domain Bawaan yang Selalu Diizinkan:</span>{' '}
          <span className="font-mono text-brand">wil.nri.my.id</span>, <span className="font-mono text-brand">nri.my.id</span>, dan lingkungan lokal development (<span className="font-mono text-muted">localhost</span>).
          <p className="mt-0.5 text-muted text-[11px]">
            * Request langsung tanpa browser (seperti cURL atau script backend) wajib menyertakan header <code className="font-mono text-brand bg-brand/10 px-1 rounded">X-API-Key</code>.
          </p>
        </div>
      </div>

      {/* Form Tambah Domain Baru */}
      <form onSubmit={handleAddDomain} className="mt-5 rounded-lg border border-hairline bg-canvas p-4">
        <h3 className="text-xs font-semibold text-ink uppercase tracking-wider mb-3">
          Tambah Domain yang Diizinkan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5">
            <label htmlFor="input-new-domain" className="block text-xs font-medium text-muted mb-1">
              Nama Domain Utama
            </label>
            <input
              id="input-new-domain"
              type="text"
              placeholder="misal: tokosaya.com"
              value={inputDomain}
              onChange={(e) => {
                setInputDomain(e.target.value);
                if (formError) setFormError(null);
              }}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink font-mono placeholder:font-sans placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              disabled={isSubmitting}
            />
          </div>

          <div className="sm:col-span-5">
            <label htmlFor="input-new-keterangan" className="block text-xs font-medium text-muted mb-1">
              Catatan / Nama Aplikasi (Opsional)
            </label>
            <input
              id="input-new-keterangan"
              type="text"
              placeholder="misal: Portal Kasir & Toko Online"
              value={inputKeterangan}
              onChange={(e) => setInputKeterangan(e.target.value)}
              className="w-full rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-faint focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              disabled={isSubmitting}
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              id="btn-add-domain"
              disabled={isSubmitting || !inputDomain.trim()}
              className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Tambah</span>
                </>
              )}
            </button>
          </div>
        </div>

        {formError && (
          <div className="mt-2.5 rounded-md bg-danger-tint p-2 text-xs text-danger flex items-center justify-between">
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError(null)} className="underline font-semibold ml-2">
              Tutup
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mt-2.5 rounded-md bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800 flex items-center gap-2">
            <svg className="h-4 w-4 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}
      </form>

      {/* Daftar Domain Aktif */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-ink uppercase tracking-wider">
            Daftar Domain Kustom ({domains.length})
          </span>
          <button
            type="button"
            onClick={loadDomains}
            className="text-[11px] text-muted hover:text-brand transition-colors cursor-pointer"
          >
            Segarkan
          </button>
        </div>

        {loading ? (
          <div className="py-6 text-center text-xs text-muted">Memuat daftar domain...</div>
        ) : error ? (
          <div className="rounded-lg bg-danger-tint p-3 text-xs text-danger text-center">
            {error}
          </div>
        ) : domains.length === 0 ? (
          <div className="rounded-lg border border-dashed border-hairline py-8 text-center">
            <svg className="mx-auto h-8 w-8 text-muted/50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs font-medium text-ink">Belum Ada Domain Kustom</p>
            <p className="mt-0.5 text-[11px] text-muted max-w-sm mx-auto">
              Saat ini hanya domain bawaan yang diizinkan. Daftarkan domain aplikasi Anda di atas agar frontend aplikasi Anda dapat memanggil API Wilindo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-hairline bg-canvas text-muted">
                <tr>
                  <th className="px-3.5 py-2.5 font-medium">Domain Utama</th>
                  <th className="px-3.5 py-2.5 font-medium">Cakupan Akses</th>
                  <th className="px-3.5 py-2.5 font-medium">Catatan / Keterangan</th>
                  <th className="px-3.5 py-2.5 font-medium">Tanggal Ditambahkan</th>
                  <th className="px-3.5 py-2.5 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {domains.map((d) => (
                  <tr key={d.id} className="hover:bg-canvas/50 transition-colors">
                    <td className="px-3.5 py-2.5 font-mono font-medium text-ink">
                      {d.domain}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="inline-flex items-center gap-1 rounded bg-brand-tint px-2 py-0.5 text-[10px] font-medium text-brand">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Domain & seluruh sub-domain</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-muted">
                      {d.keterangan || <span className="text-faint italic">-</span>}
                    </td>
                    <td className="px-3.5 py-2.5 text-muted text-[11px]">
                      {new Date(d.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(d)}
                        disabled={deletingId === d.id}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-danger hover:bg-danger-tint transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === d.id ? 'Menghapus...' : 'Hapus'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
