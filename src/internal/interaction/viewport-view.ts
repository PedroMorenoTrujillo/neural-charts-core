import type { ChartResult } from '../../public/chart-types.js';
import type { ChartViewportChange } from '../../public/viewport-types.js';
import type { Shell } from '../chart/shell.js';
import { subscriptions, cleanup, removeOwnedNode } from '../chart/cleanup.js';
import type { ShellFrame, Plot } from '../layout/frame.js';
import type { FrameClock } from '../platform/ports.js';
import type { Viewport, ViewportValue } from './viewport.js';
import { requestViewport, sameViewport } from './viewport.js';
import { zoomDisplayedViewport, panDisplayedViewport, type ViewportDomains } from './viewport-display.js';
import { categoryZoomAnchor, categoryPanFraction, categoryBoxWindow } from './viewport-category.js';
import { createLinearScale } from '../math/linear.js';

export type ViewportViewState = Readonly<{ model: Viewport; plot: Plot; domains: ViewportDomains; categorySpacing?: number; horizontal: boolean; xReversed: boolean; yReversed: boolean; enabled: boolean }>;
export type ViewportView = Readonly<{ update(state: ViewportViewState | null): void; invalidate(): void; suspend(): void; destroy(): void }>;
export type ViewportViewOptions = Readonly<{ shell: Shell; clock: FrameClock; current(): ViewportViewState | null; request(value: ViewportValue, source: ChartViewportChange['source']): ChartResult<number>; begin(): void }>;
const axisKeys = ['x', 'y'] as const;
type Axis = typeof axisKeys[number];
const active = (model: Viewport, axis: Axis): boolean => model.settings.axes === 'xy' || model.settings.axes === axis;
function reserve(frame: ShellFrame, viewport: Viewport | null): number {
  if (!viewport?.settings.controls) return 0;
  const count = viewport.settings.axes === 'xy' ? 7 : 5, columns = Math.max(1, Math.floor((frame.width - 20) / 40)), height = Math.ceil(count / columns) * 40 + 4;
  return frame.body.height >= height + 32 ? height : 0;
}
/** Reserve footer space only when enabled and usable; ordinary charts preserve
 * their exact original layout. The HTML controls are not part of exported SVG. */
export function viewportShell(frame: ShellFrame, viewport: Viewport | null): ShellFrame {
  const height = reserve(frame, viewport); if (!height) return frame;
  return Object.freeze({ ...frame, body: { ...frame.body, height: frame.body.height - height }, legend: frame.legendPosition === 'end' ? { ...frame.legend, height: frame.legend.height - height } : { ...frame.legend, y: frame.legend.y - height } });
}
function shifted(model: Viewport, domains: ViewportDomains, axis: Axis, sign: number): ChartResult<Viewport> {
  const window = model.resolved[axis], bounds = model.context[axis]; let delta = sign * .25;
  if (bounds.kind === 'category' && window && !Array.isArray(window)) {
    const category = window as Readonly<{ firstId: string; lastId: string }>, count = bounds.ranks.get(category.lastId)! - bounds.ranks.get(category.firstId)! + 1;
    delta = sign * Math.max(1, Math.round(count / 4)) / count;
  }
  return panDisplayedViewport(model, domains, { [axis]: delta });
}
/** One delegated port owns controls and the ephemeral gesture. It never owns
 * applied windows: every completion returns through the controller's request. */
