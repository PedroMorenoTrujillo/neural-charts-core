import type { ChartState } from '../../public/chart-types.js';
import type { Dash } from '../chart/presentation.js';
import { subscriptions } from '../chart/cleanup.js';
export type LegendItem = Readonly<{ id: string; name: string; color: string; dash: Dash; width: number }>;
export interface LegendView { update(items: readonly LegendItem[], state: ChartState, disabled: boolean): void; disable(value: boolean): void; destroy(): void; }
export function createLegendView(element: HTMLElement, onToggle: (id: string) => void): LegendView {
  let owned: HTMLElement | null = element, callback: ((id: string) => void) | null = onToggle;
  const buttons = new Map<string, HTMLButtonElement>();
  const click = (event: Event): void => { const target = event.target as HTMLElement | null, button = target?.closest('button'); if (button && owned?.contains(button) && !button.disabled) { const id = button.dataset.ncSeries; if (id !== undefined) callback?.(id); } };
  const listeners = subscriptions();
  try { listeners.add(element, 'click', click); } catch (error) { owned = null; callback = null; throw error; }
  return {
    update(items, state, disabled) {
      if (!owned) return; const ids = new Set(items.map(i => i.id)), hidden = new Set(state.hiddenSeriesIds);
      const focused = owned.ownerDocument.activeElement, oldOrder = Array.from(owned.children), oldPosition = oldOrder.indexOf(focused as Element), removedFocus = oldPosition >= 0 && !ids.has((focused as HTMLElement).dataset.ncSeries ?? '');
      for (const item of items) {
        let button = buttons.get(item.id);
        if (!button) { button = owned.ownerDocument.createElement('button'); button.type = 'button'; button.dataset.ncSeries = item.id; Object.assign(button.style, { height: '32px', flex: '0 0 auto', display: 'inline-flex', gap: '6px', alignItems: 'center', overflow: 'hidden', fontFamily: 'inherit', fontSize: '12px', fontWeight: '400', cursor: 'pointer', boxSizing: 'border-box' }); const swatch = owned.ownerDocument.createElement('span'), name = owned.ownerDocument.createElement('span'); swatch.setAttribute('aria-hidden', 'true'); Object.assign(swatch.style, { display: 'inline-block', width: '16px', flex: '0 0 16px', borderTopWidth: '2px' }); Object.assign(name.style, { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }); button.append(swatch, name); buttons.set(item.id, button); }
        button.style.width = `${item.width}px`; button.title = item.name; button.setAttribute('aria-pressed', String(!hidden.has(item.id))); button.setAttribute('aria-label', item.name); button.disabled = disabled;
        const swatch = button.firstElementChild as HTMLElement, name = button.lastElementChild as HTMLElement; swatch.style.borderTopColor = item.color; swatch.style.borderTopStyle = item.dash === 'solid' ? 'solid' : item.dash === 'dashed' ? 'dashed' : 'dotted'; name.textContent = item.name;
        const expected = owned.children.item(items.indexOf(item)); if (expected !== button) owned.insertBefore(button, expected);
      }
      if (removedFocus) {
        const next = items[oldPosition] ?? items[Math.min(oldPosition - 1, items.length - 1)], button = next ? buttons.get(next.id) : null;
        const root = owned.closest<HTMLElement>('[data-nc-root]'), table = root?.querySelector<HTMLButtonElement>('button[aria-controls]');
        (button && !button.disabled ? button : table && !table.hidden && !table.disabled ? table : root)?.focus({ preventScroll: true });
      }
      for (const [id, button] of buttons) if (!ids.has(id)) { button.remove(); buttons.delete(id); }
    },
    disable(value) { for (const button of buttons.values()) button.disabled = value; },
    destroy() { owned = null; callback = null; buttons.clear(); listeners.clear(); },
  };
}
