'use client';

import { Copy, Download, Printer } from 'lucide-react';
import { useMemo } from 'react';
import { qrMatrix, qrSvgPath } from '@/lib/qr';
import type { TournamentRow } from '@/lib/types';
import { BTN_GHOST, BTN_PRIMARY, Sheet, T1, T3, T4, type Toast } from './kit';

/* =====================================================================
   Mã QR của giải — dán ở sân, khán giả quét là vào đúng giải.
   Generated locally (lib/qr.ts), no external service.
   ===================================================================== */

/** Public link of a tournament (the viewer opens straight on it). */
export function tournamentUrl(tournamentId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/$/, '')}/?t=${tournamentId}`;
}

/** Crisp SVG QR code (dark modules on white, 4-module quiet zone). */
export function QRCode({ value, className = '', title }: { value: string; className?: string; title?: string }) {
  const { path, size } = useMemo(() => qrSvgPath(qrMatrix(value)), [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={className} role="img" aria-label={title ?? 'Mã QR'} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#020617" />
    </svg>
  );
}

/** Render a printable/downloadable PNG: QR + tournament title underneath. */
function qrPng(value: string, title: string) {
  const matrix = qrMatrix(value);
  const margin = 4;
  const n = matrix.length + margin * 2;
  const scale = Math.floor(900 / n);
  const qrPx = n * scale;
  const canvas = document.createElement('canvas');
  canvas.width = qrPx;
  canvas.height = qrPx + 150;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#020617';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale); }));
  ctx.textAlign = 'center';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText(title.length > 34 ? `${title.slice(0, 33)}…` : title, qrPx / 2, qrPx + 55);
  ctx.font = '30px system-ui, sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Quét để xem tỉ số trực tiếp', qrPx / 2, qrPx + 110);
  return canvas.toDataURL('image/png');
}

export function QRShareSheet({ tournament, onClose, toast }: { tournament: TournamentRow; onClose: () => void; toast: Toast }) {
  const url = tournamentUrl(tournament.id);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép link giải'); } catch { toast('Không sao chép được', 'error'); }
  };
  const download = () => {
    const a = document.createElement('a');
    a.href = qrPng(url, tournament.title);
    a.download = `QR-${tournament.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.png`;
    a.click();
  };
  const print = () => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) { toast('Trình duyệt chặn cửa sổ in. Hãy dùng "Tải ảnh QR".', 'error'); return; }
    const img = qrPng(url, tournament.title);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${tournament.title.replace(/</g, '&lt;')}</title>
      <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui}img{width:90vw;max-width:640px}</style></head>
      <body><img src="${img}" onload="setTimeout(function(){window.print()},200)"></body></html>`);
    w.document.close();
  };

  return (
    <Sheet title="Mã QR của giải" onClose={onClose}>
      <div className="flex flex-col items-center gap-3">
        <QRCode value={url} title={`Mã QR ${tournament.title}`} className="w-full max-w-[280px] rounded-xl" />
        <div className="text-center">
          <p className={`${T1} text-white`}>{tournament.title}</p>
          <p className={`${T4} text-slate-500`}>Quét bằng camera điện thoại để xem tỉ số trực tiếp, không cần đăng nhập</p>
        </div>
        <p className={`${T3} w-full truncate rounded-lg bg-slate-950 px-3 py-2 text-center text-slate-400`}>{url}</p>
        <div className="grid w-full grid-cols-3 gap-2">
          <button type="button" className={BTN_GHOST} onClick={() => void copy()}><Copy className="h-4 w-4" /> Link</button>
          <button type="button" className={BTN_GHOST} onClick={download}><Download className="h-4 w-4" /> Tải ảnh</button>
          <button type="button" className={BTN_PRIMARY} onClick={print}><Printer className="h-4 w-4" /> In</button>
        </div>
      </div>
    </Sheet>
  );
}
