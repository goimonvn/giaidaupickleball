/* =====================================================================
   Minimal QR Code generator (ISO/IEC 18004) — no dependency.
   Byte mode (UTF-8), error correction level M, versions 1–10
   (enough for a URL up to ~210 bytes). Picks the mask with the lowest
   penalty score. Returns a boolean matrix: true = dark module.
   ===================================================================== */

// Level M: [ecCodewordsPerBlock, [blocks, dataCodewordsPerBlock][]] for versions 1..10
const EC_M: [number, [number, number][]][] = [
  [10, [[1, 16]]],
  [16, [[1, 28]]],
  [26, [[1, 44]]],
  [18, [[2, 32]]],
  [24, [[2, 43]]],
  [16, [[4, 27]]],
  [18, [[4, 31]]],
  [22, [[2, 38], [2, 39]]],
  [22, [[3, 36], [2, 37]]],
  [26, [[4, 43], [1, 44]]],
];
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/* ---------- GF(256) arithmetic for Reed–Solomon ---------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gfMul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    poly.forEach((c, j) => {
      next[j] ^= c;
      next[j + 1] ^= gfMul(c, EXP[i]);
    });
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const res = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ res.shift()!;
    res.push(0);
    for (let i = 0; i < degree; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}

/* ---------- BCH codes for format / version info ---------- */
function bch(value: number, poly: number, bits: number) {
  let v = value << bits;
  const polyLen = Math.floor(Math.log2(poly)) + 1;
  while (Math.floor(Math.log2(v || 1)) + 1 >= polyLen) v ^= poly << (Math.floor(Math.log2(v)) + 1 - polyLen);
  return (value << bits) | v;
}

/* ---------- encoder ---------- */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));

  // Smallest version that fits
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const dataCap = EC_M[v - 1][1].reduce((s, [n, d]) => s + n * d, 0);
    const bits = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (bits <= dataCap * 8) { version = v; break; }
  }
  if (!version) throw new Error('QR: nội dung quá dài');

  const [ecLen, groups] = EC_M[version - 1];
  const dataCap = groups.reduce((s, [n, d]) => s + n * d, 0);

  // Bit stream: mode 0100, count, data, terminator, pad
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataCap; pad ^= 0xec ^ 0x11) data.push(pad);

  // Split into blocks, add EC, interleave
  const blocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let k = 0;
  for (const [n, d] of groups) {
    for (let i = 0; i < n; i++) {
      const blk = data.slice(k, k + d);
      k += d;
      blocks.push(blk);
      ecBlocks.push(rsRemainder(blk, ecLen));
    }
  }
  const codewords: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) blocks.forEach((b) => { if (i < b.length) codewords.push(b[i]); });
  for (let i = 0; i < ecLen; i++) ecBlocks.forEach((b) => codewords.push(b[i]));

  // Function patterns
  const size = version * 4 + 17;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };

  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version - 1];
  for (const ay of al) {
    for (const ax of al) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  // Reserve format areas (filled per mask below) + the dark module
  const drawFormat = (mask: number) => {
    const f = bch((0b00 << 3) | mask, 0x537, 10) ^ 0x5412; // level M = 00
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    const v = bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Data placement (zig-zag)
  const allBits: number[] = [];
  codewords.forEach((c) => { for (let i = 7; i >= 0; i--) allBits.push((c >>> i) & 1); });
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x]) {
          mod[y][x] = bi < allBits.length ? allBits[bi] === 1 : false;
          bi++;
        }
      }
    }
  }

  const MASKS: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
  };

  const penalty = () => {
    let p = 0;
    // Rule 1: runs of 5+ same colour in rows / columns
    for (let y = 0; y < size; y++) {
      for (const line of [mod[y], mod.map((r) => r[y])]) {
        let run = 1;
        for (let i = 1; i <= size; i++) {
          if (i < size && line[i] === line[i - 1]) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
    }
    // Rule 2: 2x2 blocks
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    // Rule 3: finder-like 1:1:3:1:1 patterns
    const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    for (let y = 0; y < size; y++) for (let x = 0; x <= size - 11; x++) {
      let r1 = true; let r2 = true; let c1 = true; let c2 = true;
      for (let i = 0; i < 11; i++) {
        if (mod[y][x + i] !== pat1[i]) r1 = false;
        if (mod[y][x + i] !== pat2[i]) r2 = false;
        if (mod[x + i][y] !== pat1[i]) c1 = false;
        if (mod[x + i][y] !== pat2[i]) c2 = false;
      }
      p += 40 * [r1, r2, c1, c2].filter(Boolean).length;
    }
    // Rule 4: dark/light balance
    const dark = mod.reduce((s, r) => s + r.filter(Boolean).length, 0);
    p += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10;
    return p;
  };

  let best = 0;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const s = penalty();
    if (s < bestScore) { bestScore = s; best = m; }
    applyMask(m); // undo (XOR)
  }
  applyMask(best);
  drawFormat(best);
  return mod;
}

/** SVG path ("M x y h1 v1 h-1 z" per dark module) with a quiet zone of `margin` modules. */
export function qrSvgPath(matrix: boolean[][], margin = 4): { path: string; size: number } {
  let d = '';
  matrix.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + margin} ${y + margin}h1v1h-1z`; }));
  return { path: d, size: matrix.length + margin * 2 };
}
