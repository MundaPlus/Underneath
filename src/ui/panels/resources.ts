import { fmt } from '../../engine/format';
import { h, setText, toggle } from '../dom';
import type { Panel, UiContext } from './context';

/** Top bar with each resource, its amount and its net rate. */
export function resourcesPanel(ctx: UiContext): Panel {
  const { game } = ctx;
  const items = game.content.resources.map((r) => {
    const amount = h('span', { class: 'res-amount' });
    const rate = h('span', { class: 'res-rate' });
    const el = h(
      'div',
      { class: 'res', style: `--c:${r.color}`, title: r.description ?? r.name },
      h('span', { class: 'res-icon', text: r.icon }),
      h('span', { class: 'res-body' }, h('span', { class: 'res-name', text: r.name }), amount, rate),
    );
    return { r, el, amount, rate };
  });
  const el = h('div', { class: 'resources' }, ...items.map((i) => i.el));
  return {
    el,
    update() {
      for (const i of items) {
        const isPrestige = i.r.id === game.content.prestige.currency;
        const have = game.state.res[i.r.id] ?? 0;
        toggle(i.el, 'hidden', isPrestige && have === 0 && game.state.prestiges === 0);
        setText(i.amount, fmt(have));
        const net = game.rates.net[i.r.id] ?? 0;
        setText(i.rate, isPrestige ? `+${Math.round((game.mods.prestigeMult - 1) * 100)}% prod.` : `${net >= 0 ? '+' : ''}${fmt(net)}/s`);
        toggle(i.rate, 'negative', net < 0);
      }
    },
  };
}
