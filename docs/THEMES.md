# How to add a theme

The engine does not know about any theme. A theme pack gives the engine three things:

1. **Content**: data for resources, generators, upgrades, terrain, balance zones, prestige, story and UI words (`ThemeContent` in `src/engine/types.ts`).
2. **Look**: a CSS string that sets the design tokens (CSS variables) and any extra styles.
3. **Map renderer**: a function that draws the map on a canvas (`MapRenderer` in `src/themes/types.ts`).

## Steps

1. Make a folder `src/themes/<id>/`.
2. Write `content.ts` that exports a `ThemeContent` object. Copy `src/themes/fungal/content.ts` as a start.
3. Write `theme.css`. Put all rules under `:root[data-theme='<id>']` or `[data-theme='<id>']`. Set every token in the list below.
4. Write a renderer, or use the default grid renderer:
   ```ts
   import { createGridRenderer } from '../shared/gridRenderer';
   ```
5. Write `index.ts` that default-exports a `ThemePack`:
   ```ts
   import type { ThemePack } from '../types';
   import { myContent } from './content';
   import { createGridRenderer } from '../shared/gridRenderer';
   import css from './theme.css?inline';

   const pack: ThemePack = {
     id: 'clockwork',
     name: 'Clockwork Afterlife Bureau',
     tagline: 'Process the souls of the dead, in triplicate.',
     icon: '⚙️',
     themeColor: '#16100b',
     content: myContent,
     css,
     createMapRenderer: createGridRenderer,
   };
   export default pack;
   ```
6. In `src/themes/registry.ts`, set the entry to `status: 'ready'` and add `load: () => import('./<id>').then((m) => m.default)`.
7. Add the content to `CONTENTS` in `scripts/simulate.ts`. Run `npm run sim -- <id> 2 75` and tune the numbers until the first prestige comes at 20–35 minutes for the bot.
8. Add the content to `THEME_CONTENTS` in `src/engine/game.test.ts` and run `npm test`.

Each theme keeps its own save (`localStorage` key `incremental-save:<id>`).

## Design tokens

The base layout (`src/ui/base.css`) uses only these variables.

| Token | Use |
|---|---|
| `--bg` | Page background |
| `--surface`, `--surface-2`, `--surface-hover` | Panels, cards, hover state |
| `--border` | Borders |
| `--text`, `--text-dim` | Text |
| `--accent`, `--accent-ink` | Primary buttons, active tabs, highlights, and the text on them |
| `--danger` | Hard reset, negative rates |
| `--radius` | Corner radius |
| `--font-display`, `--font-body` | Headings and body text |

Resource colors and zone colors are free names. The content refers to them, for example `color: 'var(--res-sugar)'`. A canvas renderer can read any token with `getComputedStyle(canvas).getPropertyValue('--name')`. Use hex values for tokens that a renderer reads.

## Map renderer contract

- `resize(width, height, dpr)`: the panel calls this when the map area changes size.
- `render(view)`: called every animation frame. `view` holds the game, the time, the hovered tile, the claimable and affordable tiles, the pulses and the pan offset.
- `hitTest(x, y)`: return the tile index under a point in CSS pixels, or `null`.

Use `gridLayout()` and `viewOffset()` from `src/themes/shared/layout.ts`. They give a minimum cell size and drag-to-pan on small screens. Draw static parts (ground, network) to offscreen canvases and redraw them only when the map changes. The Fungal renderer shows this pattern.

## Optional time cycle

Set `cycle` in the content to add a repeating cycle, such as night and day. Each phase covers a part of the cycle and has production multipliers (key `'*'` for all resources). The cycle runs on game time, so offline time counts too. The UI shows a cycle meter and a toast when the phase changes. A renderer can read `view.game.cycle()` to change its look. Dream Weaver uses this.

## Examples

- `src/themes/fungal/`: organic network with jittered tile centers.
- `src/themes/clockwork/`: blueprint floor plan, no jitter, walls between rooms.
- `src/themes/dream/`: top-down city with a night-and-day cycle.
