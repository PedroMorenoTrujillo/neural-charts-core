import { subscriptions } from '../chart/cleanup.js';
export type InteractionHandlers = Readonly<{ revision(): number; enabled(): boolean; pointer(x: number, y: number, intent: 'hover' | 'pointer' | 'touch'): void; leave(): void; focus(): void; blur(next: EventTarget | null): void; key(key: string, ctrl: boolean): boolean; closeDetail(): void; reposition(): void }>;
export function attachCartesianInteraction(body: HTMLElement, grid: HTMLElement, detail: HTMLElement, handlers: InteractionHandlers): Readonly<{ pin(value: boolean, revision: number): void; cancelGesture(): void; destroy(): void }> {
  let callback: InteractionHandlers | null = handlers;
  type Gesture = { id: number; x: number; y: number; revision: number; touch: boolean };
  let gesture: Gesture | null = null;
  let lastHover: Readonly<{ id: number; type: string; x: number; y: number; revision: number }> | null = null;
  const listeners = subscriptions(), outside = subscriptions(); let root: HTMLElement | null = body.parentElement;
  const add = listeners.add;
  const excluded = (event: Event): boolean => !!(event.target as HTMLElement | null)?.closest('button,[data-nc-table],[data-nc-detail]');
  try {
  add(body, 'pointermove', ((event: PointerEvent) => {
    if (!callback?.enabled() || event.pointerType === 'touch' || excluded(event)) return;
    const revision = callback.revision(), { pointerId: id, pointerType: type, clientX: x, clientY: y } = event;
    // Browsers can echo unchanged coordinates after scroll. Reposition already
    // follows the logical datum; re-hit-testing here would lose that hover.
    if (lastHover?.revision === revision && lastHover.id === id && lastHover.type === type && lastHover.x === x && lastHover.y === y) return;
    lastHover = { id, type, x, y, revision }; callback.pointer(x, y, 'hover');
  }) as EventListener, { passive: true });
  add(body, 'pointerdown', ((event: PointerEvent) => { if (callback?.enabled() && !excluded(event) && event.button === 0) gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, revision: callback.revision(), touch: event.pointerType === 'touch' }; }) as EventListener, { passive: true });
  add(body, 'pointerup', ((event: PointerEvent) => { const g = gesture; gesture = null; if (!g || !callback?.enabled() || g.id !== event.pointerId || g.revision !== callback.revision() || excluded(event)) return; if (Math.hypot(event.clientX - g.x, event.clientY - g.y) <= 8) callback.pointer(event.clientX, event.clientY, g.touch ? 'touch' : 'pointer'); }) as EventListener, { passive: true });
  add(body, 'pointercancel', (() => { gesture = null; lastHover = null; }) as EventListener, { passive: true });
  add(body, 'pointerleave', (() => { gesture = null; lastHover = null; callback?.leave(); }) as EventListener, { passive: true });
  add(grid, 'focus', (() => callback?.focus()) as EventListener); add(grid, 'blur', ((event: FocusEvent) => callback?.blur(event.relatedTarget)) as EventListener);
  add(grid, 'keydown', ((event: KeyboardEvent) => { if (!event.altKey && !event.metaKey && callback?.key(event.key, event.ctrlKey)) event.preventDefault(); }) as EventListener);
  add(detail, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); callback?.closeDetail(); } }) as EventListener);
  const document = body.ownerDocument, window = document.defaultView!;
  const reposition = (() => callback?.reposition()) as EventListener;
  add(document, 'scroll', reposition, { capture: true, passive: true }); add(window, 'resize', reposition, { passive: true });
  if (window.visualViewport) { add(window.visualViewport, 'scroll', reposition, { passive: true }); add(window.visualViewport, 'resize', reposition, { passive: true }); }
  } catch (error) { callback = null; gesture = null; lastHover = null; root = null; listeners.clear(); throw error; }
  return {
    cancelGesture() { gesture = null; },
    pin(value, revision) {
      outside.clear();
      if (value && root && callback) outside.add(root.ownerDocument, 'pointerdown', event => {
        if (callback?.revision() === revision && root && !root.contains(event.target as Node | null)) callback.closeDetail();
      }, { capture: true, passive: true });
    },
    destroy() { callback = null; gesture = null; lastHover = null; root = null; outside.clear(); listeners.clear(); },
  };
}
