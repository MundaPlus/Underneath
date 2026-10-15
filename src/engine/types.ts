/**
 * Theme-neutral content contract.
 * A theme pack supplies a ThemeContent object. The engine reads only these fields.
 */

export type ResourceId = string;
export type Amounts = Record<ResourceId, number>;

export interface ResourceDef {
  id: ResourceId;
  name: string;
  /** Short symbol or emoji for compact display. */
  icon: string;
  /** CSS color for this resource. */
  color: string;
  description?: string;
  /** Amount at the start of a run. */
  start?: number;
}

/** Condition for when a thing becomes visible or active. All given parts must be true. */
export interface Condition {
  /** Own at least `count` of generator `id`. */
  gen?: { id: string; count: number };
  /** Have earned at least `amount` of resource `id` in this run. */
  earned?: { id: ResourceId; amount: number };
  /** Have claimed at least this many map tiles. */
  tiles?: number;
  /** Have claimed at least `count` tiles of terrain `id`. */
  terrain?: { id: string; count: number };
  /** Have bought upgrade `id`. */
  upgrade?: string;
  /** Have done at least this many prestige resets. */
  prestiges?: number;
}

export interface GeneratorDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Cost of the first unit. Several resources are allowed. */
  baseCost: Amounts;
  /** Cost multiplier per unit owned. */
  costGrowth: number;
  /** Production per unit per second, before multipliers. */
  produces: Amounts;
  /** Optional upkeep per unit per second. Missing upkeep slows the generator. */
  consumes?: Amounts;
  unlock?: Condition;
}

/** An effect from an upgrade, a prestige upgrade or a terrain tile. */
export type Effect =
  | { type: 'genMult'; gen: string; mult: number }
  | { type: 'resMult'; res: ResourceId; mult: number }
  | { type: 'globalMult'; mult: number }
  | { type: 'clickMult'; click: string; mult: number }
  | { type: 'clickRate'; click: string; add: number }
  | { type: 'tileCostMult'; mult: number }
  | { type: 'terrainMult'; terrain: string; mult: number }
  | { type: 'stability'; add: number }
  | { type: 'genCostMult'; gen: string; mult: number }
  | { type: 'startRes'; res: ResourceId; amount: number }
  | { type: 'prestigeGainMult'; mult: number }
  | { type: 'offlineCapHours'; add: number };

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  flavor?: string;
  cost: Amounts;
  effects: Effect[];
  unlock?: Condition;
}

export interface ClickDef {
  id: string;
  label: string;
  icon: string;
  res: ResourceId;
  /** Flat gain per click. */
  base: number;
  /** Extra gain per click as a fraction of the current per-second rate of `res`. */
  rateFraction: number;
}

export interface TerrainDef {
  id: string;
  name: string;
  description: string;
  /** Relative frequency on map generation. 0 = only placed by `fixed`. */
  weight: number;
  /** Multiplier on the claim cost. */
  costMult: number;
  /**
   * Bonus per claimed tile of this terrain, as additive percent multipliers.
   * Example: { nutrients: 0.1 } means +10% nutrients per tile.
   */
  bonus: Partial<Record<ResourceId | '*', number>>;
  /** Base color, used by the default grid renderer. */
  color: string;
  /** Can never be claimed. */
  blocked?: boolean;
}

export interface MapDef {
  width: number;
  height: number;
  /** Terrain at the start tile (the center). */
  startTerrain: string;
  /** Terrains placed a set number of times at random free spots, at a minimum distance from the start. */
  fixed?: { terrain: string; count: number; minDistance: number }[];
  /** Resource paid to claim a tile. */
  claimRes: ResourceId;
  /** Cost of the first claimed tile (the start tile is free). */
  claimBase: number;
  /** Cost multiplier per claimed tile. */
  claimGrowth: number;
  /** Additive global production bonus per claimed tile (network effect). */
  perTileGlobal: number;
}

export interface BalanceZone {
  id: string;
  name: string;
  description: string;
  /** Zone covers balance values in [from, to). Balance runs from -1 (left) to +1 (right). */
  from: number;
  to: number;
  mult: Partial<Record<ResourceId, number>>;
  /** CSS color for the meter. */
  color: string;
}

/**
 * Dual resource balance. The balance value compares the gross production of two resources.
 * -1 means all left, +1 means all right. Stability pulls the value toward 0.
 */
export interface BalanceDef {
  left: ResourceId;
  right: ResourceId;
  leftLabel: string;
  rightLabel: string;
  title: string;
  zones: BalanceZone[];
  /** Highest total stability. 1 would lock the balance at 0. */
  maxStability: number;
}

export interface PrestigeDef {
  /** Currency id. It is also listed in `resources` so the UI can show it. */
  currency: ResourceId;
  /** Resources whose earned totals in this run count toward the gain. */
  counts: ResourceId[];
  /** gain = floor((earned / divisor) ^ exponent) */
  divisor: number;
  exponent: number;
  /** Global multiplier per unspent currency point (additive). */
  bonusPerPoint: number;
  upgrades: (UpgradeDef & { maxLevel?: number; costGrowth?: number })[];
}

export interface CyclePhase {
  id: string;
  name: string;
  description: string;
  /** Phase covers this part of the cycle, as fractions in [from, to). */
  from: number;
  to: number;
  /** Production multipliers. Key '*' applies to every resource without its own key. */
  mult: Partial<Record<ResourceId | '*', number>>;
  /** CSS color for the cycle meter. */
  color: string;
}

/** Optional repeating time cycle (e.g. day and night). It runs on game time, so offline time counts too. */
export interface CycleDef {
  title: string;
  /** Length of one full cycle in seconds. */
  period: number;
  phases: CyclePhase[];
}

export interface StoryEvent {
  id: string;
  when: Condition;
  text: string;
}

/** UI words that a theme can rename. */
export interface ThemeStrings {
  generators: string;
  upgrades: string;
  map: string;
  prestige: string;
  prestigeAction: string;
  prestigeConfirm: string;
  log: string;
  claim: string;
  owned: string;
}

export interface ThemeContent {
  resources: ResourceDef[];
  clicks: ClickDef[];
  generators: GeneratorDef[];
  upgrades: UpgradeDef[];
  terrains: TerrainDef[];
  map: MapDef;
  balance: BalanceDef;
  prestige: PrestigeDef;
  story: StoryEvent[];
  cycle?: CycleDef;
  strings: ThemeStrings;
}

/* ---------- Runtime state ---------- */

export interface Tile {
  terrain: string;
  claimed: boolean;
  /** Game time (seconds) when the tile was claimed. Used for growth animation. */
  claimedAt: number;
}

export interface MapState {
  width: number;
  height: number;
  seed: number;
  tiles: Tile[];
  start: number;
}

export interface GameState {
  version: number;
  themeId: string;
  /** Total game time in seconds, including offline time. */
  time: number;
  /** Time in this run (resets on prestige). */
  runTime: number;
  res: Amounts;
  /** Earned this run. */
  earned: Amounts;
  /** Earned over all runs. */
  lifetime: Amounts;
  gens: Record<string, number>;
  upgrades: Record<string, boolean>;
  prestigeUpgrades: Record<string, number>;
  prestiges: number;
  map: MapState;
  seenStory: Record<string, boolean>;
  log: { t: number; text: string }[];
  clicks: number;
  lastSaved: number;
}
