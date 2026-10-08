import type { Rect } from './place.js';

export type DockGeometry = Readonly<{ anchor: Rect; plot: Rect; body: Rect }>;
// All inputs are committed body-local CSS pixels. The selected halo plus an
// 8px clearance is excluded; no viewport/portal mapping is needed by the dock.
export function dockRegion({ anchor, plot, body }: DockGeometry, size: Readonly<{ width: number; height: number }>, direction: 'ltr' | 'rtl'): Rect {
  const gap = 8, left = anchor.x - gap, right = anchor.x + anchor.width + gap, top = anchor.y - gap, bottom = anchor.y + anchor.height + gap;
  const regions = (bounds: Rect): Rect[] => {
    const end = bounds.x + bounds.width, floor = bounds.y + bounds.height;
    const sides = [
      { x: Math.max(bounds.x, right), y: bounds.y, width: Math.max(0, end - Math.max(bounds.x, right)), height: bounds.height },
      { x: bounds.x, y: bounds.y, width: Math.max(0, Math.min(end, left) - bounds.x), height: bounds.height },
    ];
    if (direction === 'rtl') sides.reverse();
    return [...sides,
      { x: bounds.x, y: bounds.y, width: bounds.width, height: Math.max(0, Math.min(floor, top) - bounds.y) },
      { x: bounds.x, y: Math.max(bounds.y, bottom), width: bounds.width, height: Math.max(0, floor - Math.max(bounds.y, bottom)) },
    ];
  };
  // Keep X tick/title space free. First prefer a complete detail inside the
  // plot; then use the body band above its bottom, with native scrolling.
  const band = { ...body, height: Math.max(0, Math.min(body.height, plot.y + plot.height - body.y)) };
  const plotRegions = regions(plot), bodyRegions = regions(band);
  const full = plotRegions.find(r => r.width >= size.width && r.height >= size.height);
  const candidates = bodyRegions.filter(r => r.width >= Math.min(96, body.width) && r.height >= 32);
  const selected = full ?? candidates.reduce<Rect | null>((best, r) => {
    const score = (v: Rect) => Math.min(v.width, size.width) * Math.min(v.height, size.height);
    return !best || score(r) > score(best) ? r : best;
  }, null) ?? [...bodyRegions, ...regions(body)].reduce((best, r) => r.width * r.height > best.width * best.height ? r : best);
  const width = Math.min(size.width, selected.width);
  return { x: direction === 'ltr' ? selected.x + selected.width - width : selected.x, y: selected.y, width, height: selected.height };
}
