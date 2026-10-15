import { mulberry32 } from '../../engine/rng';
import type { MapState } from '../../engine/types';
import { neighbors } from '../../engine/map';
import { fitCanvas, gridLayout, nearestTile, viewOffset, type GridLayout } from '../shared/layout';
import type { MapRenderer, MapView } from '../types';

interface Edge {
  a: number;
  b: number;
  /** Quadratic bezier control point. */
  qx: number;
  qy: number;
  len: number;
  phase: number;
}

interface Palette {
  soilTop: string;
  soilBottom: string;
  fog: string;
  hypha: string;
  glow: string;
  nutrients: string;
  sugar: string;
}

const GROW_SECONDS = 1.2;
const TAU = Math.PI * 2;

/** Seeded random stream for one tile or edge, so the drawing is stable between frames. */
function rng(seed: number, a: number, b = 0): () => number {
  return mulberry32((seed * 31 + a * 7919 + b * 104729) >>> 0);
}

function offscreen(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  const ctx = fitCanvas(c, w, h, dpr);
  return [c, ctx];
}

export function createFungalRenderer(canvas: HTMLCanvasElement): MapRenderer {
  let ctx = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let layout: GridLayout | null = null;
  let pal: Palette = readPalette(canvas);

  let ground: HTMLCanvasElement | null = null;
  let net: HTMLCanvasElement | null = null;
  let fog: HTMLCanvasElement | null = null;
  let groundKey = '';
  let netKey = '';

  let edges: Edge[] = [];
  const growStart = new Map<number, number>();
  let known = new Set<number>();
  let knownSeed = -1;
  let ox = 0;
  let oy = 0;

  const invalidate = (): void => {
    layout = null;
    groundKey = '';
    netKey = '';
  };

  return {
    resize(width, height, ratio) {
      w = Math.max(1, width);
      h = Math.max(1, height);
      dpr = ratio;
      ctx = fitCanvas(canvas, w, h, dpr);
      pal = readPalette(canvas);
      invalidate();
    },

    hitTest(x, y) {
      return layout ? nearestTile(layout, x + ox, y + oy, 0.65) : null;
    },

    render(view: MapView) {
      const game = view.game;
      const map = game.state.map;
      const now = view.now;

      if (!layout || knownSeed !== map.seed) {
        layout = gridLayout(map, w, h, 0.22, 16);
      }

      // Track new claims so their hyphae can grow in.
      if (knownSeed !== map.seed) {
        known = new Set(claimedTiles(map));
        knownSeed = map.seed;
        growStart.clear();
        groundKey = '';
      } else {
        for (const i of claimedTiles(map)) {
          if (!known.has(i)) {
            known.add(i);
            growStart.set(i, now);
          }
        }
      }
      for (const [i, t] of growStart) if (now - t > GROW_SECONDS) growStart.delete(i);

      const ww = layout.worldW;
      const wh = layout.worldH;
      const gk = `${map.seed}:${ww}x${wh}`;
      if (gk !== groundKey) {
        ground = drawGround(map, layout, view, ww, wh, dpr, pal);
        groundKey = gk;
        netKey = '';
      }
      const nk = `${gk}:${known.size}:${growStart.size}`;
      if (nk !== netKey) {
        edges = buildEdges(map, layout);
        [net, fog] = drawNetwork(map, layout, edges, growStart, ww, wh, dpr, pal);
        netKey = nk;
      }

      ctx.clearRect(0, 0, w, h);
      [ox, oy] = viewOffset(layout, map.start, w, h, view.pan);
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.drawImage(ground!, 0, 0, ww, wh);
      ctx.drawImage(fog!, 0, 0, ww, wh);
      ctx.drawImage(net!, 0, 0, ww, wh);

      drawGrowing(ctx, layout, edges, growStart, now, pal);
      drawNodes(ctx, map, layout, now, pal, growStart);
      drawFlow(ctx, layout, edges, growStart, view, pal);
      drawClaimable(ctx, layout, view, pal);
      drawMushrooms(ctx, map, layout, view);
      drawPulses(ctx, layout, view, pal);
      ctx.restore();
    },
  };
}

function readPalette(canvas: HTMLCanvasElement): Palette {
  const css = getComputedStyle(canvas);
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  return {
    soilTop: v('--soil-top', '#1d140d'),
    soilBottom: v('--soil-bottom', '#0c0805'),
    fog: v('--fog', '#0a0705'),
    hypha: v('--hypha', '#efe6cf'),
    glow: v('--hypha-glow', '#9ff5e0'),
    nutrients: v('--res-nutrients', '#c59cf0'),
    sugar: v('--res-sugar', '#f0c75e'),
  };
}

