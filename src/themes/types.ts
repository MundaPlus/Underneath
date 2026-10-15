import type { Game } from '../engine/game';
import type { ThemeContent } from '../engine/types';

/** What a map renderer gets each frame. */
export interface MapView {
  game: Game;
  /** Real time in seconds, for animation. */
  now: number;
  hover: number | null;
  /** Drag offset in CSS pixels. Renderers clamp it in place (see viewOffset). */
  pan: { x: number; y: number };
  claimable: Set<number>;
  affordable: Set<number>;
  /** Recent click or claim pulses: tile index and real start time. */
  pulses: { tile: number; start: number }[];
}

/** Draws the theme's map on a canvas. One renderer per theme. */
export interface MapRenderer {
  /** Size in CSS pixels and device pixel ratio. */
  resize(width: number, height: number, dpr: number): void;
  render(view: MapView): void;
  /** Tile index under a point in CSS pixels, or null. */
  hitTest(x: number, y: number): number | null;
  destroy?(): void;
}

/** A complete theme: game content, look and map renderer. */
export interface ThemePack {
  id: string;
  name: string;
  tagline: string;
  /** Emoji for the header and the browser tab. */
  icon: string;
  /** Browser UI color (meta theme-color). */
  themeColor: string;
  content: ThemeContent;
  /** CSS for this theme. It sets the design tokens (CSS variables) and any extra styles. */
  css: string;
  /** Optional stylesheet URLs, e.g. Google Fonts. The theme must look fine without them. */
  fontUrls?: string[];
  createMapRenderer(canvas: HTMLCanvasElement): MapRenderer;
}

/** Entry in the theme registry. `load` is a lazy import, so unused themes are not downloaded. */
export interface ThemeEntry {
  id: string;
  name: string;
  tagline: string;
  status: 'ready' | 'planned';
  load?: () => Promise<ThemePack>;
}
