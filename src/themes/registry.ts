import type { ThemeEntry } from './types';

/**
 * All known themes. To add a theme:
 * 1. Make a folder src/themes/<id>/ with an index.ts that default-exports a ThemePack.
 * 2. Add an entry here with status 'ready' and a lazy `load`.
 * See docs/THEMES.md.
 */
export const THEMES: ThemeEntry[] = [
  {
    id: 'fungal',
    name: 'Fungal Network',
    tagline: 'Grow a mycelium under the forest floor.',
    status: 'ready',
    load: () => import('./fungal').then((m) => m.default),
  },
  {
    id: 'clockwork',
    name: 'Clockwork Afterlife Bureau',
    tagline: 'Process the souls of the dead, in triplicate.',
    status: 'planned',
  },
  {
    id: 'dream',
    name: 'Dream Weaver',
    tagline: 'Harvest the dreams of a sleeping city.',
    status: 'planned',
  },
];

export const DEFAULT_THEME = 'fungal';
