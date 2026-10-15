import { mulberry32 } from './rng';
import type { MapDef, MapState, TerrainDef, Tile } from './types';

export function generateMap(def: MapDef, terrains: TerrainDef[], seed: number): MapState {
  const rnd = mulberry32(seed);
  const { width: w, height: h } = def;
  const weighted = terrains.filter((t) => t.weight > 0);
  const total = weighted.reduce((s, t) => s + t.weight, 0);
  const pick = (): string => {
    let r = rnd() * total;
    for (const t of weighted) {
      r -= t.weight;
      if (r <= 0) return t.id;
    }
    return weighted[weighted.length - 1].id;
  };

  let ids: string[] = Array.from({ length: w * h }, pick);

  // One smoothing pass: tiles copy a random neighbor now and then, so terrain forms clumps.
  const next = ids.slice();
  for (let i = 0; i < ids.length; i++) {
    if (rnd() < 0.4) {
      const ns = neighbors(i, w, h);
      next[i] = ids[ns[Math.floor(rnd() * ns.length)]];
    }
  }
  ids = next;

  const start = Math.floor(h / 2) * w + Math.floor(w / 2);
  const [sx, sy] = [start % w, Math.floor(start / w)];

  for (const f of def.fixed ?? []) {
    let placed = 0;
    for (let tries = 0; placed < f.count && tries < 2000; tries++) {
      const i = Math.floor(rnd() * ids.length);
      const dx = (i % w) - sx;
      const dy = Math.floor(i / w) - sy;
      if (Math.hypot(dx, dy) < f.minDistance) continue;
      if (def.fixed!.some((o) => o.terrain === ids[i])) continue;
      ids[i] = f.terrain;
      placed++;
    }
  }

  // The start tile and its neighbors must be open, or the player is stuck.
  const blocked = new Set(terrains.filter((t) => t.blocked).map((t) => t.id));
  const open = weighted.filter((t) => !t.blocked).sort((a, b) => b.weight - a.weight)[0].id;
  for (const n of neighbors(start, w, h)) if (blocked.has(ids[n])) ids[n] = open;
  ids[start] = def.startTerrain;

  const tiles: Tile[] = ids.map((terrain) => ({ terrain, claimed: false, claimedAt: 0 }));
  tiles[start].claimed = true;
  return { width: w, height: h, seed, tiles, start };
}

/** 4-way neighbors. */
export function neighbors(i: number, w: number, h: number): number[] {
  const x = i % w;
  const y = Math.floor(i / w);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < w - 1) out.push(i + 1);
  if (y > 0) out.push(i - w);
  if (y < h - 1) out.push(i + w);
  return out;
}

export function isClaimable(map: MapState, i: number, terrains: Map<string, TerrainDef>): boolean {
  const t = map.tiles[i];
  if (!t || t.claimed || terrains.get(t.terrain)?.blocked) return false;
  return neighbors(i, map.width, map.height).some((n) => map.tiles[n].claimed);
}
