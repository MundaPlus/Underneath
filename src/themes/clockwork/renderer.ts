import { neighbors } from '../../engine/map';
import { mulberry32 } from '../../engine/rng';
import type { MapState } from '../../engine/types';
import { hexA } from '../shared/color';
import { fitCanvas, gridLayout, nearestTile, viewOffset, type GridLayout } from '../shared/layout';
import type { MapRenderer, MapView } from '../types';

interface Palette {
  bg: string;
  line: string;
  brass: string;
  brassDark: string;
  wall: string;
  paperwork: string;
  favors: string;
  ghost: string;
  stamp: string;
}

interface Pipe {
  a: number;
  b: number;
  phase: number;
}

const BUILD_SECONDS = 0.9;
const TAU = Math.PI * 2;

function rng(seed: number, a: number, b = 0): () => number {
  return mulberry32((seed * 31 + a * 7919 + b * 104729) >>> 0);
}

function offscreen(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  return [c, fitCanvas(c, w, h, dpr)];
}

export function createClockworkRenderer(canvas: HTMLCanvasElement): MapRenderer {
  let ctx = canvas.getContext('2d')!;
  let w = 1;
  let h = 1;
  let dpr = 1;
  let layout: GridLayout | null = null;
  let pal = readPalette(canvas);
  let base: HTMLCanvasElement | null = null;
  let built: HTMLCanvasElement | null = null;
  let baseKey = '';
  let builtKey = '';
  let pipes: Pipe[] = [];
  let ox = 0;
  let oy = 0;
  const buildStart = new Map<number, number>();
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
      return layout ? nearestTile(layout, x + ox, y + oy, 0.55) : null;
    },

    render(view: MapView) {
      const map = view.game.state.map;
      const now = view.now;
      if (!layout || knownSeed !== map.seed) layout = gridLayout(map, w, h, 0, 16, 28);

      if (knownSeed !== map.seed) {
        known = new Set(claimed(map));
        knownSeed = map.seed;
        buildStart.clear();
        baseKey = '';
      } else {
        for (const i of claimed(map)) {
          if (!known.has(i)) {
            known.add(i);
            buildStart.set(i, now);
          }
        }
      }
      for (const [i, t] of buildStart) if (now - t > BUILD_SECONDS) buildStart.delete(i);

      const ww = layout.worldW;
      const wh = layout.worldH;
      const bk = `${map.seed}:${ww}x${wh}`;
      if (bk !== baseKey) {
        base = drawBase(map, layout, ww, wh, dpr, pal);
        baseKey = bk;
        builtKey = '';
      }
      const kk = `${bk}:${known.size}:${buildStart.size}`;
      if (kk !== builtKey) {
        pipes = buildPipes(map, buildStart);
        built = drawBuilt(map, layout, view, buildStart, pipes, ww, wh, dpr, pal);
        builtKey = kk;
      }

      ctx.clearRect(0, 0, w, h);
      [ox, oy] = viewOffset(layout, map.start, w, h, view.pan);
      ctx.save();
      ctx.translate(-ox, -oy);
      ctx.drawImage(base!, 0, 0, ww, wh);
      drawBigGears(ctx, layout, view, pal);
      ctx.drawImage(built!, 0, 0, ww, wh);

      drawConstruction(ctx, map, layout, view, buildStart, pal);
      drawCapsules(ctx, layout, pipes, view, pal);
      drawMachines(ctx, map, layout, view, buildStart, pal);
      drawGhosts(ctx, map, layout, view, pal);
      drawClaimable(ctx, layout, view, pal);
      drawAuditStamps(ctx, map, layout, view, pal);
      drawPulses(ctx, layout, view, pal);
      ctx.restore();
    },
  };
}

