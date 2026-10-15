import { fmt, fmtPct } from '../../engine/format';
import { floatText, h, setText } from '../dom';
import type { Panel, UiContext } from './context';

/** Click buttons and the dual-resource balance meter. */
export function actionsPanel(ctx: UiContext): Panel {
  const { game } = ctx;
  const c = game.content;

  const buttons = c.clicks.map((def) => {
    const res = c.resources.find((r) => r.id === def.res)!;
    const gain = h('span', { class: 'click-gain' });
    const btn = h(
      'button',
      {
        class: 'click-btn',
        style: `--c:${res.color}`,
        onclick: (e: Event) => {
          const got = game.click(def.id);
          const me = e as MouseEvent;
          const rect = btn.getBoundingClientRect();
          const x = me.clientX || rect.left + rect.width / 2;
          const y = me.clientY || rect.top;
          floatText(x, y, `+${fmt(got)}`, res.color);
          btn.classList.remove('pop');
          void btn.offsetWidth;
          btn.classList.add('pop');
        },
      },
      h('span', { class: 'click-icon', text: def.icon }),
      h('span', { class: 'click-label', text: def.label }),
      gain,
    );
    return { def, btn, gain };
  });

  const b = c.balance;
  const marker = h('div', { class: 'balance-marker' });
  const rawMarker = h('div', { class: 'balance-raw' });
  const track = h(
    'div',
    { class: 'balance-track' },
    ...b.zones.map((z) => {
      const from = Math.max(z.from, -1);
      const to = Math.min(z.to, 1);
      const seg = h('div', { class: 'balance-seg', title: `${z.name}: ${z.description}` });
      seg.style.left = `${((from + 1) / 2) * 100}%`;
      seg.style.width = `${((to - from) / 2) * 100}%`;
      seg.style.background = z.color;
      return seg;
    }),
    rawMarker,
    marker,
  );
  const zoneName = h('strong', { class: 'zone-name' });
  const zoneDesc = h('span', { class: 'zone-desc' });
  const stability = h('span', { class: 'stability' });

  const el = h(
    'section',
    { class: 'panel actions' },
    h('div', { class: 'click-row' }, ...buttons.map((x) => x.btn)),
    h(
      'div',
      { class: 'balance' },
      h(
        'div',
        { class: 'balance-head' },
        h('span', { class: 'balance-side left', text: `◀ ${b.leftLabel}` }),
        h('span', { class: 'balance-title', text: b.title }),
        h('span', { class: 'balance-side right', text: `${b.rightLabel} ▶` }),
      ),
      track,
      h('div', { class: 'balance-info' }, zoneName, zoneDesc, stability),
    ),
  );

  return {
    el,
    update() {
      for (const x of buttons) setText(x.gain, `+${fmt(game.clickGain(x.def.id))}`);
      const r = game.rates;
      marker.style.left = `${((r.balance + 1) / 2) * 100}%`;
      rawMarker.style.left = `${((r.rawBalance + 1) / 2) * 100}%`;
      rawMarker.style.opacity = Math.abs(r.rawBalance - r.balance) > 0.01 ? '0.6' : '0';
      marker.style.setProperty('--zc', r.zone.color);
      setText(zoneName, r.zone.name);
      setText(zoneDesc, r.zone.description);
      setText(stability, game.mods.stability > 0 ? `Stability ${fmtPct(game.mods.stability)}` : '');
    },
  };
}
