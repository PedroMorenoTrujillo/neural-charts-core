import type { Shell } from '../chart/shell.js';
import type { Palette, ResolvedFont } from '../chart/presentation.js';
import type { TooltipModel } from './model.js';
import { rowText } from './model.js';
import type { Rect, PlacementResult } from './place.js';
import { intersect } from './place.js';
import { cleanup, removeOwnedNode } from '../chart/cleanup.js';
export function allowedRect(host: HTMLElement): Rect {
  const doc = host.ownerDocument, win = doc.defaultView!, r = host.getBoundingClientRect(), style = win.getComputedStyle(host), sx = host.offsetWidth ? r.width / host.offsetWidth : 1, sy = host.offsetHeight ? r.height / host.offsetHeight : 1;
  const px = (name: string): number => parseFloat(style.getPropertyValue(name)) || 0;
  const left = (px('border-left-width') + px('padding-left')) * sx, right = (px('border-right-width') + px('padding-right')) * sx, top = (px('border-top-width') + px('padding-top')) * sy, bottom = (px('border-bottom-width') + px('padding-bottom')) * sy;
  let bounds: Rect = { x: r.x + left, y: r.y + top, width: Math.max(0, r.width - left - right), height: Math.max(0, r.height - top - bottom) };
  const viewport = win.visualViewport; bounds = intersect(bounds, viewport ? { x: viewport.offsetLeft, y: viewport.offsetTop, width: viewport.width, height: viewport.height } : { x: 0, y: 0, width: win.innerWidth, height: win.innerHeight });
  for (let ancestor = host.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const s = win.getComputedStyle(ancestor), clipsX = /^(hidden|clip|auto|scroll)$/.test(s.overflowX), clipsY = /^(hidden|clip|auto|scroll)$/.test(s.overflowY);
    if (!clipsX && !clipsY) continue;
    const b = ancestor.getBoundingClientRect(); bounds = intersect(bounds, { x: clipsX ? b.x : bounds.x, y: clipsY ? b.y : bounds.y, width: clipsX ? b.width : bounds.width, height: clipsY ? b.height : bounds.height });
  }
  return bounds;
}
export function unsupportedPortalMapping(document: Document): boolean {
  const win = document.defaultView; if (!win) return true;
  for (const element of [document.documentElement, document.body]) {
    const s = win.getComputedStyle(element);
    if (s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' || /(?:paint|layout|strict|content)/.test(s.contain) || /transform|perspective|filter/.test(s.willChange)) return true;
  }
  return false;
}
export interface TooltipView { write(model: TooltipModel, bounds: Rect, palette: Palette, font: ResolvedFont, direction: 'ltr' | 'rtl'): void; measure(): Readonly<{ width: number; height: number }> | null; show(placement: PlacementResult, model: TooltipModel): void; close(returnFocus?: boolean): void; destroy(): void; }
export function createTooltipView(shell: Shell): TooltipView {
  let owned: Shell | null = shell, portal: HTMLDivElement | null = null;
  const content = (element: HTMLElement, model: TooltipModel): void => {
    element.dataset.ncPointId = model.pointId; element.dataset.ncSeriesId = model.seriesId; element.dataset.ncRevision = String(model.revision);
    const document = element.ownerDocument, header = document.createElement('div'); header.textContent = model.header; header.style.fontWeight = '600'; const rows: HTMLElement[] = [header];
    for (const row of model.rows) { const line = document.createElement('div'), swatch = document.createElement('span'); swatch.setAttribute('aria-hidden', 'true'); Object.assign(swatch.style, { display: 'inline-block', width: '16px', marginInlineEnd: '6px', borderTop: `2px ${row.dash === 'solid' ? 'solid' : row.dash === 'dashed' ? 'dashed' : 'dotted'} ${row.color}` }); line.append(swatch, document.createTextNode(rowText(row))); rows.push(line); }
    element.replaceChildren(...rows);
  };
  const close = (returnFocus = false): void => {
    if (!owned) return;
    if (returnFocus && owned.detail.contains(owned.root.ownerDocument.activeElement)) owned.grid.focus({ preventScroll: true });
    removeOwnedNode(portal); portal = null; owned.detail.hidden = true; owned.detail.replaceChildren();
  };
  return {
    write(model, bounds, palette, font, direction) {
      if (!owned) return;
      if (!portal) { portal = owned.root.ownerDocument.createElement('div'); portal.dataset.ncTooltip = ''; portal.setAttribute('role', 'tooltip'); portal.setAttribute('aria-hidden', 'true'); Object.assign(portal.style, { position: 'fixed', pointerEvents: 'none', zIndex: '1000', padding: '8px', boxSizing: 'border-box', overflowWrap: 'anywhere', lineHeight: '1.25', borderRadius: '4px' }); owned.root.ownerDocument.body.append(portal); }
      portal.style.visibility = 'hidden'; portal.style.left = '0'; portal.style.top = '0'; portal.style.maxWidth = `${Math.max(0, Math.min(280, bounds.width - 16))}px`; portal.style.fontFamily = font.family; portal.style.fontSize = `${font.size}px`; portal.style.fontWeight = String(font.weight); portal.style.color = palette.tooltipText; portal.style.backgroundColor = palette.tooltipSurface; portal.dir = direction;
      content(portal, model);
    },
    measure() { if (!portal) return null; const r = portal.getBoundingClientRect(); return { width: r.width, height: r.height }; },
    show(placement, model) {
      if (!owned) return;
      if (placement.kind === 'closed') { close(true); return; }
      // A focused dock remains the active detail until focus leaves or it closes.
      if (placement.kind === 'docked' || owned.detail.contains(owned.root.ownerDocument.activeElement)) { removeOwnedNode(portal); portal = null; content(owned.detail, model); owned.detail.hidden = false; return; }
      if (portal) { owned.detail.hidden = true; portal.style.left = `${placement.x}px`; portal.style.top = `${placement.y}px`; portal.style.visibility = 'visible'; }
    },
    close,
    destroy() { cleanup(() => close()); const node = portal; owned = null; portal = null; removeOwnedNode(node); },
  };
}
