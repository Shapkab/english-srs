'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/api/client';
import {
  getOfflineQueue,
  removeFromOfflineQueue,
  updateOfflineQueueItem,
} from '@/lib/offline/submission-queue';
import { Toast } from '@/components/ui/Toast';

const MAX_ATTEMPTS = 3;

export function OfflineSyncManager() {
  const [syncedCount, setSyncedCount] = useState(0);
  const [showToast, setShowToast] = useState(false);
  // Ref guard rather than state, so a sync in flight can't be re-entered
  // by a rapid online/mount double-trigger (state would be stale here).
  const syncingRef = useRef(false);

  const syncOfflineQueue = useCallback(async () => {
    if (syncingRef.current) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    syncingRef.current = true;
    let synced = 0;
    try {
      for (const item of queue) {
        if (item.attempts >= MAX_ATTEMPTS) continue;
        try {
          updateOfflineQueueItem(item.id, { attempts: item.attempts + 1 });
          const res = await fetchWithAuth('/api/v1/submissions', {
            method: 'POST',
            body: JSON.stringify({ text: item.text }),
          });
          if (res.ok) {
            removeFromOfflineQueue(item.id);
            synced++;
          }
        } catch {
          // Network still down — retried on the next online event.
        }
      }
    } finally {
      syncingRef.current = false;
    }

    if (synced > 0) {
      setSyncedCount(synced);
      setShowToast(true);
    }
  }, []);

  useEffect(() => {
    function handleOnline() {
      void syncOfflineQueue();
    }
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) void syncOfflineQueue();
    return () => window.removeEventListener('online', handleOnline);
  }, [syncOfflineQueue]);

  return (
    <Toast
      open={showToast}
      message={`Synced ${syncedCount} offline submission${syncedCount !== 1 ? 's' : ''}`}
      variant="success"
      onDismiss={() => setShowToast(false)}
    />
  );
}
