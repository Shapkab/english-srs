import type { Metadata } from 'next';
import { Suspense } from 'react';
import { QuickComposer } from '@/components/QuickComposer';

export const metadata: Metadata = {
  title: 'Submit | English SRS',
};

export default function SubmitPage() {
  // QuickComposer reads useSearchParams (shared-text param) — Next.js 15
  // requires a Suspense boundary around any such client component.
  return (
    <Suspense fallback={<main className="min-h-screen bg-bg" />}>
      <QuickComposer />
    </Suspense>
  );
}
