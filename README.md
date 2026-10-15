# Incremental

An incremental (idle) game engine with plug-in themes. Two themes are ready:

- **Fungal Network**: you are a mycelium under a forest floor.
- **Clockwork Afterlife Bureau**: you run the paperwork office of the underworld.

Pick the theme in Options, or open the game with `?theme=clockwork`. Each theme has its own save.

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

### Clockwork Afterlife Bureau

| Engine term | Clockwork Afterlife Bureau |
|---|---|
| Resources | Paperwork (order), Favors (chaos), Seniority (prestige) |
| Generators | Staff: Junior Clerk … Grand Difference Engine (order), Restless Ghost … Department of Exceptions (chaos) |
| Balance | Office Climate: Total Paralysis, By the Book, Running Like Clockwork, Lax Oversight, Ghostly Anarchy |
| Map | Bureau Floor, drawn as a blueprint: desk pools, filing rooms, break rooms, back rooms, Forbidden Archives, Great Clock Rooms, tube junctions, walls, the Void |
| Prestige | Audit: move to a new building with more seniority |

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
src/themes/clockwork/ Clockwork Afterlife Bureau: content, renderer, CSS
scripts/simulate.ts  headless bot that checks pacing
docs/THEMES.md     how to add a theme
```

## Add a theme

See [docs/THEMES.md](docs/THEMES.md). Dream Weaver is planned.
