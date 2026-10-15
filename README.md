# Incremental

An incremental (idle) game engine with plug-in themes. The first theme is **Fungal Network**: you are a mycelium under a forest floor.

## Gameplay (all themes)

- **Click** to get the two main resources.
- **Generators** produce resources every second. Their cost grows with each one you buy.
- **Dual balance**: two resources pull against each other. Their production ratio puts you in a zone with bonuses or penalties. Stability upgrades pull the balance toward the middle.
- **Map**: claim tiles next to your network. Each tile makes the network stronger, and special terrain gives extra bonuses or unlocks generators.
- **Upgrades** multiply production, make clicks stronger, make tiles cheaper or add stability.
- **Prestige**: reset the run for a permanent currency, which you spend in a shop. Each run gets a new random map.
- **Offline progress** for up to 8 hours (more with prestige upgrades). The game saves itself every 15 seconds.

### Fungal Network

| Engine term | Fungal Network |
|---|---|
| Resources | Nutrients (decay), Sugar (symbiosis), Spores (prestige) |
| Generators | Growths: Hyphal Tip … Saprotroph Mat (decay), Root Handshake … Ancient Grove Pact (symbiosis) |
| Balance | Forest Health: Rot Bloom, Hungry Soil, Harmony, Lush Canopy, Starved Ground |
| Map | Forest Floor: leaf litter, fallen logs, oak roots, Mother Trees, streams, stone, bedrock |
| Prestige | Fruiting: release spores into a new forest |

Decay growths cost sugar, and symbiosis growths cost nutrients. You need both sides.

## Run it

Requires Node 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5180 (also on the LAN)
npm run build      # static files in dist/, open from any web server
npm test           # engine unit tests
npm run sim        # pacing check: npm run sim -- fungal <clicks/s> <minutes>
```

## Project layout

```
src/engine/        theme-neutral rules: types, game, map, save, format
src/ui/            DOM interface and base layout (uses CSS tokens only)
src/themes/        theme registry, theme contract, shared renderers
src/themes/fungal/ Fungal Network: content, renderer, CSS
scripts/simulate.ts  headless bot that checks pacing
docs/THEMES.md     how to add a theme
```

## Add a theme

See [docs/THEMES.md](docs/THEMES.md). Clockwork Afterlife Bureau and Dream Weaver are planned.
