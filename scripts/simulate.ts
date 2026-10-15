/**
 * Headless pacing check. A simple bot plays a theme and reports milestones.
 * Usage: npm run sim -- [theme] [clicksPerSecond] [minutes]
 */
import { claimedCount } from '../src/engine/conditions';
import { Game } from '../src/engine/game';
import { fmt, fmtTime } from '../src/engine/format';
import type { ThemeContent } from '../src/engine/types';
import { clockworkContent } from '../src/themes/clockwork/content';
import { fungalContent } from '../src/themes/fungal/content';

const CONTENTS: Record<string, ThemeContent> = { fungal: fungalContent, clockwork: clockworkContent };

const themeId = process.argv[2] ?? 'fungal';
const cps = Number(process.argv[3] ?? 2);
const minutes = Number(process.argv[4] ?? 75);
const content = CONTENTS[themeId];
if (!content) throw new Error(`Unknown theme ${themeId}`);

const game = new Game(content, themeId);
const { left, right } = content.balance;
const milestones: string[] = [];
const seen = new Set<string>();
const mark = (key: string, text: string): void => {
  if (seen.has(key)) return;
  seen.add(key);
  milestones.push(`${fmtTime(game.state.runTime).padStart(8)}  ${text}`);
};

const DT = 0.5;
let zoneTime: Record<string, number> = {};

function botStep(): void {
  const s = game.state;
  // Clicks: feed the resource that is lower.
  const clicks = cps * DT;
  for (let i = 0; i < clicks; i++) {
    const want = (s.res[left] ?? 0) <= (s.res[right] ?? 0) ? content.clicks[0] : content.clicks[1];
    game.click(want.id);
  }

  // Upgrades: buy every affordable one, cheapest first.
  const ups = content.upgrades
    .filter((u) => game.upgradeVisible(u) && game.canAfford(u.cost))
    .sort((a, b) => total(a.cost) - total(b.cost));
  for (const u of ups) game.buyUpgrade(u.id);

  // Generators: buy on the weaker side of the balance, best rate per cost.
  for (let guard = 0; guard < 50; guard++) {
    const side = game.rates.rawBalance > 0 ? left : right;
    const best = bestGen(side) ?? bestGen(side === left ? right : left);
    if (!best || !game.buyGen(best, 1)) break;
  }

  // Map: claim the cheapest claimable tile when it costs at most 40% of the stock.
  for (let guard = 0; guard < 5; guard++) {
    let pick = -1;
    let pickCost = Infinity;
    for (let i = 0; i < s.map.tiles.length; i++) {
      if (!game.canClaim(i)) continue;
      const def = game.terrain(s.map.tiles[i].terrain)!;
      const value = 1 + Object.values(def.bonus).reduce<number>((a, b) => a + (b ?? 0), 0) * 5;
      const c = game.claimCost(i) / value;
      if (c < pickCost) {
        pickCost = c;
        pick = i;
      }
    }
    if (pick < 0) break;
    const cost = game.claimCost(pick);
    if (cost > s.res[content.map.claimRes] * 0.4) break;
    game.claimTile(pick);
  }
}

function bestGen(res: string): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const g of content.generators) {
    if (!game.isUnlocked(g.unlock) || !(res in g.produces)) continue;
    const cost = game.genCost(g.id, 1);
    if (!game.canAfford(cost)) continue;
    const score = (game.rates.perGen[g.id][res] ?? 0) / total(cost);
    if (score > bestScore) {
      bestScore = score;
      best = g.id;
    }
  }
  return best;
}

function total(a: Record<string, number>): number {
  return Object.values(a).reduce((x, y) => x + y, 0);
}

const steps = (minutes * 60) / DT;
for (let i = 0; i < steps; i++) {
  botStep();
  game.tick(DT);
  zoneTime[game.rates.zone.id] = (zoneTime[game.rates.zone.id] ?? 0) + DT;
  for (const g of content.generators) if ((game.state.gens[g.id] ?? 0) > 0) mark(`g:${g.id}`, `first ${g.name}`);
  for (const t of [5, 10, 20, 30, 40]) if (claimedCount(game.state) >= t) mark(`t:${t}`, `${t} tiles`);
  const gain = game.prestigeGain();
  for (const p of [1, 2, 5, 10]) if (gain >= p) mark(`p:${p}`, `prestige gain ${p}`);
  if (i % ((5 * 60) / DT) === 0 && i > 0) {
    const r = game.rates;
    milestones.push(
      `${fmtTime(game.state.runTime).padStart(8)}  -- ${left} ${fmt(game.state.res[left])} (+${fmt(r.net[left])}/s), ` +
        `${right} ${fmt(game.state.res[right])} (+${fmt(r.net[right])}/s), tiles ${claimedCount(game.state)}, ` +
        `zone ${r.zone.id}, gain ${gain}`,
    );
  }
}

console.log(`theme=${themeId} clicks/s=${cps} minutes=${minutes}`);
console.log(milestones.join('\n'));
console.log('zone time:', Object.fromEntries(Object.entries(zoneTime).map(([k, v]) => [k, fmtTime(v)])));
console.log('gens:', game.state.gens);
console.log('upgrades bought:', Object.keys(game.state.upgrades).length, '/', content.upgrades.length);
