'use client';

export default function OfflinePage() {
  return (
    <main className="grid place-items-center min-h-screen bg-bg px-10">
      <div className="text-center max-w-[440px]">
        <h2 className="font-serif text-[48px] leading-none mb-3">Offline</h2>
        <p className="text-[13px] text-ink-soft mb-6">
          You&apos;re offline. Your submissions will sync when you reconnect.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-ink text-bg rounded-lg min-h-[44px]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
