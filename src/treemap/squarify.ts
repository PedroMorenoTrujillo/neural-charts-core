import type { ChartResult } from '../public/chart-types.js';
import type { Plot } from '../internal/layout/frame.js';
import { invalid, ok } from '../internal/diagnostics.js';
export type WeightedNode = Readonly<{ id: string; index: number; weight: number }>;
export type Tile = WeightedNode & Readonly<{ rect: Plot; endsRight: boolean; endsBottom: boolean }>;
export type TileStrip = Readonly<{ rect: Plot; vertical: boolean; tiles: readonly Tile[]; endsRight: boolean; endsBottom: boolean }>;
export type Tiling = Readonly<{ rect: Plot; tiles: readonly Tile[]; strips: readonly TileStrip[]; unrepresented: readonly Readonly<{ index: number; reason: 'zero' | 'underflow' | 'coordinate-resolution' }>[]; candidateChecks: number }>;
type Row = { sum: number; compensation: number; minimum: number; maximum: number; first: number; end: number };
const fresh = (index: number): Row => ({ sum: 0, compensation: 0, minimum: Infinity, maximum: 0, first: index, end: index });
/** Original Neural implementation of the row-quality heuristic described in
 * Bruls/Huizing/van Wijk (2000), section3.2, DOI10.2312/VisSym/VisSym00/033-042.
 * Uses an iterative cursor and incremental statistics, not a library or the
 * paper's recursive list pseudocode. The approved Neural rule accepts equal
 * or improved worst aspect ratio. Logs avoid squared overflow/underflow. */
