'use client';
import React, { useEffect, useRef } from 'react';

/**
 * A full-screen orchid garden rendered as text.
 * The scene is painted each frame onto two tiny offscreen canvases (one pixel = one character cell):
 *   - sky / hills / ground  → drawn back as halftone dots
 *   - orchids, leaves, the bookstand, petals → drawn back as ASCII characters
 * The banner's position (measured from the DOM) decides where the bookstand's top sits.
 */

type Rect = { x: number; y: number; w: number; h: number };
type Petal = { x: number; y: number; vx: number; vy: number; life: number; c: string };
type Plant = { x: number; base: number; h: number; lean: number; phase: number; speed: number; flowers: number; depth: number; hue: number };

const LOGO = [
  'M105.56 152.177C118.591 152.004 135.653 153.04 148.969 153.461L149.274 183.809L174.165 184.48L174.495 210.84L201.013 211.511C201.134 237.947 200.936 264.384 200.427 290.821L174.583 290.993L174.239 322.009L150.112 322.334C150.026 332.995 150.234 343.866 149.874 354.505L148.969 354.523C140.637 356.009 117.039 355.402 107.659 355.36C93.5133 355.297 80.6324 355.651 66.4945 354.83C66.4466 343.919 66.6118 333.217 66.8195 322.334L33.4458 322.009C33.3946 311.709 33.3627 302.08 33.1101 291.798C22.6747 290.968 11.2052 291.257 0.653862 291.016C0.0163758 264.329 -0.205263 237.633 0.18922 210.94L33.1101 210.84L33.4458 183.809L59.5245 183.302C59.5645 173.399 59.5246 163.36 59.6587 153.461L105.56 152.177Z',
  'M384.011 152.158C399.718 151.334 417.504 152.484 433.356 153.097L433.383 181.93L465.293 182.084L465.795 214.521L498.163 214.866C499.227 252.383 499.426 280.948 497.877 318.235L463.877 318.753L463.388 353.989C449.46 354.276 435.432 355.311 421.519 356.193C398.974 356.519 377.845 355.407 355.346 354.18L355.176 322.146L327.425 321.743L326.582 291.3L299.306 291.185C298.396 264.346 298.279 237.487 298.956 210.648L326.093 210.322L326.519 183.732L350.804 182.697L351.252 153.251L384.011 152.158Z',
  'M221.888 0.899673C232.729 0.382061 280.504 -1.78423 287.071 3.31522L287.759 13.9549C291.975 19.6678 291.347 18.1151 299.716 20.3006C303.032 26.857 302.237 36.4231 302.354 44.1681L336.383 44.7626C338.056 83.1234 338.436 111.036 336.038 149.723L302.455 150.029L300.853 185.687L280.527 187.585C280.529 195.867 281.719 213.926 277.489 219.581C258.003 220.712 237.888 220.118 218.325 219.831C218.327 211.549 220.244 188.525 210.207 187.01C192.627 184.384 196.911 164.58 197.308 149.55L163.386 149.493C161.965 110.269 161.91 83.6217 163.635 44.6474L197.99 44.0914C198.026 36.5956 197.591 28.3906 199.359 21.2399C219.288 15.9871 209.626 8.91296 215.669 1.49385L221.888 0.899673Z',
  'M219.928 304.624C233.584 304.892 269.497 301.825 278.902 307.672C279.215 313.116 279.059 313.634 281.346 318.427C288.951 322.721 290.77 321.187 300.723 321.341C304.102 359.855 301.329 380.425 299.477 418.767L282.427 419.687C256.424 421.067 226.58 419.994 200.271 419.629C200.327 401.456 198.119 390.202 196.503 372.297C195.125 356.979 196.821 336.716 197.868 321.206C204.957 321.36 210.552 322.031 217.247 319.807C221.362 313.538 219.985 313.04 219.928 304.624Z',
];

const PETAL_COLORS = ['#FBEFFD', '#F3D4F8', '#E8B6F0', '#DB98E6', '#CB7FD9', '#F7C6DE'];
const RAMP = ' .,:;-~=+*o#%@';