function readPalette(canvas: HTMLCanvasElement): Palette {
  const css = getComputedStyle(canvas);
  const v = (n: string, f: string): string => css.getPropertyValue(n).trim() || f;
  return {
    bg: v('--bp-bg', '#132b3c'),
    line: v('--bp-line', '#9cc3d9'),
    brass: v('--brass', '#d8a94a'),
    brassDark: v('--brass-dark', '#7a5a22'),
    wall: v('--wall', '#2a1d12'),
    paperwork: v('--res-paperwork', '#efe2c2'),
    favors: v('--res-favors', '#7fd18a'),
    ghost: v('--ghost', '#dff3ff'),
    stamp: v('--stamp', '#c8412f'),
  };
}

function claimed(map: MapState): number[] {
  const out: number[] = [];
  map.tiles.forEach((t, i) => t.claimed && out.push(i));
  return out;
}

function rect(l: GridLayout, i: number): [number, number, number] {
  const s = l.cell;
  return [l.cx[i] - s / 2, l.cy[i] - s / 2, s];
}

/* ---------- blueprint base (static per map) ---------- */

function drawBase(map: MapState, l: GridLayout, w: number, h: number, dpr: number, pal: Palette): HTMLCanvasElement {
  const [c, g] = offscreen(w, h, dpr);
  g.fillStyle = pal.bg;
  g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  glow.addColorStop(0, 'rgba(255,255,255,0.06)');
  glow.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  // Fine and major grid lines.
  const s = l.cell;
  for (const [step, alpha] of [
    [s / 4, 0.05],
    [s, 0.12],
  ] as const) {
    g.strokeStyle = hexA(pal.line, alpha);
    g.lineWidth = 1;
    g.beginPath();
    for (let x = l.originX % step; x < w; x += step) {
      g.moveTo(Math.round(x) + 0.5, 0);
      g.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = l.originY % step; y < h; y += step) {
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(w, Math.round(y) + 0.5);
    }
    g.stroke();
  }

  // Pencil sketch of every planned room.
  for (let i = 0; i < map.tiles.length; i++) {
    sketch(g, map.tiles[i].terrain, l, i, pal, rng(map.seed, i, 5));
  }

  // Title block.
  g.font = `${Math.max(9, s * 0.3)}px ui-monospace, monospace`;
  g.fillStyle = hexA(pal.line, 0.45);
  g.textAlign = 'right';
  g.fillText(`BUREAU OF DEPARTED AFFAIRS · FLOOR PLAN · SHEET ${(map.seed % 900) + 100}`, w - 14, h - 10);
  return c;
}

/** Thin white blueprint symbol for a room that is not built yet. */
function sketch(g: CanvasRenderingContext2D, terrain: string, l: GridLayout, i: number, pal: Palette, r: () => number): void {
  const [x, y, s] = rect(l, i);
  const cx = x + s / 2;
  const cy = y + s / 2;
  g.save();
  g.strokeStyle = hexA(pal.line, 0.4);
  g.fillStyle = hexA(pal.line, 0.4);
  g.lineWidth = 1;
  switch (terrain) {
    case 'desks':
      for (let k = 0; k < 4; k++) g.strokeRect(x + s * (0.15 + (k % 2) * 0.4), y + s * (0.2 + Math.floor(k / 2) * 0.4), s * 0.3, s * 0.18);
      break;
    case 'filing':
      for (let k = 0; k < 4; k++) g.strokeRect(x + s * 0.15 + k * s * 0.18, y + s * 0.15, s * 0.15, s * 0.7);
      break;
    case 'lounge':
      g.beginPath();
      g.arc(cx, cy, s * 0.2, 0, TAU);
      g.stroke();
      g.strokeRect(x + s * 0.1, y + s * 0.1, s * 0.25, s * 0.12);
      break;
    case 'backroom':
      g.strokeRect(x + s * 0.25, y + s * 0.3, s * 0.5, s * 0.4);
      g.beginPath();
      g.arc(x + s * 0.25, y + s * 0.85, s * 0.25, -Math.PI / 2, 0);
      g.stroke();
      break;
    case 'archive':
    case 'clockroom':
      g.beginPath();
      g.arc(cx, cy, s * 0.32, 0, TAU);
      g.moveTo(cx, cy);
      g.lineTo(cx, cy - s * 0.22);
      g.moveTo(cx, cy);
      g.lineTo(cx + s * 0.15, cy);
      g.stroke();
      if (terrain === 'archive') {
        g.font = `${s * 0.28}px serif`;
        g.textAlign = 'center';
        g.fillText('?', cx, cy + s * 0.1);
      }
      break;
    case 'junction':
      g.beginPath();
      g.moveTo(x, cy);
      g.lineTo(x + s, cy);
      g.moveTo(cx, y);
      g.lineTo(cx, y + s);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, s * 0.15, 0, TAU);
      g.stroke();
      break;
    case 'wall':
      g.beginPath();
      for (let k = -s; k < s; k += s / 5) {
        g.moveTo(x + Math.max(0, k), y + Math.max(0, -k));
        g.lineTo(x + Math.min(s, k + s), y + Math.min(s, s - k));
      }
      g.stroke();
      g.strokeRect(x + 2, y + 2, s - 4, s - 4);
      break;
    case 'void':
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.beginPath();
      g.arc(cx + (r() - 0.5) * 4, cy, s * 0.42, 0, TAU);
      g.fill();
      break;
    case 'reception':
      g.strokeRect(x + s * 0.2, y + s * 0.55, s * 0.6, s * 0.2);
      break;
    default:
      g.setLineDash([2, 3]);
      g.strokeRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
      g.setLineDash([]);
  }
  g.restore();
}

