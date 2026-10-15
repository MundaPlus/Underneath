import { neighbors } from '../../engine/map';
import { mulberry32 } from '../../engine/rng';
import type { MapState } from '../../engine/types';
import { hexA } from '../shared/color';
import { fitCanvas, gridLayout, nearestTile, viewOffset, type GridLayout } from '../shared/layout';
import type { MapRenderer, MapView } from '../types';

interface Palette {
  ground: string;
  night: string;
  day: string;
  thread: string;
  reverie: string;
  dread: string;
  lamp: string;
  accent: string;
}

interface Thread {
  a: number;
  b: number;
  phase: number;
}

const TAU = Math.PI * 2;
const VISIT_SECONDS = 1.1;
/** Terrains whose sleepers mostly have nightmares. */
const DARK = new Set(['tenement', 'ward', 'haunted', 'factory']);

function rng(seed: number, a: number, b = 0): () => number {
  return mulberry32((seed * 31 + a * 7919 + b * 104729) >>> 0);
}

function offscreen(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  return [c, fitCanvas(c, w, h, dpr)];
}

/** 0 at deep night, 1 at full day. Uses the theme's cycle when it has one. */
function daylight(view: MapView): number {
  const cy = view.game.cycle();
  if (!cy) return 0;
  const { phase, progress } = cy;
  const t = (progress - phase.from) / (phase.to - phase.from);
  const smooth = t * t * (3 - 2 * t);
  if (phase.id === 'dawn') return smooth;
  if (phase.id === 'day') return 1;
  if (phase.id === 'dusk') return 1 - smooth;
  return 0;
}

export function createDreamRenderer(canvas: HTMLCanvasElement): MapRenderer {
  let ctx = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let layout: GridLayout | null = null;
  let pal = readPalette(canvas);
  let base: HTMLCanvasElement | null = null;
  let woven: HTMLCanvasElement | null = null;
  let fog: HTMLCanvasElement | null = null;
  let baseKey = '';
  let wovenKey = '';
  let threads: Thread[] = [];
  let ox = 0;
  let oy = 0;
  const visitStart = new Map<number, number>();
  let known = new Set<number>();
  let knownSeed = -1;

  return {
    resize(width, height, ratio) {
      w = Math.max(1, width);
      h = Math.max(1, height);
      dpr = ratio;
      ctx = fitCanvas(canvas, w, h, dpr);
      pal = readPalette(canvas);
      layout = null;
      baseKey = '';
    },

    hitTest(x, y) {
      return layout ? nearestTile(layout, x + ox, y + oy, 0.6) : null;
    },

    render(view: MapView) {
      const map = view.game.state.map;
      const now = view.now;
      if (!layout || knownSeed !== map.seed) layout = gridLayout(map, w, h, 0.08, 16, 28);

      if (knownSeed !== map.seed) {
        known = new Set(claimedTiles(map));
        knownSeed = map.seed;
        visitStart.clear();
        baseKey = '';
      } else {
        for (const i of claimedTiles(map)) {
          if (!known.has(i)) {
            known.add(i);
            visitStart.set(i, now);
          }
        }
      }
      for (const [i, t] of visitStart) if (now - t > VISIT_SECONDS) visitStart.delete(i);

      const ww = layout.worldW;
      const wh = layout.worldH;
      const bk = `${map.seed}:${ww}x${wh}`;
      if (bk !== baseKey) {
        base = drawCity(map, layout, view, ww, wh, dpr, pal);
        baseKey = bk;
        wovenKey = '';
      }
      const wk = `${bk}:${known.size}:${visitStart.size}`;
      if (wk !== wovenKey) {
        threads = buildThreads(map, visitStart);
        woven = drawWoven(map, layout, threads, ww, wh, dpr, pal);
        fog = drawFog(map, layout, ww, wh, dpr, pal);
        wovenKey = wk;
      }

      const day = daylight(view);
      ctx.clearRect(0, 0, w, h);
      [ox, oy] = viewOffset(layout, map.start, w, h, view.pan);
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.drawImage(base!, 0, 0, ww, wh);
      drawSmoke(ctx, map, layout, view);
      drawLight(ctx, fog!, day, pal, ww, wh);
      ctx.drawImage(woven!, 0, 0, ww, wh);
      drawVisits(ctx, layout, view, visitStart, pal);
      drawThreadStars(ctx, layout, threads, view, day, pal);
      drawWindows(ctx, map, layout, view, day, pal);
      drawBubbles(ctx, map, layout, view, day, pal);
      drawClaimable(ctx, layout, view, pal);
      drawPulses(ctx, layout, view, pal);
      ctx.restore();

      drawFireflies(ctx, w, h, view, day, pal);
      drawShootingStars(ctx, w, h, view);
      drawSkyDial(ctx, w, view, day, pal);
    },
  };
}

