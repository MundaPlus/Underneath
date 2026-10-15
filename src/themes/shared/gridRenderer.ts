import type { MapRenderer, MapView } from '../types';
import { fitCanvas, gridLayout, nearestTile, viewOffset, type GridLayout } from './layout';

/**
 * Plain square-grid renderer. A new theme can use it until it has its own look.
 * Colors come from terrain definitions and CSS variables.
 */
export function createGridRenderer(canvas: HTMLCanvasElement): MapRenderer {
  let ctx = canvas.getContext('2d')!;
  let w = 0;
  let h = 0;
  let layout: GridLayout | null = null;
  let seed = -1;
  let ox = 0;
  let oy = 0;

  return {
    resize(width, height, dpr) {
      w = width;
      h = height;
      ctx = fitCanvas(canvas, w, h, dpr);
      layout = null;
    },
    hitTest(x, y) {
      return layout ? nearestTile(layout, x + ox, y + oy, 0.5) : null;
    },
    render(view: MapView) {
      const map = view.game.state.map;
      if (!layout || seed !== map.seed) {
        layout = gridLayout(map, w, h);
        seed = map.seed;
      }
      const css = getComputedStyle(canvas);
      const accent = css.getPropertyValue('--accent').trim() || '#fff';
      ctx.clearRect(0, 0, w, h);
      [ox, oy] = viewOffset(layout, map.start, w, h, view.pan);
      ctx.save();
      ctx.translate(-ox, -oy);
      const s = layout.cell;
      for (let i = 0; i < map.tiles.length; i++) {
        const t = map.tiles[i];
        const def = view.game.terrain(t.terrain);
        const x = layout.cx[i] - s / 2;
        const y = layout.cy[i] - s / 2;
        ctx.fillStyle = def?.color ?? '#333';
        ctx.globalAlpha = t.claimed ? 1 : view.claimable.has(i) ? 0.6 : 0.25;
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        ctx.globalAlpha = 1;
        if (t.claimed || i === view.hover) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = i === view.hover ? 2 : 1;
          ctx.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
        } else if (view.affordable.has(i)) {
          ctx.strokeStyle = accent;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
          ctx.setLineDash([]);
        }
      }
      for (const p of view.pulses) {
        const age = view.now - p.start;
        ctx.strokeStyle = accent;
        ctx.globalAlpha = Math.max(0, 1 - age);
        ctx.beginPath();
        ctx.arc(layout.cx[p.tile], layout.cy[p.tile], s * (0.3 + age), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },
  };
}
