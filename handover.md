# Handover — Underneath — 2026-10-15 19:20

## Goal
The user said: "push to github and create a page there to host it on github and add to projects to munda.si make the repo public in github". Later: add screenshots, a classic GitHub README, a mobile top bar fix, and Munda Plus as the license holder (also for Ash & Gears).

## Done so far
- Public repo https://github.com/MundaPlus/Underneath. The default branch is `master`. Remotes: `origin` (Gitea) and `github`. Releases 0.1.1, 0.1.2 and 0.1.3 are on both remotes.
- GitHub Pages is live at https://mundaplus.github.io/Underneath/ (`.github/workflows/pages.yml`, on each push to `master`).
- The README uses a GitHub layout, with screenshots in `docs/screenshots/`.
- `LICENSE` is MIT, "Copyright (c) 2026 Munda Plus". The README has the credit line "Made by Munda Plus — https://munda.si".
- The phone top bar fits at 360 and 390 px (`src/ui/base.css`).
- munda.si has the Underneath card and "21 projects". The change is deployed (backup `index.html.bak-20261015-underneath`) and pushed on the `redesign` branch of MundaPlus_WebPage.
- Ash & Gears (debian-llm `~/git_projects/game`): LICENSE and README now credit Munda Plus. The change is pushed to Gitea `master` and GitHub `main`.

## Current state
- Nothing is in progress. The working tree is clean.

## Decisions
- Pages uses GitHub Actions as the source and deploys from `master` only. The `github-pages` environment allows only `master`.
- The license is MIT, the same as Ash & Gears and Printwright.

## Next steps
1. Optional: update the workflow actions to versions that run on Node 24. GitHub warns that `actions/checkout@v4`, `actions/setup-node@v4` and `actions/upload-artifact@v4` target Node 20.

## Key files
- `README.md`: the GitHub page of the repo.
- `.github/workflows/pages.yml`: GitHub Pages deploy.
- `docs/THEMES.md`: how to add a theme.
- `CHANGELOG.md`: history, newest on top.

## Gotchas
- In a new repo, GitHub did not register the workflow until the user enabled Actions in the web UI.
- The first Pages setup gave the `github-pages` environment a `develop` rule, because the default branch was still `develop`. Fixed: the rule is now `master`.
- To make screenshots of a game in progress, set the save with `Page.addScriptToEvaluateOnNewDocument`. If you set it after the page loads, the game saves its fresh state on unload and overwrites it.