function claimedTiles(map: MapState): number[] {
  const out: number[] = [];
  map.tiles.forEach((t, i) => t.claimed && out.push(i));
  return out;
}

function buildEdges(map: MapState, l: GridLayout): Edge[] {
  const out: Edge[] = [];
  for (let a = 0; a < map.tiles.length; a++) {
    if (!map.tiles[a].claimed) continue;
    for (const b of neighbors(a, map.width, map.height)) {
      if (b < a || !map.tiles[b].claimed) continue;
      const r = rng(map.seed, a, b);
      const dx = l.cx[b] - l.cx[a];
      const dy = l.cy[b] - l.cy[a];
      const len = Math.hypot(dx, dy);
      const bend = (r() - 0.5) * 0.5;
      out.push({
        a,
        b,
        qx: (l.cx[a] + l.cx[b]) / 2 - dy * bend,
        qy: (l.cy[a] + l.cy[b]) / 2 + dx * bend,
        len,
        phase: r(),
      });
    }
  }
  return out;
}

function bez(l: GridLayout, e: Edge, t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * l.cx[e.a] + 2 * u * t * e.qx + t * t * l.cx[e.b],
    u * u * l.cy[e.a] + 2 * u * t * e.qy + t * t * l.cy[e.b],
  ];
}

/* ---------- static ground layer ---------- */

