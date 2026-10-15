import { checkCondition, claimedCount } from './conditions';
import { generateMap, isClaimable } from './map';
import { randomSeed } from './rng';
import type {
  Amounts,
  BalanceZone,
  CyclePhase,
  Effect,
  GameState,
  GeneratorDef,
  ThemeContent,
  TerrainDef,
  UpgradeDef,
} from './types';

export const SAVE_VERSION = 1;
const BASE_OFFLINE_CAP_HOURS = 8;

/** All effects folded together. Rebuilt when something is bought or claimed. */
export interface Modifiers {
  genMult: Record<string, number>;
  resMult: Record<string, number>;
  global: number;
  clickMult: Record<string, number>;
  clickRate: Record<string, number>;
  tileCost: number;
  terrainMult: Record<string, number>;
  stability: number;
  genCost: Record<string, number>;
  startRes: Amounts;
  prestigeGain: number;
  offlineCapHours: number;
  /** Additive production bonus per resource from claimed tiles. Key '*' applies to all. */
  terrainBonus: Record<string, number>;
  prestigeMult: number;
}

export interface Rates {
  /** Production per second after all multipliers. */
  prod: Amounts;
  /** Upkeep per second actually paid. */
  cons: Amounts;
  net: Amounts;
  /** Balance before stability, -1..1. */
  rawBalance: number;
  /** Balance after stability, -1..1. */
  balance: number;
  zone: BalanceZone;
  /** Current cycle phase, or null when the theme has no cycle. */
  phase: CyclePhase | null;
  /** Per generator: production per unit per second of each resource. */
  perGen: Record<string, Amounts>;
  /** Per generator efficiency 0..1 (upkeep shortfall). */
  genEff: Record<string, number>;
}

export type GameEvent =
  | { type: 'log'; text: string }
  | { type: 'claim'; tile: number }
  | { type: 'buy'; kind: 'gen' | 'upgrade' | 'prestigeUpgrade'; id: string }
  | { type: 'prestige'; gain: number }
  | { type: 'zone'; zone: BalanceZone }
  | { type: 'phase'; phase: CyclePhase };

export type BuyAmount = number | 'max';

export class Game {
  readonly content: ThemeContent;
  state: GameState;
  mods!: Modifiers;
  rates!: Rates;

  private terrainById: Map<string, TerrainDef>;
  private genById: Map<string, GeneratorDef>;
  private upgradeById: Map<string, UpgradeDef>;
  private listeners: ((e: GameEvent) => void)[] = [];
  private storyTimer = 0;

  constructor(content: ThemeContent, themeId: string, state?: GameState) {
    this.content = content;
    this.terrainById = new Map(content.terrains.map((t) => [t.id, t]));
    this.genById = new Map(content.generators.map((g) => [g.id, g]));
    this.upgradeById = new Map(content.upgrades.map((u) => [u.id, u]));
    this.state = state ?? this.newState(themeId);
    this.refresh();
  }

  /* ---------- setup ---------- */

