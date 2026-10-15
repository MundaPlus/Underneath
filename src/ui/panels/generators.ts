import { fmt } from '../../engine/format';
import { h, setText, toggle } from '../dom';
import { describeCondition, fillCost, type Panel, type UiContext } from './context';

/** List of generators with buy buttons. */
export function generatorsPanel(ctx: UiContext): Panel {
  const { game } = ctx;
  const c = game.content;
  const list = h('div', { class: 'gen-list' });

  const rows = c.generators.map((g) => {
    const count = h('span', { class: 'gen-count' });
    const rate = h('span', { class: 'gen-rate' });
    const cost = h('span', { class: 'cost' });
    const qty = h('span', { class: 'gen-qty' });
    const row = h(
      'button',
      {
        class: 'gen',
        onclick: () => game.buyGen(g.id, ctx.buyAmount()),
        title: g.description,
      },
      h('span', { class: 'gen-icon', text: g.icon }),
      h(
        'span',
        { class: 'gen-main' },
        h('span', { class: 'gen-name' }, g.name, ' ', qty),
        h('span', { class: 'gen-desc', text: g.description }),
        h('span', { class: 'gen-foot' }, cost, rate),
      ),
      count,
    );
    list.append(row);
    return { g, row, count, rate, cost, qty };
  });

  const el = h('section', { class: 'panel gens' }, h('h2', { text: c.strings.generators }), list);

  return {
    el,
    update() {
      let lockedShown = false;
      for (const x of rows) {
        const unlocked = game.isUnlocked(x.g.unlock);
        const owned = game.state.gens[x.g.id] ?? 0;
        // Show unlocked generators, plus the next locked one as a teaser.
        const show = unlocked || owned > 0 || !lockedShown;
        if (!unlocked && owned === 0) lockedShown = true;
        toggle(x.row, 'hidden', !show);
        toggle(x.row, 'locked', !unlocked);
        if (!show) continue;

        const amt = ctx.buyAmount();
        const n = amt === 'max' ? Math.max(1, game.maxAffordable(x.g.id)) : amt;
        const cost = game.genCost(x.g.id, n);
        const can = unlocked && game.canAfford(cost);
        toggle(x.row, 'affordable', can);
        x.row.disabled = !unlocked;
        setText(x.count, owned ? fmt(owned, 0) : '');
        setText(x.qty, n > 1 ? `×${n}` : '');
        fillCost(ctx, x.cost, cost);

        const per = game.rates.perGen[x.g.id] ?? {};
        const eff = game.rates.genEff[x.g.id] ?? 1;
        const parts = Object.entries(per).map(([r, v]) => {
          const def = c.resources.find((d) => d.id === r)!;
          return `${def.icon} ${fmt(v * eff * Math.max(owned, 1))}/s${owned ? '' : ' each'}`;
        });
        setText(x.rate, unlocked ? parts.join('  ') : describeCondition(ctx, x.g.unlock));
        if (!unlocked) setText(x.cost, '');
      }
    },
  };
}
