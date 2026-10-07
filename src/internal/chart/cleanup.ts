// B composition cleanup: one failed release must not strand sibling ownership.
export function cleanup(release: () => void): void { try { release(); } catch { /* Continue all remaining releases. */ } }
export function removeOwnedNode(node: Element | null): void {
  if (!node) return;
  try { node.remove(); } catch { cleanup(() => { node.parentNode?.removeChild(node); }); }
}
export function subscriptions(): Readonly<{ add(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions | boolean): void; clear(): void }> {
  const owned: Array<{ target: EventTarget; type: string; listener: EventListener; options?: AddEventListenerOptions | boolean }> = [];
  const clear = (): void => { for (const item of owned.splice(0).reverse()) cleanup(() => item.target.removeEventListener(item.type, item.listener, item.options)); };
  return {
    add(target, type, listener, options) {
      // Register ownership before an API may perform its side effect and throw.
      owned.push({ target, type, listener, ...(options === undefined ? {} : { options }) });
      try { target.addEventListener(type, listener, options); } catch (error) { clear(); throw error; }
    },
    clear,
  };
}
