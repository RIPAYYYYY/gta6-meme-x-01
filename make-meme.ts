// make-meme.ts — draws this entry's meme, meme.png, from scratch.
//
// Every pixel is computed here: a hand-rolled 5x7 bitmap typeface, plain
// shape primitives (rects, circles, polygons, thick lines) and a small
// PNG writer on top of node:zlib. No image assets, no fonts on disk, no
// randomness and no clock, so the file comes out byte for byte the same
// on every run.
//
// The joke: a gamer who sat down for GTA 6 in 2013 is a skeleton by the
// time the download bar moves — and make.fun's ghost mascot, who has
// been earning money in bounties the whole wait, floats by to say so.
// The ghost is drawn to the bounty judge's own description of the
// mascot: a white ghost with a thick black outline, two black
// four-pointed sparkle eyes and a round little hand, holding a magenta
// coin with a white star.
//
// Run it from the repository root:  node make-meme.ts

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// ------------------------------------------------------------- canvas

type RGB = [number, number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array; // RGBA, row major

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 4);
  }

  set(x: number, y: number, [r, g, b]: RGB, alpha = 1): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 4;
    if (alpha >= 1) {
      this.px[i] = r;
      this.px[i + 1] = g;
      this.px[i + 2] = b;
    } else if (alpha > 0) {
      // Every blend in this picture happens over an opaque pixel.
      this.px[i] = lerp(this.px[i], r, alpha);
      this.px[i + 1] = lerp(this.px[i + 1], g, alpha);
      this.px[i + 2] = lerp(this.px[i + 2], b, alpha);
    }
    this.px[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, color: RGB, alpha = 1): void {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) {
      for (let xx = Math.round(x); xx < Math.round(x + w); xx++) {
        this.set(xx, yy, color, alpha);
      }
    }
  }

  // Vertical gradient through colour stops: [[0..1, RGB], ...]
  vgrad(x: number, y: number, w: number, h: number, stops: [number, RGB][]): void {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) {
          a = stops[s];
          b = stops[s + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const f = Math.min(1, Math.max(0, (t - a[0]) / span));
      const color: RGB = [
        lerp(a[1][0], b[1][0], f),
        lerp(a[1][1], b[1][1], f),
        lerp(a[1][2], b[1][2], f),
      ];
      for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, color);
    }
  }

  circle(cx: number, cy: number, r: number, color: RGB, alpha = 1): void {
    for (let yy = Math.floor(cy - r); yy <= cy + r; yy++) {
      for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r * r) this.set(xx, yy, color, alpha);
      }
    }
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: RGB, alpha = 1): void {
    for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy++) {
      for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx++) {
        const dx = (xx - cx) / rx;
        const dy = (yy - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(xx, yy, color, alpha);
      }
    }
  }

  // A ring drawn as a stamped circle travelling an ellipse's rim.
  ellipseRim(cx: number, cy: number, rx: number, ry: number, thick: number, color: RGB): void {
    const steps = Math.max(24, Math.floor(Math.max(rx, ry) * 4));
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      this.circle(cx + rx * Math.cos(a), cy + ry * Math.sin(a), thick / 2, color);
    }
  }

  arc(cx: number, cy: number, r: number, from: number, to: number, thick: number, color: RGB): void {
    const steps = Math.max(12, Math.floor(r * 2));
    for (let s = 0; s <= steps; s++) {
      const a = from + ((to - from) * s) / steps;
      this.circle(cx + r * Math.cos(a), cy + r * Math.sin(a), thick / 2, color);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, thick: number, color: RGB, alpha = 1): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.circle(lerp(x0, x1, t), lerp(y0, y1, t), thick / 2, color, alpha);
    }
  }

  // Scanline even-odd polygon fill.
  poly(points: [number, number][], color: RGB, alpha = 1): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of points) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    for (let yy = Math.floor(minY); yy <= Math.ceil(maxY); yy++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((yy >= y0 && yy < y1) || (yy >= y1 && yy < y0)) {
          xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let xx = Math.ceil(xs[i]); xx <= Math.floor(xs[i + 1]); xx++) {
          this.set(xx, yy, color, alpha);
        }
      }
    }
  }

  star(cx: number, cy: number, outer: number, inner: number, points: number, rot: number, color: RGB): void {
    const pts: [number, number][] = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = rot + (i / (points * 2)) * Math.PI * 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    this.poly(pts, color);
  }

  // Four-pointed sparkle, the mascot's eye shape.
  sparkle(cx: number, cy: number, tall: number, wide: number, color: RGB): void {
    const inner = Math.min(tall, wide) * 0.22;
    const pts: [number, number][] = [
      [cx, cy - tall],
      [cx + inner, cy - inner],
      [cx + wide, cy],
      [cx + inner, cy + inner],
      [cx, cy + tall],
      [cx - inner, cy + inner],
      [cx - wide, cy],
      [cx - inner, cy - inner],
    ];
    this.poly(pts, color);
  }

  toPNG(): Buffer {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let yy = 0; yy < this.h; yy++) {
      const rowStart = yy * (this.w * 4 + 1);
      raw[rowStart] = 0; // filter: none
      Buffer.from(this.px.buffer, yy * this.w * 4, this.w * 4).copy(raw, rowStart + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // colour type RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// -------------------------------------------------------------- font
// A 5x7 bitmap typeface, one string per row, '1' is ink. Advance is 6
// cells a character (5 ink + 1 space), so a string of n characters at
// scale s is n*6*s - s pixels wide and 7*s tall.

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '01010', '00100', '00100', '00100', '01010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  c: ['00000', '00000', '01110', '10000', '10000', '10001', '01110'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01001', '01000', '11110', '01000', '01000', '01000'],
  k: ['10000', '10000', '10100', '11000', '10100', '10010', '10001'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
};

function textWidth(text: string, scale: number): number {
  return text.length === 0 ? 0 : text.length * 6 * scale - scale;
}

function drawText(
  cv: Canvas,
  text: string,
  x: number,
  y: number,
  scale: number,
  color: RGB,
): void {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT['?'];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '1') {
          cv.rect(cx + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(
  cv: Canvas,
  text: string,
  centerX: number,
  y: number,
  scale: number,
  color: RGB,
): void {
  drawText(cv, text, centerX - textWidth(text, scale) / 2, y, scale, color);
}

// Draws one line made of coloured segments, centred as a whole.
function drawSegmentsCentered(
  cv: Canvas,
  segments: [string, RGB][],
  centerX: number,
  y: number,
  scale: number,
): void {
  const total = segments.reduce((sum, [t]) => sum + t.length, 0);
  let cx = centerX - (total * 6 * scale - scale) / 2;
  for (const [text, color] of segments) {
    drawText(cv, text, cx, y, scale, color);
    cx += text.length * 6 * scale;
  }
}

// -------------------------------------------------------------- scene

const INK: RGB = [10, 10, 14];
const PAPER: RGB = [246, 244, 238];
const BONE: RGB = [233, 228, 209];
const BONE_SHADE: RGB = [176, 168, 146];
const MAGENTA: RGB = [255, 46, 166];
const MAGENTA_DEEP: RGB = [196, 0, 108];
const PINK: RGB = [255, 120, 180];
const CYAN: RGB = [110, 231, 255];
const SUN_YELLOW: RGB = [255, 217, 61];
const DARK: RGB = [16, 13, 26];

const SCENE_TOP = 168;
const SCENE_BOTTOM = 1064;

function cobweb(cv: Canvas, cx: number, cy: number, r: number, sx: number): void {
  const color: RGB = [112, 110, 142];
  for (const a of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2]) {
    cv.line(cx, cy, cx + sx * r * Math.cos(a), cy + r * Math.sin(a), 2, color);
  }
  for (const f of [0.38, 0.66, 0.94]) {
    const rr = r * f;
    const steps = 10;
    for (let s = 0; s < steps; s++) {
      const a0 = (s / steps) * (Math.PI / 2);
      const a1 = ((s + 1) / steps) * (Math.PI / 2);
      const sag = 1 - 0.1 * Math.sin(((a0 + a1) / 2) * 2);
      cv.line(
        cx + sx * rr * sag * Math.cos(a0),
        cy + rr * sag * Math.sin(a0),
        cx + sx * rr * sag * Math.cos(a1),
        cy + rr * sag * Math.sin(a1),
        2,
        color,
      );
    }
  }
}

function drawWindow(cv: Canvas): void {
  cv.rect(48, 208, 344, 340, [12, 10, 24]);
  cv.vgrad(64, 224, 312, 308, [
    [0, [255, 138, 61]],
    [0.55, [255, 78, 138]],
    [1, [123, 47, 247]],
  ]);
  // Sunset sun and its glow.
  cv.circle(150, 318, 60, SUN_YELLOW, 0.22);
  cv.circle(150, 318, 44, SUN_YELLOW);
  // Skyline silhouettes along the bottom of the glass.
  const city: RGB = [30, 12, 44];
  cv.rect(64, 452, 52, 80, city);
  cv.rect(124, 428, 40, 104, city);
  cv.rect(172, 462, 58, 70, city);
  cv.rect(238, 438, 44, 94, city);
  cv.rect(290, 458, 50, 74, city);
  cv.rect(340, 446, 36, 86, city);
  const lit: RGB = [255, 220, 130];
  for (const [lx, ly] of [
    [80, 470], [140, 450], [200, 480], [255, 460],
    [305, 478], [350, 466], [95, 500], [265, 495],
  ]) {
    cv.rect(lx, ly, 6, 8, lit, 0.9);
  }
  // The bay in front of the skyline.
  cv.rect(64, 498, 312, 34, MAGENTA_DEEP, 0.45);
  cv.line(90, 510, 120, 510, 3, PAPER, 0.7);
  cv.line(180, 518, 215, 518, 3, PAPER, 0.7);
  cv.line(280, 508, 305, 508, 3, PAPER, 0.7);
  // Palms, pure silhouette.
  const palm: RGB = [20, 9, 30];
  cv.line(296, 532, 306, 448, 7, palm);
  cv.line(306, 448, 322, 392, 7, palm);
  for (const [fx, fy] of [[268, 362], [292, 344], [330, 338], [366, 352], [382, 382]]) {
    cv.line(322, 392, fx, fy, 6, palm);
  }
  cv.line(110, 532, 100, 470, 6, palm);
  cv.line(100, 470, 92, 428, 6, palm);
  for (const [fx, fy] of [[48, 404], [70, 388], [104, 384], [128, 398]]) {
    cv.line(92, 428, fx, fy, 5, palm);
  }
  // Window cross bars over the view.
  cv.rect(214, 224, 10, 308, [12, 10, 24]);
  cv.rect(64, 368, 312, 10, [12, 10, 24]);
}

function drawChair(cv: Canvas): void {
  cv.rect(92, 466, 212, 420, DARK);
  cv.rect(112, 486, 172, 380, [25, 19, 42]);
  cv.line(94, 470, 94, 848, 4, MAGENTA, 0.8);
  cv.line(302, 470, 302, 848, 4, MAGENTA, 0.8);
  cv.rect(128, 436, 140, 52, DARK);
  cv.line(130, 440, 266, 440, 4, MAGENTA, 0.8);
  cv.rect(92, 852, 240, 34, DARK);
}

function drawDesk(cv: Canvas): void {
  cv.rect(330, 856, 870, 30, [66, 44, 74]);
  cv.rect(330, 856, 870, 5, [110, 78, 124]);
  cv.rect(330, 886, 870, 86, [44, 30, 54]);
}

function drawMonitor(cv: Canvas): void {
  // Stand first, so the bezel overlaps its top.
  cv.poly(
    [[620, 772], [716, 772], [736, 856], [600, 856]],
    [10, 10, 16],
  );
  cv.rect(560, 846, 216, 14, [10, 10, 16]);
  cv.rect(408, 452, 520, 320, [10, 10, 16]);
  cv.vgrad(428, 472, 480, 260, [
    [0, [10, 26, 54]],
    [1, [8, 16, 38]],
  ]);
  drawTextCentered(cv, 'GTA VI', 668, 496, 10, CYAN);
  // Download bar: 99% full, as it has been for years.
  cv.rect(478, 606, 380, 36, [13, 28, 52]);
  cv.rect(482, 610, 365, 28, MAGENTA);
  cv.line(478, 606, 858, 606, 3, CYAN);
  cv.line(478, 642, 858, 642, 3, CYAN);
  cv.line(478, 606, 478, 642, 3, CYAN);
  cv.line(858, 606, 858, 642, 3, CYAN);
  drawTextCentered(cv, 'DOWNLOADING... 99%', 668, 658, 4, PAPER);
  drawTextCentered(cv, '13 YEARS REMAINING', 668, 694, 4, SUN_YELLOW);
  drawTextCentered(cv, 'make.fun', 668, 742, 2, [160, 160, 170]);
}

function drawSkeleton(cv: Canvas): void {
  const socket: RGB = [12, 10, 16];
  // Headphone cups sit behind the skull; the band goes over it later.
  cv.rect(168, 518, 36, 76, DARK);
  cv.rect(306, 518, 36, 76, DARK);
  cv.circle(186, 556, 7, MAGENTA);
  // Skull: cranium plus a jaw block.
  cv.circle(255, 545, 66, BONE);
  cv.circle(255, 606, 40, BONE);
  cv.rect(216, 578, 78, 58, BONE);
  cv.ellipse(233, 550, 13, 17, socket);
  cv.ellipse(277, 550, 13, 17, socket);
  cv.poly([[255, 578], [245, 600], [265, 600]], socket);
  cv.line(222, 614, 288, 614, 3, BONE_SHADE);
  for (let tx = 228; tx <= 282; tx += 11) {
    cv.line(tx, 616, tx, 636, 3, BONE_SHADE);
  }
  cv.arc(255, 538, 78, Math.PI, Math.PI * 2, 11, DARK);
  // Spine and ribs.
  for (let i = 0; i < 6; i++) {
    cv.rect(238, 648 + i * 26, 34, 18, BONE);
    cv.line(238, 657 + i * 26, 272, 657 + i * 26, 3, BONE_SHADE);
  }
  for (let i = 0; i < 3; i++) {
    cv.ellipseRim(255, 692 + i * 34, 74 - i * 6, 20, 7, BONE);
  }
  cv.ellipse(255, 838, 50, 20, BONE);
  // Right arm out to the mouse: a bent elbow, kept short.
  cv.ellipse(486, 844, 26, 11, DARK);
  cv.line(312, 672, 388, 750, 15, BONE);
  cv.line(388, 750, 472, 824, 13, BONE);
  for (const [fx, fy] of [[492, 834], [500, 840], [504, 846]]) {
    cv.line(472, 824, fx, fy, 5, BONE);
  }
  // Left arm still holding a controller after all these years.
  cv.line(188, 668, 150, 770, 15, BONE);
  cv.line(150, 770, 268, 842, 13, BONE);
  cv.rect(268, 826, 80, 36, DARK);
  cv.circle(288, 844, 5, MAGENTA);
  cv.circle(330, 844, 5, CYAN);
  for (const [fx, fy] of [[300, 852], [316, 856], [332, 852]]) {
    cv.line(268, 842, fx, fy, 5, BONE);
  }
  // One shin and a sneaker under the chair.
  cv.line(210, 880, 205, 958, 13, BONE);
  cv.ellipse(212, 968, 42, 16, MAGENTA_DEEP);
  cv.rect(170, 978, 84, 10, PAPER);
}

// The make.fun ghost: dome body, wavy hem, sparkle eyes, one round
// hand, and the magenta star coin it holds.
function ghostPoints(cx: number, domeCy: number, r: number): [number, number][] {
  const pts: [number, number][] = [];
  const hem = domeCy + 170;
  pts.push([cx - r, hem]);
  pts.push([cx - r, domeCy]);
  for (let i = 1; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI;
    pts.push([cx + r * Math.cos(a), domeCy - r * Math.sin(a)]);
  }
  pts.push([cx + r, hem]);
  const bw = (2 * r) / 3;
  const wr = bw / 2;
  for (let bump = 0; bump < 3; bump++) {
    const ccx = cx + r - wr - bump * bw;
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pts.push([ccx + wr * Math.cos(a), hem + wr * Math.sin(a)]);
    }
  }
  return pts;
}

function drawGhost(cv: Canvas): void {
  const cx = 1015;
  const domeCy = 470;
  const r = 118;
  cv.ellipse(cx, 712, 112, 16, INK, 0.25);
  const pts = ghostPoints(cx, domeCy, r);
  // Thick black outline: the silhouette stamped around the body.
  for (const d of [5, 10]) {
    for (const [ox, oy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [d, -d], [-d, d], [-d, -d]]) {
      cv.poly(pts.map(([x, y]) => [x + ox, y + oy] as [number, number]), INK);
    }
  }
  cv.poly(pts, PAPER);
  cv.sparkle(968, 498, 27, 19, INK);
  cv.sparkle(1062, 498, 27, 19, INK);
  cv.arc(cx, 540, 22, Math.PI * 0.15, Math.PI * 0.85, 5, INK);
  // The coin, then the little round hand holding its edge.
  cv.circle(952, 650, 55, MAGENTA);
  cv.ellipseRim(952, 650, 55, 55, 7, MAGENTA_DEEP);
  cv.star(952, 650, 30, 12.5, 5, -Math.PI / 2, PAPER);
  cv.circle(900, 620, 22, INK);
  cv.circle(900, 620, 15, PAPER);
}

function drawBubble(cv: Canvas): void {
  cv.rect(588, 188, 506, 172, INK);
  cv.poly([[928, 356], [988, 356], [970, 408]], INK);
  cv.rect(596, 196, 490, 156, PAPER);
  cv.poly([[937, 354], [979, 354], [968, 394]], PAPER);
  drawTextCentered(cv, 'I GOT PAID ON', 841, 214, 5, INK);
  drawTextCentered(cv, 'MAKE.FUN', 841, 258, 7, MAGENTA_DEEP);
  drawTextCentered(cv, 'WHILE YOU WAITED', 841, 314, 5, INK);
}

function drawMeme(): Canvas {
  const cv = new Canvas(1200, 1200);
  // Room wall and floor.
  cv.vgrad(0, 0, 1200, 1200, [
    [0, [43, 32, 84]],
    [1, [22, 16, 48]],
  ]);
  cv.rect(0, 984, 1200, SCENE_BOTTOM - 984, [14, 10, 30]);
  cv.rect(0, 980, 1200, 6, [60, 50, 90]);

  drawWindow(cv);
  cobweb(cv, 2, SCENE_TOP + 2, 95, 1);
  cobweb(cv, 1198, SCENE_TOP + 2, 80, -1);
  drawChair(cv);
  drawDesk(cv);
  drawMonitor(cv);
  drawSkeleton(cv);
  drawGhost(cv);
  drawBubble(cv);

  // Accent rules between the scene and the caption bars.
  cv.rect(0, SCENE_TOP - 4, 1200, 4, MAGENTA);
  cv.rect(0, SCENE_BOTTOM, 1200, 4, MAGENTA);

  // Caption bars.
  cv.rect(0, 0, 1200, SCENE_TOP, [8, 8, 12]);
  drawSegmentsCentered(
    cv,
    [
      ['WAITING FOR ', PAPER],
      ['GTA 6', SUN_YELLOW],
    ],
    600,
    14,
    8,
  );
  drawTextCentered(cv, 'SINCE 2013', 600, 96, 6, PINK);
  cv.rect(0, SCENE_BOTTOM + 4, 1200, 1200 - SCENE_BOTTOM - 4, [8, 8, 12]);
  drawSegmentsCentered(
    cv,
    [
      ['STILL A ', PAPER],
      ['DAY-ONE', SUN_YELLOW],
      [' PLAYER', PAPER],
    ],
    600,
    1107,
    7,
  );
  return cv;
}

const png = drawMeme().toPNG();
const outUrl = new URL('./meme.png', import.meta.url);
writeFileSync(outUrl, png);
console.log(`meme.png written: ${png.length} bytes (1200x1200)`);
