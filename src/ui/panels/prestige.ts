import { fmt, fmtTime } from '../../engine/format';
import { h, setText, toggle } from '../dom';
import type { Panel, UiContext } from './context';
import { showModal } from './modal';

/** Prestige: reset button, gain preview and the permanent upgrade shop. */
export function prestigePanel(ctx: UiContext): Panel {
  const { game } = ctx;
  const c = game.content;
  const p = c.prestige;
  const cur = c.resources.find((r) => r.id === p.currency)!;

  const gain = h('strong', { class: 'prestige-gain' });
  const next = h('p', { class: 'muted small' });
  const have = h('p', {});
  const runInfo = h('p', { class: 'muted small' });
  const btn = h('button', {
    class: 'btn btn-primary prestige-btn',
    text: c.strings.prestigeAction,
    onclick: () => {
      const g = game.prestigeGain();
      if (g < 1) return;
      showModal(c.strings.prestige, `${c.strings.prestigeConfirm} You will gain ${fmt(g)} ${cur.name}.`, [
        { label: 'Not yet' },
        {
          label: c.strings.prestigeAction,
          primary: true,
          action: () => {
            game.prestige();
            ctx.save();
          },
        },
      ]);
    },
  });

  const shop = h('div', { class: 'upg-grid' });
  const rows = p.upgrades.map((u) => {
    const level = h('span', { class: 'upg-level' });
    const cost = h('span', { class: 'cost' });
    const card = h(
      'button',
      { class: 'upg', onclick: () => game.buyPrestigeUpgrade(u.id) },
      h('span', { class: 'upg-icon', text: u.icon }),
      h(
        'span',
        { class: 'upg-main' },
        h('span', { class: 'upg-name' }, u.name, ' ', level),
        h('span', { class: 'upg-desc', text: u.description }),
        cost,
      ),
    );
    shop.append(card);
    return { u, card, level, cost };
  });

  const el = h(
    'section',
    { class: 'panel prestige' },
    h('div', { class: 'prestige-box', style: `--c:${cur.color}` }, h('p', {}, 'Fruiting now gives ', gain), next, btn, runInfo),
    have,
    h('h3', { text: `${cur.name} shop` }),
    shop,
  );

  return {
    el,
    update() {
      const g = game.prestigeGain();
      setText(gain, `${cur.icon} ${fmt(g)} ${cur.name}`);
      const earned = p.counts.reduce((s, r) => s + (game.state.earned[r] ?? 0), 0);
      setText(next, `Next ${cur.name.toLowerCase().replace(/s$/, '')} at ${fmt(game.nextPrestigeAt())} total earned (now ${fmt(earned)}).`);
      btn.disabled = g < 1;
      setText(
        have,
        `You have ${fmt(game.state.res[p.currency] ?? 0)} ${cur.name}. Each unspent one gives +${Math.round(p.bonusPerPoint * 100)}% production.`,
      );
      setText(runInfo, `This run: ${fmtTime(game.state.runTime)}. ${c.strings.prestige} count: ${game.state.prestiges}.`);
      const bank = game.state.res[p.currency] ?? 0;
      for (const x of rows) {
        const lvl = game.state.prestigeUpgrades[x.u.id] ?? 0;
        const maxed = x.u.maxLevel !== undefined && lvl >= x.u.maxLevel;
        setText(x.level, x.u.maxLevel ? `${lvl}/${x.u.maxLevel}` : `${lvl}`);
        const cost = game.prestigeUpgradeCost(x.u.id);
        setText(x.cost, maxed ? 'Max' : `${cur.icon} ${fmt(cost)}`);
        toggle(x.card, 'affordable', !maxed && bank >= cost);
        toggle(x.card, 'maxed', maxed);
      }
    },
  };
}
