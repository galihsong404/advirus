'use client';

import React, { useEffect } from 'react';
import Script from 'next/script';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Initialize Telegram WebApp
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webApp = (window as any).Telegram.WebApp;
      webApp.ready();
      webApp.expand();
      webApp.enableClosingConfirmation();

      // Set theme colors
      webApp.setHeaderColor('#000000');
      webApp.setBackgroundColor('#000000');
    }
  }, []);

  return (
    <html lang="en">
      <head>
        {/* P1-05 FIX: Use next/script instead of next/head (unsupported in App Router) */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="antialiased selection:bg-purple-500/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
