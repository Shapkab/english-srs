import type { Metadata } from 'next';
import { QuickCapture } from '@/components/QuickCapture';

export const metadata: Metadata = {
  title: 'Quick Capture | English SRS',
};

export default function QuickCapturePage() {
  return <QuickCapture />;
}
