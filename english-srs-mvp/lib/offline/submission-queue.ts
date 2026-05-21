const OFFLINE_QUEUE_KEY = 'plait:offline-submissions';

export interface OfflineSubmission {
  id: string;
  text: string;
  createdAt: number;
  attempts: number;
}

export function getOfflineQueue(): OfflineSubmission[] {
  try {
    const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return saved ? (JSON.parse(saved) as OfflineSubmission[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: OfflineSubmission[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage unavailable
  }
}

export function addToOfflineQueue(text: string): OfflineSubmission {
  const item: OfflineSubmission = {
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now(),
    attempts: 0,
  };
  writeQueue([...getOfflineQueue(), item]);
  return item;
}

export function removeFromOfflineQueue(id: string): void {
  writeQueue(getOfflineQueue().filter((i) => i.id !== id));
}

export function updateOfflineQueueItem(
  id: string,
  updates: Partial<OfflineSubmission>,
): void {
  writeQueue(
    getOfflineQueue().map((i) => (i.id === id ? { ...i, ...updates } : i)),
  );
}
