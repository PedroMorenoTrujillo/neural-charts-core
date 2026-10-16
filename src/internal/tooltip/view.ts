import type { Shell } from '../chart/shell.js';
import type { Palette, ResolvedFont } from '../chart/presentation.js';
import type { TooltipModel } from './model.js';
import { rowText } from './model.js';
import type { Rect, PlacementResult } from './place.js';
import { intersect } from './place.js';
import { cleanup, removeOwnedNode } from '../chart/cleanup.js';
import { dockRegion, type DockGeometry } from './dock.js';
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
export interface TooltipView { write(model: TooltipModel, bounds: Rect, palette: Palette, font: ResolvedFont, direction: 'ltr' | 'rtl'): void; measure(): Readonly<{ width: number; height: number }> | null; show(placement: PlacementResult, model: TooltipModel, geometry: DockGeometry): void; close(returnFocus?: boolean): void; destroy(): void; }
export function createTooltipView(shell: Shell): TooltipView {
  let owned: Shell | null = shell, portal: HTMLDivElement | null = null;
  const content = (element: HTMLElement, model: TooltipModel): void => {
    element.dataset.ncPointId = model.pointId; element.dataset.ncSeriesId = model.seriesId; element.dataset.ncRevision = String(model.revision);
    element.dataset.ncCategory = String(model.x);
    const document = element.ownerDocument, header = document.createElement('div'); header.dataset.ncTooltipHeading = ''; header.textContent = model.displayHeader; Object.assign(header.style, { fontWeight: '600', marginBottom: '7px', lineHeight: '1.35' }); const rows: HTMLElement[] = [header];
    const alignment = (element.dir || owned?.root.dir) === 'rtl' ? 'right' : 'left';
    if (model.isolateText) { header.dir = typeof model.x === 'number' ? 'ltr' : 'auto'; header.style.textAlign = alignment; }
    for (const row of model.rows) {
      const line = document.createElement('div'), swatch = document.createElement('span'), name = document.createElement('span'), value = document.createElement('span');
      line.dataset.ncTooltipRow = ''; Object.assign(line.style, { display: 'grid', gridTemplateColumns: '16px minmax(0,1fr) auto', gap: '7px', alignItems: 'baseline', marginTop: '4px' });
      swatch.setAttribute('aria-hidden', 'true'); Object.assign(swatch.style, { display: 'inline-block', width: '16px', alignSelf: 'center', borderTop: `2px ${row.dash === 'solid' ? 'solid' : row.dash === 'dashed' ? 'dashed' : 'dotted'} ${row.color}` });
      name.textContent = row.name + ': '; name.style.color = 'var(--nc-detail-muted)'; value.textContent = rowText(row).slice(row.name.length + 2); value.dataset.ncTooltipValue = ''; Object.assign(value.style, { fontWeight: row.availability === 'value' ? '600' : '400', textAlign: 'end', fontVariantNumeric: 'tabular-nums' });
      if (model.isolateText) { name.dir = 'auto'; name.style.textAlign = alignment; value.dir = row.availability === 'value' ? 'ltr' : 'auto'; }
      line.append(swatch, name, value); rows.push(line);
    }
    if (model.context) {
      const context = document.createElement('div'); context.dataset.ncTooltipContext = ''; context.textContent = model.context;
      if (model.isolateText) { context.dir = 'auto'; context.style.textAlign = alignment; }
      Object.assign(context.style, { marginTop: '8px', lineHeight: '1.4', color: 'var(--nc-detail-muted)' }); rows.push(context);
    }
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
      if (!portal) { portal = owned.root.ownerDocument.createElement('div'); portal.dataset.ncTooltip = ''; portal.dataset.ncTooltipOwner = owned.root.dataset.ncRoot!; portal.setAttribute('role', 'tooltip'); portal.setAttribute('aria-hidden', 'true'); Object.assign(portal.style, { position: 'fixed', pointerEvents: 'none', zIndex: '1000', padding: '10px 12px', boxSizing: 'border-box', overflowWrap: 'anywhere', lineHeight: '1.35', borderRadius: '5px', border: '1px solid', boxShadow: '0 3px 12px rgba(10,22,38,.14)' }); owned.root.ownerDocument.body.append(portal); }
      portal.style.visibility = 'hidden'; portal.style.left = '0'; portal.style.top = '0'; portal.style.maxWidth = `${Math.max(0, Math.min(280, bounds.width - 16))}px`; portal.style.fontFamily = font.family; portal.style.fontSize = `${font.size}px`; portal.style.fontWeight = String(font.weight); portal.style.color = palette.tooltipText; portal.style.backgroundColor = palette.tooltipSurface; portal.dir = direction;
      portal.style.borderColor = palette.grid; portal.style.setProperty('--nc-detail-muted', palette.muted); owned.detail.style.setProperty('--nc-detail-muted', palette.muted); owned.detail.style.fontSize = `${font.size}px`; owned.detail.style.lineHeight = '1.35';
      content(portal, model);
    },
    measure() { if (!portal) return null; const r = portal.getBoundingClientRect(); return { width: r.width, height: r.height }; },
    show(placement, model, geometry) {
      if (!owned) return;
      if (placement.kind === 'closed') { close(true); return; }
      // A focused dock remains the active detail until focus leaves or it closes.
      if (placement.kind === 'docked' || owned.detail.contains(owned.root.ownerDocument.activeElement)) {
        const direction = owned.root.dir === 'rtl' ? 'rtl' : 'ltr';
        const changed = owned.detail.dataset.ncPointId !== model.pointId || owned.detail.dataset.ncSeriesId !== model.seriesId;
        removeOwnedNode(portal); portal = null; content(owned.detail, model);
        const width = Math.min(280, geometry.body.width);
        Object.assign(owned.detail.style, { insetInlineEnd: 'auto', insetBlockEnd: 'auto', left: '0', top: '0', width: `${width}px`, maxHeight: `${geometry.body.height}px` });
        owned.detail.hidden = false;
        // One additional local measurement after the dock width changes. No
        // feedback job; the chosen region always excludes the selected halo.
        const height = owned.detail.offsetHeight;
        const region = dockRegion(geometry, { width, height }, direction);
        Object.assign(owned.detail.style, { left: `${region.x}px`, top: `${region.y}px`, width: `${region.width}px`, maxHeight: `${region.height}px` });
        if (changed) owned.detail.scrollTop = 0;
        return;
      }
      if (portal) { owned.detail.hidden = true; portal.style.left = `${placement.x}px`; portal.style.top = `${placement.y}px`; portal.style.visibility = 'visible'; }
    },
    close,
    destroy() { cleanup(() => close()); const node = portal; owned = null; portal = null; removeOwnedNode(node); },
  };
}
