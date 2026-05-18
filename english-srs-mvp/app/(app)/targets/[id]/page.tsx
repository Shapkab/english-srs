import Link from 'next/link';
import type { Route } from 'next';
import { Button } from '@/components/ui/Button';
import { Topbar } from '@/components/Topbar';

export default async function TargetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="px-10 py-9 max-w-[1280px]">
      <Topbar
        caption="Learning target"
        title="Coming soon"
        subtitle={`Target ${id} — a detail view is on the way.`}
        actions={
          <Link href={'/targets' as Route}>
            <Button variant="ghost">← All targets</Button>
          </Link>
        }
      />
    </main>
  );
}