/* ---------- built rooms (rebuilt on annex) ---------- */

function buildPipes(map: MapState, building: Map<number, number>): Pipe[] {
  const out: Pipe[] = [];
  for (let a = 0; a < map.tiles.length; a++) {
    if (!map.tiles[a].claimed || building.has(a)) continue;
    for (const b of neighbors(a, map.width, map.height)) {
      if (b < a || !map.tiles[b].claimed || building.has(b)) continue;
      out.push({ a, b, phase: rng(map.seed, a, b)() });
    }
  }
  return out;
}

function isBuilt(map: MapState, i: number, building: Map<number, number>): boolean {
  return map.tiles[i].claimed && !building.has(i);
}

function drawBuilt(
  map: MapState,
  l: GridLayout,
  view: MapView,
  building: Map<number, number>,
  pipes: Pipe[],
  w: number,
  h: number,
  dpr: number,
  pal: Palette,
): HTMLCanvasElement {
  const [c, g] = offscreen(w, h, dpr);
  const s = l.cell;

  // Dim the far plan. Frontier rooms stay clear.
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i].claimed) continue;
    const frontier = neighbors(i, map.width, map.height).some((n) => map.tiles[n].claimed);
    if (frontier) continue;
    const [x, y] = rect(l, i);
    g.fillStyle = hexA(pal.bg, 0.55);
    g.fillRect(x, y, s, s);
  }

  // Shadow under the building.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = s * 0.4;
  g.fillStyle = pal.wall;
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isBuilt(map, i, building)) continue;
    const [x, y] = rect(l, i);
    g.fillRect(x, y, s, s);
  }
  g.restore();

  for (let i = 0; i < map.tiles.length; i++) {
    if (!isBuilt(map, i, building)) continue;
    drawRoom(g, map.tiles[i].terrain, l, i, view, pal, rng(map.seed, i, 9), 1);
  }

  // Walls on the outside. Partitions with a door between different rooms.
  const wallW = Math.max(3, s * 0.1);
  g.lineCap = 'square';
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isBuilt(map, i, building)) continue;
    const [x, y] = rect(l, i);
    const xi = i % map.width;
    const yi = Math.floor(i / map.width);
    const sides: [number, number, number, number, number][] = [
      [xi > 0 ? i - 1 : -1, x, y, x, y + s],
      [xi < map.width - 1 ? i + 1 : -1, x + s, y, x + s, y + s],
      [yi > 0 ? i - map.width : -1, x, y, x + s, y],
      [yi < map.height - 1 ? i + map.width : -1, x, y + s, x + s, y + s],
    ];
    for (const [n, x1, y1, x2, y2] of sides) {
      const open = n >= 0 && isBuilt(map, n, building);
      if (!open) {
        g.strokeStyle = pal.wall;
        g.lineWidth = wallW;
        line(g, x1, y1, x2, y2);
        g.strokeStyle = hexA(pal.brass, 0.35);
        g.lineWidth = 1;
        line(g, x1, y1, x2, y2);
      } else if (n > i && map.tiles[n].terrain !== map.tiles[i].terrain) {
        // Partition with a door gap in the middle.
        g.strokeStyle = hexA(pal.wall, 0.85);
        g.lineWidth = Math.max(1.5, s * 0.05);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const gap = 0.22;
        line(g, x1, y1, x1 + (mx - x1) * (1 - gap), y1 + (my - y1) * (1 - gap));
        line(g, x2, y2, x2 + (mx - x2) * (1 - gap), y2 + (my - y2) * (1 - gap));
      }
    }
  }

  // Brass pneumatic tubes along the ceiling, offset from the room centers.
  const off = s * 0.28;
  for (const pass of [0, 1]) {
    g.strokeStyle = pass === 0 ? pal.brassDark : pal.brass;
    g.lineWidth = pass === 0 ? Math.max(3, s * 0.11) : Math.max(1.5, s * 0.05);
    g.lineCap = 'round';
    for (const p of pipes) {
      const [ax, ay] = pipePoint(l, p.a, off);
      const [bx, by] = pipePoint(l, p.b, off);
      line(g, ax, ay, bx, by);
    }
  }
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isBuilt(map, i, building)) continue;
    const [px, py] = pipePoint(l, i, off);
    g.fillStyle = pal.brassDark;
    g.beginPath();
    g.arc(px, py, Math.max(3, s * 0.09), 0, TAU);
    g.fill();
    g.fillStyle = pal.brass;
    g.beginPath();
    g.arc(px, py, Math.max(1.5, s * 0.045), 0, TAU);
    g.fill();
  }
  return c;
}

