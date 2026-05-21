import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen grid place-items-center bg-bg px-6 py-12">
      <div className="w-full max-w-[400px] rounded-lg border border-line bg-bg-card p-8 shadow-card">
        <div className="flex items-center gap-2 mb-5">
          <span className="relative inline-flex h-6 w-6 items-center justify-center">
            <span className="absolute inset-0 rounded-full border border-sage-deep/70" />
            <span className="h-2 w-2 rounded-full bg-peach-deep" />
          </span>
          <span className="font-serif text-[22px] leading-none">English SRS</span>
        </div>
        {children}
      </div>
    </main>
  );
}
