import { fmt, fmtTime, setNumberStyle, type NumberStyle } from '../engine/format';
import { Game } from '../engine/game';
import { deleteLocal, importSave, loadLocal, saveLocal } from '../engine/save';
import { DEFAULT_THEME, THEMES } from '../themes/registry';
import type { ThemePack } from '../themes/types';
import { h, toggle } from './dom';
import { actionsPanel } from './panels/actions';
import type { Panel, UiContext } from './panels/context';
import { generatorsPanel } from './panels/generators';
import { logPanel } from './panels/log';
import { mapPanel } from './panels/map';
import { showModal } from './panels/modal';
import { optionsPanel } from './panels/options';
import { prestigePanel } from './panels/prestige';
import { resourcesPanel } from './panels/resources';
import { upgradesPanel } from './panels/upgrades';

const THEME_KEY = 'incremental-theme';
const NUMBERS_KEY = 'incremental-numbers';
const TICK_MS = 100;
const AUTOSAVE_MS = 15000;
/** Gaps longer than this (tab asleep) run through the offline simulation. */
const CATCH_UP_SECONDS = 5;

type RightTab = 'upgrades' | 'prestige' | 'log' | 'options';
type MobileView = 'map' | 'gens' | 'side';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: setting is not kept */
  }
}

function chosenThemeId(): string {
  const fromUrl = new URLSearchParams(location.search).get('theme');
  const id = fromUrl ?? storageGet(THEME_KEY) ?? DEFAULT_THEME;
  const entry = THEMES.find((t) => t.id === id && t.status === 'ready');
  return entry ? entry.id : DEFAULT_THEME;
}

function applyTheme(theme: ThemePack): void {
  document.documentElement.dataset.theme = theme.id;
  document.title = theme.name;
  const icon = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${theme.icon}</text></svg>`;
  document.querySelector('link[rel=icon]')?.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(icon)}`);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.themeColor);
  const style = h('style', { 'data-theme-css': theme.id });
  style.textContent = theme.css;
  document.head.append(style);
  for (const url of theme.fontUrls ?? []) {
    document.head.append(h('link', { rel: 'stylesheet', href: url }));
  }
}