function pipePoint(l: GridLayout, i: number, off: number): [number, number] {
  return [l.cx[i] - off, l.cy[i] - off];
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

/** Floor, pattern and furniture of one built room. `p` (0..1) is the build progress. */
function drawRoom(
  g: CanvasRenderingContext2D,
  terrain: string,
  l: GridLayout,
  i: number,
  view: MapView,
  pal: Palette,
  r: () => number,
  p: number,
): void {
  const [x, y, s] = rect(l, i);
  const def = view.game.terrain(terrain);
  g.save();
  g.beginPath();
  g.rect(x, y, s, s * p);
  g.clip();
  g.fillStyle = def?.color ?? '#776655';
  g.fillRect(x, y, s, s);

  // Floor patterns.
  g.globalAlpha = 0.18;
  g.fillStyle = '#000';
  switch (terrain) {
    case 'corridor':
    case 'reception':
    case 'clockroom':
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2) g.fillRect(x + (a * s) / 4, y + (b * s) / 4, s / 4, s / 4);
      break;
    case 'desks':
    case 'filing':
    case 'junction':
      for (let k = 1; k < 5; k++) g.fillRect(x, y + (k * s) / 5, s, 1);
      break;
    case 'lounge':
    case 'backroom':
    case 'archive':
      g.globalAlpha = 0.25;
      g.fillStyle = terrain === 'lounge' ? '#2e5d3a' : '#5a1f2a';
      g.fillRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
      break;
  }
  g.globalAlpha = 1;

  // Furniture.
  const wood = '#4a3020';
  const paper = hexA(pal.paperwork, 0.9);
  switch (terrain) {
    case 'desks':
      for (let k = 0; k < 4; k++) {
        const dx = x + s * (0.13 + (k % 2) * 0.42);
        const dy = y + s * (0.18 + Math.floor(k / 2) * 0.42);
        g.fillStyle = wood;
        g.fillRect(dx, dy, s * 0.32, s * 0.18);
        g.fillStyle = paper;
        g.fillRect(dx + s * 0.04 + r() * s * 0.1, dy + s * 0.03, s * 0.08, s * 0.1);
      }
      break;
    case 'filing':
      for (let k = 0; k < 4; k++) {
        const fx = x + s * 0.13 + k * s * 0.19;
        g.fillStyle = '#5b5b55';
        g.fillRect(fx, y + s * 0.12, s * 0.16, s * 0.76);
        g.fillStyle = pal.brass;
        for (let d = 0; d < 4; d++) g.fillRect(fx + s * 0.06, y + s * (0.2 + d * 0.18), s * 0.04, s * 0.02);
      }
      break;
    case 'lounge':
      g.fillStyle = wood;
      g.beginPath();
      g.arc(x + s / 2, y + s / 2, s * 0.18, 0, TAU);
      g.fill();
      g.fillStyle = '#efe6d4';
      g.beginPath();
      g.arc(x + s * 0.45, y + s * 0.47, s * 0.04, 0, TAU);
      g.arc(x + s * 0.57, y + s * 0.55, s * 0.04, 0, TAU);
      g.fill();
      g.fillStyle = '#6b3a2a';
      g.fillRect(x + s * 0.1, y + s * 0.1, s * 0.28, s * 0.12);
      break;
    case 'backroom':
      g.fillStyle = '#2f5a35';
      g.fillRect(x + s * 0.22, y + s * 0.3, s * 0.56, s * 0.4);
      g.fillStyle = paper;
      for (let k = 0; k < 3; k++) g.fillRect(x + s * (0.3 + k * 0.14), y + s * 0.42, s * 0.08, s * 0.12);
      break;
    case 'archive':
      g.fillStyle = '#2a1f33';
      for (let k = 0; k < 3; k++) g.fillRect(x + s * 0.12, y + s * (0.15 + k * 0.25), s * 0.76, s * 0.12);
      g.fillStyle = hexA(pal.favors, 0.35);
      g.beginPath();
      g.arc(x + s / 2, y + s / 2, s * 0.35, 0, TAU);
      g.fill();
      break;
    case 'reception':
      g.fillStyle = wood;
      g.fillRect(x + s * 0.15, y + s * 0.62, s * 0.7, s * 0.16);
      g.fillStyle = pal.brass;
      g.fillRect(x + s * 0.47, y + s * 0.58, s * 0.06, s * 0.05);
      break;
    case 'junction':
      g.strokeStyle = pal.brassDark;
      g.lineWidth = s * 0.08;
      line(g, x, y + s / 2, x + s, y + s / 2);
      line(g, x + s / 2, y, x + s / 2, y + s);
      break;
    case 'wall':
      g.fillStyle = '#3a3532';
      g.fillRect(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4);
      break;
  }
  g.restore();
}