  private newState(themeId: string): GameState {
    const c = this.content;
    const s: GameState = {
      version: SAVE_VERSION,
      themeId,
      time: 0,
      runTime: 0,
      res: {},
      earned: {},
      lifetime: {},
      gens: {},
      upgrades: {},
      prestigeUpgrades: {},
      prestiges: 0,
      map: generateMap(c.map, c.terrains, randomSeed()),
      seenStory: {},
      log: [],
      clicks: 0,
      lastSaved: Date.now(),
    };
    for (const r of c.resources) {
      s.res[r.id] = r.start ?? 0;
      s.earned[r.id] = 0;
      s.lifetime[r.id] = 0;
    }
    return s;
  }

  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private emit(e: GameEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /** Rebuild modifiers and rates. Call after any purchase or claim. */
  refresh(): void {
    this.mods = this.computeModifiers();
    this.rates = this.computeRates(0);
  }

  /* ---------- modifiers ---------- */

  private computeModifiers(): Modifiers {
    const c = this.content;
    const s = this.state;
    const m: Modifiers = {
      genMult: {},
      resMult: {},
      global: 1,
      clickMult: {},
      clickRate: {},
      tileCost: 1,
      terrainMult: {},
      stability: 0,
      genCost: {},
      startRes: {},
      prestigeGain: 1,
      offlineCapHours: BASE_OFFLINE_CAP_HOURS,
      terrainBonus: {},
      prestigeMult: 1,
    };

    const apply = (e: Effect, times = 1): void => {
      switch (e.type) {
        case 'genMult':
          m.genMult[e.gen] = (m.genMult[e.gen] ?? 1) * e.mult ** times;
          break;
        case 'resMult':
          m.resMult[e.res] = (m.resMult[e.res] ?? 1) * e.mult ** times;
          break;
        case 'globalMult':
          m.global *= e.mult ** times;
          break;
        case 'clickMult':
          m.clickMult[e.click] = (m.clickMult[e.click] ?? 1) * e.mult ** times;
          break;
        case 'clickRate':
          m.clickRate[e.click] = (m.clickRate[e.click] ?? 0) + e.add * times;
          break;
        case 'tileCostMult':
          m.tileCost *= e.mult ** times;
          break;
        case 'terrainMult':
          m.terrainMult[e.terrain] = (m.terrainMult[e.terrain] ?? 1) * e.mult ** times;
          break;
        case 'stability':
          m.stability += e.add * times;
          break;
        case 'genCostMult':
          m.genCost[e.gen] = (m.genCost[e.gen] ?? 1) * e.mult ** times;
          break;
        case 'startRes':
          m.startRes[e.res] = (m.startRes[e.res] ?? 0) + e.amount * times;
          break;
        case 'prestigeGainMult':
          m.prestigeGain *= e.mult ** times;
          break;
        case 'offlineCapHours':
          m.offlineCapHours += e.add * times;
          break;
      }
    };

    for (const u of c.upgrades) if (s.upgrades[u.id]) u.effects.forEach((e) => apply(e));
    for (const p of c.prestige.upgrades) {
      const lvl = s.prestigeUpgrades[p.id] ?? 0;
      if (lvl > 0) p.effects.forEach((e) => apply(e, lvl));
    }
    m.stability = Math.min(m.stability, c.balance.maxStability);

    let tiles = 0;
    for (const t of s.map.tiles) {
      if (!t.claimed) continue;
      tiles++;
      const def = this.terrainById.get(t.terrain);
      if (!def) continue;
      const tm = m.terrainMult[def.id] ?? 1;
      for (const [r, v] of Object.entries(def.bonus)) {
        m.terrainBonus[r] = (m.terrainBonus[r] ?? 0) + (v ?? 0) * tm;
      }
    }
    m.terrainBonus['*'] = (m.terrainBonus['*'] ?? 0) + tiles * c.map.perTileGlobal;

    m.prestigeMult = 1 + (s.res[c.prestige.currency] ?? 0) * c.prestige.bonusPerPoint;
    return m;
  }

  /** Total multiplier on a resource, without the balance zone. */
  resourceMult(res: string): number {
    const m = this.mods;
    const tb = 1 + (m.terrainBonus[res] ?? 0) + (m.terrainBonus['*'] ?? 0);
    return (m.resMult[res] ?? 1) * tb * m.global * m.prestigeMult;
  }

  /* ---------- rates ---------- */

  /**
   * Compute production rates. `dt` is used only to judge upkeep shortfall:
   * a generator slows down when its upkeep for `dt` is more than the stock plus income.
   */
  private computeRates(dt: number): Rates {
    const c = this.content;
    const s = this.state;
    const prod: Amounts = {};
    const cons: Amounts = {};
    const perGen: Record<string, Amounts> = {};
    const genEff: Record<string, number> = {};

    const resMult: Record<string, number> = {};
    for (const r of c.resources) {
      resMult[r.id] = this.resourceMult(r.id);
      prod[r.id] = 0;
      cons[r.id] = 0;
    }

    // Pass 1: production without balance zone, to find the balance.
    for (const g of c.generators) {
      const n = s.gens[g.id] ?? 0;
      const gm = this.mods.genMult[g.id] ?? 1;
      const per: Amounts = {};
      for (const [r, v] of Object.entries(g.produces)) per[r] = v * gm * (resMult[r] ?? 1);
      perGen[g.id] = per;
      genEff[g.id] = 1;
      if (n === 0) continue;
      for (const [r, v] of Object.entries(per)) prod[r] += v * n;
    }

    const { left, right } = c.balance;
    const L = prod[left] ?? 0;
    const R = prod[right] ?? 0;
    const rawBalance = L + R > 0 ? (R - L) / (L + R) : 0;
    const balance = rawBalance * (1 - this.mods.stability);
    const zone = this.zoneFor(balance);

    // Apply zone and cycle multipliers.
    const phase = this.cycle()?.phase ?? null;
    for (const g of c.generators) {
      const per = perGen[g.id];
      for (const r of Object.keys(per)) per[r] *= (zone.mult[r] ?? 1) * (phase ? (phase.mult[r] ?? phase.mult['*'] ?? 1) : 1);
    }

    // Pass 2: upkeep. Efficiency per generator = worst ratio over its upkeep resources.
    const need: Amounts = {};
    for (const g of c.generators) {
      const n = s.gens[g.id] ?? 0;
      if (!g.consumes || n === 0) continue;
      for (const [r, v] of Object.entries(g.consumes)) need[r] = (need[r] ?? 0) + v * n;
    }
    for (const r of c.resources) prod[r.id] = 0;
    for (const g of c.generators) {
      const n = s.gens[g.id] ?? 0;
      if (n === 0) continue;
      let eff = 1;
      if (g.consumes) {
        for (const r of Object.keys(g.consumes)) {
          const want = need[r] * Math.max(dt, 1e-9);
          // Income from generators without upkeep is known, use it to cover upkeep.
          const have = (s.res[r] ?? 0) + this.freeIncome(r, perGen) * Math.max(dt, 1e-9);
          eff = Math.min(eff, dt > 0 ? Math.min(1, have / want) : 1);
        }
      }
      genEff[g.id] = eff;
      for (const [r, v] of Object.entries(perGen[g.id])) prod[r] += v * n * eff;
      if (g.consumes) for (const [r, v] of Object.entries(g.consumes)) cons[r] += v * n * eff;
    }

    const net: Amounts = {};
    for (const r of c.resources) net[r.id] = prod[r.id] - cons[r.id];
    return { prod, cons, net, rawBalance, balance, zone, phase, perGen, genEff };
  }

  private freeIncome(res: string, perGen: Record<string, Amounts>): number {
    let sum = 0;
    for (const g of this.content.generators) {
      if (g.consumes) continue;
      sum += (perGen[g.id][res] ?? 0) * (this.state.gens[g.id] ?? 0);
    }
    return sum;
  }

  /** Where the game is in its time cycle, or null when the theme has none. */
  cycle(): { phase: CyclePhase; progress: number; phaseLeft: number } | null {
    const cy = this.content.cycle;
    if (!cy) return null;
    const progress = (this.state.time % cy.period) / cy.period;
    const phase = cy.phases.find((p) => progress >= p.from && progress < p.to) ?? cy.phases[cy.phases.length - 1];
    return { phase, progress, phaseLeft: (phase.to - progress) * cy.period };
  }

  zoneFor(balance: number): BalanceZone {
    const zones = this.content.balance.zones;
    for (const z of zones) if (balance >= z.from && balance < z.to) return z;
    return balance < 0 ? zones[0] : zones[zones.length - 1];
  }

  /* ---------- time ---------- */

  tick(dt: number): void {
    if (dt <= 0) return;
    const s = this.state;
    const prevZone = this.rates.zone.id;
    const prevPhase = this.rates.phase?.id;
    this.rates = this.computeRates(dt);
    for (const r of this.content.resources) {
      const gain = this.rates.prod[r.id] * dt;
      s.res[r.id] = Math.max(0, s.res[r.id] + gain - this.rates.cons[r.id] * dt);
      this.addEarned(r.id, gain);
    }
    s.time += dt;
    s.runTime += dt;
    if (this.rates.zone.id !== prevZone) this.emit({ type: 'zone', zone: this.rates.zone });
    if (this.rates.phase && this.rates.phase.id !== prevPhase) this.emit({ type: 'phase', phase: this.rates.phase });

    this.storyTimer += dt;
    if (this.storyTimer >= 1) {
      this.storyTimer = 0;
      this.checkStory();
    }
  }

  private addEarned(res: string, amount: number): void {
    if (amount <= 0) return;
    this.state.earned[res] = (this.state.earned[res] ?? 0) + amount;
    this.state.lifetime[res] = (this.state.lifetime[res] ?? 0) + amount;
  }

  /**
   * Run the game forward by `seconds` of offline time, capped by the offline limit.
   * Returns resources gained and the seconds actually simulated.
   */
  simulateOffline(seconds: number): { gained: Amounts; seconds: number } {
    const capped = Math.min(seconds, this.mods.offlineCapHours * 3600);
    const before = { ...this.state.res };
    const steps = Math.min(2000, Math.max(1, Math.ceil(capped / 5)));
    const dt = capped / steps;
    for (let i = 0; i < steps; i++) this.tick(dt);
    const gained: Amounts = {};
    for (const r of this.content.resources) gained[r.id] = this.state.res[r.id] - (before[r.id] ?? 0);
    return { gained, seconds: capped };
  }

  private checkStory(): void {
    for (const ev of this.content.story) {
      if (this.state.seenStory[ev.id]) continue;
      if (checkCondition(this.state, ev.when)) {
        this.state.seenStory[ev.id] = true;
        this.log(ev.text);
      }
    }
  }

  log(text: string): void {
    this.state.log.unshift({ t: this.state.time, text });
    if (this.state.log.length > 60) this.state.log.length = 60;
    this.emit({ type: 'log', text });
  }

  /* ---------- clicks ---------- */

  clickGain(id: string): number {
    const def = this.content.clicks.find((c) => c.id === id);
    if (!def) return 0;
    const frac = def.rateFraction + (this.mods.clickRate[id] ?? 0);
    const base = def.base * this.resourceMult(def.res);
    return (base + Math.max(0, this.rates.prod[def.res]) * frac) * (this.mods.clickMult[id] ?? 1);
  }

  click(id: string): number {
    const def = this.content.clicks.find((c) => c.id === id);
    if (!def) return 0;
    const gain = this.clickGain(id);
    this.state.res[def.res] += gain;
    this.addEarned(def.res, gain);
    this.state.clicks++;
    return gain;
  }

  /* ---------- generators ---------- */

  isUnlocked(cond: GeneratorDef['unlock']): boolean {
    return checkCondition(this.state, cond);
  }

  /** Cost of buying `n` units of a generator from the current count. */
  genCost(id: string, n: number): Amounts {
    const g = this.genById.get(id)!;
    const k = this.state.gens[id] ?? 0;
    const r = g.costGrowth;
    const mult = this.mods.genCost[id] ?? 1;
    const factor = r === 1 ? n : (r ** k * (r ** n - 1)) / (r - 1);
    const out: Amounts = {};
    for (const [res, base] of Object.entries(g.baseCost)) out[res] = base * factor * mult;
    return out;
  }

  /** Largest number of units the player can buy now. */
  maxAffordable(id: string): number {
    const g = this.genById.get(id)!;
    const k = this.state.gens[id] ?? 0;
    const r = g.costGrowth;
    const mult = this.mods.genCost[id] ?? 1;
    let best = Infinity;
    for (const [res, base] of Object.entries(g.baseCost)) {
      const have = this.state.res[res] ?? 0;
      const first = base * mult * r ** k;
      const n = Math.floor(Math.log((have * (r - 1)) / first + 1) / Math.log(r));
      best = Math.min(best, n);
    }
    return Math.max(0, isFinite(best) ? best : 0);
  }

  canAfford(cost: Amounts): boolean {
    return Object.entries(cost).every(([r, v]) => (this.state.res[r] ?? 0) >= v - 1e-9);
  }

  private pay(cost: Amounts): void {
    for (const [r, v] of Object.entries(cost)) this.state.res[r] = Math.max(0, this.state.res[r] - v);
  }

  buyGen(id: string, amount: BuyAmount = 1): number {
    const g = this.genById.get(id);
    if (!g || !this.isUnlocked(g.unlock)) return 0;
    const n = amount === 'max' ? this.maxAffordable(id) : amount;
    if (n <= 0) return 0;
    const cost = this.genCost(id, n);
    if (!this.canAfford(cost)) return 0;
    this.pay(cost);
    this.state.gens[id] = (this.state.gens[id] ?? 0) + n;
    this.refresh();
    this.emit({ type: 'buy', kind: 'gen', id });
    return n;
  }

  /* ---------- upgrades ---------- */

  upgradeVisible(u: UpgradeDef): boolean {
    return !this.state.upgrades[u.id] && checkCondition(this.state, u.unlock);
  }

  buyUpgrade(id: string): boolean {
    const u = this.upgradeById.get(id);
    if (!u || !this.upgradeVisible(u) || !this.canAfford(u.cost)) return false;
    this.pay(u.cost);
    this.state.upgrades[id] = true;
    this.refresh();
    this.emit({ type: 'buy', kind: 'upgrade', id });
    return true;
  }

  /* ---------- map ---------- */

  terrain(id: string): TerrainDef | undefined {
    return this.terrainById.get(id);
  }

  canClaim(i: number): boolean {
    return isClaimable(this.state.map, i, this.terrainById);
  }

  claimCost(i: number): number {
    const m = this.content.map;
    const t = this.terrainById.get(this.state.map.tiles[i].terrain);
    const n = claimedCount(this.state);
    return m.claimBase * m.claimGrowth ** (n - 1) * (t?.costMult ?? 1) * this.mods.tileCost;
  }

  claimTile(i: number): boolean {
    if (!this.canClaim(i)) return false;
    const cost = this.claimCost(i);
    const res = this.content.map.claimRes;
    if ((this.state.res[res] ?? 0) < cost) return false;
    this.state.res[res] -= cost;
    const tile = this.state.map.tiles[i];
    tile.claimed = true;
    tile.claimedAt = this.state.time;
    this.refresh();
    this.emit({ type: 'claim', tile: i });
    return true;
  }

  /* ---------- prestige ---------- */

  prestigeGain(): number {
    const p = this.content.prestige;
    const total = p.counts.reduce((sum, r) => sum + (this.state.earned[r] ?? 0), 0);
    return Math.floor((total / p.divisor) ** p.exponent * this.mods.prestigeGain);
  }

  /** Earned total needed for the next prestige point. */
  nextPrestigeAt(): number {
    const p = this.content.prestige;
    const next = this.prestigeGain() + 1;
    return (next / this.mods.prestigeGain) ** (1 / p.exponent) * p.divisor;
  }

  prestige(): number {
    const gain = this.prestigeGain();
    if (gain < 1) return 0;
    const c = this.content;
    const s = this.state;
    const cur = c.prestige.currency;
    const keep = (s.res[cur] ?? 0) + gain;

    s.prestiges++;
    s.runTime = 0;
    s.gens = {};
    s.upgrades = {};
    s.seenStory = Object.fromEntries(
      Object.entries(s.seenStory).filter(([id]) => c.story.find((e) => e.id === id)?.when.prestiges !== undefined),
    );
    s.map = generateMap(c.map, c.terrains, randomSeed());
    for (const r of c.resources) {
      s.res[r.id] = r.start ?? 0;
      s.earned[r.id] = 0;
    }
    s.res[cur] = keep;
    s.lifetime[cur] = (s.lifetime[cur] ?? 0) + gain;
    this.refresh();
    for (const [r, v] of Object.entries(this.mods.startRes)) s.res[r] += v;
    this.emit({ type: 'prestige', gain });
    return gain;
  }

  prestigeUpgradeCost(id: string): number {
    const p = this.content.prestige.upgrades.find((u) => u.id === id)!;
    const lvl = this.state.prestigeUpgrades[id] ?? 0;
    return (p.cost[this.content.prestige.currency] ?? 0) * (p.costGrowth ?? 1) ** lvl;
  }

  buyPrestigeUpgrade(id: string): boolean {
    const p = this.content.prestige.upgrades.find((u) => u.id === id);
    if (!p || !checkCondition(this.state, p.unlock)) return false;
    const lvl = this.state.prestigeUpgrades[id] ?? 0;
    if (p.maxLevel !== undefined && lvl >= p.maxLevel) return false;
    const cost = this.prestigeUpgradeCost(id);
    const cur = this.content.prestige.currency;
    if ((this.state.res[cur] ?? 0) < cost) return false;
    this.state.res[cur] -= cost;
    this.state.prestigeUpgrades[id] = lvl + 1;
    this.refresh();
    this.emit({ type: 'buy', kind: 'prestigeUpgrade', id });
    return true;
  }
}
