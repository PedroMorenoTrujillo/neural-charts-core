import type { ChartResult } from '../public/chart-types.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { invalid, ok } from '../internal/diagnostics.js';

export const TAU = Math.PI * 2;
export type RadialValue = Readonly<{ id: string; value: number | null }>;
export type RadialSlice<P extends RadialValue> = Readonly<{ point: P; index: number; fraction: number; start: number; end: number }>;
export type RadialData<P extends RadialValue> = Readonly<{ slices: readonly RadialSlice<P>[]; eligible: readonly RadialSlice<P>[]; drawn: readonly RadialSlice<P>[]; total: number | null; missing: number; hidden: number; positive: number }>;
type Sum = { value: number; error: number };
function add(sum: Sum, value: number): number {
  const adjusted = value - sum.error, next = sum.value + adjusted;
  sum.error = (next - sum.value) - adjusted; sum.value = next; return next;
}
export function normalizeRadial<P extends RadialValue>(points: readonly P[], hiddenIds: ReadonlySet<string>): ChartResult<RadialData<P>> {
  if (!Array.isArray(points) || points.length > 10000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'radial.data');
  const ids = new Set<string>(); let maximum = 0, missing = 0, hidden = 0, positive = 0;
  const visible: { point: P; index: number }[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    if (!point || typeof point.id !== 'string' || !point.id.length || ids.has(point.id)) return invalid('INVALID_CONFIG', 'BAD_POINT_IDENTITY', 'radial.data[' + index + ']');
    ids.add(point.id);
    if (point.value !== null && (typeof point.value !== 'number' || !Number.isFinite(point.value) || point.value < 0)) return invalid('INVALID_NUMBER', 'BAD_RADIAL_VALUE', 'radial.data[' + index + '].value');
    if (hiddenIds.has(point.id)) { hidden++; continue; }
    visible.push({ point, index });
    if (point.value === null) missing++; else if (point.value > 0) { positive++; maximum = Math.max(maximum, point.value); }
  }
  for (const id of hiddenIds) if (!ids.has(id)) return invalid('INVALID_CONFIG', 'UNKNOWN_SLICE', 'radial.state.hiddenSliceIds');
  const ratioSum: Sum = { value: 0, error: 0 }, rawSum: Sum = { value: 0, error: 0 };
  let last = -1, representable = true;
  for (let i = 0; i < visible.length; i++) {
    const value = visible[i]!.point.value;
    if (value === null) continue;
    if (value > 0) last = i;
    add(ratioSum, maximum ? value / maximum : 0);
    if (representable && !Number.isFinite(add(rawSum, value))) representable = false;
  }
  const prefix: Sum = { value: 0, error: 0 }, slices: RadialSlice<P>[] = [], eligible: RadialSlice<P>[] = [], drawn: RadialSlice<P>[] = [];
  for (let i = 0; i < visible.length; i++) {
    const { point, index } = visible[i]!, fraction = maximum && point.value !== null ? (point.value / maximum) / ratioSum.value : 0;
    const start = prefix.value * TAU;
    if (fraction > 0) {
      add(prefix, fraction);
      const clamped = Math.max(start / TAU, Math.min(1, prefix.value));
      if (clamped !== prefix.value) { prefix.value = clamped; prefix.error = 0; }
    }
    if (i === last) { prefix.value = 1; prefix.error = 0; }
    const end = prefix.value * TAU, slice = Object.freeze({ point, index, fraction, start, end });
    slices.push(slice); if (point.value !== null) eligible.push(slice); if (end > start && fraction > 0) drawn.push(slice);
  }
  return ok(Object.freeze({ slices: Object.freeze(slices), eligible: Object.freeze(eligible), drawn: Object.freeze(drawn), total: representable ? rawSum.value : null, missing, hidden, positive }));
}
export type RadialFrame = Readonly<{ cx: number; cy: number; radius: number; innerRadius: number }>;
export function polar(frame: RadialFrame, radius: number, angle: number): Readonly<{ x: number; y: number }> {
  // Logical angle zero is the top seam; the SVG y axis points downwards.
  return { x: frame.cx + radius * Math.sin(angle), y: frame.cy - radius * Math.cos(angle) };
}
export function sectorPath(frame: RadialFrame, start: number, end: number): ChartResult<readonly PathCommand[]> {
  const { cx, cy, radius, innerRadius } = frame;
  if (![cx, cy, radius, innerRadius, start, end, cx - radius, cx + radius, cy - radius, cy + radius].every(Number.isFinite) || radius <= 0 || innerRadius < 0 || innerRadius >= radius || start < 0 || end < start || end > TAU) return invalid('INVALID_CONFIG', 'BAD_RADIAL_GEOMETRY', 'radial.sector');
  if (start === end) return ok(Object.freeze([]));
  const full = end - start === TAU, outerStart = polar(frame, radius, start), outerEnd = full ? outerStart : polar(frame, radius, end);
  if (!full && outerStart.x === outerEnd.x && outerStart.y === outerEnd.y) return ok(Object.freeze([]));
  const commands: PathCommand[] = [{ kind: 'M', ...outerStart }];
  if (full) {
    const opposite = polar(frame, radius, start + Math.PI);
    if (opposite.x === outerStart.x && opposite.y === outerStart.y) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'radial.sector');
    commands.push({ kind: 'A', radius, largeArc: 0, sweep: 1, ...opposite }, { kind: 'A', radius, largeArc: 0, sweep: 1, ...outerStart }, { kind: 'Z' });
    if (innerRadius > 0) {
      const innerStart = polar(frame, innerRadius, start), innerOpposite = polar(frame, innerRadius, start + Math.PI);
      if (innerOpposite.x !== innerStart.x || innerOpposite.y !== innerStart.y) commands.push({ kind: 'M', ...innerStart }, { kind: 'A', radius: innerRadius, largeArc: 0, sweep: 0, ...innerOpposite }, { kind: 'A', radius: innerRadius, largeArc: 0, sweep: 0, ...innerStart }, { kind: 'Z' });
    }
    return ok(Object.freeze(commands.map(command => Object.freeze(command))));
  }
  commands.push({ kind: 'A', radius, largeArc: end - start > Math.PI ? 1 : 0, sweep: 1, ...outerEnd });
  if (innerRadius > 0) {
    const innerEnd = polar(frame, innerRadius, full ? start : end), innerStart = polar(frame, innerRadius, start);
    commands.push({ kind: 'L', ...innerEnd });
    if (innerEnd.x !== innerStart.x || innerEnd.y !== innerStart.y) commands.push({ kind: 'A', radius: innerRadius, largeArc: end - start > Math.PI ? 1 : 0, sweep: 0, ...innerStart });
  } else commands.push({ kind: 'L', x: cx, y: cy });
  commands.push({ kind: 'Z' });
  return ok(Object.freeze(commands.map(command => Object.freeze(command))));
}
export function pickRadial<P extends RadialValue>(data: RadialData<P>, frame: RadialFrame, x: number, y: number): RadialSlice<P> | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const dx = x - frame.cx, dy = y - frame.cy, distance = Math.hypot(dx, dy);
  if (distance > frame.radius || distance < frame.innerRadius || !data.drawn.length) return null;
  if (distance === 0) return data.drawn[0]!;
  const angle = (Math.atan2(dx, -dy) + TAU) % TAU;
  // The global closing seam belongs to the last drawn slice. The tiny angular
  // tolerance covers atan2/modulo rounding, not a visual hit-area enlargement.
  if (angle <= 8 * Number.EPSILON || angle >= TAU - 8 * Number.EPSILON) return data.drawn[data.drawn.length - 1]!;
  let low = 0, high = data.drawn.length;
  while (low < high) { const middle = (low + high) >>> 1; if (angle >= data.drawn[middle]!.end) low = middle + 1; else high = middle; }
  const slice = data.drawn[low]; return slice && angle >= slice.start ? slice : null;
}