function readPalette(canvas: HTMLCanvasElement): Palette {
  const css = getComputedStyle(canvas);
  const v = (n: string, f: string): string => css.getPropertyValue(n).trim() || f;
  return {
    ground: v('--city-ground', '#1a1c33'),
    night: v('--city-night', '#070a1f'),
    day: v('--city-day', '#ffe3b8'),
    thread: v('--dream-thread', '#e8e4ff'),
    reverie: v('--res-reverie', '#9fd8ff'),
    dread: v('--res-dread', '#ff6b8b'),
    lamp: v('--lamp', '#ffd38a'),
    accent: v('--accent', '#c9b8ff'),
  };
}

function claimedTiles(map: MapState): number[] {
  const out: number[] = [];
  map.tiles.forEach((t, i) => t.claimed && out.push(i));
  return out;
}

/* ---------- static city ---------- */

function drawCity(map: MapState, l: GridLayout, view: MapView, w: number, h: number, dpr: number, pal: Palette): HTMLCanvasElement {
  const [c, g] = offscreen(w, h, dpr);
  g.fillStyle = pal.ground;
  g.fillRect(0, 0, w, h);
  const s = l.cell;

  // Cobble speckle.
  const r0 = rng(map.seed, 4040);
  for (let k = 0; k < (w * h) / 140; k++) {
    g.fillStyle = r0() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)';
    g.fillRect(r0() * w, r0() * h, 2, 1.5);
  }
  // Streets: a lighter grid between blocks.
  g.strokeStyle = 'rgba(160,170,230,0.06)';
  g.lineWidth = s * 0.16;
  g.beginPath();
  for (let x = 0; x <= map.width; x++) {
    g.moveTo(l.originX + x * s, l.originY);
    g.lineTo(l.originX + x * s, l.originY + map.height * s);
  }
  for (let y = 0; y <= map.height; y++) {
    g.moveTo(l.originX, l.originY + y * s);
    g.lineTo(l.originX + map.width * s, l.originY + y * s);
  }
  g.stroke();

  for (let i = 0; i < map.tiles.length; i++) {
    const def = view.game.terrain(map.tiles[i].terrain);
    drawBuilding(g, map.tiles[i].terrain, def?.color ?? '#333', l.cx[i], l.cy[i], s, rng(map.seed, i, 3), pal);
  }
  return c;
}

function roof(g: CanvasRenderingContext2D, x: number, y: number, rw: number, rh: number, color: string): void {
  // Top-down pitched roof: two halves split by a ridge.
  g.fillStyle = color;
  g.fillRect(x - rw / 2, y - rh / 2, rw, rh);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(x - rw / 2, y, rw, rh / 2);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - rw / 2, y);
  g.lineTo(x + rw / 2, y);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.strokeRect(x - rw / 2 + 0.5, y - rh / 2 + 0.5, rw - 1, rh - 1);
}

