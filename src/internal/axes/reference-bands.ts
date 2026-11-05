import type { Result } from '../diagnostics.js';
import type { Domain } from '../math/domain.js';
import type { Plot } from '../layout/frame.js';
import type { Layers } from '../axes/scene.js';
import { record, array, text, number, color, choice, ValidationFailure, fail } from '../data/validation.js';
import { invalid, ok } from '../diagnostics.js';
export type ReferenceBand = Readonly<{ id: string; axis: 'x' | 'y'; from: string | number; to: string | number; label?: string; color?: string; opacity?: number }>;
export type ReferenceAxisContract = Readonly<{ type: 'linear' | 'time' }> | Readonly<{ type: 'category'; ranks: ReadonlyMap<string, number> }>;
export type ReferenceBandAxis = (Readonly<{ type: 'linear' | 'time'; domain: Domain | null; map(value: number): number | null }> | Readonly<{ type: 'category'; ranks: ReadonlyMap<string, number>; first: number; last: number; slot(rank: number): readonly [number, number] | null }>) & Readonly<{ dimension?: 'x' | 'y' }>;
export type ProjectedReferenceBand = Readonly<{ band: ReferenceBand; box: Plot }>;
export function validateReferenceBands(input: unknown, axes: Readonly<{ x: ReferenceAxisContract; y: ReferenceAxisContract }>): Result<readonly ReferenceBand[]> {
  try {
    const ids = new Set<string>(), bands = array(input, 16, 'referenceBands').map((input, i) => {
      const path = 'referenceBands[' + i + ']', value = record(input, ['id', 'axis', 'from', 'to', 'label', 'color', 'opacity'], ['id', 'axis', 'from', 'to'], path), id = text(value.id, path + '.id', 64); if (ids.has(id)) fail(path + '.id', 'DUPLICATE_ID'); ids.add(id);
      const axis = choice(value.axis, ['x', 'y'], path + '.axis'), contract = axes[axis]; let from: string | number, to: string | number;
      if (contract.type === 'category') { from = text(value.from, path + '.from', 128); to = text(value.to, path + '.to', 128); const low = contract.ranks.get(from), high = contract.ranks.get(to); if (low === undefined || high === undefined) fail(path, 'UNKNOWN_CATEGORY', 'UNKNOWN_CATEGORY'); if (low > high) fail(path, 'REVERSED_REFERENCE_BAND'); }
      else { from = number(value.from, path + '.from'); to = number(value.to, path + '.to'); if (!(from < to)) fail(path, 'REVERSED_REFERENCE_BAND'); if (contract.type === 'time' && (![from, to].every(Number.isInteger) || Math.abs(from) > 8.64e15 || Math.abs(to) > 8.64e15)) fail(path, 'OUTSIDE_DATE_RANGE', 'INVALID_DOMAIN'); }
      return Object.freeze({ id, axis, from, to, ...(Object.hasOwn(value, 'label') ? { label: text(value.label, path + '.label') } : {}), ...(Object.hasOwn(value, 'color') ? { color: color(value.color, path + '.color') } : {}), ...(Object.hasOwn(value, 'opacity') ? { opacity: number(value.opacity, path + '.opacity', 0, 1) } : {}) });
    }); return ok(Object.freeze(bands));
  } catch (error) { return error instanceof ValidationFailure ? { status: 'invalid', diagnostic: error.diagnostic } : invalid('INVALID_CONFIG', 'BAD_REFERENCE_BANDS', 'referenceBands'); }
}
/** Numeric clipping precedes mapping. Category slots come from the existing
 * physical frame rather than a second scale or a label-based identity. */
export function projectReferenceBands(bands: readonly ReferenceBand[], plot: Plot, axes: Readonly<{ x: ReferenceBandAxis; y: ReferenceBandAxis }>): Result<readonly ProjectedReferenceBand[]> {
  if (![plot.x, plot.y, plot.width, plot.height, plot.x + plot.width, plot.y + plot.height].every(Number.isFinite) || plot.width < 0 || plot.height < 0) return invalid('INVALID_CONFIG', 'BAD_PLOT', 'referenceBands.plot');
  if (!plot.width || !plot.height) return ok(Object.freeze([])); const output: ProjectedReferenceBand[] = [];
  for (const band of bands) {
    const axis = axes[band.axis]; let a: number | null, b: number | null;
    if (axis.type === 'category') {
      const low = typeof band.from === 'string' ? axis.ranks.get(band.from) : undefined, high = typeof band.to === 'string' ? axis.ranks.get(band.to) : undefined;
      if (low === undefined || high === undefined || low > high) return invalid('INVALID_CONFIG', 'BAD_REFERENCE_BAND', band.id);
      const first = Math.max(low, axis.first), last = Math.min(high, axis.last); if (first > last) continue;
      const start = axis.slot(first), end = axis.slot(last); if (!start || !end) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_REFERENCE_BAND', band.id);
      a = Math.min(...start, ...end); b = Math.max(...start, ...end);
    } else {
      if (typeof band.from !== 'number' || typeof band.to !== 'number' || !(band.from < band.to)) return invalid('INVALID_CONFIG', 'BAD_REFERENCE_BAND', band.id);
      if (!axis.domain || band.to <= axis.domain[0] || band.from >= axis.domain[1]) continue;
      a = axis.map(Math.max(axis.domain[0], band.from)); b = axis.map(Math.min(axis.domain[1], band.to));
    }
    if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_REFERENCE_BAND', band.id);
    const dimension = axis.dimension ?? band.axis, minimum = dimension === 'x' ? plot.x : plot.y, maximum = minimum + (dimension === 'x' ? plot.width : plot.height), start = Math.max(minimum, Math.min(a, b)), end = Math.min(maximum, Math.max(a, b)); if (!(start < end)) continue;
    const box = Object.freeze(dimension === 'x' ? { x: start, y: plot.y, width: end - start, height: plot.height } : { x: plot.x, y: start, width: plot.width, height: end - start }); output.push(Object.freeze({ band, box }));
  }
  return ok(Object.freeze(output));
}
export function referenceBandsScene(bands: readonly ProjectedReferenceBand[], ink: string, layers: Layers): void {
  for (const { band, box } of bands) layers['reference-bands'].push({ type: 'rect', key: 'band:' + band.id.length + ':' + band.id, ...box, clipKey: 'plot', presentation: { fill: { type: 'solid', value: band.color ?? ink }, fillOpacity: band.opacity ?? .12 } });
}
