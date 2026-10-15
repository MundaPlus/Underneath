import { getNumberStyle, setNumberStyle, type NumberStyle } from '../../engine/format';
import { exportSave } from '../../engine/save';
import { THEMES } from '../../themes/registry';
import { h } from '../dom';
import type { Panel, UiContext } from './context';
import { showModal } from './modal';

/** Theme picker, number format, save tools. */
export function optionsPanel(ctx: UiContext): Panel {
  const { game, theme } = ctx;

  const themeList = h(
    'div',
    { class: 'theme-list' },
    ...THEMES.map((t) =>
      h(
        'button',
        {
          class: `theme-card${t.id === theme.id ? ' current' : ''}`,
          disabled: t.status !== 'ready' || t.id === theme.id,
          onclick: () => ctx.switchTheme(t.id),
        },
        h('strong', { text: t.name }),
        h('span', { class: 'small', text: t.tagline }),
        h('span', {
          class: 'small muted',
          text: t.id === theme.id ? 'Playing now' : t.status === 'ready' ? 'Switch (each theme has its own save)' : 'Coming soon',
        }),
      ),
    ),
  );

  const numSelect = h(
    'select',
    {
      onchange: (e: Event) => {
        setNumberStyle((e.target as HTMLSelectElement).value as NumberStyle);
        try {
          localStorage.setItem('incremental-numbers', getNumberStyle());
        } catch {
          /* storage blocked */
        }
      },
    },
    h('option', { value: 'short', text: 'Short (1.23M)' }),
    h('option', { value: 'scientific', text: 'Scientific (1.23e6)' }),
  );
  numSelect.value = getNumberStyle();

  const exportBtn = h('button', {
    class: 'btn',
    text: 'Export save',
    onclick: () => {
      ctx.save();
      const area = h('textarea', { class: 'save-text', readonly: true, rows: 6 });
      area.value = exportSave(game.state);
      showModal('Export save', h('div', {}, h('p', { text: 'Copy this text and keep it somewhere safe.' }), area), [
        {
          label: 'Copy',
          primary: true,
          action: () => void navigator.clipboard?.writeText(area.value),
        },
        { label: 'Close' },
      ]);
      area.select();
    },
  });

  const importBtn = h('button', {
    class: 'btn',
    text: 'Import save',
    onclick: () => {
      const area = h('textarea', { class: 'save-text', rows: 6, placeholder: 'Paste save text here' });
      showModal('Import save', h('div', {}, h('p', { text: 'This replaces your current progress in this theme.' }), area), [
        { label: 'Cancel' },
        {
          label: 'Import',
          primary: true,
          action: () => {
            if (!ctx.replaceState(area.value)) showModal('Import failed', 'That text is not a valid save for this theme.');
          },
        },
      ]);
    },
  });

  const resetBtn = h('button', {
    class: 'btn btn-danger',
    text: 'Hard reset',
    onclick: () =>
      showModal('Hard reset', `This deletes all progress in ${theme.name}, including prestige. It cannot be undone.`, [
        { label: 'Cancel', primary: true },
        { label: 'Delete everything', danger: true, action: () => ctx.hardReset() },
      ]),
  });

  const el = h(
    'section',
    { class: 'panel options' },
    h('h3', { text: 'Theme' }),
    themeList,
    h('h3', { text: 'Numbers' }),
    numSelect,
    h('h3', { text: 'Save' }),
    h('p', { class: 'muted small', text: 'The game saves itself every 15 seconds and when you leave.' }),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', text: 'Save now', onclick: () => ctx.save() }), exportBtn, importBtn),
    h('div', { class: 'btn-row' }, resetBtn),
  );
  return { el, update() {} };
}