export async function startApp(root: HTMLElement): Promise<void> {
  const numbers = storageGet(NUMBERS_KEY);
  if (numbers === 'short' || numbers === 'scientific') setNumberStyle(numbers as NumberStyle);

  const themeId = chosenThemeId();
  const theme = await THEMES.find((t) => t.id === themeId)!.load!();
  applyTheme(theme);

  const saved = loadLocal(theme.id);
  const game = new Game(theme.content, theme.id, saved ?? undefined);
  let saving = true;
  // Dev builds only: inspect and drive the game from the browser console.
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

  const save = (): void => {
    if (saving) saveLocal(game.state);
  };
  const reloadWithoutSave = (): void => {
    saving = false;
    location.reload();
  };

  let buyAmount: number | 'max' = 1;
  const ctx: UiContext = {
    game,
    theme,
    buyAmount: () => buyAmount,
    save,
    switchTheme: (id) => {
      save();
      storageSet(THEME_KEY, id);
      const url = new URL(location.href);
      url.searchParams.delete('theme');
      history.replaceState(null, '', url);
      reloadWithoutSave();
    },
    hardReset: () => {
      deleteLocal(theme.id);
      reloadWithoutSave();
    },
    replaceState: (text) => {
      const state = importSave(text);
      if (!state || state.themeId !== theme.id) return false;
      state.lastSaved = Date.now();
      saveLocal(state);
      reloadWithoutSave();
      return true;
    },
  };

  /* ---------- build the page ---------- */

  const resources = resourcesPanel(ctx);
  const actions = actionsPanel(ctx);
  const gens = generatorsPanel(ctx);
  const map = mapPanel(ctx);
  const upgrades = upgradesPanel(ctx);
  const prestige = prestigePanel(ctx);
  const log = logPanel(ctx);
  const options = optionsPanel(ctx);
  const panels: Panel[] = [resources, actions, gens, map, upgrades, prestige, log, options];

  // Buy amount toggle in the generator panel header.
  const amounts: (number | 'max')[] = [1, 10, 25, 'max'];
  const amountBtns = amounts.map((a) =>
    h('button', {
      text: a === 'max' ? 'Max' : `×${a}`,
      class: a === buyAmount ? 'active' : '',
      onclick: () => {
        buyAmount = a;
        amountBtns.forEach((b, i) => toggle(b, 'active', amounts[i] === a));
      },
    }),
  );
  const gensTitle = gens.el.querySelector('h2')!;
  const gensHead = h('div', { class: 'panel-head' });
  gensTitle.before(gensHead);
  gensHead.append(gensTitle, h('div', { class: 'buy-amount' }, ...amountBtns));
  const gensList = gens.el.querySelector('.gen-list') as HTMLElement;
  gensList.classList.add('scroll');

  const s = theme.content.strings;
  const tabDefs: { id: RightTab; label: string; panel: Panel }[] = [
    { id: 'upgrades', label: s.upgrades, panel: upgrades },
    { id: 'prestige', label: s.prestige, panel: prestige },
    { id: 'log', label: s.log, panel: log },
    { id: 'options', label: 'Options', panel: options },
  ];
  let rightTab: RightTab = 'upgrades';
  const badges = new Map<RightTab, HTMLElement>();
  const tabBtns = tabDefs.map((t) => {
    const badge = h('span', { class: 'badge hidden' });
    badges.set(t.id, badge);
    return h('button', { class: 'tab', 'data-tab': t.id, onclick: () => setRightTab(t.id) }, t.label, badge);
  });
  const tabBody = h('div', { class: 'tab-body scroll' }, ...tabDefs.map((t) => t.panel.el));

  const app = h(
    'div',
    { class: 'app', 'data-view': 'map' },
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', text: theme.icon }), h('h1', { text: theme.name })),
      resources.el,
      h('button', { class: 'icon-btn', title: 'Options', 'aria-label': 'Options', text: '⚙', onclick: () => openSide('options') }),
    ),
    h(
      'main',
      { class: 'layout' },
      h('div', { class: 'col col-left' }, gens.el),
      h('div', { class: 'col col-center' }, actions.el, map.el),
      h('div', { class: 'col col-right' }, h('nav', { class: 'tabs' }, ...tabBtns), tabBody),
    ),
  );

  // Mobile: one column at a time.
  const mobileDefs: { label: string; view: MobileView; tab?: RightTab }[] = [
    { label: s.map, view: 'map' },
    { label: s.generators, view: 'gens' },
    { label: s.upgrades, view: 'side', tab: 'upgrades' },
    { label: s.prestige, view: 'side', tab: 'prestige' },
    { label: s.log, view: 'side', tab: 'log' },
  ];
  const mobileBtns = mobileDefs.map((m) =>
    h('button', {
      class: 'tab',
      text: m.label,
      onclick: () => {
        app.dataset.view = m.view;
        if (m.tab) setRightTab(m.tab);
        syncMobile();
      },
    }),
  );
  const syncMobile = (): void => {
    mobileDefs.forEach((m, i) =>
      toggle(mobileBtns[i], 'active', app.dataset.view === m.view && (!m.tab || m.tab === rightTab)),
    );
  };
  app.append(h('nav', { class: 'mobile-nav' }, ...mobileBtns));

  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  document.body.append(toasts);
  root.replaceChildren(app);

  function setRightTab(id: RightTab): void {
    rightTab = id;
    tabDefs.forEach((t, i) => {
      toggle(t.panel.el, 'hidden', t.id !== id);
      toggle(tabBtns[i], 'active', t.id === id);
    });
    syncMobile();
  }
  function openSide(id: RightTab): void {
    app.dataset.view = 'side';
    setRightTab(id);
  }
  setRightTab('upgrades');

  const toast = (text: string): void => {
    const t = h('div', { class: 'toast', text });
    toasts.prepend(t);
    while (toasts.children.length > 3) toasts.lastElementChild!.remove();
    setTimeout(() => {
      t.classList.add('out');
      t.addEventListener('animationend', () => t.remove());
    }, 6000);
  };

  game.on((e) => {
    if (e.type === 'log') toast(e.text);
    if (e.type === 'prestige') {
      toast(`+${fmt(e.gain)} ${theme.content.resources.find((r) => r.id === theme.content.prestige.currency)!.name}`);
      setRightTab('upgrades');
    }
  });

  /* ---------- offline progress ---------- */

  if (saved) {
    const away = (Date.now() - saved.lastSaved) / 1000;
    if (away > 30) {
      const { gained, seconds } = game.simulateOffline(away);
      const items = theme.content.resources
        .filter((r) => (gained[r.id] ?? 0) > 0)
        .map((r) => h('li', { style: `--c:${r.color}`, text: `${r.icon} +${fmt(gained[r.id])} ${r.name}` }));
      const capped = seconds < away ? ` Offline progress stops after ${fmtTime(seconds)}.` : '';
      showModal(
        'While you were away',
        h('div', {}, h('p', { text: `You were gone for ${fmtTime(away)}.${capped}` }), h('ul', { class: 'offline-list' }, ...items)),
        [{ label: 'Continue', primary: true }],
      );
    }
  }

  /* ---------- loop ---------- */

  const updateUi = (): void => {
    for (const p of panels) p.update();
    const affordable = theme.content.upgrades.filter((u) => game.upgradeVisible(u) && game.canAfford(u.cost)).length;
    const ub = badges.get('upgrades')!;
    ub.textContent = String(affordable);
    toggle(ub, 'hidden', affordable === 0);
    const pb = badges.get('prestige')!;
    const gain = game.prestigeGain();
    pb.textContent = '!';
    toggle(pb, 'hidden', gain < 1);
  };

  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    if (dt > CATCH_UP_SECONDS) game.simulateOffline(dt);
    else game.tick(dt);
    updateUi();
  }, TICK_MS);

  const frame = (t: number): void => {
    map.render(t / 1000);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  setInterval(save, AUTOSAVE_MS);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
  });

  updateUi();
  save();
}
