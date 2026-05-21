import type { ReactNode } from 'react';
import { AuthGate } from '@/components/AuthGate';

export default function SubmitLayout({ children }: { children: ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
