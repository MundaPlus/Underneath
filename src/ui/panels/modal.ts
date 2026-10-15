import { h } from '../dom';

export interface ModalButton {
  label: string;
  primary?: boolean;
  danger?: boolean;
  action?: () => void;
}

/** In-page modal dialog. Closes on any button, Escape or a click outside. */
export function showModal(title: string, body: Node | string, buttons: ModalButton[] = [{ label: 'OK', primary: true }]): void {
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const content = typeof body === 'string' ? h('p', { text: body }) : body;
  const box = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { text: title }),
    content,
    h(
      'div',
      { class: 'modal-buttons' },
      ...buttons.map((b) =>
        h('button', {
          class: `btn${b.primary ? ' btn-primary' : ''}${b.danger ? ' btn-danger' : ''}`,
          text: b.label,
          onclick: () => {
            close();
            b.action?.();
          },
        }),
      ),
    ),
  );
  const overlay = h('div', { class: 'modal-overlay', onclick: (e: Event) => e.target === overlay && close() }, box);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  (box.querySelector('.btn-primary') as HTMLButtonElement | null)?.focus();
}
