import { describe, it, expect } from 'vitest';
import { bpsSyncManager } from './bps-sync.service';

describe('bpsSyncManager', () => {
  it('initializes with default idle state', () => {
    const progress = bpsSyncManager.getProgress();
    expect(progress.isRunning).toBe(false);
    expect(progress.stage).toBe('idle');
    expect(progress.percent).toBe(0);
    expect(progress.logs).toBeDefined();
  });

  it('allows subscribing to progress updates', () => {
    let callCount = 0;
    const unsub = bpsSyncManager.subscribe((p) => {
      callCount++;
      expect(p).toBeDefined();
      expect(typeof p.percent).toBe('number');
    });

    expect(callCount).toBe(1);
    unsub();
  });
});
