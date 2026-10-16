import type { FrameClock } from '../platform/ports.js';
import { invalid, type Diagnostic } from '../diagnostics.js';
export type MotionSurface = Readonly<{ opacity(value: number | null): void }>;
export type ReducedMotionQuery = Readonly<{ matches(): boolean; subscribe(listener: () => void): () => void }>;
/** Own a final-geometry layer fade on the existing frame clock.
 * Importing the module never reads DOM or browser globals. */
export function createLayerMotion(clock: FrameClock, makeQuery: () => ReducedMotionQuery, onFailure?: () => void) {
  type Fade = { first: number | null; end: number | null; previous: number | null; from: number; alpha: number };
  let query: ReducedMotionQuery | null = null, unsubscribe: (() => void) | null = null, surface: MotionSurface | null = null, handle: number | null = null, epoch = 0, disposed = false, painted = false, active: Fade | null = null;
  let failure = onFailure ?? null; onFailure = undefined;
  function cancel(): void {
    epoch++; const pending = handle, target = surface; handle = null; surface = null; active = null;
    try { if (pending !== null) clock.cancel(pending); } finally { target?.opacity(null); }
  }
  function releaseQuery(): void { const release = unsubscribe; unsubscribe = null; query = null; release?.(); }
  function disable(): void { try { cancel(); } finally { releaseQuery(); } }
  function destroy(): void { if (disposed) return; disposed = true; failure = null; try { cancel(); } finally { releaseQuery(); } }
  function fail(): void { if (disposed) return; const notify = failure; try { destroy(); } catch { /* Stop all owned work before notifying. */ } try { notify?.(); } catch { /* Diagnostics cannot restart presentation work. */ } }
  function paint(mode: 'none' | 'subtle', next: MotionSurface, animate: boolean | 'continue'): void {
    if (disposed) return; const carried = active, entering = !painted; painted = true; cancel();
    if (mode === 'none') { releaseQuery(); return; }
    if (!query) {
      try { query = makeQuery(); unsubscribe = query.subscribe(() => { try { if (!disposed && query?.matches()) cancel(); } catch { fail(); } }); }
      catch { releaseQuery(); return; }
    }
    if (!animate || animate === 'continue' && !carried || query.matches()) return;
    // Updates retain visible data, and rapid retargets keep their original
    // deadline rather than repeatedly restarting an invisible layer.
    const from = animate === 'continue' ? carried!.alpha : entering ? 0 : Math.max(.65, carried?.alpha ?? .65), fade: Fade = { first: carried?.previous ?? null, end: carried?.end ?? null, previous: carried?.previous ?? null, from, alpha: from };
    active = fade; surface = next; next.opacity(from); const generation = epoch;
    const advance = (time: number): void => {
      if (disposed || generation !== epoch || !surface) return; handle = null;
      try {
      if (!Number.isFinite(time) || fade.previous !== null && time < fade.previous || query?.matches()) { cancel(); return; }
      fade.previous = time; fade.first ??= time; fade.end ??= fade.first + 160;
      if (fade.end <= fade.first) { cancel(); return; }
      const progress = Math.max(0, Math.min(1, (time - fade.first) / (fade.end - fade.first)));
      if (progress === 1) { const target = surface; surface = null; active = null; target.opacity(null); return; }
      fade.alpha = fade.from + (1 - fade.from) * (1 - (1 - progress) ** 2); surface.opacity(fade.alpha); handle = clock.request(advance);
      } catch { fail(); }
    };
    handle = clock.request(advance);
  }
  return Object.freeze({ paint, cancel, disable, destroy });
}

export type LayerMotion = ReturnType<typeof createLayerMotion>;
export function createBrowserMotion(clock: FrameClock, view: Window, report: (diagnostic: Diagnostic) => void): LayerMotion {
  return createLayerMotion(clock, () => {
    const query = view.matchMedia('(prefers-reduced-motion: reduce)');
    return { matches: () => query.matches, subscribe(listener) { query.addEventListener('change', listener); return () => query.removeEventListener('change', listener); } };
  }, () => report(invalid('INTERNAL_INVARIANT', 'DOM_WRITE_FAILED', 'motion').diagnostic));
}
export function paintLayerMotion(owner: LayerMotion | null, mode: 'none' | 'subtle' | undefined, host: HTMLElement | null, animate: boolean | 'continue'): void {
  if (!owner) return;
  const layer = host?.querySelector<SVGGElement>('[data-nc-layer="marks"]');
  if (!layer) { if (mode === 'subtle') owner.cancel(); else owner.disable(); return; }
  owner.paint(mode ?? 'none', { opacity(value) { if (value === null) layer.style.removeProperty('opacity'); else layer.style.setProperty('opacity', String(value)); } }, animate);
}