/* ---------- per frame ---------- */

function drawConstruction(
  ctx: CanvasRenderingContext2D,
  map: MapState,
  l: GridLayout,
  view: MapView,
  building: Map<number, number>,
  pal: Palette,
): void {
  for (const [i, t0] of building) {
    const p = Math.min(1, (view.now - t0) / BUILD_SECONDS);
    drawRoom(ctx, map.tiles[i].terrain, l, i, view, pal, rng(map.seed, i, 9), p);
    const [x, y, s] = rect(l, i);
    ctx.strokeStyle = pal.brass;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    ctx.setLineDash([]);
    // Drafting line that sweeps down as the room is drawn.
    ctx.strokeStyle = hexA(pal.paperwork, 0.9);
    line(ctx, x, y + s * p, x + s, y + s * p);
  }
}

function drawCapsules(ctx: CanvasRenderingContext2D, l: GridLayout, pipes: Pipe[], view: MapView, pal: Palette): void {
  const game = view.game;
  const L = game.rates.prod.paperwork ?? 0;
  const R = game.rates.prod.favors ?? 0;
  const total = L + R;
  if (total <= 0 || !pipes.length) return;
  const share = R / total;
  const speed = 0.25 + Math.log10(total + 1) * 0.12;
  const s = l.cell;
  const off = s * 0.28;
  const size = Math.max(3, s * 0.1);
  for (const p of pipes) {
    let t = (view.now * speed + p.phase) % 1;
    if ((p.a + p.b) % 2) t = 1 - t;
    const [ax, ay] = pipePoint(l, p.a, off);
    const [bx, by] = pipePoint(l, p.b, off);
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    const horiz = Math.abs(bx - ax) > Math.abs(by - ay);
    ctx.fillStyle = (p.phase * 7.31) % 1 < share ? pal.favors : pal.paperwork;
    ctx.beginPath();
    ctx.roundRect(x - (horiz ? size : size / 2), y - (horiz ? size / 2 : size), horiz ? size * 2 : size, horiz ? size : size * 2, size / 2);
    ctx.fill();
  }
}

