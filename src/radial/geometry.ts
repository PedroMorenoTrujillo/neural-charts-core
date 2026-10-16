import type { ChartResult } from '../public/chart-types.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { invalid, ok } from '../internal/diagnostics.js';
import type { PieSlice, RadialChartSpec, RadialState } from '../public/radial-types.js';
import { normalizeRadial, sectorPath, polar, TAU } from './math.js';
import type { RadialData, RadialFrame, RadialSlice } from './math.js';
export type RadialBounds = Readonly<{ x: number; y: number; width: number; height: number }>;
export type RadialMark<T> = Readonly<{ slice: RadialSlice<PieSlice<T>>; commands: readonly PathCommand[]; anchor: Readonly<{ x: number; y: number }> }>;
export type RadialProjection<T> = Readonly<{ bounds: RadialBounds; frame: RadialFrame; data: RadialData<PieSlice<T>>; marks: readonly RadialMark<T>[]; markById: ReadonlyMap<string, RadialMark<T>>; byId: ReadonlyMap<string, RadialSlice<PieSlice<T>>>; rankById: ReadonlyMap<string, number>; outsideLabels: boolean; tooSmall: boolean }>;
export function projectRadial<T>(spec: RadialChartSpec<T>, state: RadialState, bounds: RadialBounds): ChartResult<RadialProjection<T>> {
  if (![bounds.x, bounds.y, bounds.width, bounds.height, bounds.x + bounds.width, bounds.y + bounds.height].every(Number.isFinite) || bounds.width < 0 || bounds.height < 0) return invalid('INVALID_CONFIG', 'BAD_RADIAL_BOUNDS', 'plot');
  const normalized = normalizeRadial(spec.data, new Set(state.hiddenSliceIds)); if (normalized.status === 'invalid') return normalized;
  const outsideLabels = (spec.labels ?? 'outside') === 'outside' && bounds.width >= 480;
  const sideBudget = outsideLabels ? Math.min(132, bounds.width * .22) + 16 : 12;
  const radius = Math.max(0, Math.min(bounds.width / 2 - sideBudget, bounds.height / 2 - 12));
  const frame: RadialFrame = Object.freeze({ cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2, radius, innerRadius: radius * (spec.family === 'donut' ? spec.holeRatio ?? .6 : 0) });
  const tooSmall = radius < 12, marks: RadialMark<T>[] = [], byId = new Map(normalized.value.eligible.map(slice => [slice.point.id, slice]));
  if (!tooSmall) for (const slice of normalized.value.drawn) {
    const path = sectorPath(frame, slice.start, slice.end); if (path.status === 'invalid') return path;
    if (path.value.length) marks.push(Object.freeze({ slice, commands: path.value, anchor: Object.freeze(polar(frame, (frame.radius + frame.innerRadius) / 2, slice.start + (slice.end - slice.start) / 2)) }));
  }
  const rankById = new Map(normalized.value.eligible.map((slice, index) => [slice.point.id, index]));
  const markById = new Map(marks.map(mark => [mark.slice.point.id, mark]));
  return ok(Object.freeze({ bounds, frame, data: normalized.value, marks: Object.freeze(marks), markById, byId, rankById, outsideLabels, tooSmall }));
}
export function radialLabelFits(frame: RadialFrame, slice: Readonly<{ start: number; end: number }>, box: RadialBounds, clearance = 2): boolean {
  if (![box.x, box.y, box.width, box.height, clearance].every(Number.isFinite) || box.width < 0 || box.height < 0 || clearance < 0) return false;
  const nearestX = Math.max(box.x, Math.min(frame.cx, box.x + box.width)), nearestY = Math.max(box.y, Math.min(frame.cy, box.y + box.height));
  if (frame.innerRadius > 0 && Math.hypot(nearestX - frame.cx, nearestY - frame.cy) < frame.innerRadius + clearance) return false;
  const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]] as const;
  if (corners.some(([x, y]) => Math.hypot(x - frame.cx, y - frame.cy) > frame.radius - clearance)) return false;
  if (slice.end - slice.start === TAU) return true;
  if (frame.cx >= box.x && frame.cx <= box.x + box.width && frame.cy >= box.y && frame.cy <= box.y + box.height) return false;
  const angles = corners.map(([x, y]) => (Math.atan2(x - frame.cx, frame.cy - y) + TAU) % TAU).sort((a, b) => a - b);
  let largestGap = -1, afterGap = 0;
  for (let i = 0; i < angles.length; i++) { const next = i + 1 < angles.length ? angles[i + 1]! : angles[0]! + TAU, gap = next - angles[i]!; if (gap > largestGap) { largestGap = gap; afterGap = (i + 1) % angles.length; } }
  const relative = (angles[afterGap]! - slice.start + TAU) % TAU;
  return relative + TAU - largestGap <= slice.end - slice.start + 1e-12;
}
export function radialFocusAnchor<T>(projection: RadialProjection<T>, slice: RadialSlice<PieSlice<T>>): Readonly<{ x: number; y: number }> {
  return polar(projection.frame, (projection.frame.innerRadius + projection.frame.radius) / 2, slice.start + (slice.end - slice.start) / 2);
}
export function radialLeaderClear(frame: RadialFrame, leader: readonly Readonly<{ x: number; y: number }>[] ): boolean {
  for (let i = 1; i < leader.length; i++) {
    const a = leader[i - 1]!, b = leader[i]!, dx = b.x - a.x, dy = b.y - a.y, squared = dx * dx + dy * dy;
    const t = squared ? Math.max(0, Math.min(1, ((frame.cx - a.x) * dx + (frame.cy - a.y) * dy) / squared)) : 0;
    if (Math.hypot(a.x + t * dx - frame.cx, a.y + t * dy - frame.cy) < frame.radius - 1e-9) return false;
  }
  return true;
}