function drawBuilding(g: CanvasRenderingContext2D, terrain: string, color: string, x: number, y: number, s: number, r: () => number, pal: Palette): void {
  g.save();
  switch (terrain) {
    case 'street': {
      // Lamp post.
      const lx = x + (r() - 0.5) * s * 0.5;
      const ly = y + (r() - 0.5) * s * 0.5;
      g.fillStyle = '#4a4f70';
      g.beginPath();
      g.arc(lx, ly, s * 0.05, 0, TAU);
      g.fill();
      break;
    }
    case 'cottage':
    case 'nursery':
    case 'window':
      for (let k = 0; k < (terrain === 'cottage' ? 2 : 1); k++) {
        const big = terrain === 'cottage' ? 0.38 : 0.6;
        const bx = terrain === 'cottage' ? x + (k ? 0.2 : -0.2) * s : x;
        const by = terrain === 'cottage' ? y + (k ? 0.18 : -0.15) * s : y;
        roof(g, bx, by, s * big, s * big * 0.75, color);
        g.fillStyle = '#3a3048';
        g.fillRect(bx + s * big * 0.2, by - s * big * 0.35, s * 0.07, s * 0.07);
      }
      if (terrain === 'nursery') {
        g.fillStyle = hexA(pal.lamp, 0.8);
        star(g, x, y - s * 0.08, s * 0.08);
      }
      break;
    case 'tenement':
    case 'ward': {
      g.fillStyle = color;
      g.fillRect(x - s * 0.38, y - s * 0.3, s * 0.76, s * 0.6);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.strokeRect(x - s * 0.38 + 0.5, y - s * 0.3 + 0.5, s * 0.76 - 1, s * 0.6 - 1);
      if (terrain === 'ward') {
        g.fillStyle = 'rgba(255,220,230,0.5)';
        g.fillRect(x - s * 0.04, y - s * 0.13, s * 0.08, s * 0.26);
        g.fillRect(x - s * 0.13, y - s * 0.04, s * 0.26, s * 0.08);
      } else {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        for (let k = 0; k < 3; k++) g.fillRect(x - s * 0.3 + k * s * 0.22, y - s * 0.2, s * 0.1, s * 0.1);
        g.fillStyle = '#4b3a50';
        g.beginPath();
        g.arc(x + s * 0.2, y + s * 0.12, s * 0.09, 0, TAU);
        g.fill();
      }
      break;
    }
    case 'haunted': {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(x - s * 0.36, y - s * 0.22);
      g.lineTo(x + s * 0.3, y - s * 0.32);
      g.lineTo(x + s * 0.38, y + s * 0.26);
      g.lineTo(x - s * 0.3, y + s * 0.3);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(180,120,200,0.45)';
      g.lineWidth = 1;
      g.stroke();
      g.strokeStyle = '#2a1a22';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x - s * 0.42, y + s * 0.4);
      g.lineTo(x - s * 0.36, y + s * 0.18);
      g.lineTo(x - s * 0.44, y + s * 0.08);
      g.moveTo(x - s * 0.36, y + s * 0.18);
      g.lineTo(x - s * 0.28, y + s * 0.1);
      g.stroke();
      break;
    }
    case 'observatory':
      g.fillStyle = '#3c3a4e';
      g.fillRect(x - s * 0.34, y - s * 0.34, s * 0.68, s * 0.68);
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, s * 0.26, 0, TAU);
      g.fill();
      g.strokeStyle = '#2a2638';
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.moveTo(x, y - s * 0.24);
      g.lineTo(x, y + s * 0.05);
      g.stroke();
      break;
    case 'park':
      g.fillStyle = color;
      g.fillRect(x - s * 0.44, y - s * 0.44, s * 0.88, s * 0.88);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? '#2f5f4c' : '#28513f';
        g.beginPath();
        g.arc(x + (r() - 0.5) * s * 0.6, y + (r() - 0.5) * s * 0.6, s * (0.1 + r() * 0.06), 0, TAU);
        g.fill();
      }
      break;
    case 'factory':
      g.fillStyle = color;
      g.fillRect(x - s * 0.4, y - s * 0.28, s * 0.8, s * 0.56);
      g.fillStyle = '#26232a';
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        g.arc(x - s * 0.15 + k * s * 0.3, y - s * 0.05, s * 0.09, 0, TAU);
        g.fill();
      }
      break;
    case 'river':
      g.fillStyle = color;
      g.fillRect(x - s * 0.52, y - s * 0.52, s * 1.04, s * 1.04);
      g.strokeStyle = 'rgba(140,160,230,0.18)';
      g.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const yy = y - s * 0.3 + k * s * 0.3;
        g.beginPath();
        g.moveTo(x - s * 0.3, yy);
        g.quadraticCurveTo(x, yy - s * 0.06, x + s * 0.3, yy);
        g.stroke();
      }
      break;
  }
  g.restore();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/* ---------- woven threads (on visit) ---------- */

function buildThreads(map: MapState, visiting: Map<number, number>): Thread[] {
  const out: Thread[] = [];
  for (let a = 0; a < map.tiles.length; a++) {
    if (!map.tiles[a].claimed || visiting.has(a)) continue;
    for (const b of neighbors(a, map.width, map.height)) {
      if (b < a || !map.tiles[b].claimed || visiting.has(b)) continue;
      out.push({ a, b, phase: rng(map.seed, a, b)() });
    }
  }
  return out;
}

