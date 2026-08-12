import { useEffect, useState } from 'react';

export type ApiHealthStatus = 'checking' | 'online' | 'offline';

export function useApiHealth(pollIntervalMs = 30_000): ApiHealthStatus {
  const [status, setStatus] = useState<ApiHealthStatus>('checking');

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/health');
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline');
      } catch {
        if (!cancelled) setStatus('offline');
      }
    }

    check();
    const interval = window.setInterval(check, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return status;
}
