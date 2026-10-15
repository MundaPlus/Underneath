import { mulberry32 } from '../../engine/rng';
import type { MapState } from '../../engine/types';

/** Where each tile sits on the canvas. Shared by renderers. */
export interface GridLayout {
  cell: number;
  /** Size of the drawn world in CSS pixels. Larger than the view when cells hit the minimum size. */
  worldW: number;
  worldH: number;
  originX: number;
  originY: number;
  /** Tile centers in CSS pixels. Jittered when `jitter` > 0. */
  cx: Float32Array;
  cy: Float32Array;
}

/**
 * Fit the grid into the canvas and place tile centers. `jitter` is a fraction of a cell.
 * Cells never get smaller than `minCell`. Then the world is bigger than the view and the renderer pans.
 */
export function gridLayout(map: MapState, width: number, height: number, jitter = 0, pad = 12, minCell = 26): GridLayout {
  const cell = Math.max(minCell, Math.min((width - pad * 2) / map.width, (height - pad * 2) / map.height));
  const worldW = Math.max(width, cell * map.width + pad * 2);
  const worldH = Math.max(height, cell * map.height + pad * 2);
  const originX = (worldW - cell * map.width) / 2;
  const originY = (worldH - cell * map.height) / 2;
  const n = map.width * map.height;
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  const rnd = mulberry32(map.seed ^ 0x9e3779b9);
  for (let i = 0; i < n; i++) {
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const jx = i === map.start ? 0 : (rnd() - 0.5) * 2 * jitter * cell;
    const jy = i === map.start ? 0 : (rnd() - 0.5) * 2 * jitter * cell;
    cx[i] = originX + (x + 0.5) * cell + jx;
    cy[i] = originY + (y + 0.5) * cell + jy;
  }
  return { cell, worldW, worldH, originX, originY, cx, cy };
}

/** Nearest tile center within `maxDist` cells, or null. */
export function nearestTile(l: GridLayout, x: number, y: number, maxDist = 0.7): number | null {
  let best: number | null = null;
  let bestD = (maxDist * l.cell) ** 2;
  for (let i = 0; i < l.cx.length; i++) {
    const d = (l.cx[i] - x) ** 2 + (l.cy[i] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Set canvas backing size for the device pixel ratio and return a scaled 2D context. */
export function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, dpr: number): CanvasRenderingContext2D {
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Scroll offset of the view inside the world. The view starts centered on the start tile.
 * `pan` is the player's drag offset. It is clamped in place so it never drifts past the edges.
 */
export function viewOffset(l: GridLayout, start: number, w: number, h: number, pan: { x: number; y: number }): [number, number] {
  const clamp = (v: number, max: number): number => Math.min(Math.max(v, 0), Math.max(0, max));
  const baseX = l.cx[start] - w / 2;
  const baseY = l.cy[start] - h / 2;
  const ox = clamp(baseX + pan.x, l.worldW - w);
  const oy = clamp(baseY + pan.y, l.worldH - h);
  pan.x = ox - baseX;
  pan.y = oy - baseY;
  return [ox, oy];
}
