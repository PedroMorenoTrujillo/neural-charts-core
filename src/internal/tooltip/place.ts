export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type Placement = 'top' | 'bottom' | 'start' | 'end';
export type PlacementResult = Readonly<{ kind: 'floating'; x: number; y: number; placement: Placement }> | Readonly<{ kind: 'docked' }> | Readonly<{ kind: 'closed' }>;
export function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
export function placeTooltip(anchor: Rect, size: Readonly<{ width: number; height: number }>, allowed: Rect, preferred: Placement, direction: 'ltr' | 'rtl', avoidAnchor = false): PlacementResult {
  if (![anchor.x, anchor.y, anchor.width, anchor.height, size.width, size.height, allowed.x, allowed.y, allowed.width, allowed.height].every(Number.isFinite) || allowed.width <= 16 || allowed.height <= 16) return { kind: 'closed' };
  const bounds = { x: allowed.x + 8, y: allowed.y + 8, width: allowed.width - 16, height: allowed.height - 16 };
  if (size.width > bounds.width || size.height > bounds.height) return { kind: 'docked' };
  const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', start: 'end', end: 'start' }, canonical: readonly Placement[] = ['top', 'bottom', 'end', 'start'];
  const order = [...new Set([preferred, opposite[preferred], ...canonical])];
  let best: Readonly<{ x: number; y: number; placement: Placement }> | null = null, overflow = Infinity;
  let clear: Readonly<{ x: number; y: number; placement: Placement }> | null = null, clearOverflow = Infinity;
  for (const placement of order) {
    const leftward = placement === (direction === 'ltr' ? 'start' : 'end');
    const x = placement === 'top' || placement === 'bottom' ? anchor.x + anchor.width / 2 - size.width / 2 : leftward ? anchor.x - 8 - size.width : anchor.x + anchor.width + 8;
    const y = placement === 'top' ? anchor.y - 8 - size.height : placement === 'bottom' ? anchor.y + anchor.height + 8 : anchor.y + anchor.height / 2 - size.height / 2;
    const candidate = { x, y, placement }, intersection = intersect({ x, y, ...size }, bounds), area = size.width * size.height - intersection.width * intersection.height;
    if (area === 0) return { kind: 'floating', ...candidate };
    if (avoidAnchor && area < clearOverflow) {
      const shifted = { ...candidate, x: Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - size.width)), y: Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - size.height)) };
      const overlap = intersect({ ...shifted, ...size }, anchor);
      if (!overlap.width || !overlap.height) { clear = shifted; clearOverflow = area; }
    }
    if (area < overflow) { overflow = area; best = candidate; }
  }
  if (avoidAnchor) return clear ? { kind: 'floating', ...clear } : { kind: 'docked' };
  return { kind: 'floating', ...best!, x: Math.max(bounds.x, Math.min(best!.x, bounds.x + bounds.width - size.width)), y: Math.max(bounds.y, Math.min(best!.y, bounds.y + bounds.height - size.height)) };
}