function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, teeth: number, angle: number): void {
  ctx.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const a = angle + (k / (teeth * 2)) * TAU;
    const rr = k % 2 ? r * 0.82 : r;
    const a2 = a + TAU / (teeth * 4);
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
  }
  ctx.closePath();
}

/** Big faint gears in the corners of the sheet. Speed follows total production. */
function drawBigGears(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  const total = (view.game.rates.prod.paperwork ?? 0) + (view.game.rates.prod.favors ?? 0);
  const spin = view.now * (0.05 + Math.log10(total + 1) * 0.04);
  const R = l.cell * 3;
  ctx.strokeStyle = hexA(pal.line, 0.18);
  ctx.lineWidth = 1.5;
  for (const [x, y, dir, teeth] of [
    [0, 0, 1, 16],
    [R * 1.75, -R * 0.15, -1, 10],
    [l.worldW, l.worldH, 1, 16],
  ] as const) {
    const r = teeth === 10 ? R * 0.62 : R;
    gear(ctx, x, y, r, teeth, spin * dir * (16 / teeth));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, TAU);
    ctx.stroke();
  }
}

/** Clock on the front desk and spinning gears in clock rooms and archives. */
function drawMachines(
  ctx: CanvasRenderingContext2D,
  map: MapState,
  l: GridLayout,
  view: MapView,
  building: Map<number, number>,
  pal: Palette,
): void {
  const s = l.cell;
  const total = (view.game.rates.prod.paperwork ?? 0) + (view.game.rates.prod.favors ?? 0);
  const speed = 0.3 + Math.log10(total + 1) * 0.35;
  for (let i = 0; i < map.tiles.length; i++) {
    if (!isBuilt(map, i, building)) continue;
    const t = map.tiles[i].terrain;
    const cx = l.cx[i];
    const cy = l.cy[i] - s * 0.1;
    if (t === 'reception') {
      ctx.fillStyle = '#f3ead6';
      ctx.strokeStyle = pal.brassDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.24, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#2a1d12';
      ctx.lineWidth = 1.5;
      const m = view.now * speed;
      line(ctx, cx, cy, cx + Math.cos(m - Math.PI / 2) * s * 0.18, cy + Math.sin(m - Math.PI / 2) * s * 0.18);
      line(ctx, cx, cy, cx + Math.cos(m / 12 - Math.PI / 2) * s * 0.12, cy + Math.sin(m / 12 - Math.PI / 2) * s * 0.12);
    } else if (t === 'clockroom' || t === 'archive') {
      ctx.fillStyle = t === 'clockroom' ? pal.brass : hexA(pal.favors, 0.8);
      gear(ctx, cx - s * 0.08, cy + s * 0.1, s * 0.22, 8, view.now * speed);
      ctx.fill();
      ctx.fillStyle = t === 'clockroom' ? pal.brassDark : '#3e2f4f';
      gear(ctx, cx + s * 0.2, cy - s * 0.12, s * 0.13, 6, -view.now * speed * 1.6 + 0.3);
      ctx.fill();
    }
  }
}

