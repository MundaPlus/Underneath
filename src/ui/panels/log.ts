import { fmtTime } from '../../engine/format';
import { h } from '../dom';
import type { Panel, UiContext } from './context';

/** Story and event log, newest first. */
export function logPanel(ctx: UiContext): Panel {
  const { game } = ctx;
  const list = h('ol', { class: 'log' });
  let lastKey = '';
  const el = h('section', { class: 'panel logp' }, list);
  return {
    el,
    update() {
      const log = game.state.log;
      const key = `${log.length}:${log[0]?.t ?? 0}`;
      if (key === lastKey) return;
      lastKey = key;
      list.replaceChildren(
        ...log.map((e) => h('li', {}, h('span', { class: 'log-time', text: fmtTime(e.t) }), h('span', { text: e.text }))),
      );
    },
  };
}
