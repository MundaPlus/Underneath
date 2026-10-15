import { claimedCount } from '../../engine/conditions';
import { fmt, fmtPct } from '../../engine/format';
import type { MapRenderer, MapView } from '../../themes/types';
import { floatText, h, setText } from '../dom';
import type { Panel, UiContext } from './context';

export interface MapPanel extends Panel {
  /** Draw one frame. Called from requestAnimationFrame. */
  render(now: number): void;
  /** Add a pulse effect on a tile (e.g. on click). */
  pulse(tile: number): void;
  destroy(): void;
}

/** Canvas host for the theme's map renderer. Handles input and the tooltip. */
export function mapPanel(ctx: UiContext): MapPanel {
  const { game } = ctx;
  const c = game.content;
  const claimRes = c.resources.find((r) => r.id === c.map.claimRes)!;

  const canvas = h('canvas', { class: 'map-canvas', 'aria-label': c.strings.map });
  const tip = h('div', { class: 'map-tip hidden', role: 'tooltip' });
  const wrap = h('div', { class: 'map-wrap' }, canvas, tip);
  const stats = h('span', { class: 'map-stats muted small' });
  const el = h(
    'section',
    { class: 'panel map' },
    h('div', { class: 'map-head' }, h('h2', { text: c.strings.map }), stats),
    wrap,
  );

  const renderer: MapRenderer = ctx.theme.createMapRenderer(canvas);
  const view: MapView = {
    game,
    now: 0,
    hover: null,
    pan: { x: 0, y: 0 },
    claimable: new Set(),
    affordable: new Set(),
    pulses: [],
  };

  const refreshSets = (): void => {
    view.claimable.clear();
    view.affordable.clear();
    const have = game.state.res[c.map.claimRes] ?? 0;
    for (let i = 0; i < game.state.map.tiles.length; i++) {
      if (!game.canClaim(i)) continue;
      view.claimable.add(i);
      if (game.claimCost(i) <= have) view.affordable.add(i);
    }
  };

  const showTip = (i: number | null, x: number, y: number): void => {
    if (i === null) {
      tip.classList.add('hidden');
      return;
    }
    const tile = game.state.map.tiles[i];
    const def = game.terrain(tile.terrain)!;
    let status: string;
    if (tile.claimed) status = 'Part of your network';
    else if (def.blocked) status = 'Blocked';
    else if (view.claimable.has(i)) status = `${c.strings.claim}: ${claimRes.icon} ${fmt(game.claimCost(i))}`;
    else status = 'Not connected yet';
    tip.innerHTML = '';
    tip.append(
      h('strong', { text: def.name }),
      h('span', { text: def.description }),
      h('span', { class: view.affordable.has(i) ? 'tip-ok' : 'tip-status', text: status }),
    );
    tip.classList.remove('hidden');
    const r = wrap.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 14), r.width - tip.offsetWidth - 8);
    const top = y + 14 + tip.offsetHeight > r.height ? y - tip.offsetHeight - 10 : y + 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  };

  const local = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // Drag to pan (only matters when the map is bigger than the view). A short tap still claims.
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  });
  canvas.addEventListener('pointerup', () => {
    setTimeout(() => (drag = null));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag && drag.id === e.pointerId && e.buttons) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (drag.moved || Math.hypot(dx, dy) > 6) {
        if (!drag.moved) canvas.setPointerCapture(e.pointerId);
        drag.moved = true;
        view.pan.x -= dx;
        view.pan.y -= dy;
        drag.x = e.clientX;
        drag.y = e.clientY;
        showTip(null, 0, 0);
        return;
      }
    }
    const [x, y] = local(e);
    view.hover = renderer.hitTest(x, y);
    canvas.style.cursor = view.hover !== null && view.claimable.has(view.hover) ? 'pointer' : 'default';
    if (e.pointerType === 'mouse') showTip(view.hover, x, y);
  });
  canvas.addEventListener('pointerleave', () => {
    view.hover = null;
    showTip(null, 0, 0);
  });
  canvas.addEventListener('click', (e) => {
    if (drag?.moved) return;
    const [x, y] = local(e as PointerEvent);
    const i = renderer.hitTest(x, y);
    if (i === null) return;
    if (view.claimable.has(i) && game.claimTile(i)) {
      view.pulses.push({ tile: i, start: performance.now() / 1000 });
      floatText(e.clientX, e.clientY, c.strings.claim, claimRes.color);
      refreshSets();
    }
    showTip(i, x, y);
  });

  const ro = new ResizeObserver(() => {
    const r = wrap.getBoundingClientRect();
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  });
  ro.observe(wrap);

  return {
    el,
    update() {
      refreshSets();
      const n = claimedCount(game.state);
      setText(stats, `${n} tiles · network +${fmtPct(n * c.map.perTileGlobal)}`);
    },
    render(now) {
      view.now = now;
      view.pulses = view.pulses.filter((p) => now - p.start < 2);
      renderer.render(view);
    },
    pulse(tile) {
      view.pulses.push({ tile, start: performance.now() / 1000 });
    },
    destroy() {
      ro.disconnect();
      renderer.destroy?.();
    },
  };
}
