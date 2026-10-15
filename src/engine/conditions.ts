import type { Condition, GameState } from './types';

/** True when every given part of the condition holds. An empty or missing condition is true. */
export function checkCondition(state: GameState, c: Condition | undefined): boolean {
  if (!c) return true;
  if (c.gen && (state.gens[c.gen.id] ?? 0) < c.gen.count) return false;
  if (c.earned && (state.earned[c.earned.id] ?? 0) < c.earned.amount) return false;
  if (c.tiles !== undefined && claimedCount(state) < c.tiles) return false;
  if (c.terrain && terrainCount(state, c.terrain.id) < c.terrain.count) return false;
  if (c.upgrade && !state.upgrades[c.upgrade]) return false;
  if (c.prestiges !== undefined && state.prestiges < c.prestiges) return false;
  return true;
}

export function claimedCount(state: GameState): number {
  let n = 0;
  for (const t of state.map.tiles) if (t.claimed) n++;
  return n;
}

export function terrainCount(state: GameState, terrain: string): number {
  let n = 0;
  for (const t of state.map.tiles) if (t.claimed && t.terrain === terrain) n++;
  return n;
}