/** Souls drifting from room to room. More rooms, more souls. */
function drawGhosts(ctx: CanvasRenderingContext2D, map: MapState, l: GridLayout, view: MapView, pal: Palette): void {
  const rooms = claimed(map);
  if (rooms.length < 2) return;
  const count = Math.min(12, 1 + Math.floor(rooms.length / 3));
  const s = l.cell;
  for (let k = 0; k < count; k++) {
    const period = 4 + (k % 3);
    const t = view.now / period + k * 0.37;
    const seg = Math.floor(t);
    const f = t - seg;
    const pick = (n: number): number => rooms[Math.floor(rng(map.seed, k * 1000 + n, 77)() * rooms.length)];
    const a = pick(seg);
    const b = pick(seg + 1);
    const e = f < 0.6 ? 0 : (f - 0.6) / 0.4;
    const ease = e * e * (3 - 2 * e);
    const x = l.cx[a] + (l.cx[b] - l.cx[a]) * ease + Math.sin(view.now * 1.3 + k) * s * 0.12;
    const y = l.cy[a] + (l.cy[b] - l.cy[a]) * ease + Math.sin(view.now * 2.1 + k * 2) * s * 0.06 + s * 0.12;
    const r = s * 0.13;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = pal.ghost;
    ctx.beginPath();
    ctx.arc(0, -r * 0.2, r, Math.PI, 0);
    ctx.lineTo(r, r * 0.9);
    for (let q = 3; q >= 0; q--) {
      const qx = -r + (q / 3) * 2 * r;
      ctx.lineTo(qx, r * (0.9 + (q % 2 ? -0.3 : 0) + Math.sin(view.now * 6 + q) * 0.06));
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1b2a36';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.25, r * 0.14, 0, TAU);
    ctx.arc(r * 0.35, -r * 0.25, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawClaimable(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  const s = l.cell;
  for (const i of view.claimable) {
    const [x, y] = rect(l, i);
    const afford = view.affordable.has(i);
    if (afford) {
      ctx.fillStyle = hexA(pal.brass, 0.1 + 0.06 * Math.sin(view.now * 3));
      ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
    }
    ctx.strokeStyle = hexA(afford ? pal.brass : pal.line, afford ? 0.85 : 0.35);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = afford ? -view.now * 10 : 0;
    ctx.strokeRect(x + 3.5, y + 3.5, s - 7, s - 7);
  }
  ctx.setLineDash([]);
  if (view.hover !== null) {
    const [x, y] = rect(l, view.hover);
    ctx.strokeStyle = pal.paperwork;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
  }
}

/** Red rubber stamps on rooms when the player can call the audit. */
function drawAuditStamps(ctx: CanvasRenderingContext2D, map: MapState, l: GridLayout, view: MapView, pal: Palette): void {
  const gain = view.game.prestigeGain();
  if (gain < 1) return;
  const rooms = claimed(map);
  const r = rng(map.seed, 31337);
  const count = Math.min(rooms.length, 2 + Math.floor(Math.log2(gain + 1)));
  const s = l.cell;
  ctx.save();
  ctx.font = `bold ${s * 0.34}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 0; k < count; k++) {
    const i = rooms[Math.floor(r() * rooms.length)];
    const rot = (r() - 0.5) * 0.7;
    ctx.save();
    ctx.translate(l.cx[i], l.cy[i]);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(view.now * 2 + k);
    ctx.fillStyle = hexA(pal.paperwork, 0.75);
    ctx.fillRect(-s * 0.68, -s * 0.25, s * 1.36, s * 0.5);
    ctx.strokeStyle = pal.stamp;
    ctx.fillStyle = pal.stamp;
    ctx.lineWidth = 3;
    ctx.strokeRect(-s * 0.62, -s * 0.2, s * 1.24, s * 0.4);
    ctx.fillText('AUDIT', 0, 1);
    ctx.restore();
  }
  ctx.restore();
}

function drawPulses(ctx: CanvasRenderingContext2D, l: GridLayout, view: MapView, pal: Palette): void {
  for (const p of view.pulses) {
    const age = view.now - p.start;
    if (age < 0 || age > 1.2) continue;
    const k = age / 1.2;
    const half = l.cell * (0.5 + k * 1.2);
    ctx.strokeStyle = hexA(pal.brass, 0.8 * (1 - k));
    ctx.lineWidth = 2;
    ctx.strokeRect(l.cx[p.tile] - half, l.cy[p.tile] - half, half * 2, half * 2);
  }
}