function quality(sum: number, minimum: number, maximum: number, side: number): Readonly<{ worst: number; error: number }> {
  const a = 2 * Math.log(side), b = 2 * Math.log(sum), c = Math.log(maximum), d = Math.log(minimum);
  return { worst: Math.max(a + c - b, b - a - d), error: 32 * Number.EPSILON * Math.max(1, Math.abs(a) + Math.abs(b) + Math.abs(c) + Math.abs(d)) };
}
function proportionalArea(area: number, weight: number, maximum: number, normalizedSum: number): number {
  const ratio = (weight / maximum) / normalizedSum, direct = area * ratio;
  if (direct > 0) return direct;
  // Preserve representable subnormal areas even when weight/maximum rounds
  // to zero. Truly unrepresentable ratios remain explicit, never inflated.
  return Math.exp(Math.log(area) + Math.log(weight) - Math.log(maximum) - Math.log(normalizedSum));
}
export function squarify(input: readonly WeightedNode[], rect: Plot): ChartResult<Tiling> {
  if (![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0 || input.length > 10000) return invalid('INVALID_CONFIG', 'BAD_TREEMAP_BOUNDS', 'layout');
  const ids = new Set<string>(), indices = new Set<number>();
  for (const item of input) {
    if (!item || typeof item.id !== 'string' || !item.id.length || !Number.isInteger(item.index) || item.index < 0 || typeof item.weight !== 'number' || !Number.isFinite(item.weight) || item.weight < 0 || ids.has(item.id) || indices.has(item.index)) return invalid('INVALID_CONFIG', 'BAD_TREEMAP_WEIGHT', 'layout.weights');
    ids.add(item.id); indices.add(item.index);
  }
  const sorted = [...input].sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const tiles: Tile[] = [], strips: TileStrip[] = [], unrepresented: { index: number; reason: 'zero' | 'underflow' | 'coordinate-resolution' }[] = [];
  const area = rect.width * rect.height, positive = sorted.filter(item => item.weight > 0), maximum = positive[0]?.weight ?? 0;
  let normalizedSum = 0, correction = 0;
  for (const item of positive) { const adjusted = item.weight / maximum - correction, next = normalizedSum + adjusted; correction = (next - normalizedSum) - adjusted; normalizedSum = next; }
  if (!Number.isFinite(area) || !Number.isFinite(maximum * normalizedSum)) return invalid('INVALID_NUMBER', 'TREEMAP_RANGE_OVERFLOW', 'layout');
  for (const item of sorted) if (item.weight === 0) unrepresented.push({ index: item.index, reason: 'zero' });
  if (!area || rect.x + rect.width === rect.x || rect.y + rect.height === rect.y) {
    for (const item of positive) unrepresented.push({ index: item.index, reason: area ? 'coordinate-resolution' : 'underflow' });
    return ok(Object.freeze({ rect: Object.freeze({ ...rect }), tiles: Object.freeze([]), strips: Object.freeze([]), unrepresented: Object.freeze(unrepresented), candidateChecks: 0 }));
  }
  const weighted = positive.flatMap(item => { const size = proportionalArea(area, item.weight, maximum, normalizedSum); if (!size) { unrepresented.push({ index: item.index, reason: 'underflow' }); return []; } return [{ item, area: size }]; });
  let residual = { ...rect }, cursor = 0, row = fresh(0), candidateChecks = 0;
  const right = rect.x + rect.width, bottom = rect.y + rect.height;
  const tolerance = 256 * Number.EPSILON * Math.max(1, input.length);
  function boundedLength(start: number, length: number, boundary: number): number {
    let fitted = Math.max(0, Math.min(length, boundary - start));
    // Subtraction followed by addition need not reproduce the same endpoint.
    // Remove only a machine-sized residue; do not widen a tiny positive tile.
    if (start + fitted > boundary) fitted = Math.max(0, fitted - Math.max(Number.MIN_VALUE, Math.abs(fitted) * Number.EPSILON));
    return fitted;
  }
  function flush(last: boolean): boolean {
    const vertical = residual.width >= residual.height, side = vertical ? residual.height : residual.width, cross = vertical ? residual.width : residual.height;
    if (!(side > 0 && cross > 0)) { for (let i = row.first; i < row.end; i++) unrepresented.push({ index: weighted[i]!.item.index, reason: 'coordinate-resolution' }); row = fresh(cursor); return true; }
    let thickness = row.sum / side;
    if (last) {
      const remaining = side * cross;
      if (Math.abs(remaining - row.sum) / area > tolerance) return false;
      thickness = cross;
    }
    if (thickness > cross) { if ((thickness - cross) / Math.max(rect.width, rect.height) > tolerance) return false; thickness = cross; }
    if (!(thickness > 0)) { for (let i = row.first; i < row.end; i++) unrepresented.push({ index: weighted[i]!.item.index, reason: 'underflow' }); row = fresh(cursor); return true; }
    const stripRect = { x: residual.x, y: residual.y, width: vertical ? thickness : side, height: vertical ? side : thickness }, rowTiles: Tile[] = [];
    const endsRight = !vertical || last || thickness === cross, endsBottom = vertical || last || thickness === cross;
    let position = vertical ? residual.y : residual.x;
    const end = vertical ? residual.y + residual.height : residual.x + residual.width;
    for (let i = row.first; i < row.end; i++) {
      const current = weighted[i]!, length = current.area / thickness;
      let next = i === row.end - 1 ? end : position + length;
      if (next > end) { if ((next - end) / side > tolerance) return false; next = end; }
      const box = { x: vertical ? residual.x : position, y: vertical ? position : residual.y, width: vertical ? thickness : next - position, height: vertical ? next - position : thickness };
      box.width = boundedLength(box.x, box.width, right); box.height = boundedLength(box.y, box.height, bottom);
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width < 0 || box.height < 0) return false;
      if (box.width === 0 || box.height === 0 || box.x + box.width === box.x || box.y + box.height === box.y) unrepresented.push({ index: current.item.index, reason: 'coordinate-resolution' });
      else { const tile = Object.freeze({ ...current.item, rect: Object.freeze(box), endsRight: endsRight && (vertical || i === row.end - 1), endsBottom: endsBottom && (!vertical || i === row.end - 1) }); rowTiles.push(tile); tiles.push(tile); }
      position = next;
    }
    strips.push(Object.freeze({ rect: Object.freeze(stripRect), vertical, tiles: Object.freeze(rowTiles), endsRight, endsBottom }));
    const nextX = vertical ? Math.min(right, residual.x + thickness) : residual.x, nextY = vertical ? residual.y : Math.min(bottom, residual.y + thickness);
    residual = { x: nextX, y: nextY, width: Math.max(0, right - nextX), height: Math.max(0, bottom - nextY) };
    row = fresh(cursor); return true;
  }
  while (cursor < weighted.length) {
    candidateChecks++;
    const side = Math.min(residual.width, residual.height), candidate = weighted[cursor]!, adjusted = candidate.area - row.compensation, sum = row.sum + adjusted, minimum = Math.min(row.minimum, candidate.area), maximum = Math.max(row.maximum, candidate.area);
    const next = quality(sum, minimum, maximum, side), current = row.first === row.end ? null : quality(row.sum, row.minimum, row.maximum, side);
    if (!current || next.worst <= current.worst + Math.max(current.error, next.error)) { row.compensation = (sum - row.sum) - adjusted; row.sum = sum; row.minimum = minimum; row.maximum = maximum; row.end = ++cursor; }
    else if (!flush(false)) return invalid('INTERNAL_INVARIANT', 'TREEMAP_AREA_ERROR', 'layout');
  }
  if (row.first !== row.end && !flush(true)) return invalid('INTERNAL_INVARIANT', 'TREEMAP_AREA_ERROR', 'layout');
  return ok(Object.freeze({ rect: Object.freeze({ ...rect }), tiles: Object.freeze(tiles), strips: Object.freeze(strips), unrepresented: Object.freeze(unrepresented.map(item => Object.freeze(item))), candidateChecks }));
}
function contains(box: Plot, outer: Plot, x: number, y: number, endsRight: boolean, endsBottom: boolean): boolean {
  return x >= box.x && y >= box.y && (x < box.x + box.width || x === outer.x + outer.width && endsRight) && (y < box.y + box.height || y === outer.y + outer.height && endsBottom);
}
/** Strip descent plus binary row lookup. Worst case remains O(n); no generic
 * spatial library or unsupported logarithmic-complexity promise. */
export function findTile(layout: Tiling, x: number, y: number): Tile | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !contains(layout.rect, layout.rect, x, y, true, true)) return null;
  for (const strip of layout.strips) {
    if (!contains(strip.rect, layout.rect, x, y, strip.endsRight, strip.endsBottom)) continue;
    let low = 0, high = strip.tiles.length; const value = strip.vertical ? y : x;
    while (low < high) { const middle = Math.floor((low + high) / 2), tile = strip.tiles[middle]!, box = tile.rect, end = strip.vertical ? box.y + box.height : box.x + box.width; if (value < end || value === (strip.vertical ? layout.rect.y + layout.rect.height : layout.rect.x + layout.rect.width) && (strip.vertical ? tile.endsBottom : tile.endsRight)) high = middle; else low = middle + 1; }
    const tile = strip.tiles[low]; return tile && contains(tile.rect, layout.rect, x, y, tile.endsRight, tile.endsBottom) ? tile : null;
  }
  return null;
}
