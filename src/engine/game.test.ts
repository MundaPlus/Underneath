import { describe, expect, it } from 'vitest';
import { clockworkContent } from '../themes/clockwork/content';
import { fungalContent } from '../themes/fungal/content';
import { claimedCount } from './conditions';
import { fmt } from './format';
import { Game } from './game';
import { generateMap } from './map';
import { deserialize, serialize } from './save';
import type { ThemeContent } from './types';

/** Minimal theme for engine tests. */
function testContent(): ThemeContent {
  return {
    resources: [
      { id: 'a', name: 'A', icon: 'a', color: '#f00', start: 100 },
      { id: 'b', name: 'B', icon: 'b', color: '#0f0' },
      { id: 'p', name: 'P', icon: 'p', color: '#00f' },
    ],
    clicks: [{ id: 'ca', label: 'A', icon: 'a', res: 'a', base: 1, rateFraction: 0.1 }],
    generators: [
      { id: 'ga', name: 'GA', icon: '', description: '', baseCost: { a: 10 }, costGrowth: 1.5, produces: { a: 1 } },
      { id: 'gb', name: 'GB', icon: '', description: '', baseCost: { a: 10 }, costGrowth: 1.5, produces: { b: 1 } },
      {
        id: 'conv',
        name: 'Conv',
        icon: '',
        description: '',
        baseCost: { a: 1 },
        costGrowth: 1,
        produces: { b: 10 },
        consumes: { a: 5 },
      },
    ],
    upgrades: [
      { id: 'u1', name: 'U1', icon: '', description: '', cost: { a: 5 }, effects: [{ type: 'genMult', gen: 'ga', mult: 2 }] },
      { id: 'st', name: 'St', icon: '', description: '', cost: { a: 1 }, effects: [{ type: 'stability', add: 0.5 }] },
    ],
    terrains: [
      { id: 'o', name: 'O', description: '', weight: 0, costMult: 1, bonus: {}, color: '#000' },
      { id: 'g', name: 'G', description: '', weight: 1, costMult: 1, bonus: { a: 0.5 }, color: '#111' },
      { id: 'x', name: 'X', description: '', weight: 1, costMult: 1, bonus: {}, color: '#222', blocked: true },
    ],
    map: { width: 7, height: 5, startTerrain: 'o', claimRes: 'a', claimBase: 10, claimGrowth: 2, perTileGlobal: 0 },
    balance: {
      left: 'a',
      right: 'b',
      leftLabel: 'A',
      rightLabel: 'B',
      title: 'Bal',
      maxStability: 0.8,
      zones: [
        { id: 'left', name: 'L', description: '', from: -2, to: -0.3, mult: { a: 2 }, color: '' },
        { id: 'mid', name: 'M', description: '', from: -0.3, to: 0.3, mult: {}, color: '' },
        { id: 'right', name: 'R', description: '', from: 0.3, to: 2, mult: { b: 2 }, color: '' },
      ],
    },
    prestige: {
      currency: 'p',
      counts: ['a', 'b'],
      divisor: 100,
      exponent: 0.5,
      bonusPerPoint: 0.1,
      upgrades: [
        {
          id: 'pu',
          name: 'PU',
          icon: '',
          description: '',
          cost: { p: 1 },
          costGrowth: 2,
          maxLevel: 2,
          effects: [{ type: 'startRes', res: 'a', amount: 50 }],
        },
      ],
    },
    story: [{ id: 'first', when: {}, text: 'hello' }],
    strings: {
      generators: '',
      upgrades: '',
      map: '',
      prestige: '',
      prestigeAction: '',
      prestigeConfirm: '',
      log: '',
      claim: '',
      owned: '',
    },
  };
}

describe('generators', () => {
  it('uses geometric cost and max affordable', () => {
    const g = new Game(testContent(), 't');
    expect(g.genCost('ga', 1).a).toBeCloseTo(10);
    expect(g.genCost('ga', 3).a).toBeCloseTo(10 + 15 + 22.5);
    // 100 a: 10 + 15 + 22.5 + 33.75 = 81.25, next is 50.6 -> 4 units.
    expect(g.maxAffordable('ga')).toBe(4);
    expect(g.buyGen('ga', 'max')).toBe(4);
    expect(g.state.res.a).toBeCloseTo(18.75);
  });

  it('produces over time and applies upgrade multipliers', () => {
    const g = new Game(testContent(), 't');
    g.buyGen('ga', 1);
    g.tick(10);
    expect(g.state.res.a).toBeCloseTo(90 + 10 * 2, 5); // zone 'left' doubles a
    g.buyUpgrade('u1');
    expect(g.rates.prod.a).toBeCloseTo(4);
  });

  it('slows generators when upkeep is short', () => {
    const c = testContent();
    c.resources[0].start = 3;
    const g = new Game(c, 't');
    g.buyGen('conv', 1);
    g.state.res.a = 2;
    g.tick(1);
    expect(g.rates.genEff.conv).toBeCloseTo(2 / 5);
    expect(g.state.res.a).toBeCloseTo(0);
  });
});

