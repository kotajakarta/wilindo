import { useState, useEffect, useRef } from 'react';
import {
  startBpsSync,
  subscribeBpsSyncProgress,
  getBpsSyncStatus,
  type BpsSyncProgress,
} from '../api/bpsSync';

interface BpsSyncSectionProps {
  apiKey: string;
  onSyncCompleted?: () => void;
}

export function BpsSyncSection({ apiKey, onSyncCompleted }: BpsSyncSectionProps) {
  const [progress, setProgress] = useState<BpsSyncProgress | null>(null);
  const [periode, setPeriode] = useState('2025_2.2025');
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Load initial status and subscribe to SSE
  useEffect(() => {
    getBpsSyncStatus()
      .then((data) => setProgress(data))
      .catch((err) => console.error('Failed to get BPS sync status', err));

    const unsubscribe = subscribeBpsSyncProgress((data) => {
      setProgress(data);
      if (data.stage === 'done') {
        onSyncCompleted?.();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [onSyncCompleted]);

  // Auto scroll logs when open
  useEffect(() => {
    if (showLogs && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [progress?.logs, showLogs]);

  const isRunning = Boolean(progress?.isRunning || starting);

  async function handleStart(mode: 'online' | 'local') {
    if (!apiKey) {
      setErrorMsg('Masukkan Kunci API terlebih dahulu di panel atas.');
      return;
    }

    const confirmText =
      mode === 'online'
        ? `Mulai sinkronisasi online dari BPS untuk periode "${periode}"?\n\nProses ini akan mengunduh data seluruh Indonesia (~80k desa) langsung dari BPS dan memakan waktu sekitar 5-10 menit.`
        : 'Sinkronkan data ke database menggunakan file lokal bps/*.json yang sudah ada?';

    if (!window.confirm(confirmText)) return;

    setStarting(true);
    setErrorMsg(null);

    try {
      const res = await startBpsSync(apiKey, mode, periode);
      setProgress(res.progress);
      setShowLogs(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memulai sinkronisasi');
    } finally {
      setStarting(false);
    }
  }

  const percent = progress?.percent ?? 0;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-hairline pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
              Pembaruan Data BPS Resmi
            </h2>
            {progress?.isRunning ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-medium text-brand animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-brand"></span>
                Sinkronisasi Berjalan
              </span>
            ) : progress?.stage === 'done' ? (
              <span className="inline-flex items-center rounded-full bg-success-tint px-2.5 py-0.5 text-xs font-medium text-success">
                Tersinkron
              </span>
            ) : progress?.stage === 'error' ? (
              <span className="inline-flex items-center rounded-full bg-danger-tint px-2.5 py-0.5 text-xs font-medium text-danger">
                Perlu Perhatian
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">
            Sinkronisasi pemutakhiran wilayah berkala semesteran (~6 bulan sekali) langsung dari API BPS (sig.bps.go.id).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label htmlFor="bps-periode" className="text-xs font-medium text-muted">
            Periode:
          </label>
          <input
            id="bps-periode"
            type="text"
            className="w-32 rounded-lg border border-hairline bg-canvas px-2.5 py-1 font-mono text-xs text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            disabled={isRunning}
            placeholder="2025_2.2025"
          />
        </div>
      </div>

      {errorMsg && (
        <div className="mt-4 rounded-lg bg-danger-tint p-3 text-xs text-danger flex items-center justify-between">
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

      {/* Progress Display */}
      {isRunning && (
        <div className="mt-5 space-y-3 rounded-lg border border-hairline bg-canvas p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink flex items-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5 text-brand" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              {progress?.stageLabel || 'Memproses...'}
            </span>
            <span className="font-mono font-semibold text-brand text-sm">{percent}%</span>
          </div>

          {/* Progress Bar Container */}
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-hairline/60">
            <div
              className="h-full bg-brand transition-all duration-300 ease-out rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="text-xs text-muted truncate">
            {progress?.message || 'Menyiapkan proses sinkronisasi...'}
          </p>
        </div>
      )}

      {/* Completion Summary */}
      {!isRunning && progress?.stage === 'done' && progress.summary && (
        <div className="mt-5 rounded-lg border border-success/30 bg-success-tint/40 p-4">
          <div className="flex items-center gap-2 text-success font-medium text-sm">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            Sinkronisasi Berhasil Selesai
          </div>
          <p className="mt-1 text-xs text-ink/80">
            Periode: <strong className="font-mono">{progress.summary.periode}</strong> &bull; Total data sumber BPS:{' '}
            <strong>{progress.summary.sourceTotal.toLocaleString('id-ID')}</strong> baris.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] text-muted font-medium">
            <span className="rounded bg-surface px-2 py-0.5 border border-hairline">
              Ditambahkan: <strong className="text-ink">{progress.summary.insertCount}</strong>
            </span>
            <span className="rounded bg-surface px-2 py-0.5 border border-hairline">
              Diperbarui: <strong className="text-ink">{progress.summary.updateCount}</strong>
            </span>
            <span className="rounded bg-surface px-2 py-0.5 border border-hairline">
              Dihapus: <strong className="text-ink">{progress.summary.deleteCount}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Error state */}
      {!isRunning && progress?.stage === 'error' && (
        <div className="mt-5 rounded-lg border border-danger/30 bg-danger-tint p-4">
          <div className="flex items-center gap-2 text-danger font-medium text-sm">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Sinkronisasi Terhenti / Gagal
          </div>
          <p className="mt-1 text-xs text-danger/90">{progress.error || progress.message}</p>
        </div>
      )}

      {/* Controls & Logs Toggle */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="btn-sync-bps-online"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleStart('online')}
            disabled={isRunning || !apiKey}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {isRunning ? 'Sedang Menyinkronkan...' : 'Update dari BPS Online'}
          </button>

          <button
            type="button"
            id="btn-sync-bps-local"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-canvas transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => handleStart('local')}
            disabled={isRunning || !apiKey}
            title="Sinkronisasi cepat dari berkas bps/*.json yang sudah tersimpan secara lokal"
          >
            <svg className="h-3.5 w-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            Sinkron dari File Lokal
          </button>
        </div>

        {progress?.logs && progress.logs.length > 0 && (
          <button
            type="button"
            className="text-xs text-muted hover:text-ink underline transition-colors"
            onClick={() => setShowLogs(!showLogs)}
          >
            {showLogs ? 'Sembunyikan Log' : `Lihat Log Aktivitas (${progress.logs.length})`}
          </button>
        )}
      </div>

      {!apiKey && (
        <p className="mt-2 text-[11px] text-faint">
          * Masukkan Kunci API pada panel di atas untuk mengaktifkan tombol sinkronisasi.
        </p>
      )}

      {/* Log Console */}
      {showLogs && progress?.logs && progress.logs.length > 0 && (
        <div className="mt-4 rounded-lg bg-ink p-3 font-mono text-[11px] text-canvas shadow-inner max-h-52 overflow-y-auto space-y-1">
          {progress.logs.map((log, index) => (
            <div key={index} className="leading-relaxed opacity-90 break-words">
              {log}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
