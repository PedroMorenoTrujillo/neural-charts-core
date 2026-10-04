export type InteractionHandlers = Readonly<{ revision(): number; enabled(): boolean; pointer(x: number, y: number, intent: 'hover' | 'pointer' | 'touch'): void; leave(): void; focus(): void; blur(): void; key(key: string, ctrl: boolean): boolean; closeDetail(): void; reposition(): void }>;
export function attachLineInteraction(body: HTMLElement, grid: HTMLElement, detail: HTMLElement, handlers: InteractionHandlers): Readonly<{ destroy(): void }> {
  let callback: InteractionHandlers | null = handlers;
  type Gesture = { id: number; x: number; y: number; revision: number; touch: boolean };
  let gesture: Gesture | null = null;
  const subscriptions: Array<Readonly<{ element: EventTarget; type: string; listener: EventListener; options?: AddEventListenerOptions | boolean }>> = [];
  const add = (element: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean): void => { element.addEventListener(type, listener, options); subscriptions.push({ element, type, listener, ...(options !== undefined ? { options } : {}) }); };
  const excluded = (event: Event): boolean => !!(event.target as HTMLElement | null)?.closest('button,[data-nc-table],[data-nc-detail]');
  add(body, 'pointermove', ((event: PointerEvent) => { if (callback?.enabled() && event.pointerType !== 'touch' && !excluded(event)) callback.pointer(event.clientX, event.clientY, 'hover'); }) as EventListener, { passive: true });
  add(body, 'pointerdown', ((event: PointerEvent) => { if (callback?.enabled() && !excluded(event) && event.button === 0) gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, revision: callback.revision(), touch: event.pointerType === 'touch' }; }) as EventListener, { passive: true });
  add(body, 'pointerup', ((event: PointerEvent) => { const g = gesture; gesture = null; if (!g || !callback?.enabled() || g.id !== event.pointerId || g.revision !== callback.revision() || excluded(event)) return; if (Math.hypot(event.clientX - g.x, event.clientY - g.y) <= 8) callback.pointer(event.clientX, event.clientY, g.touch ? 'touch' : 'pointer'); }) as EventListener, { passive: true });
  add(body, 'pointercancel', (() => { gesture = null; }) as EventListener, { passive: true });
  add(body, 'pointerleave', (() => { gesture = null; callback?.leave(); }) as EventListener, { passive: true });
  add(grid, 'focus', (() => callback?.focus()) as EventListener); add(grid, 'blur', (() => callback?.blur()) as EventListener);
  add(grid, 'keydown', ((event: KeyboardEvent) => { if (!event.altKey && !event.metaKey && callback?.key(event.key, event.ctrlKey)) event.preventDefault(); }) as EventListener);
  add(detail, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); callback?.closeDetail(); } }) as EventListener);
  const document = body.ownerDocument, window = document.defaultView!;
  const reposition = (() => callback?.reposition()) as EventListener;
  add(document, 'scroll', reposition, { capture: true, passive: true }); add(window, 'resize', reposition, { passive: true });
  if (window.visualViewport) { add(window.visualViewport, 'scroll', reposition, { passive: true }); add(window.visualViewport, 'resize', reposition, { passive: true }); }
  return { destroy() { callback = null; gesture = null; for (const s of subscriptions) s.element.removeEventListener(s.type, s.listener, s.options); subscriptions.length = 0; } };
}
