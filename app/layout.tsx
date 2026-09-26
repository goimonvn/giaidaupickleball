import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Barlow_Condensed, Be_Vietnam_Pro } from 'next/font/google';
import './globals.css';

// Body font of the approved demo (full Vietnamese diacritics); Barlow Condensed stays for scoreboard digits
const body = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
const display = Barlow_Condensed({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PickleMasters Live',
  description: 'Tổ chức giải Pickleball phong trào: bảng xếp hạng realtime, nhập điểm, màn hình TV.',
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable}`}>
      <body className="pm-root min-h-screen bg-slate-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
