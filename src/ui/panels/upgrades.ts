import { h, setText, toggle } from '../dom';
import { fillCost, type Panel, type UiContext } from './context';

/** Grid of one-time upgrades. Shows only unlocked, not yet bought ones, cheapest first. */
export function upgradesPanel(ctx: UiContext): Panel {
  const { game } = ctx;
  const c = game.content;
  const grid = h('div', { class: 'upg-grid' });
  const empty = h('p', { class: 'muted small', text: 'Nothing to learn yet. Keep growing.' });
  const bought = h('p', { class: 'muted small' });

  const cards = new Map(
    c.upgrades.map((u) => {
      const cost = h('span', { class: 'cost' });
      const card = h(
        'button',
        { class: 'upg', onclick: () => game.buyUpgrade(u.id) },
        h('span', { class: 'upg-icon', text: u.icon }),
        h(
          'span',
          { class: 'upg-main' },
          h('span', { class: 'upg-name', text: u.name }),
          h('span', { class: 'upg-desc', text: u.description }),
          u.flavor ? h('span', { class: 'upg-flavor', text: u.flavor }) : null,
          cost,
        ),
      );
      return [u.id, { u, card, cost }] as const;
    }),
  );

  const total = (a: Record<string, number>): number => Object.values(a).reduce((x, y) => x + y, 0);
  const sorted = [...cards.values()].sort((a, b) => total(a.u.cost) - total(b.u.cost));
  for (const x of sorted) grid.append(x.card);

  const el = h('section', { class: 'panel upgs' }, grid, empty, bought);

  return {
    el,
    update() {
      let shown = 0;
      for (const x of sorted) {
        const vis = game.upgradeVisible(x.u);
        toggle(x.card, 'hidden', !vis);
        if (!vis) continue;
        shown++;
        toggle(x.card, 'affordable', game.canAfford(x.u.cost));
        fillCost(ctx, x.cost, x.u.cost);
      }
      toggle(empty, 'hidden', shown > 0);
      const n = Object.keys(game.state.upgrades).length;
      setText(bought, n ? `${n} of ${c.upgrades.length} learned.` : '');
    },
  };
}
