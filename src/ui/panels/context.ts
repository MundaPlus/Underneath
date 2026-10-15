import type { Game } from '../../engine/game';
import type { Amounts } from '../../engine/types';
import type { ThemePack } from '../../themes/types';
import { fmt } from '../../engine/format';
import { h } from '../dom';

/** Shared things every panel needs. */
export interface UiContext {
  game: Game;
  theme: ThemePack;
  buyAmount: () => number | 'max';
  save: () => void;
  switchTheme: (id: string) => void;
  hardReset: () => void;
  replaceState: (text: string) => boolean;
}

export interface Panel {
  el: HTMLElement;
  update(): void;
}

/** Render a cost like "◆ 120  ● 40" with colors and an affordable state per resource. */
export function costNode(ctx: UiContext, cost: Amounts): HTMLElement {
  const wrap = h('span', { class: 'cost' });
  fillCost(ctx, wrap, cost);
  return wrap;
}

export function fillCost(ctx: UiContext, wrap: HTMLElement, cost: Amounts): void {
  const parts = Object.entries(cost).map(([r, v]) => {
    const def = ctx.game.content.resources.find((x) => x.id === r)!;
    const ok = (ctx.game.state.res[r] ?? 0) >= v;
    return `<span class="cost-part${ok ? '' : ' short'}" style="--c:${def.color}">${def.icon} ${fmt(v)}</span>`;
  });
  const html = parts.join(' ');
  if (wrap.innerHTML !== html) wrap.innerHTML = html;
}

/** Human text for an unlock condition, e.g. "Needs 5 Litter Digester". */
export function describeCondition(ctx: UiContext, cond: import('../../engine/types').Condition | undefined): string {
  if (!cond) return '';
  const c = ctx.game.content;
  const parts: string[] = [];
  if (cond.gen) parts.push(`${cond.gen.count} ${c.generators.find((g) => g.id === cond.gen!.id)?.name ?? cond.gen.id}`);
  if (cond.earned) parts.push(`${fmt(cond.earned.amount)} ${c.resources.find((r) => r.id === cond.earned!.id)?.name} earned`);
  if (cond.tiles !== undefined) parts.push(`${cond.tiles} tiles`);
  if (cond.terrain) parts.push(`${cond.terrain.count} ${c.terrains.find((t) => t.id === cond.terrain!.id)?.name} claimed`);
  if (cond.upgrade) parts.push(c.upgrades.find((u) => u.id === cond.upgrade)?.name ?? cond.upgrade);
  if (cond.prestiges !== undefined) parts.push(`${cond.prestiges} ${c.strings.prestige.toLowerCase()}`);
  return parts.length ? `Needs ${parts.join(', ')}` : '';
}
