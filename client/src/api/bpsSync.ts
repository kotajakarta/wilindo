export type BpsSyncStage =
  | 'idle'
  | 'fetching_provinces'
  | 'fetching_regencies'
  | 'fetching_districts'
  | 'fetching_villages'
  | 'syncing_db'
  | 'done'
  | 'error';

export interface BpsSyncProgress {
  isRunning: boolean;
  stage: BpsSyncStage;
  stageLabel: string;
  percent: number;
  currentStep: number;
  totalSteps: number;
  message: string;
  logs: string[];
  startedAt?: string;
  completedAt?: string;
  error?: string;
  summary?: {
    periode: string;
    sourceTotal: number;
    currentTotal: number;
    insertCount: number;
    updateCount: number;
    deleteCount: number;
  };
}

export async function getBpsSyncStatus(): Promise<BpsSyncProgress> {
  const res = await fetch('/api/admin/bps-sync/status');
  if (!res.ok) throw new Error('Gagal memeriksa status sinkronisasi');
  return res.json();
}

export async function startBpsSync(
  apiKey: string,
  mode: 'online' | 'local',
  periode: string = '2025_2.2025'
): Promise<{ ok: boolean; progress: BpsSyncProgress }> {
  const res = await fetch('/api/admin/bps-sync/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ mode, periode }),
  });

  if (!res.ok) {
    let errMsg = 'Gagal memulai sinkronisasi';
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export function subscribeBpsSyncProgress(
  onProgress: (progress: BpsSyncProgress) => void,
  onError?: (err: Event) => void
): () => void {
  const eventSource = new EventSource('/api/admin/bps-sync/progress');

  eventSource.onmessage = (event) => {
    try {
      const data: BpsSyncProgress = JSON.parse(event.data);
      onProgress(data);
    } catch (e) {
      console.error('Failed to parse SSE data', e);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    eventSource.close();
  };
}
