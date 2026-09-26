import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import './globals.css';

const body = Barlow({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' });
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
  themeColor: '#0B0F17',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${body.variable} ${display.variable}`}>
      <body className="pm-root min-h-screen bg-[#0B0F17] text-slate-200 antialiased">{children}</body>
    </html>
  );
}
