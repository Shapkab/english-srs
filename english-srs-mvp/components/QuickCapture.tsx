'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api/client';
import { toUserMessage, type ErrorPayload } from '@/lib/api/error-messages';
import { cn } from '@/lib/ui/cn';

const QUEUE_KEY = 'plait:quick-queue';
const MIN_LENGTH = 10;

interface QueuedItem {
  id: string;
  text: string;
  createdAt: number;
  status: 'pending' | 'submitting' | 'done' | 'error';
  error?: string;
}

export function QuickCapture() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [queue, setQueue] = useState<QueuedItem[]>([]);

  // Load queue from localStorage; reset any stuck "submitting" items.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUEUE_KEY);
      if (saved) {
        const items = JSON.parse(saved) as QueuedItem[];
        setQueue(
          items.map((i) =>
            i.status === 'submitting' ? { ...i, status: 'pending' as const } : i,
          ),
        );
      }
    } catch {
      // localStorage unavailable
    }
    inputRef.current?.focus();
  }, []);

  // Persist queue to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // localStorage unavailable
    }
  }, [queue]);

  // Process the next pending item. Re-runs on every queue change; marking
  // an item "submitting" makes the next run find nothing and return, so a
  // single item is submitted at a time and the loop converges.
  useEffect(() => {
    const pending = queue.find((i) => i.status === 'pending');
    if (!pending) return;

    setQueue((q) =>
      q.map((i) => (i.id === pending.id ? { ...i, status: 'submitting' as const } : i)),
    );

    (async () => {
      try {
        const res = await fetchWithAuth('/api/v1/submissions', {
          method: 'POST',
          body: JSON.stringify({ text: pending.text }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as ErrorPayload;
          throw new Error(toUserMessage(body, res.status));
        }
        setQueue((q) =>
          q.map((i) => (i.id === pending.id ? { ...i, status: 'done' as const } : i)),
        );
        setTimeout(() => {
          setQueue((q) => q.filter((i) => i.id !== pending.id));
        }, 2000);
      } catch (e) {
        setQueue((q) =>
          q.map((i) =>
            i.id === pending.id
              ? {
                  ...i,
                  status: 'error' as const,
                  error: e instanceof Error ? e.message : 'Failed',
                }
              : i,
          ),
        );
      }
    })();
  }, [queue]);

  function handleAdd() {
    const text = input.trim();
    if (text.length < MIN_LENGTH) return;
    const item: QueuedItem = {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
      status: 'pending',
    };
    setQueue((q) => [...q, item]);
    setInput('');
    inputRef.current?.focus();
  }

  function handleRemove(id: string) {
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  function handleRetry(id: string) {
    setQueue((q) =>
      q.map((i) =>
        i.id === id ? { ...i, status: 'pending' as const, error: undefined } : i,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-line">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 text-ink-soft hover:text-ink min-h-[44px] min-w-[44px]"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <span className="text-sm font-medium">Quick Capture</span>
        <div className="w-10" />
      </header>

      <div className="p-4 border-b border-line">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Type a sentence or correction..."
            className={cn(
              'flex-1 px-3 py-2 rounded-lg border border-line bg-bg-elev',
              'text-[16px] placeholder:text-ink-ghost min-h-[44px]',
              'focus:outline-none focus:border-ink',
            )}
          />
          <button
            onClick={handleAdd}
            disabled={input.trim().length < MIN_LENGTH}
            className={cn(
              'px-4 py-2 rounded-lg transition-colors min-h-[44px] min-w-[44px]',
              input.trim().length >= MIN_LENGTH
                ? 'bg-ink text-bg hover:bg-ink/90'
                : 'bg-line text-ink-ghost cursor-not-allowed',
            )}
            aria-label="Add to queue"
          >
            <Plus size={20} />
          </button>
        </div>
        <p className="text-xs text-ink-soft mt-2">
          Press Enter or tap + to queue for analysis
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <div className="p-8 text-center text-ink-soft">
            <p>No items in queue</p>
            <p className="text-xs mt-1">
              Type quick notes and they&apos;ll be analyzed automatically
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {queue.map((item) => (
              <li key={item.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{item.text}</p>
                  {item.error && (
                    <p className="text-xs text-rose-deep mt-1">{item.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {item.status === 'pending' && (
                    <span className="text-xs text-ink-soft">Queued</span>
                  )}
                  {item.status === 'submitting' && (
                    <span className="text-xs text-ink-soft animate-pulse">
                      Sending...
                    </span>
                  )}
                  {item.status === 'done' && (
                    <Check size={16} className="text-sage-deep" />
                  )}
                  {item.status === 'error' && (
                    <button
                      onClick={() => handleRetry(item.id)}
                      className="text-xs text-rose-deep hover:underline"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="p-1 text-ink-ghost hover:text-ink"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="px-4 py-3 border-t border-line text-center">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-ink-soft hover:text-ink min-h-[44px]"
        >
          &larr; Back to Dashboard
        </button>
      </footer>
    </main>
  );
}
