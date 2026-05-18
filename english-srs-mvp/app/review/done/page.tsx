import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/Button';

const DASHBOARD_ROUTE = '/dashboard' as Route;

interface Search {
  reviewed?: string;
  ms?: string;
  suspended?: string;
}

export default async function ReviewDonePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { reviewed = '0', ms = '0', suspended = '0' } = await searchParams;
  const totalReviewed = Number.parseInt(reviewed, 10) || 0;
  const totalMs = Number.parseInt(ms, 10) || 0;
  const totalSuspended = Number.parseInt(suspended, 10) || 0;
  const minutes = Math.max(0, Math.round(totalMs / 60000));

  return (
    <main className="grid place-items-center min-h-screen bg-bg px-10">
      <div className="text-center max-w-[560px]">
        <h1 className="font-serif text-[96px] leading-[0.85] tracking-tight mb-6">Done.</h1>
        <p className="font-serif text-[20px] text-ink-soft mb-2">
          {totalReviewed === 0
            ? "You didn't review any cards this session."
            : `You reviewed ${totalReviewed} ${totalReviewed === 1 ? 'card' : 'cards'} in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`}
        </p>
        {totalSuspended > 0 && (
          <p className="font-mono text-[12px] text-ink-faint mb-6">
            {totalSuspended} card{totalSuspended === 1 ? '' : 's'} suspended.
          </p>
        )}
        <div className="mt-8">
          <Link href={DASHBOARD_ROUTE}>
            <Button variant="primary" size="lg">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