describe('balance', () => {
  it('picks zones from production ratio and stability narrows it', () => {
    const g = new Game(testContent(), 't');
    g.buyGen('gb', 1);
    expect(g.rates.rawBalance).toBe(1);
    expect(g.rates.zone.id).toBe('right');
    g.buyGen('ga', 1);
    expect(g.rates.zone.id).toBe('mid');
    g.state.gens.gb = 4; // raw = 3/5 = 0.6
    g.refresh();
    expect(g.rates.zone.id).toBe('right');
    g.buyUpgrade('st'); // 0.6 * 0.5 = 0.3 -> still right edge
    g.state.gens.gb = 3; // raw 0.5 -> 0.25
    g.refresh();
    expect(g.rates.balance).toBeCloseTo(0.25);
    expect(g.rates.zone.id).toBe('mid');
  });
});

describe('map', () => {
  it('generates the same map for the same seed, with an open start', () => {
    const c = testContent();
    const m1 = generateMap(c.map, c.terrains, 42);
    const m2 = generateMap(c.map, c.terrains, 42);
    expect(m1.tiles.map((t) => t.terrain)).toEqual(m2.tiles.map((t) => t.terrain));
    expect(m1.tiles[m1.start].claimed).toBe(true);
    expect(m1.tiles[m1.start].terrain).toBe('o');
  });

  it('claims only neighbors and grows the cost', () => {
    const g = new Game(testContent(), 't');
    const { start, width } = g.state.map;
    g.state.map.tiles[start + 1].terrain = 'g';
    expect(g.canClaim(start + 2)).toBe(false);
    expect(g.claimCost(start + 1)).toBe(10);
    expect(g.claimTile(start + 1)).toBe(true);
    expect(claimedCount(g.state)).toBe(2);
    expect(g.mods.terrainBonus.a).toBeCloseTo(0.5);
    g.state.map.tiles[start + width].terrain = 'g';
    expect(g.claimCost(start + width)).toBe(20);
  });
});

describe('prestige', () => {
  it('converts earned resources and resets the run', () => {
    const g = new Game(testContent(), 't');
    g.state.earned.a = 400;
    expect(g.prestigeGain()).toBe(2);
    g.buyGen('ga', 2);
    expect(g.prestige()).toBe(2);
    expect(g.state.res.p).toBe(2);
    expect(g.state.gens).toEqual({});
    expect(g.state.res.a).toBe(100);
    expect(g.mods.prestigeMult).toBeCloseTo(1.2);
    expect(g.buyPrestigeUpgrade('pu')).toBe(true);
    expect(g.state.res.p).toBe(1);
    expect(g.prestigeUpgradeCost('pu')).toBe(2);
    g.state.earned.a = 100;
    g.prestige();
    expect(g.state.res.a).toBe(150);
  });
});

describe('save', () => {
  it('round-trips state', () => {
    const g = new Game(testContent(), 't');
    g.buyGen('ga', 2);
    const back = deserialize(serialize(g.state));
    expect(back).toEqual(g.state);
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"a":1}')).toBeNull();
  });
});

describe('format', () => {
  it('formats numbers', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(1.5)).toBe('1.5');
    expect(fmt(999)).toBe('999');
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(2.5e9)).toBe('2.50B');
  });
});

const THEME_CONTENTS: [string, ThemeContent, string][] = [
  ['fungal', fungalContent, 'mother'],
  ['clockwork', clockworkContent, 'archive'],
];

describe.each(THEME_CONTENTS)('%s content', (id, c, fixedTerrain) => {
  it('references only known ids', () => {
    const res = new Set(c.resources.map((r) => r.id));
    const gens = new Set(c.generators.map((g) => g.id));
    const ter = new Set(c.terrains.map((t) => t.id));
    const ups = new Set(c.upgrades.map((u) => u.id));
    expect(ups.size).toBe(c.upgrades.length);
    expect(ter.has(c.map.startTerrain)).toBe(true);
    expect(res.has(c.prestige.currency)).toBe(true);
    for (const g of c.generators) {
      for (const r of [...Object.keys(g.baseCost), ...Object.keys(g.produces)]) expect(res.has(r)).toBe(true);
      if (g.unlock?.gen) expect(gens.has(g.unlock.gen.id)).toBe(true);
      if (g.unlock?.terrain) expect(ter.has(g.unlock.terrain.id)).toBe(true);
    }
    for (const u of c.upgrades) {
      for (const e of u.effects) {
        if (e.type === 'genMult') expect(gens.has(e.gen)).toBe(true);
        if (e.type === 'terrainMult') expect(ter.has(e.terrain)).toBe(true);
        if (e.type === 'clickMult' || e.type === 'clickRate') expect(c.clicks.some((k) => k.id === e.click)).toBe(true);
      }
      if (u.unlock?.upgrade) expect(ups.has(u.unlock.upgrade)).toBe(true);
      if (u.unlock?.terrain) expect(ter.has(u.unlock.terrain.id)).toBe(true);
    }
    const g = new Game(c, id);
    expect(g.state.map.tiles.filter((t) => t.terrain === fixedTerrain).length).toBe(3);
  });
});