function drawGround(map: MapState, l: GridLayout, view: MapView, w: number, h: number, dpr: number, pal: Palette): HTMLCanvasElement {
  const [c, g] = offscreen(w, h, dpr);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, pal.soilTop);
  grad.addColorStop(1, pal.soilBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  // Speckles of grit.
  const r0 = rng(map.seed, 999);
  for (let i = 0; i < (w * h) / 180; i++) {
    g.fillStyle = r0() < 0.5 ? 'rgba(255,240,210,0.035)' : 'rgba(0,0,0,0.25)';
    g.fillRect(r0() * w, r0() * h, 1 + r0() * 1.5, 1 + r0() * 1.5);
  }

  const s = l.cell;
  // Soft terrain patches first, then features on top.
  for (let i = 0; i < map.tiles.length; i++) {
    const def = view.game.terrain(map.tiles[i].terrain);
    if (!def) continue;
    const rg = g.createRadialGradient(l.cx[i], l.cy[i], 0, l.cx[i], l.cy[i], s * 0.85);
    rg.addColorStop(0, hexA(def.color, 0.75));
    rg.addColorStop(1, hexA(def.color, 0));
    g.fillStyle = rg;
    g.beginPath();
    g.arc(l.cx[i], l.cy[i], s * 0.85, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < map.tiles.length; i++) {
    drawFeature(g, map.tiles[i].terrain, l.cx[i], l.cy[i], s, rng(map.seed, i, 7));
  }

  // Vignette.
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}

function drawFeature(g: CanvasRenderingContext2D, terrain: string, x: number, y: number, s: number, r: () => number): void {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  switch (terrain) {
    case 'litter':
      for (let k = 0; k < 5; k++) {
        g.save();
        g.translate((r() - 0.5) * s * 0.7, (r() - 0.5) * s * 0.7);
        g.rotate(r() * TAU);
        g.fillStyle = ['rgba(160,95,40,0.55)', 'rgba(120,70,30,0.55)', 'rgba(180,120,50,0.45)'][k % 3];
        g.beginPath();
        g.ellipse(0, 0, s * 0.13, s * 0.06, 0, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(60,30,10,0.5)';
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(-s * 0.12, 0);
        g.lineTo(s * 0.12, 0);
        g.stroke();
        g.restore();
      }
      break;
    case 'log': {
      g.rotate((r() - 0.5) * 1.2);
      const L = s * 0.48;
      const R = s * 0.15;
      g.fillStyle = '#5a3b22';
      g.beginPath();
      g.roundRect(-L, -R, L * 2, R * 2, R);
      g.fill();
      g.strokeStyle = 'rgba(30,15,5,0.6)';
      g.lineWidth = 1;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.moveTo(k * L * 0.35 - 2, -R * 0.8);
        g.quadraticCurveTo(k * L * 0.35 + 2, 0, k * L * 0.35 - 2, R * 0.8);
        g.stroke();
      }
      g.fillStyle = '#8a6440';
      g.beginPath();
      g.ellipse(L, 0, R * 0.45, R, 0, 0, TAU);
      g.fill();
      break;
    }
    case 'sapling':
    case 'oak':
    case 'mother': {
      const big = terrain === 'mother' ? 1.6 : terrain === 'oak' ? 1.1 : 0.6;
      const count = terrain === 'mother' ? 9 : terrain === 'oak' ? 6 : 4;
      if (terrain === 'mother') {
        const glow = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.9);
        glow.addColorStop(0, 'rgba(170,230,140,0.35)');
        glow.addColorStop(1, 'rgba(170,230,140,0)');
        g.fillStyle = glow;
        g.beginPath();
        g.arc(0, 0, s * 0.9, 0, TAU);
        g.fill();
      }
      g.strokeStyle = terrain === 'mother' ? 'rgba(120,150,80,0.85)' : 'rgba(95,110,60,0.75)';
      for (let k = 0; k < count; k++) {
        const a = (k / count) * TAU + r() * 0.5;
        const len = s * (0.25 + r() * 0.25) * big;
        g.lineWidth = Math.max(0.8, s * 0.035 * big);
        g.beginPath();
        g.moveTo(0, 0);
        const mx = Math.cos(a + 0.4) * len * 0.5;
        const my = Math.sin(a + 0.4) * len * 0.5;
        g.quadraticCurveTo(mx, my, Math.cos(a) * len, Math.sin(a) * len);
        g.stroke();
      }
      g.fillStyle = terrain === 'mother' ? '#6f8a45' : '#4a5a32';
      g.beginPath();
      g.arc(0, 0, s * 0.07 * big, 0, TAU);
      g.fill();
      break;
    }
    case 'carcass':
      g.rotate(r() * TAU);
      g.strokeStyle = 'rgba(225,215,190,0.75)';
      g.lineWidth = Math.max(1, s * 0.04);
      g.beginPath();
      g.moveTo(-s * 0.32, 0);
      g.lineTo(s * 0.32, 0);
      g.stroke();
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.arc(k * s * 0.12, 0, s * 0.16, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      g.fillStyle = 'rgba(225,215,190,0.75)';
      g.beginPath();
      g.ellipse(s * 0.38, 0, s * 0.08, s * 0.06, 0, 0, TAU);
      g.fill();
      break;
    case 'stream': {
      const wg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.7);
      wg.addColorStop(0, 'rgba(70,140,170,0.45)');
      wg.addColorStop(1, 'rgba(70,140,170,0)');
      g.fillStyle = wg;
      g.beginPath();
      g.arc(0, 0, s * 0.7, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(150,210,230,0.35)';
      g.lineWidth = 1;
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        for (let t = -0.4; t <= 0.4; t += 0.05) {
          const px = t * s;
          const py = k * s * 0.15 + Math.sin(t * 14 + k) * s * 0.03;
          if (t === -0.4) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.stroke();
      }
      break;
    }
    case 'stone':
    case 'bedrock': {
      const n = 7;
      const rad = s * (terrain === 'bedrock' ? 0.48 : 0.32);
      g.fillStyle = terrain === 'bedrock' ? '#151515' : '#5a5856';
      g.beginPath();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const rr = rad * (0.7 + r() * 0.35);
        if (k === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = terrain === 'bedrock' ? 'rgba(80,80,80,0.6)' : 'rgba(180,175,165,0.35)';
      g.lineWidth = 1;
      g.stroke();
      break;
    }
    case 'origin': {
      const og = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.5);
      og.addColorStop(0, 'rgba(240,230,200,0.5)');
      og.addColorStop(1, 'rgba(240,230,200,0)');
      g.fillStyle = og;
      g.beginPath();
      g.arc(0, 0, s * 0.5, 0, TAU);
      g.fill();
      break;
    }
    default:
      for (let k = 0; k < 3; k++) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.arc((r() - 0.5) * s * 0.6, (r() - 0.5) * s * 0.6, s * 0.03 + r() * s * 0.03, 0, TAU);
        g.fill();
      }
  }
  g.restore();
}

/* ---------- network layer (rebuilt on claim) ---------- */

