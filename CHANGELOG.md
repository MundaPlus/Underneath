# Changelog

## 2026-10-15 (GitHub Pages)
- Add a GitHub Actions workflow that tests, builds and publishes the game to GitHub Pages on each push to `master` (`.github/workflows/pages.yml`). The user wants the game public on GitHub and linked from munda.si.

## 2026-10-15 (folder)
- Rename the project folder from `~/git_projects/incremental_game` to `~/git_projects/underneath` to match the game name. No files in the repo changed.

## 2026-10-15 (name)
- Name the game "Underneath": README title, package name, page title and browser tab (`README.md`, `package.json`, `index.html`, `src/ui/app.ts`). The user picked the name.

## 0.1.0 — 2026-10-15
- Release 0.1.0: theme-neutral engine with three themes (Fungal Network, Clockwork Afterlife Bureau, Dream Weaver). Version in `package.json` is 0.1.0.

## 2026-10-15 (Dream theme)
- Add an optional time cycle to the engine: phases with production multipliers, `Game.cycle()`, a phase change event (`src/engine/types.ts`, `src/engine/game.ts`). The Dream Weaver pitch needs night and day.
- Show a cycle meter in the actions panel and a toast on phase change. Mute the toasts during offline catch-up (`src/ui/panels/actions.ts`, `src/ui/app.ts`, `src/ui/base.css`).
- Add the Dream Weaver theme: content with Sweet Dreams/Nightmares balance and a 4-minute night cycle, a top-down sleeping-city renderer with lit windows, dream bubbles, braided threads, smoke, fireflies, shooting stars and a moon/sun dial, indigo CSS (`src/themes/dream/`).
- Mark Dream Weaver as ready in the registry (`src/themes/registry.ts`).
- Add cycle tests and Dream content checks. Add Dream to the simulator (`src/engine/game.test.ts`, `scripts/simulate.ts`).
- Update README and theme guide (`README.md`, `docs/THEMES.md`).

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
