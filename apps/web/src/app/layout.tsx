import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { env } from '@/lib/env';

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: { default: 'SoloTrav — Explore More. Share Your Journey.', template: '%s · SoloTrav' },
  description: 'Plan trips, track journeys, complete destinations and share your travel stories with a community of travelers.',
  openGraph: { siteName: 'SoloTrav', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#1769FF', width: 'device-width', initialScale: 1 };

const themeScript = `try{var t=localStorage.getItem('st_theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