function threadPoint(l: GridLayout, t: Thread, u: number, strand: number): [number, number] {
  const ax = l.cx[t.a];
  const ay = l.cy[t.a];
  const dx = l.cx[t.b] - ax;
  const dy = l.cy[t.b] - ay;
  const len = Math.hypot(dx, dy) || 1;
  const wave = Math.sin(u * Math.PI * 2 + t.phase * 6) * l.cell * 0.07 * strand;
  return [ax + dx * u - (dy / len) * wave, ay + dy * u + (dx / len) * wave];
}

function drawWoven(map: MapState, l: GridLayout, threads: Thread[], w: number, h: number, dpr: number, pal: Palette): HTMLCanvasElement {
  const [c, g] = offscreen(w, h, dpr);
  g.lineCap = 'round';
  for (const t of threads) {
    for (const strand of [1, -1]) {
      for (const pass of [0, 1]) {
        g.strokeStyle = pass === 0 ? hexA(pal.accent, 0.15) : hexA(pal.thread, 0.7);
        g.lineWidth = pass === 0 ? 5 : 1;
        g.beginPath();
        for (let k = 0; k <= 12; k++) {
          const [x, y] = threadPoint(l, t, k / 12, strand);
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  }
  // Knots at visited houses.
  for (let i = 0; i < map.tiles.length; i++) {
    if (!map.tiles[i].claimed) continue;
    g.fillStyle = hexA(pal.thread, 0.85);
    g.beginPath();
    g.arc(l.cx[i], l.cy[i] + l.cell * 0.32, 2, 0, TAU);
    g.fill();
  }
  return c;
}

/* ---------- per frame ---------- */

/** Darkness over unvisited districts, cleared softly around visited houses and the frontier. */
function drawFog(map: MapState, l: GridLayout, w: number, h: number, dpr: number, pal: Palette): HTMLCanvasElement {
  const [c, f] = offscreen(w, h, dpr);
  f.fillStyle = hexA(pal.night, 0.7);
  f.fillRect(0, 0, w, h);
  f.globalCompositeOperation = 'destination-out';
  const s = l.cell;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    const frontier = !t.claimed && neighbors(i, map.width, map.height).some((n) => map.tiles[n].claimed);
    if (!t.claimed && !frontier) continue;
    const rad = s * (t.claimed ? 1.35 : 0.9);
    const rg = f.createRadialGradient(l.cx[i], l.cy[i], 0, l.cx[i], l.cy[i], rad);
    rg.addColorStop(0, `rgba(0,0,0,${t.claimed ? 1 : 0.55})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = rg;
    f.beginPath();
    f.arc(l.cx[i], l.cy[i], rad, 0, TAU);
    f.fill();
  }
  return c;
}

/** Fog (thinner by day), night tint, warm daylight wash. */
function drawLight(ctx: CanvasRenderingContext2D, fog: HTMLCanvasElement, day: number, pal: Palette, w: number, h: number): void {
  ctx.globalAlpha = 1 - day * 0.45;
  ctx.drawImage(fog, 0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = hexA(pal.night, 0.25 * (1 - day));
  ctx.fillRect(0, 0, w, h);
  if (day > 0) {
    ctx.fillStyle = hexA(pal.day, 0.24 * day);
    ctx.fillRect(0, 0, w, h);
  }
}

function drawVisits(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, visiting: Map<number, number>, pal: Palette): void {
  for (const [i, t0] of visiting) {
    const p = Math.min(1, (view.now - t0) / VISIT_SECONDS);
    const r = l.cell * (0.2 + p * 0.5);
    const glow = ctx.createRadialGradient(l.cx[i], l.cy[i], 0, l.cx[i], l.cy[i], r);
    glow.addColorStop(0, hexA(pal.thread, 0.6 * (1 - p)));
    glow.addColorStop(1, hexA(pal.thread, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], r, 0, TAU);
    ctx.fill();
  }
}

/** Little stars sliding along the threads. Color share follows reverie vs dread production. */
function drawThreadStars(ctx: CanvasRenderingContext2D, l: GridLayout, threads: Thread[], view: MapView, day: number, pal: Palette): void {
  const g = view.game;
  const L = g.rates.prod.reverie ?? 0;
  const R = g.rates.prod.dread ?? 0;
  if (L + R <= 0) return;
  const share = R / (L + R);
  const speed = 0.18 + Math.log10(L + R + 1) * 0.08;
  ctx.globalCompositeOperation = 'lighter';
  for (const t of threads) {
    let u = (view.now * speed + t.phase) % 1;
    if ((t.a + t.b) % 2) u = 1 - u;
    const [x, y] = threadPoint(l, t, u, (t.a % 2) * 2 - 1);
    const col = (t.phase * 7.31) % 1 < share ? pal.dread : pal.reverie;
    const a = Math.sin(u * Math.PI) * (1 - day * 0.6);
    ctx.fillStyle = hexA(col, 0.3 * a);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hexA(col, a);
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Lit windows in visited houses. Lights go out by day. */
function drawWindows(ctx: CanvasRenderingContext2D, map: MapState, l: GridLayout, view: MapView, day: number, pal: Palette): void {
  const s = l.cell;
  const lit = 1 - day * 0.85;
  if (lit <= 0.05) return;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!t.claimed || t.terrain === 'street' || t.terrain === 'park' || t.terrain === 'river') continue;
    const r = rng(map.seed, i, 11);
    const dark = DARK.has(t.terrain);
    const col = dark ? pal.dread : pal.lamp;
    const flicker = 0.75 + 0.25 * Math.sin(view.now * (dark ? 7 : 1.3) + i);
    const halo = ctx.createRadialGradient(l.cx[i], l.cy[i], 0, l.cx[i], l.cy[i], s * 0.7);
    halo.addColorStop(0, hexA(dark ? pal.dread : pal.reverie, 0.22 * lit * flicker));
    halo.addColorStop(1, hexA(dark ? pal.dread : pal.reverie, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], s * 0.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = hexA(col, 0.9 * lit * flicker);
    for (let k = 0; k < 2; k++) {
      const wx = l.cx[i] + (r() - 0.5) * s * 0.4;
      const wy = l.cy[i] + (r() - 0.5) * s * 0.3;
      ctx.fillRect(wx, wy, s * 0.07, s * 0.07);
    }
  }
}

/** Dream bubbles drifting up from sleepers. Fewer by day. */
function drawBubbles(ctx: CanvasRenderingContext2D, map: MapState, l: GridLayout, view: MapView, day: number, pal: Palette): void {
  const s = l.cell;
  const life = 5;
  ctx.font = `${Math.max(8, s * 0.22)}px serif`;
  ctx.textAlign = 'center';
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!t.claimed || t.terrain === 'street' || t.terrain === 'river') continue;
    const r = rng(map.seed, i, 21);
    const offset = r() * life;
    const age = (view.now + offset) % life;
    const p = age / life;
    // By day only some houses dream (nappers).
    if (day > 0.5 && r() < day * 0.8) continue;
    const dark = DARK.has(t.terrain);
    const col = dark ? pal.dread : pal.reverie;
    const x = l.cx[i] + Math.sin(view.now * 0.9 + i) * s * 0.12 + s * 0.15;
    const y = l.cy[i] - p * s * 0.9;
    const rad = s * (0.06 + p * 0.12);
    const alpha = Math.sin(p * Math.PI) * 0.75;
    ctx.strokeStyle = hexA(col, alpha);
    ctx.fillStyle = hexA(col, alpha * 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (p < 0.5) {
      ctx.fillStyle = hexA(pal.thread, alpha * 0.8);
      ctx.fillText('z', l.cx[i] - s * 0.12, l.cy[i] - p * s * 0.6);
    }
  }
}

function drawSmoke(ctx: CanvasRenderingContext2D, map: MapState, l: GridLayout, view: MapView): void {
  const s = l.cell;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i].terrain !== 'factory') continue;
    for (let k = 0; k < 3; k++) {
      const p = ((view.now * 0.25 + k / 3 + i * 0.13) % 1);
      const x = l.cx[i] - s * 0.15 + p * s * 0.5;
      const y = l.cy[i] - s * 0.05 - p * s * 0.7;
      ctx.fillStyle = `rgba(150,145,160,${0.25 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(x, y, s * (0.08 + p * 0.15), 0, TAU);
      ctx.fill();
    }
  }
}

function drawClaimable(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  const s = l.cell;
  ctx.lineWidth = 1.2;
  for (const i of view.claimable) {
    const afford = view.affordable.has(i);
    ctx.strokeStyle = hexA(pal.accent, afford ? 0.85 : 0.25);
    ctx.setLineDash([2, 5]);
    ctx.lineDashOffset = afford ? -view.now * 6 : 0;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], s * 0.42, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (view.hover !== null) {
    ctx.strokeStyle = hexA(pal.thread, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(l.cx[view.hover], l.cy[view.hover], s * 0.46, 0, TAU);
    ctx.stroke();
  }
}

function drawPulses(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  for (const p of view.pulses) {
    const age = view.now - p.start;
    if (age < 0 || age > 1.4) continue;
    const k = age / 1.4;
    ctx.fillStyle = hexA(pal.thread, 0.9 * (1 - k));
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * TAU + k;
      const d = l.cell * (0.2 + k * 0.9);
      star(ctx, l.cx[p.tile] + Math.cos(a) * d, l.cy[p.tile] + Math.sin(a) * d, 3 * (1 - k) + 1);
    }
  }
}

/* ---------- screen-space overlays ---------- */

function drawFireflies(ctx: CanvasRenderingContext2D, w: number, h: number, view: MapView, day: number, pal: Palette): void {
  const a = 1 - day;
  if (a <= 0.05) return;
  const r = mulberry32(777);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 40; k++) {
    const bx = r() * w;
    const by = r() * h;
    const sp = 0.2 + r() * 0.4;
    const x = (bx + Math.sin(view.now * sp + k) * 30 + w) % w;
    const y = (by + Math.cos(view.now * sp * 0.8 + k * 2) * 20 + h) % h;
    const tw = 0.5 + 0.5 * Math.sin(view.now * (1 + r() * 3) + k);
    ctx.fillStyle = hexA(pal.thread, 0.5 * tw * a);
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Shooting stars when the player can take the long sleep. */
function drawShootingStars(ctx: CanvasRenderingContext2D, w: number, h: number, view: MapView): void {
  if (view.game.prestigeGain() < 1) return;
  const period = 2.6;
  for (let k = 0; k < 2; k++) {
    const t = view.now / period + k * 0.5;
    const n = Math.floor(t);
    const p = t - n;
    if (p > 0.45) continue;
    const r = mulberry32(n * 13 + k);
    const sx = r() * w * 0.8 + w * 0.1;
    const sy = r() * h * 0.4;
    const len = Math.min(w, h) * 0.35;
    const q = p / 0.45;
    const x = sx + q * len;
    const y = sy + q * len * 0.5;
    const grad = ctx.createLinearGradient(x - len * 0.3, y - len * 0.15, x, y);
    grad.addColorStop(0, 'rgba(255,240,200,0)');
    grad.addColorStop(1, `rgba(255,240,200,${0.9 * (1 - q)})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - len * 0.3, y - len * 0.15);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
}

/** Moon or sun moving along an arc in the top-right corner, following the cycle. */
function drawSkyDial(ctx: CanvasRenderingContext2D, w: number, view: MapView, day: number, pal: Palette): void {
  const cy = view.game.cycle();
  if (!cy) return;
  const cx0 = w - 46;
  const cy0 = 46;
  const R = 26;
  ctx.fillStyle = 'rgba(5,6,20,0.55)';
  ctx.beginPath();
  ctx.arc(cx0, cy0, R + 12, 0, TAU);
  ctx.fill();
  const a = Math.PI + cy.progress * TAU;
  const x = cx0 + Math.cos(a) * R * 0.55;
  const y = cy0 + Math.sin(a) * R * 0.55;
  if (day < 0.5) {
    ctx.fillStyle = pal.thread;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(5,6,20,0.9)';
    ctx.beginPath();
    ctx.arc(x + 4, y - 3, 8, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = pal.lamp;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.lamp;
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 8; k++) {
      const b = (k / 8) * TAU + view.now * 0.3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(b) * 10, y + Math.sin(b) * 10);
      ctx.lineTo(x + Math.cos(b) * 13, y + Math.sin(b) * 13);
      ctx.stroke();
    }
  }
}
