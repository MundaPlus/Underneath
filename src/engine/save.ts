import { SAVE_VERSION } from './game';
import type { GameState } from './types';

const PREFIX = 'incremental-save:';

export function saveKey(themeId: string): string {
  return PREFIX + themeId;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse and check a save. Returns null when the text is not a valid save. */
export function deserialize(text: string): GameState | null {
  try {
    const s = JSON.parse(text) as GameState;
    if (typeof s !== 'object' || s === null) return null;
    if (typeof s.themeId !== 'string' || !s.map || !Array.isArray(s.map.tiles)) return null;
    return migrate(s);
  } catch {
    return null;
  }
}

/** Upgrade older saves to the current format. Add steps here when GameState changes. */
function migrate(s: GameState): GameState {
  if (s.version > SAVE_VERSION) return s;
  s.version = SAVE_VERSION;
  s.seenStory ??= {};
  s.log ??= [];
  s.prestigeUpgrades ??= {};
  return s;
}

export function saveLocal(state: GameState): boolean {
  try {
    state.lastSaved = Date.now();
    localStorage.setItem(saveKey(state.themeId), serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(themeId: string): GameState | null {
  try {
    const text = localStorage.getItem(saveKey(themeId));
    return text ? deserialize(text) : null;
  } catch {
    return null;
  }
}

export function deleteLocal(themeId: string): void {
  try {
    localStorage.removeItem(saveKey(themeId));
  } catch {
    /* storage blocked: nothing to delete */
  }
}

/** Export as base64 text that the player can copy. */
export function exportSave(state: GameState): string {
  const bytes = new TextEncoder().encode(serialize(state));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importSave(text: string): GameState | null {
  try {
    const bin = atob(text.trim());
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return deserialize(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
