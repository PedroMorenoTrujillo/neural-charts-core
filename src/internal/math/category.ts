import { invalid, ok } from '../diagnostics.js';
import type { Result } from '../diagnostics.js';
import { isFiniteNumber, normalizeZero } from './finite.js';
export interface CategoryFrame {
  readonly ids: readonly string[]; readonly range: readonly [number, number]; readonly edgeSpacing: number;
  readonly step: number; readonly direction: 1 | -1; readonly invertible: boolean;
  centerAt(index: number): number | null;
}
export interface PointScale {
  readonly frame: CategoryFrame;
  center(id: string): number | null; indexAt(pixel: number): number | null; categoryAt(pixel: number): string | null;
}
export type Band = Readonly<{ index: number; id: string; start: number; end: number; center: number; width: number }>;
export interface BandScale extends PointScale {
  readonly gapRatio: number; readonly width: number; readonly gap: number; readonly outerStart: number; readonly outerEnd: number;
  band(id: string): Band | null; bandAt(pixel: number): Band | null;
}
export function createCategoryFrame(ids: readonly string[], range: readonly [number, number], edgeSpacing: number): Result<CategoryFrame> {
  if (!Array.isArray(ids) || ids.length > 1_000_000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'ids');
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== 'string' || !id.length) return invalid('INVALID_CONFIG', 'BAD_CATEGORY_ID', `ids[${i}]`);
    if (seen.has(id)) return invalid('INVALID_CONFIG', 'DUPLICATE_ID', `ids[${i}]`);
    seen.add(id);
  }
  if (!Array.isArray(range) || range.length !== 2 || !range.every(isFiniteNumber)) return invalid('INVALID_NUMBER', 'NONFINITE', 'range');
  if (!isFiniteNumber(edgeSpacing) || edgeSpacing < 0) return invalid('INVALID_CONFIG', 'BAD_EDGE_SPACING', 'edgeSpacing');
  const [r0, r1] = range, n = ids.length, length = Math.abs(r1 - r0), denominator = n - 1 + 2 * edgeSpacing;
  if (!Number.isFinite(length) || (n > 1 && !Number.isFinite(denominator))) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE', 'range');
  const step = n === 0 ? 0 : n === 1 ? length : length / denominator;
  const centers: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : (edgeSpacing + i) / denominator;
    const center = normalizeZero(r0 + (r1 - r0) * t);
    if (!Number.isFinite(center) || (length > 0 && i > 0 && center === centers[i - 1])) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE', 'centers');
    centers.push(center);
  }
  return ok(Object.freeze({ ids: Object.freeze([...ids]), range: Object.freeze([...range]) as readonly [number, number], edgeSpacing, step, direction: r1 >= r0 ? 1 as const : -1 as const, invertible: n > 0 && length > 0,
    centerAt: (index: number) => Number.isInteger(index) && index >= 0 && index < n ? centers[index]! : null }));
}
export function createPointScale(frame: CategoryFrame): PointScale {
  const indices = new Map(frame.ids.map((id, i) => [id, i]));
  function indexAt(pixel: number): number | null {
    if (!frame.invertible || !isFiniteNumber(pixel) || pixel < Math.min(...frame.range) || pixel > Math.max(...frame.range)) return null;
    if (frame.ids.length === 1) return 0;
    const u = frame.direction * (pixel - frame.range[0]);
    const raw = u / frame.step - frame.edgeSpacing;
    const low = Math.max(0, Math.min(frame.ids.length - 1, Math.floor(raw)));
    const high = Math.min(frame.ids.length - 1, low + 1);
    const dl = Math.abs(pixel - frame.centerAt(low)!), dh = Math.abs(pixel - frame.centerAt(high)!);
    return dh <= dl ? high : low;
  }
  return Object.freeze({ frame, center: (id: string) => { const i = indices.get(id); return i === undefined ? null : frame.centerAt(i); }, indexAt,
    categoryAt: (pixel: number) => { const index = indexAt(pixel); return index === null ? null : frame.ids[index]!; } });
}
export function createBandScale(frame: CategoryFrame, gapRatio: number): Result<BandScale> {
  if (!isFiniteNumber(gapRatio) || gapRatio < 0 || gapRatio >= 1) return invalid('INVALID_CONFIG', 'BAD_GAP', 'gapRatio');
  if (frame.ids.length > 1 && frame.edgeSpacing < (1 - gapRatio) / 2) return invalid('INVALID_CONFIG', 'BAD_EDGE_SPACING', 'edgeSpacing');
  const width = frame.step * (1 - gapRatio), gap = frame.step * gapRatio, point = createPointScale(frame);
  const bands: Band[] = [];
  for (let i = 0; i < frame.ids.length; i++) {
    const center = frame.centerAt(i)!, n = frame.ids.length, denominator = n - 1 + 2 * frame.edgeSpacing;
    const leading = n === 1 ? gapRatio / 2 : (frame.edgeSpacing + i - (1 - gapRatio) / 2) / denominator;
    const trailing = n === 1 ? 1 - gapRatio / 2 : (frame.edgeSpacing + i + (1 - gapRatio) / 2) / denominator;
    const at = (t: number) => normalizeZero(t === 0 ? frame.range[0] : t === 1 ? frame.range[1] : frame.range[0] + (frame.range[1] - frame.range[0]) * t);
    const start = leading === 0 || gapRatio === 0 ? at(leading) : normalizeZero(center - frame.direction * width / 2);
    const end = trailing === 1 || gapRatio === 0 ? at(trailing) : normalizeZero(center + frame.direction * width / 2);
    if (!isFiniteNumber(start) || !isFiniteNumber(end) || (width > 0 && start === end) || Math.min(start, end) < Math.min(...frame.range) || Math.max(start, end) > Math.max(...frame.range)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE', 'bands');
    bands.push(Object.freeze({ index: i, id: frame.ids[i]!, start, end, center, width }));
  }
  const map = new Map(bands.map(b => [b.id, b]));
  const outer = frame.ids.length === 0 ? 0 : frame.ids.length === 1 ? Math.abs(frame.range[1] - frame.range[0]) * gapRatio / 2 : (frame.edgeSpacing - (1 - gapRatio) / 2) * frame.step;
  return ok(Object.freeze({ ...point, gapRatio, width, gap, outerStart: outer, outerEnd: outer,
    band: (id: string) => map.get(id) ?? null,
    bandAt: (pixel: number) => {
      const nearest = point.indexAt(pixel);
      if (nearest === null) return null;
      const u = frame.direction * (pixel - frame.range[0]);
      for (let i = Math.max(0, nearest - 1); i <= Math.min(bands.length - 1, nearest + 1); i++) {
        const b = bands[i]!, leading = frame.direction * (b.start - frame.range[0]), trailing = frame.direction * (b.end - frame.range[0]);
        if (u >= leading && (u < trailing || (i === bands.length - 1 && u === trailing))) return b;
      }
      return null;
    } }));
}
