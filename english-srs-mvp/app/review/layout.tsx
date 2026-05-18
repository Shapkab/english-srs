import type { ReactNode } from 'react';
import { AuthGate } from '@/components/AuthGate';

export default function ReviewLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
