# Changelog

## 2026-10-15 (Clockwork theme)
- Add the Clockwork Afterlife Bureau theme: content with Order/Chaos balance, blueprint floor-plan renderer with walls, brass tubes, ghosts, clocks and audit stamps, mahogany-and-brass CSS (`src/themes/clockwork/`). The user picked it as the second theme.
- Mark Clockwork as ready in the registry (`src/themes/registry.ts`).
- Move the header icon and browser theme color into the theme pack. The mushroom was hard-coded in the app shell (`src/themes/types.ts`, `src/ui/app.ts`, `index.html`).
- Move `hexA` to a shared module (`src/themes/shared/color.ts`).
- Run the content checks and the simulator for every theme (`src/engine/game.test.ts`, `scripts/simulate.ts`).
- Update README and theme guide (`README.md`, `docs/THEMES.md`).

## 2026-10-15
- Add a theme-neutral engine: generators, upgrades, dual-resource balance, tile map, prestige, story log, save/load, offline progress (`src/engine/`). The user wants more themes later, so no theme facts are in the engine.
- Add the theme pack contract and registry with lazy loading. Clockwork Afterlife Bureau and Dream Weaver are listed as planned (`src/themes/types.ts`, `src/themes/registry.ts`).
- Add the Fungal Network theme: content, organic mycelium map renderer, CSS (`src/themes/fungal/`).
- Add the DOM interface: resource bar, click buttons, balance meter, generators, upgrades, prestige shop, log, options with theme picker and save export/import (`src/ui/`).
- Add a minimum map cell size with drag-to-pan, so the map can be tapped on phones (`src/themes/shared/layout.ts`, `src/ui/panels/map.ts`).
- Add a default grid renderer for new themes (`src/themes/shared/gridRenderer.ts`).
- Add engine unit tests and a pacing simulator. Tune Fungal costs so the bot reaches the first prestige at about 22 minutes (`src/engine/game.test.ts`, `scripts/simulate.ts`).
- Add README and theme guide (`README.md`, `docs/THEMES.md`).