export function createViewportView(options: ViewportViewOptions): ViewportView {
  let owner: ViewportViewOptions | null = options;
  options = null!;
  const shell = owner.shell, doc = shell.root.ownerDocument, controls = doc.createElement('div'), surface = doc.createElement('div'), preview = doc.createElement('div');
  controls.dataset.ncViewport = ''; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Chart viewport'); controls.hidden = true;
  Object.assign(controls.style, { position: 'absolute', insetInline: '8px', bottom: '4px', display: 'none', flexWrap: 'wrap', gap: '4px', alignContent: 'start', zIndex: '2' });
  surface.dataset.ncViewportSurface = ''; surface.setAttribute('aria-hidden', 'true'); surface.hidden = true;
  Object.assign(surface.style, { position: 'absolute', touchAction: 'none', userSelect: 'none', background: 'transparent' });
  preview.setAttribute('aria-hidden', 'true'); preview.hidden = true;
  Object.assign(preview.style, { position: 'absolute', pointerEvents: 'none', boxSizing: 'border-box', border: '2px dashed var(--nc-owned-focus)', zIndex: '2' });
  const buttons = new Map<string, HTMLButtonElement>();
  for (const [key, name, text] of [['in', 'Zoom in', '+'], ['out', 'Zoom out', '−'], ['x-', 'Pan to earlier X values', 'X−'], ['x+', 'Pan to later X values', 'X+'], ['y-', 'Pan to lower Y values', 'Y−'], ['y+', 'Pan to higher Y values', 'Y+'], ['reset', 'Reset zoom', '↺']] as const) {
    const button = doc.createElement('button'); button.type = 'button'; button.dataset.ncViewportAction = key; button.setAttribute('aria-label', name); button.title = name; button.textContent = text;
    Object.assign(button.style, { width: '36px', height: '36px', padding: '4px', fontSize: '13px', fontWeight: '600', border: '1px solid var(--nc-owned-muted)', flex: '0 0 36px' });
    buttons.set(key, button); controls.append(button);
  }
  shell.root.append(controls); shell.body.append(surface, preview);
  type Drag = { id: number; screen: Readonly<{ x: number; y: number }>; start: Readonly<{ x: number; y: number }>; last: Readonly<{ x: number; y: number }>; state: ViewportViewState; matrix: DOMMatrix; claimed: boolean };
  let drag: Drag | null = null, wheel: { factor: number; anchors: Readonly<{ x: number; y: number }> } | null = null, scheduled: ReturnType<FrameClock['request']> | null = null;
  const listeners = subscriptions();
  function cancel(): void {
    const previous = drag, frame = scheduled; drag = null; wheel = null; scheduled = null;
    cleanup(() => { preview.hidden = true; });
    if (previous) cleanup(() => { if (surface.hasPointerCapture(previous.id)) surface.releasePointerCapture(previous.id); });
    if (frame !== null) cleanup(() => owner?.clock.cancel(frame));
  }
  function candidate(view: ViewportViewState, key: string): ChartResult<Viewport> {
    const model = view.model;
    return key === 'reset' ? requestViewport(model, {}) : key === 'in' || key === 'out' ? zoomDisplayedViewport(model, view.domains, key === 'in' ? 2 : .5) : shifted(model, view.domains, key[0] as Axis, key[1] === '-' ? -1 : 1);
  }
  function emit(next: ChartResult<Viewport>, source: ChartViewportChange['source'], reset = false): void {
    const current = owner?.current(); if (!current?.enabled || next.status === 'invalid') return;
    if (sameViewport(current.model.value, next.value.value)) return;
    if (!reset && sameViewport(current.model.resolved, next.value.resolved)) return;
    owner!.request(next.value.value, source);
  }
  function click(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-nc-viewport-action]'), current = owner?.current();
    if (!button || button.disabled || !controls.contains(button) || !current?.enabled) return;
    owner!.begin(); emit(candidate(current, button.dataset.ncViewportAction!), 'controls', button.dataset.ncViewportAction === 'reset');
  }
  function coordinates(event: PointerEvent | WheelEvent, matrix: DOMMatrix): Readonly<{ x: number; y: number }> { return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix); }
  function fractions(point: Readonly<{ x: number; y: number }>, view: ViewportViewState): Readonly<{ x: number; y: number }> {
    const p = view.plot, clamp = (n: number): number => Math.max(0, Math.min(1, n)), horizontal = clamp((point.x - p.x) / p.width), vertical = clamp((point.y - p.y) / p.height);
    return view.horizontal ? { x: vertical, y: view.yReversed ? 1 - horizontal : horizontal } : { x: view.xReversed ? 1 - horizontal : horizontal, y: view.yReversed ? vertical : 1 - vertical };
  }
  function matrix(): DOMMatrix | null { try { return shell.base.querySelector('svg')?.getScreenCTM()?.inverse() ?? null; } catch { return null; } }
  function down(event: PointerEvent): void {
    const view = owner?.current(), transform = matrix(); if (!view?.enabled || view.model.settings.gesture === 'none' || !transform || event.button !== 0 || !event.isPrimary || drag) return;
    const start = coordinates(event, transform); drag = { id: event.pointerId, screen: { x: event.clientX, y: event.clientY }, start, last: start, state: view, matrix: transform, claimed: false };
  }
  function move(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    const current = owner?.current(); if (!current || current.model !== drag.state.model) { cancel(); return; }
    const point = coordinates(event, drag.matrix); drag.last = point;
    if (!drag.claimed && Math.hypot(event.clientX - drag.screen.x, event.clientY - drag.screen.y) <= 8) return;
    if (!drag.claimed) {
      drag.claimed = true; owner!.begin(); if (!owner || !drag) return;
      try { surface.setPointerCapture(event.pointerId); } catch { cancel(); return; }
    }
    event.preventDefault(); event.stopPropagation();
    const plot = drag.state.plot, isZoom = drag.state.model.settings.gesture === 'zoom';
    const x = Math.max(plot.x, Math.min(plot.x + plot.width, Math.min(drag.start.x, point.x))), y = Math.max(plot.y, Math.min(plot.y + plot.height, Math.min(drag.start.y, point.y)));
    const width = Math.max(0, Math.min(plot.x + plot.width, Math.max(drag.start.x, point.x)) - x), height = Math.max(0, Math.min(plot.y + plot.height, Math.max(drag.start.y, point.y)) - y);
    const enabledX = active(drag.state.model, drag.state.horizontal ? 'y' : 'x'), enabledY = active(drag.state.model, drag.state.horizontal ? 'x' : 'y');
    preview.hidden = false;
    Object.assign(preview.style, { left: `${isZoom && enabledX ? x : plot.x}px`, top: `${isZoom && enabledY ? y : plot.y}px`, width: `${isZoom && enabledX ? width : plot.width}px`, height: `${isZoom && enabledY ? height : plot.height}px`, transform: isZoom ? '' : `translate(${enabledX ? Math.max(-plot.width, Math.min(plot.width, point.x - drag.start.x)) : 0}px,${enabledY ? Math.max(-plot.height, Math.min(plot.height, point.y - drag.start.y)) : 0}px)` });
  }
  function up(event: PointerEvent): void {
    if (!drag || drag.id !== event.pointerId) return;
    const gesture = drag, view = gesture.state, first = fractions(gesture.start, view), last = fractions(coordinates(event, gesture.matrix), view); cancel(); if (!gesture.claimed) return;
    const current = owner?.current(); if (!current || current.model !== view.model) return;
    if (view.model.settings.gesture === 'pan') { emit(panDisplayedViewport(view.model, view.domains, { x: categoryPanFraction(view.model, 'x', first.x - last.x, view.categorySpacing), y: categoryPanFraction(view.model, 'y', first.y - last.y) }), 'pointer'); return; }
    const value: { x?: ViewportValue['x']; y?: ViewportValue['y'] } = { ...view.model.value };
    for (const axis of axisKeys) {
      if (!active(view.model, axis)) continue;
      const low = Math.min(first[axis], last[axis]), high = Math.max(first[axis], last[axis]), bounds = view.model.context[axis], window = view.model.resolved[axis];
      if (!window || high - low < .01) continue;
      if (bounds.kind === 'category' && !Array.isArray(window)) {
        const selected = categoryBoxWindow(view.model, axis, low, high, axis === 'x' ? view.categorySpacing : undefined); if (selected) value[axis] = selected;
      } else if (bounds.kind !== 'category' && Array.isArray(window)) {
        const scale = createLinearScale(view.domains[axis] ?? window as readonly [number, number], [0, 1], false); if (scale.status === 'invalid') continue;
        let a = scale.value.invert(low), b = scale.value.invert(high); if (a === null || b === null) continue;
        if (bounds.kind === 'time') { a = Math.floor(a); b = Math.ceil(b); }
        if (bounds.domain) { a = Math.max(bounds.domain[0], a); b = Math.min(bounds.domain[1], b); }
        if (a < b) value[axis] = [a, b];
      }
    }
    emit(requestViewport(view.model, value), 'pointer');
  }
  function onWheel(event: WheelEvent): void {
    const current = owner?.current(), transform = matrix(); if (!current?.enabled || !current.model.settings.wheel || !transform || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
    const factor = Math.exp(Math.max(-1, Math.min(1, -event.deltaY * (event.deltaMode === 0 ? .002 : .04)))), point = fractions(coordinates(event, transform), current), anchors = { x: categoryZoomAnchor(current.model, 'x', point.x, current.categorySpacing), y: categoryZoomAnchor(current.model, 'y', point.y) };
    const candidate = zoomDisplayedViewport(current.model, current.domains, factor, anchors); if (candidate.status === 'invalid' || sameViewport(candidate.value.resolved, current.model.resolved)) return;
    event.preventDefault(); event.stopPropagation(); owner!.begin(); wheel = { factor: Math.max(.05, Math.min(20, (wheel?.factor ?? 1) * factor)), anchors };
    if (scheduled === null) scheduled = owner!.clock.request(() => { scheduled = null; const intent = wheel; wheel = null; const view = owner?.current(); if (intent && view?.enabled) emit(zoomDisplayedViewport(view.model, view.domains, intent.factor, intent.anchors), 'wheel'); });
  }
  function interrupted(event: PointerEvent): void { if (drag?.id === event.pointerId) cancel(); }
  function leave(event: PointerEvent): void { if (!drag?.claimed) interrupted(event); }
  listeners.add(controls, 'click', click as EventListener); listeners.add(surface, 'pointerdown', down as EventListener); listeners.add(surface, 'pointermove', move as EventListener); listeners.add(surface, 'pointerup', up as EventListener); listeners.add(surface, 'pointercancel', interrupted as EventListener); listeners.add(surface, 'lostpointercapture', interrupted as EventListener); listeners.add(surface, 'pointerleave', leave as EventListener); listeners.add(surface, 'wheel', onWheel as EventListener, { passive: false });
  return {
    update(next) {
      cancel();
      controls.removeAttribute('aria-busy');
      const footerTop = Math.max(shell.body.offsetTop + shell.body.offsetHeight, shell.legend.hidden ? 0 : shell.legend.offsetTop + shell.legend.offsetHeight);
      const visible = !!next?.model.settings.controls && next.enabled && footerTop + 40 <= shell.root.offsetHeight;
      controls.hidden = !visible; controls.style.display = visible ? 'flex' : 'none';
      for (const [key, button] of buttons) {
        button.hidden = !!next && (key[0] === 'x' || key[0] === 'y') && !active(next.model, key[0]);
        const result = next ? candidate(next, key) : null;
        button.disabled = !next?.enabled || !result || result.status === 'invalid' || (key === 'reset' ? sameViewport(next.model.value, {}) : sameViewport(next.model.resolved, result.value.resolved));
      }
      surface.hidden = !next?.enabled || next.model.settings.gesture === 'none' && !next.model.settings.wheel;
      if (next) Object.assign(surface.style, { left: `${next.plot.x}px`, top: `${next.plot.y}px`, width: `${next.plot.width}px`, height: `${next.plot.height}px`, touchAction: next.model.settings.gesture === 'none' ? 'auto' : 'none' });
      const focused = doc.activeElement; if (focused && controls.contains(focused) && (controls.hidden || (focused as HTMLButtonElement).disabled)) {
        const fallback = [...buttons.values()].find(button => !button.hidden && !button.disabled); (visible && fallback ? fallback : shell.grid.hidden ? shell.root : shell.grid).focus({ preventScroll: true });
      }
    },
    invalidate() { cancel(); controls.setAttribute('aria-busy', 'true'); },
    suspend() { cancel(); controls.hidden = true; controls.style.display = 'none'; surface.hidden = true; },
    destroy() {
      cancel();
      listeners.clear(); removeOwnedNode(controls); removeOwnedNode(surface); removeOwnedNode(preview); buttons.clear(); owner = null;
    }
  };
}
