import { uiActions, type UiArgument } from './ui-actions.js';
import { lifetime } from './runtime.js';
import { toast } from './missions.js';

export function bindUiActions(root: HTMLElement) {
  const busy = new WeakSet<HTMLElement>();
  lifetime.listen(root, 'click', (event) => {
    if (!(event.target instanceof Element)) return;
    const element = event.target.closest<HTMLElement>('[data-action]');
    if (!element || !root.contains(element) || busy.has(element)) return;
    if (element instanceof HTMLButtonElement && element.disabled) return;
    const action = uiActions[element.dataset.action ?? ''];
    if (!action) return;
    let args: UiArgument[] = element.dataset.arg ? [element.dataset.arg] : [];
    if (element.dataset.args) {
      try {
        const value: unknown = JSON.parse(element.dataset.args);
        if (
          !Array.isArray(value) ||
          !value.every(
            (arg: unknown) => arg === null || ['string', 'number', 'boolean'].includes(typeof arg),
          )
        )
          return;
        args = value;
      } catch {
        return;
      }
    }
    busy.add(element);
    void Promise.resolve()
      .then(() => action(args))
      .catch((error: unknown) => {
        console.error('[ui]', error);
        toast('Operazione non completata. Riprova.', 4000);
      })
      .finally(() => busy.delete(element));
  });
}