function rand(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function Garden({ bannerRef }: { bannerRef: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const bg = document.createElement('canvas');
    const fg = document.createElement('canvas');
    const bctx = bg.getContext('2d', { willReadFrequently: true })!;
    const fctx = fg.getContext('2d', { willReadFrequently: true })!;
    const cs = document.createElement('canvas');
    const cctx = cs.getContext('2d', { willReadFrequently: true })!;
    const logo = LOGO.map((d) => new Path2D(d));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, dpr = 1, cw = 8, ch = 13, cols = 0, rows = 0;
    let stand: Rect = { x: 0, y: 0, w: 0, h: 0 };
    let hero: Rect = { x: 0, y: 0, w: 0, h: 0 };
    let plants: Plant[] = [];
    let tufts: { x: number; h: number; ph: number; bloom: boolean; c: string }[] = [];
    const petals: Petal[] = [];
    const ptr = { x: -9999, y: -9999, vx: 0, active: false };
    let wind = 0;
    let raf = 0, last = 0;
    const colorCache = new Map<number, string>();

    const layout = () => {
      W = window.innerWidth; H = window.innerHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ch = Math.max(8, Math.min(12, Math.round(Math.min(W, H * 1.4) / 108)));
      cw = Math.round(ch * 0.62 * 10) / 10;
      cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
      bg.width = fg.width = cs.width = cols; bg.height = fg.height = cs.height = rows;

      const b = bannerRef.current?.getBoundingClientRect();
      if (b) hero = { x: b.left, y: b.top, w: b.width, h: b.height };
      const bw = b ? b.width : Math.min(720, W * 0.86);
      const top = b ? b.bottom + Math.max(28, Math.min(90, H * 0.07)) : H * 0.6; // breathing room between the headline and the bookcase
      const sw = W < 700 ? Math.min(W * 0.8, bw * 0.9) : Math.min(W * 0.94, bw * 1.08);
      stand = { x: W / 2 - sw / 2, y: top - 6, w: sw, h: H - top + 6 };
      buildShelves();
      const rt = rand(23);
      tufts = Array.from({ length: Math.round(W / 46) }, () => ({ x: rt() * W, h: ch * (2.5 + rt() * 3), ph: rt() * 6, bloom: rt() < 0.55, c: PETAL_COLORS[Math.floor(rt() * PETAL_COLORS.length)] }));

      // orchid plants on both sides of the stand, arching their sprays toward it
      const r = rand(7);
      plants = [];
      const leftW = stand.x, rightW = W - (stand.x + stand.w);
      const perSide = Math.max(1, Math.min(2, Math.round(Math.max(leftW, rightW) / 200)));
      const narrow = leftW < 70;
      for (const side of [-1, 1]) {
        const span = side < 0 ? leftW : rightW;
        const count = narrow ? 2 : perSide;
        for (let i = 0; i < count; i++) {
          const depth = 0.7 + r() * 0.45;
          const frac = (i + 0.5) / count;
          const x = narrow ? (side < 0 ? W * (0.04 + i * 0.16) : W * (0.96 - i * 0.16)) : side < 0 ? frac * (span - 20) : W - frac * (span - 20);
          plants.push({
            x, base: H - ch * 1.2 - r() * H * 0.02, h: Math.min(H * (narrow ? 0.2 + r() * 0.08 : (i % 2 ? 0.26 : 0.42) + r() * 0.08), (narrow ? 230 : 520)) * depth,
            lean: (narrow ? -side : (i % 2 ? side : -side)) * (0.45 + r() * 0.2), phase: r() * 6.28, speed: 0.6 + r() * 0.6,
            flowers: 3 + Math.floor(r() * 3), depth, hue: Math.floor(r() * PETAL_COLORS.length),
          });
        }
      }
      plants.sort((a, c) => a.depth - c.depth);
    };

    const sx = (x: number) => x / cw, sy = (y: number) => y / ch;

    const drawBackground = (t: number) => {
      bctx.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
      const g = bctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#120B16'); g.addColorStop(0.55, '#2A1733'); g.addColorStop(0.8, '#4A2856'); g.addColorStop(1, '#2A1733');
      bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
      // a soft moon glow behind the banner
      const mx = W * 0.8, my = H * 0.08;
      const mg = bctx.createRadialGradient(mx, my, 0, mx, my, Math.max(W, H) * 0.42);
      mg.addColorStop(0, 'rgba(240,210,246,0.95)'); mg.addColorStop(0.4, 'rgba(184,132,195,0.45)'); mg.addColorStop(1, 'rgba(184,132,195,0)');
      bctx.fillStyle = mg; bctx.fillRect(0, 0, W, H);
      // rolling hills
      const hill = (y0: number, amp: number, freq: number, col: string, off: number) => {
        bctx.beginPath(); bctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 12) bctx.lineTo(x, y0 + Math.sin(x * freq + off) * amp + Math.sin(x * freq * 2.3 + off * 1.7) * amp * 0.4);
        bctx.lineTo(W, H); bctx.closePath(); bctx.fillStyle = col; bctx.fill();
      };
      hill(H * 0.66, H * 0.04, 0.004, '#5B3266', 1 + t * 0.02);
      hill(H * 0.76, H * 0.03, 0.006, '#43244D', 3 + t * 0.03);
      hill(H * 0.88, H * 0.015, 0.01, '#2E1836', 5);
      // twinkles
      const r = rand(3);
      for (let i = 0; i < 70; i++) {
        const x = r() * W, y = r() * H * 0.5, a = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.5 + r()) + i));
        bctx.fillStyle = `rgba(246,231,250,${a})`; bctx.fillRect(x, y, cw * 0.9, ch * 0.9);
      }
    };

    const SPINES = ['#B98AC0', '#9B6BA8', '#8A5A98', '#7A4E8A', '#B9A28C', '#A58A6C', '#7FA07E', '#B58AA6', '#6E4580', '#A98FB4'];
    let shelfBooks: { x: number; w: number; h: number; c: string; lean: number }[][] = [];
    const buildShelves = () => {
      const r = rand(11);
      const { x, w, y } = stand;
      const inner = w - 2 * Math.max(cw * 2.5, w * 0.035);
      const shelfH = Math.max(ch * 7, Math.min(ch * 11, (H - y) / 4));
      const n = Math.max(1, Math.floor((H - y - ch * 4) / shelfH));
      shelfBooks = [];
      for (let k = 0; k < n; k++) {
        const row: { x: number; w: number; h: number; c: string; lean: number }[] = [];
        let bx = 0;
        while (bx < inner - cw * 2) {
          if (r() < 0.07 && bx > cw * 6) { bx += cw * (3 + r() * 4); continue; } // a gap
          const bw = cw * (1.6 + Math.floor(r() * 3) * 0.9);
          if (bx + bw > inner) break;
          row.push({ x: bx, w: bw, h: shelfH * (0.62 + r() * 0.3), c: SPINES[Math.floor(r() * SPINES.length)], lean: r() < 0.05 ? 0.18 : 0 });
          bx += bw + (r() < 0.3 ? cw * 0.4 : 0);
        }
        shelfBooks.push(row);
      }
    };

    const drawStand = () => {
      const { x, y, w } = stand;
      const c = cctx;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cols, rows); c.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
      const side = Math.max(cw * 2.5, w * 0.035);
      const top = y + ch * 2.2;
      const shelfH = Math.max(ch * 7, Math.min(ch * 11, (H - y) / 4));
      // case: top board under the banner, side panels, plinth
      c.fillStyle = '#E4C4E4'; c.fillRect(x - w * 0.015, y, w * 1.03, ch * 2.2);
      c.fillStyle = '#B98CB5'; c.fillRect(x - w * 0.015, y + ch * 1.4, w * 1.03, ch * 0.8);
      c.fillStyle = '#2A1630'; c.fillRect(x, top, w, H - top);          // dark back of the case
      c.fillStyle = '#9A6E9C'; c.fillRect(x, top, side, H - top); c.fillRect(x + w - side, top, side, H - top);
      shelfBooks.forEach((row, k) => {
        const floor = top + (k + 1) * shelfH;
        row.forEach((bk) => {
          c.save(); c.translate(x + side + bk.x + bk.w / 2, floor); c.rotate(bk.lean);
          c.fillStyle = bk.c; c.fillRect(-bk.w / 2, -bk.h, bk.w, bk.h);
          c.fillStyle = '#3A2040'; c.fillRect(-bk.w / 2, -bk.h * 0.78, bk.w, ch * 0.6); // spine band
          c.restore();
        });
        c.fillStyle = '#E4C4E4'; c.fillRect(x + side, Math.round(floor / ch) * ch, w - 2 * side, ch * 1.05);   // shelf board, snapped to a text row
      });
      // plinth with the carved logo
      const plinth = Math.max(ch * 3, H - (top + shelfBooks.length * shelfH + ch * 0.9));
      c.fillStyle = '#B98CB5'; c.fillRect(x - w * 0.015, H - plinth, w * 1.03, plinth);
      const ls = Math.min(plinth * 0.7, ch * 4) / 421;
      c.save(); c.translate(x + w / 2 - (499 * ls) / 2, H - plinth / 2 - (421 * ls) / 2); c.scale(ls, ls);
      c.fillStyle = '#FFFFFF'; logo.forEach((p) => c.fill(p)); c.restore();
    };

    const drawFlower = (qx: number, qy: number, size: number, col: string, tilt: number) => {
      const c = fctx;
      c.save(); c.translate(qx, qy); c.rotate(tilt);
      c.fillStyle = col;
      // three sepals
      for (const a of [-Math.PI / 2, Math.PI / 2 + 0.75, Math.PI / 2 - 0.75]) {
        c.beginPath(); c.ellipse(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55, size * 0.48, size * 0.2, a, 0, Math.PI * 2); c.fill();
      }
      // two broad petals
      for (const k of [-1, 1]) { c.beginPath(); c.ellipse(k * size * 0.5, -size * 0.05, size * 0.48, size * 0.42, k * 0.25, 0, Math.PI * 2); c.fill(); }
      // veins: darker centres give each petal shape at character resolution
      c.fillStyle = 'rgba(126,76,147,0.55)';
      for (const k of [-1, 1]) { c.beginPath(); c.ellipse(k * size * 0.42, -size * 0.04, size * 0.2, size * 0.14, k * 0.25, 0, Math.PI * 2); c.fill(); }
      // lip and column
      c.fillStyle = '#C8559E'; c.beginPath(); c.ellipse(0, size * 0.28, size * 0.2, size * 0.24, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#FFF2C9'; c.beginPath(); c.arc(0, 0, size * 0.1, 0, Math.PI * 2); c.fill();
      c.restore();
    };

    const drawPlant = (p: Plant, t: number) => {
      const c = fctx;
      const sway = Math.sin(t * p.speed + p.phase) * 0.05 + wind * 0.25 * p.depth;
      const dx = p.x - ptr.x, dy = (p.base - p.h * 0.6) - ptr.y;
      const near = ptr.active ? Math.max(0, 1 - Math.hypot(dx, dy * 0.6) / 260) : 0;
      const lean = p.lean + sway + near * Math.sign(dx || 1) * 0.3;
      // leaves: broad, low, glossy
      c.fillStyle = p.depth > 0.95 ? '#9CC39A' : '#80A884';
      const L = Math.max(p.h * 0.32, ch * 4);
      for (const k of [-1, 1, -0.6]) {
        c.beginPath(); c.moveTo(p.x, p.base);
        c.quadraticCurveTo(p.x + k * L * 0.6, p.base - L * 0.45, p.x + k * L * (1 + 0.04 * Math.sin(t + p.phase)), p.base - L * 0.12);
        c.quadraticCurveTo(p.x + k * L * 0.45, p.base - L * 0.02, p.x, p.base); c.fill();
      }
      // flower spike: a long stem that rises and arches over, blooms hanging along its outer half
      const ctrlX = p.x + lean * p.h * 0.1, ctrlY = p.base - p.h * 1.25;
      const tipX = p.x + lean * p.h * 1.25, tipY = p.base - p.h * 0.7;
      c.strokeStyle = '#A8C79F'; c.lineWidth = Math.max(cw * 0.8, 2);
      c.beginPath(); c.moveTo(p.x, p.base); c.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY); c.stroke();
      const size = Math.max(ch * 3.2, Math.min(p.h * 0.15, ch * 5.5)) * p.depth;
      const pt = (f: number) => [(1 - f) * (1 - f) * p.x + 2 * (1 - f) * f * ctrlX + f * f * tipX, (1 - f) * (1 - f) * p.base + 2 * (1 - f) * f * ctrlY + f * f * tipY];
      let f = 1, placed = 0, prev: number[] | null = null;
      while (f > 0.3 && placed < p.flowers) {
        const q = pt(f);
        if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) >= size * 2.15) {
          const s2 = size * (1 - placed * 0.1) * (1 + near * 0.2);
          drawFlower(q[0], q[1] + size * 0.45, s2, PETAL_COLORS[(p.hue + placed) % PETAL_COLORS.length], Math.sin(t * 1.6 + placed + p.phase) * 0.1 + lean * 0.25);
          prev = q; placed++;
        }
        f -= 0.01;
      }
      // a bud at the tip
      const tq = pt(1.04); c.fillStyle = '#DDA9E8'; c.beginPath(); c.ellipse(tq[0], tq[1], size * 0.18, size * 0.24, 0, 0, Math.PI * 2); c.fill();
    };

    const drawForeground = (t: number) => {
      fctx.setTransform(1, 0, 0, 1, 0, 0);
      fctx.clearRect(0, 0, cols, rows);
      fctx.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
      drawStand();
      plants.forEach((p) => drawPlant(p, t));
      // ground grass and low flowering tufts
      fctx.fillStyle = '#6F9A72'; fctx.fillRect(0, H - ch * 1.5, W, ch * 1.5);
      tufts.forEach((tf) => {
        const sw2 = Math.sin(t * 1.3 + tf.ph) * cw * 0.6 + wind * 30;
        fctx.strokeStyle = '#8DB48A'; fctx.lineWidth = Math.max(1.5, cw * 0.7);
        for (let k = -2; k <= 2; k++) { fctx.beginPath(); fctx.moveTo(tf.x + k * cw * 0.8, H - ch); fctx.quadraticCurveTo(tf.x + k * cw * 1.2, H - tf.h * 0.6, tf.x + k * cw * 1.6 + sw2, H - tf.h); fctx.stroke(); }
        if (tf.bloom) { fctx.fillStyle = tf.c; fctx.beginPath(); fctx.arc(tf.x + sw2, H - tf.h - ch * 0.4, ch * 0.9, 0, 6.283); fctx.fill(); }
      });
      // petals
      for (const pt of petals) { fctx.globalAlpha = Math.min(1, pt.life); fctx.fillStyle = pt.c; fctx.fillRect(pt.x - cw * 0.6, pt.y - ch * 0.5, cw * 1.2, ch); }
      fctx.globalAlpha = 1;
    };

    const colorOf = (r: number, g: number, b: number, lift: number) => {
      const q = (v: number) => Math.min(255, Math.round((v + lift) / 12) * 12);
      const key = (q(r) << 16) | (q(g) << 8) | q(b);
      let s = colorCache.get(key);
      if (!s) { s = `rgb(${q(r)},${q(g)},${q(b)})`; colorCache.set(key, s); }
      return s;
    };

    const render = (t: number) => {
      drawBackground(t);
      drawForeground(t);
      const bd = bctx.getImageData(0, 0, cols, rows).data;
      const fd = fctx.getImageData(0, 0, cols, rows).data;
      const cd = cctx.getImageData(0, 0, cols, rows).data;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0E0911'; ctx.fillRect(0, 0, W, H);
      const pcx = ptr.x / cw, pcy = ptr.y / ch, pr = 9;

      // halftone dots
      const dots = new Map<string, number[]>();
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        if (fd[i + 3] > 40 || cd[i + 3] > 40) continue;
        const r = bd[i], g = bd[i + 1], b = bd[i + 2];
        let lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
        const d = Math.hypot(x - pcx, (y - pcy) * 1.6);
        if (d < pr * 1.6) lum += (1 - d / (pr * 1.6)) * 0.35;
        if (hero.w) {
          // clear the sky behind the headline: no dots in the middle, a soft fade at the edges
          const ex = (x * cw + cw / 2 - (hero.x + hero.w / 2)) / (hero.w * 0.78), ey = (y * ch + ch / 2 - (hero.y + hero.h / 2)) / (hero.h * 0.95);
          const e = ex * ex + ey * ey;
          if (e < 0.55) continue;
          if (e < 1.4) lum *= Math.pow((e - 0.55) / 0.85, 1.5);
        }
        const rad = Math.min(1, lum * 1.25) * Math.min(cw, ch) * 0.62;
        if (rad < 0.45) continue;
        const col = colorOf(r * 1.15, g * 1.1, b * 1.2, 26);
        let arr = dots.get(col); if (!arr) dots.set(col, (arr = []));
        arr.push(x * cw + cw / 2, y * ch + ch / 2, rad);
      }
      dots.forEach((arr, col) => {
        ctx.fillStyle = col; ctx.beginPath();
        for (let k = 0; k < arr.length; k += 3) { ctx.moveTo(arr[k] + arr[k + 2], arr[k + 1]); ctx.arc(arr[k], arr[k + 1], arr[k + 2], 0, 6.283); }
        ctx.fill();
      });

      // ASCII foreground
      ctx.font = `600 ${ch}px "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const glyphs = new Map<string, number[]>();
      const chars: string[] = [];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const plant = fd[i + 3] >= 40;
        if (!plant) {
          if (cd[i + 3] < 40) continue;
          // bookcase: spines as vertical strokes, boards as '='
          const r = cd[i], g = cd[i + 1], b = cd[i + 2];
          const board = Math.abs(r - 0xE4) < 22 && Math.abs(g - 0xC4) < 22 && Math.abs(b - 0xE4) < 22;
          const lum2 = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
          const d2 = Math.hypot(x - pcx, (y - pcy) * 1.6);
          const glow2 = d2 < pr ? 1 - d2 / pr : 0;
          const chc = board ? '=' : r > 245 && g > 245 ? '@' : lum2 < 0.2 ? (lum2 < 0.12 ? '' : '-') : (x % 3 === 0 ? '!' : '|');
          if (!chc) continue;
          const col2 = colorOf(r * 1.15, g * 1.15, b * 1.15, glow2 * 70 + (board ? 0 : 18));
          let arr2 = glyphs.get(col2); if (!arr2) glyphs.set(col2, (arr2 = []));
          arr2.push(x * cw + cw / 2, y * ch + ch / 2, chars.length); chars.push(chc);
          continue;
        }
        const r = fd[i], g = fd[i + 1], b = fd[i + 2];
        let lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
        const d = Math.hypot(x - pcx, (y - pcy) * 1.6);
        const glow = d < pr ? 1 - d / pr : 0;
        lum = Math.min(1, lum + glow * 0.4);
        // tiny shimmer so the text feels alive
        const n = (Math.sin(x * 12.9898 + y * 78.233 + Math.floor(t * 3)) * 43758.5) % 1;
        const idx = Math.max(1, Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1) + (Math.abs(n) - 0.5) * 1.2)));
        const col = colorOf(r * 1.1, g * 1.1, b * 1.1, glow * 70 + 30);
        let arr = glyphs.get(col); if (!arr) glyphs.set(col, (arr = []));
        arr.push(x * cw + cw / 2, y * ch + ch / 2, chars.length);
        chars.push(glow > 0.55 ? '✿' : RAMP[idx]);
      }
      glyphs.forEach((arr, col) => {
        ctx.fillStyle = col;
        for (let k = 0; k < arr.length; k += 3) ctx.fillText(chars[arr[k + 2]], arr[k], arr[k + 1]);
      });
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - last < 33) return; // ~30fps is plenty for text
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const t = now / 1000;
      wind += (ptr.vx * 0.002 - wind) * 0.05; ptr.vx *= 0.9;
      for (let i = petals.length - 1; i >= 0; i--) {
        const p = petals[i];
        p.vy += 18 * dt; p.vx += Math.sin(t * 2 + i) * 6 * dt + wind * 40 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.35;
        if (p.life <= 0 || p.y > H) petals.splice(i, 1);
      }
      if (petals.length < 26 && Math.random() < 0.08) petals.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 20, vy: 10 + Math.random() * 20, life: 2.5, c: PETAL_COLORS[Math.floor(Math.random() * 4)] });
      render(t);
    };

    const burst = (x: number, y: number) => {
      for (let i = 0; i < 36; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
        petals.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 1.6 + Math.random(), c: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)] });
      }
      if (reduce) render(performance.now() / 1000);
    };

    const onMove = (e: PointerEvent) => { ptr.vx += e.clientX - (ptr.x < -1000 ? e.clientX : ptr.x); ptr.x = e.clientX; ptr.y = e.clientY; ptr.active = true; };
    const onLeave = () => { ptr.active = false; ptr.x = ptr.y = -9999; };
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('a,button,[data-banner]')) return;
      onMove(e); burst(e.clientX, e.clientY);
    };
    const onResize = () => { layout(); render(performance.now() / 1000); };

    layout();
    const ro = new ResizeObserver(onResize);
    if (bannerRef.current) ro.observe(bannerRef.current);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerleave', onLeave);
    document.fonts?.ready.then(onResize);
    if (reduce) render(1.3); else raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [bannerRef]);

  return <canvas ref={ref} aria-hidden="true" style={{ position: 'fixed', inset: 0, display: 'block', touchAction: 'manipulation' }} />;
}