function drawNetwork(
  map: MapState,
  l: GridLayout,
  edges: Edge[],
  growing: Map<number, number>,
  w: number,
  h: number,
  dpr: number,
  pal: Palette,
): [HTMLCanvasElement, HTMLCanvasElement] {
  // Fog: dark everywhere, cleared around the network and its frontier.
  const [fc, f] = offscreen(w, h, dpr);
  f.fillStyle = hexA(pal.fog, 0.72);
  f.fillRect(0, 0, w, h);
  f.globalCompositeOperation = 'destination-out';
  const s = l.cell;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    const frontier = !t.claimed && neighbors(i, map.width, map.height).some((n) => map.tiles[n].claimed);
    if (!t.claimed && !frontier) continue;
    const rad = s * (t.claimed ? 1.3 : 0.85);
    const rg = f.createRadialGradient(l.cx[i], l.cy[i], 0, l.cx[i], l.cy[i], rad);
    rg.addColorStop(0, `rgba(0,0,0,${t.claimed ? 1 : 0.6})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = rg;
    f.beginPath();
    f.arc(l.cx[i], l.cy[i], rad, 0, TAU);
    f.fill();
  }

  // Hyphae.
  const [nc, g] = offscreen(w, h, dpr);
  g.lineCap = 'round';
  // Glow pass, then thread pass.
  for (const pass of [0, 1]) {
    for (const e of edges) {
      if (growing.has(e.a) || growing.has(e.b)) continue;
      g.strokeStyle = pass === 0 ? hexA(pal.glow, 0.12) : hexA(pal.hypha, 0.75);
      g.lineWidth = pass === 0 ? s * 0.16 : Math.max(1, s * 0.035);
      g.beginPath();
      g.moveTo(l.cx[e.a], l.cy[e.a]);
      g.quadraticCurveTo(e.qx, e.qy, l.cx[e.b], l.cy[e.b]);
      g.stroke();
    }
  }

  // Fine hairs around each claimed tile, longer toward unclaimed neighbors (searching).
  for (let i = 0; i < map.tiles.length; i++) {
    if (!map.tiles[i].claimed || growing.has(i)) continue;
    const r = rng(map.seed, i, 3);
    const out = neighbors(i, map.width, map.height).filter((n) => !map.tiles[n].claimed);
    const hairs: [number, number][] = [];
    for (let k = 0; k < 6; k++) hairs.push([r() * TAU, s * (0.18 + r() * 0.22)]);
    for (const n of out) {
      const a = Math.atan2(l.cy[n] - l.cy[i], l.cx[n] - l.cx[i]);
      hairs.push([a + (r() - 0.5) * 0.6, s * (0.35 + r() * 0.15)]);
    }
    g.strokeStyle = hexA(pal.hypha, 0.32);
    g.lineWidth = 0.7;
    for (const [a, len] of hairs) {
      g.beginPath();
      let px = l.cx[i];
      let py = l.cy[i];
      g.moveTo(px, py);
      let ang = a;
      for (let k = 0; k < 4; k++) {
        ang += (r() - 0.5) * 0.9;
        px += Math.cos(ang) * (len / 4);
        py += Math.sin(ang) * (len / 4);
        g.lineTo(px, py);
      }
      g.stroke();
    }
  }
  return [nc, fc];
}

/* ---------- per-frame layers ---------- */

function drawGrowing(
  ctx: CanvasRenderingContext2D,
  l: GridLayout,
  edges: Edge[],
  growing: Map<number, number>,
  now: number,
  pal: Palette,
): void {
  if (!growing.size) return;
  ctx.lineCap = 'round';
  for (const e of edges) {
    const ta = growing.get(e.a);
    const tb = growing.get(e.b);
    if (ta === undefined && tb === undefined) continue;
    // Grow from the old tile toward the new one.
    const fromA = tb !== undefined;
    const p = Math.min(1, (now - (fromA ? tb! : ta!)) / GROW_SECONDS);
    const ease = 1 - (1 - p) ** 3;
    ctx.strokeStyle = hexA(pal.hypha, 0.85);
    ctx.lineWidth = Math.max(1, l.cell * 0.04);
    ctx.beginPath();
    const steps = 16;
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * ease;
      const [x, y] = bez(l, e, fromA ? t : 1 - t);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const [hx, hy] = bez(l, e, fromA ? ease : 1 - ease);
    ctx.fillStyle = pal.glow;
    ctx.beginPath();
    ctx.arc(hx, hy, 2.5, 0, TAU);
    ctx.fill();
  }
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  map: MapState,
  l: GridLayout,
  now: number,
  pal: Palette,
  growing: Map<number, number>,
): void {
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < map.tiles.length; i++) {
    if (!map.tiles[i].claimed) continue;
    const g0 = growing.get(i);
    const scale = g0 === undefined ? 1 : Math.min(1, (now - g0) / GROW_SECONDS);
    const breath = 0.75 + 0.25 * Math.sin(now * 1.6 + i * 1.7);
    const r = l.cell * 0.12 * scale;
    const rg = ctx.createRadialGradient(l.cx[i], l.cy[i], 0, l.cx[i], l.cy[i], r * 2.5);
    rg.addColorStop(0, hexA(pal.glow, 0.55 * breath));
    rg.addColorStop(1, hexA(pal.glow, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], r * 2.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = pal.hypha;
  for (let i = 0; i < map.tiles.length; i++) {
    if (!map.tiles[i].claimed) continue;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], i === map.start ? 3.5 : 2, 0, TAU);
    ctx.fill();
  }
}

/** Glowing dots that travel along the hyphae. Color share follows sugar vs nutrient production. */
function drawFlow(
  ctx: CanvasRenderingContext2D,
  l: GridLayout,
  edges: Edge[],
  growing: Map<number, number>,
  view: MapView,
  pal: Palette,
): void {
  const game = view.game;
  const b = game.content.balance;
  const L = game.rates.prod[b.left] ?? 0;
  const R = game.rates.prod[b.right] ?? 0;
  const total = L + R;
  if (total <= 0) return;
  const sugarShare = R / total;
  const speed = 18 + Math.log10(total + 1) * 8;
  const perEdge = edges.length > 120 ? 1 : 2;
  ctx.globalCompositeOperation = 'lighter';
  for (const e of edges) {
    if (growing.has(e.a) || growing.has(e.b)) continue;
    for (let k = 0; k < perEdge; k++) {
      const ph = (e.phase + k / perEdge) % 1;
      let t = (view.now * (speed / e.len) * 0.5 + ph) % 1;
      if ((e.a + e.b + k) % 2) t = 1 - t;
      const [x, y] = bez(l, e, t);
      const isSugar = (ph * 7.31) % 1 < sugarShare;
      const col = isSugar ? pal.sugar : pal.nutrients;
      const fade = Math.sin(t * Math.PI);
      ctx.fillStyle = hexA(col, 0.25 * fade);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = hexA(col, 0.9 * fade);
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawClaimable(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  const s = l.cell;
  ctx.lineWidth = 1.2;
  for (const i of view.claimable) {
    const afford = view.affordable.has(i);
    ctx.strokeStyle = hexA(afford ? pal.glow : pal.hypha, afford ? 0.7 : 0.22);
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = afford ? -view.now * 8 : 0;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], s * 0.3, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (view.hover !== null) {
    const i = view.hover;
    ctx.strokeStyle = hexA(pal.hypha, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(l.cx[i], l.cy[i], s * 0.38, 0, TAU);
    ctx.stroke();
  }
}

/** Little mushrooms sprout across the network when the player can fruit. */
function drawMushrooms(ctx: CanvasRenderingContext2D, map: MapState, l: GridLayout, view: MapView): void {
  const gain = view.game.prestigeGain();
  if (gain < 1) return;
  const grown = Math.min(1, 0.4 + gain / 10);
  const claimed = claimedTiles(map);
  const r = rng(map.seed, 4242);
  const count = Math.min(claimed.length, 3 + Math.floor(Math.log2(gain + 1) * 2));
  const s = l.cell;
  for (let k = 0; k < count; k++) {
    const i = claimed[Math.floor(r() * claimed.length)];
    const x = l.cx[i] + (r() - 0.5) * s * 0.5;
    const y = l.cy[i] + (r() - 0.5) * s * 0.5;
    const sway = Math.sin(view.now * 1.3 + k) * 0.06;
    const size = s * 0.22 * grown * (0.8 + r() * 0.4);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sway);
    ctx.fillStyle = '#efe3c8';
    ctx.fillRect(-size * 0.14, -size * 0.9, size * 0.28, size * 0.9);
    ctx.fillStyle = '#c8784a';
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.9, size * 0.6, size * 0.42, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,225,0.85)';
    ctx.beginPath();
    ctx.arc(-size * 0.22, -size * 1.1, size * 0.07, 0, TAU);
    ctx.arc(size * 0.18, -size * 1.0, size * 0.06, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawPulses(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  for (const p of view.pulses) {
    const age = view.now - p.start;
    if (age < 0 || age > 1.5) continue;
    const k = age / 1.5;
    ctx.strokeStyle = hexA(pal.glow, 0.8 * (1 - k));
    ctx.lineWidth = 2 * (1 - k) + 0.5;
    ctx.beginPath();
    ctx.arc(l.cx[p.tile], l.cy[p.tile], l.cell * (0.2 + k * 1.4), 0, TAU);
    ctx.stroke();
  }
}

/** Color with alpha. Accepts #rgb, #rrggbb or any CSS color (alpha ignored then). */
function hexA(color: string, a: number): string {
  let c = color.trim();
  if (c.startsWith('#')) {
    if (c.length === 4) c = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    const n = parseInt(c.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`;
  }
  return c;
}
