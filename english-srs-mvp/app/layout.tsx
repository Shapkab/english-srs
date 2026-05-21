import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Geist, Geist_Mono } from 'next/font/google';
import React from 'react';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import { OfflineSyncManager } from '@/components/OfflineSyncManager';

const serif = Instrument_Serif({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
});

const sans = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Plait',
  description: 'Personal English coaching from your own writing.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'English SRS',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-bg text-ink font-sans antialiased">
        {children}
        <ServiceWorkerRegistration />
        <OfflineSyncManager />
      </body>
    </html>
  );
}
