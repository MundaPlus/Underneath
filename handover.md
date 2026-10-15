# Handover — Underneath — 2026-10-15 18:40

## Goal
The user said: "push to github and create a page there to host it on github and add to projects to munda.si make the repo public in github".

1. Make a **public** GitHub repo for the game "Underneath" in the **MundaPlus** org and push the code.
2. Host the game on **GitHub Pages**.
3. Add the game to the **projects list on https://munda.si**.

The work must run on the main machine (192.168.31.3), because only that machine has `gh` installed and logged in.

## Done so far
- The game is built and released as `0.1.0`. It is an idle game engine with three plug-in themes: Fungal Network, Clockwork Afterlife Bureau and Dream Weaver. Stack: TypeScript, Vite 7, Vitest. No backend. Saves are in `localStorage`.
- Repo on Gitea: `http://192.168.31.225:3333/admin/Underneath.git` (remote `origin`). Branches: `master` (release 0.1.0, tag `0.1.0`) and `develop` (newer). git-flow is set up (master + develop).
- `develop` is ahead of `master` by these commits:
  - The game name "Underneath" (package name, page title).
  - A changelog entry for the folder rename.
  - `.github/workflows/pages.yml`: on each push to `master`, it runs `npm ci`, `npm test` and `npm run build`, then deploys `dist/` to GitHub Pages.
  - This handover file.
- `vite.config.ts` has `base: './'`, so the build works under a project path such as `https://mundaplus.github.io/Underneath/`. No change is needed for Pages.

## Current state
- On debian-llm (192.168.31.215), a Vite dev server runs from `~/git_projects/underneath` on port 5180. It is not needed for this task.
- Nothing is on GitHub yet.
- munda.si is not changed yet.
- The munda.si site source was **not found** on debian-llm, and no local project mentions it. It is probably on the .3 machine, or deployed to Hostinger (`hostinger-new`). Find it before you change it.

## Decisions
- Repo name on GitHub: `MundaPlus/Underneath`, public. The Gitea repo has the same name.
- Hosting: GitHub Pages with GitHub Actions (source "GitHub Actions"), not a `gh-pages` branch.
- The Pages workflow deploys from `master`, so a release must go to `master` first (step 2 below).
- Follow the existing **Ash & Gears** entry on munda.si as the pattern. That is also a browser game on GitHub Pages: https://mundaplus.github.io/Ash-and-Gears/.

## Next steps
1. Clone and check:
   ```bash
   git clone http://192.168.31.225:3333/admin/Underneath.git ~/git_projects/underneath
   cd ~/git_projects/underneath
   git checkout develop && git flow init -d
   npm ci && npm test && npm run build
   ```
2. Release `0.1.1`, so `master` has the Pages workflow and the new name:
   ```bash
   git flow release start 0.1.1
   # package.json "version" -> 0.1.1, add a "## 0.1.1 — <date>" entry on top of CHANGELOG.md, commit
   GIT_MERGE_AUTOEDIT=no git flow release finish -m "Release 0.1.1" 0.1.1
   git push origin master develop --tags
   ```
3. **Ask the user (AskUserQuestion) before the public push:**
   - License. Ash & Gears is MIT. Recommend MIT and add a `LICENSE` file (copyright "Marko Munda"). There is no license file now.
   - Check that the repo has no secrets: `git grep -nEi "(password|secret|api[_-]?key|token)\s*[:=]"`. The last scan found none.
4. Create the public GitHub repo and push:
   ```bash
   gh repo create MundaPlus/Underneath --public \
     --description "Idle game engine with plug-in themes: Fungal Network, Clockwork Afterlife Bureau, Dream Weaver. Play in the browser." \
     --homepage "https://mundaplus.github.io/Underneath/"
   git remote add github https://github.com/MundaPlus/Underneath.git
   git push github master develop --tags
   gh repo edit MundaPlus/Underneath --default-branch master
   ```
5. Turn on Pages with GitHub Actions as the source, then run the workflow:
   ```bash
   gh api -X POST repos/MundaPlus/Underneath/pages -f build_type=workflow
   gh workflow run "Deploy to GitHub Pages" -R MundaPlus/Underneath --ref master
   gh run watch -R MundaPlus/Underneath
   ```
   If the push in step 4 already started the workflow before Pages was on, run it again as above.
6. Check that https://mundaplus.github.io/Underneath/ loads. Test the theme switch (Options) and `?theme=clockwork` and `?theme=dream`. Check the browser console for errors.
7. Add topics: `gh repo edit MundaPlus/Underneath --add-topic idle-game,incremental-game,typescript,vite,browser-game`.
8. munda.si: find the site source, then add a card in the projects list, next to Ash & Gears (category `creative`). Draft, in the same HTML pattern as the live site:
   ```html
   <li data-cat="creative"><div class="pf-top"><h3>Underneath</h3><span class="badge live">Free · Open source</span></div><p>Idle game with three hidden worlds: grow a fungal network under the forest, run the paperwork office of the underworld, or weave the dreams of a sleeping city. Free to play in the browser on PC and phone. Free to use and change (MIT license).</p><a href="https://mundaplus.github.io/Underneath/" target="_blank" rel="noopener noreferrer">Play in the browser ↗</a><a href="https://github.com/MundaPlus/Underneath" target="_blank" rel="noopener noreferrer">Get it on GitHub →</a></li>
   ```
   Drop "(MIT license)" if the user picks another license. Show the user the change and ask before you deploy the site.
9. Update `CHANGELOG.md` with the GitHub, Pages and munda.si work. Push `develop` to both remotes.

## Key files
- `README.md`: what the game is, how to run and build it.
- `docs/THEMES.md`: how to add a theme.
- `.github/workflows/pages.yml`: GitHub Pages deploy.
- `vite.config.ts`: `base: './'` for project-path hosting.
- `src/themes/registry.ts`: theme list.
- `CHANGELOG.md`: history, newest on top.

## Gotchas
- Node must be 20.19 or newer (Vite 7). The workflow uses Node 22.
- On debian-llm, the auto-mode classifier blocked reading `~/.git-credentials`, and `gh` is not installed there. That is why this work moved to .3.
- The Gitea API search without login returns no repos (they are private). Use the web UI or a logged-in session.
- The user's browser has real saves for Fungal and Clockwork in `localStorage` on the dev server origin (`http://192.168.31.215:5180`). GitHub Pages is a different origin, so those saves will not carry over. Do not delete them.
- The user's rules (claude-rules) apply: STE writing style, AskUserQuestion for decisions, a CHANGELOG entry after each change, and confirmation before outward-facing steps.
