import type { ChartResult } from '../public/chart-types.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { MAX_PATH_COMMANDS } from '../internal/geometry/path.js';
import { invalid, ok } from '../internal/diagnostics.js';

export type SplineCoordinate = Readonly<{ x: number; y: number }>;
export type CubicSegment = Readonly<{ a: SplineCoordinate; b: SplineCoordinate; c: SplineCoordinate; d: SplineCoordinate }>;
const blend = (a: SplineCoordinate, b: SplineCoordinate): SplineCoordinate => ({ x: a.x + (b.x - a.x) / 2, y: a.y + (b.y - a.y) / 2 });
const clamp = (value: number, a: number, b: number): number => Math.min(Math.max(a, b), Math.max(Math.min(a, b), value));

function exceptionalRatio(points: readonly SplineCoordinate[], h: readonly number[], knot: number, interval: number, parameters?: readonly number[]): number {
  const leftDy = points[knot]!.y - points[knot - 1]!.y, rightDy = points[knot + 1]!.y - points[knot]!.y;
  if (!leftDy || !rightDy || Math.sign(leftDy) !== Math.sign(rightDy)) return 0;
  const logStep = (i: number): number => Number.isFinite(h[i]) ? Math.log(h[i]!) : Math.log(parameters![i + 1]! / 2 - parameters![i]! / 2) + Math.LN2;
  const logLeft = logStep(knot - 1), logRight = logStep(knot), scale = Math.max(logLeft, logRight);
  const a = Math.exp(logLeft - scale), b = Math.exp(logRight - scale), weight = (a + 2 * b) / (3 * (a + b));
  const logRatio = Math.log(Math.abs(leftDy)) - logLeft - Math.log(Math.abs(rightDy)) + logRight;
  return interval < knot ? 1 / (weight + (1 - weight) * Math.exp(logRatio)) : 1 / (weight * Math.exp(-logRatio) + 1 - weight);
}

/** Raw parameters retain spacing when distinct domain values round to the
 * same projected X. Interpolation samples are never domain data. */
export function monotoneCubics(points: readonly SplineCoordinate[], parameters?: readonly number[]): ChartResult<readonly CubicSegment[]> {
  if (!Array.isArray(points) || points.length > 100000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'spline.points');
  if (parameters && parameters.length !== points.length) return invalid('INVALID_CONFIG', 'BAD_PARAMETERS', 'spline.parameters');
  const h: number[] = [], delta: number[] = [], derivative: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return invalid('INVALID_NUMBER', 'NONFINITE', 'spline.points[' + i + ']');
    if (!i) continue;
    const previous = points[i - 1]!, dx = p.x - previous.x, dy = p.y - previous.y;
    if (parameters ? dx < 0 : !(dx > 0)) return invalid('INVALID_CONFIG', 'NON_INCREASING_X', 'spline.points[' + i + '].x');
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'spline.points');
    const step = parameters ? parameters[i]! - parameters[i - 1]! : dx;
    if (!(step > 0) || parameters && (!Number.isFinite(parameters[i]) || !Number.isFinite(parameters[i - 1]))) return invalid('INVALID_CONFIG', 'NON_INCREASING_X', 'spline.parameters');
    h.push(step); delta.push(dy / step);
  }
  if (points.length < 2) return ok(Object.freeze([]));
  derivative[0] = delta[0]!; derivative[points.length - 1] = delta[delta.length - 1]!;
  for (let i = 1; i + 1 < points.length; i++) {
    const left = delta[i - 1]!, right = delta[i]!;
    // NaN is a private sentinel for the exceptional-ratio calculation below;
    // it is resolved before creating any geometric coordinate.
    if (!Number.isFinite(left) || !Number.isFinite(right) || !left || !right) { derivative[i] = NaN; continue; }
    if (Math.sign(left) !== Math.sign(right)) { derivative[i] = 0; continue; }
    // Normalize spacing and divide by secant ratios, avoiding h*delta and 1/tiny.
    const scale = Math.max(h[i - 1]!, h[i]!), a = h[i - 1]! / scale, b = h[i]! / scale;
    const weight = (a + 2 * b) / (3 * (a + b));
    const minimum = Math.min(Math.abs(left), Math.abs(right));
    derivative[i] = Math.sign(left) * minimum / (weight * (minimum / Math.abs(left)) + (1 - weight) * (minimum / Math.abs(right)));
  }
  const segments: CubicSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!, d = points[i + 1]!, dy = d.y - a.y, dx = d.x - a.x;
    const firstRatio = derivative[i]! / delta[i]!, lastRatio = derivative[i + 1]! / delta[i]!;
    const first = i === 0 ? dy / 3 : dy / 3 * (Number.isFinite(firstRatio) ? firstRatio : exceptionalRatio(points, h, i, i, parameters));
    const last = i + 2 === points.length ? dy / 3 : dy / 3 * (Number.isFinite(lastRatio) ? lastRatio : exceptionalRatio(points, h, i + 1, i, parameters));
    const b = Object.freeze({ x: a.x + dx / 3, y: clamp(a.y + first, a.y, d.y) });
    const c = Object.freeze({ x: d.x - dx / 3, y: clamp(d.y - last, a.y, d.y) });
    if (![b.x, b.y, c.x, c.y].every(Number.isFinite)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'spline.control');
    segments.push(Object.freeze({ a: Object.freeze({ x: a.x, y: a.y }), b, c, d: Object.freeze({ x: d.x, y: d.y }) }));
  }
  return ok(Object.freeze(segments));
}

function distance(point: SplineCoordinate, a: SplineCoordinate, d: SplineCoordinate): number {
  const dx = d.x - a.x, dy = d.y - a.y, length = Math.hypot(dx, dy);
  if (!Number.isFinite(length)) return Infinity;
  if (!length) return Math.hypot(point.x - a.x, point.y - a.y);
  const ux = dx / length, uy = dy / length;
  const along = (point.x - a.x) * ux + (point.y - a.y) * uy;
  if (along < 0) return Math.hypot(point.x - a.x, point.y - a.y);
  if (along > length) return Math.hypot(point.x - d.x, point.y - d.y);
  return Math.abs((point.x - a.x) * uy - (point.y - a.y) * ux);
}

export function flattenCubics(segments: readonly CubicSegment[], tolerance = .2, budget = MAX_PATH_COMMANDS): ChartResult<readonly PathCommand[]> {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 1 || !Number.isInteger(budget) || budget < 1 || budget > MAX_PATH_COMMANDS) return invalid('INVALID_CONFIG', 'BAD_TOLERANCE_OR_BUDGET', 'spline');
  if (!Array.isArray(segments) || segments.length > 100000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'spline.segments');
  if (!segments.length) return ok(Object.freeze([]));
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment || ![segment.a, segment.b, segment.c, segment.d].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return invalid('INVALID_NUMBER', 'NONFINITE', 'spline.segments[' + i + ']');
    if (segment.d.x < segment.a.x || !Number.isFinite(segment.d.x - segment.a.x) || !Number.isFinite(segment.d.y - segment.a.y)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'spline.segments[' + i + ']');
    if (i && (segments[i - 1]!.d.x !== segment.a.x || segments[i - 1]!.d.y !== segment.a.y)) return invalid('INVALID_CONFIG', 'NON_CONTIGUOUS_SPLINE', 'spline.segments[' + i + ']');
  }
  const commands: PathCommand[] = [Object.freeze({ type: 'M', x: segments[0]!.a.x, y: segments[0]!.a.y })];
  for (const segment of segments) {
    const stack = [{ segment, depth: 0 }];
    while (stack.length) {
      const item = stack.pop()!, { a, b, c, d } = item.segment;
      if (Math.max(distance(b, a, d), distance(c, a, d)) <= tolerance) {
        if (commands.length >= budget) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'spline.commands');
        commands.push(Object.freeze({ type: 'L', x: d.x, y: d.y }));
      } else {
        if (item.depth >= 20 || commands.length + stack.length + 2 > budget) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'spline.subdivision');
        const ab = blend(a, b), bc = blend(b, c), cd = blend(c, d), abc = blend(ab, bc), bcd = blend(bc, cd), center = blend(abc, bcd), depth = item.depth + 1;
        stack.push({ segment: { a: center, b: bcd, c: cd, d }, depth }, { segment: { a, b: ab, c: abc, d: center }, depth });
      }
    }
  }
  return ok(Object.freeze(commands));
}

export function splineCommands(points: readonly SplineCoordinate[], tolerance = .2, budget = MAX_PATH_COMMANDS): ChartResult<readonly PathCommand[]> {
  const cubics = monotoneCubics(points);
  return cubics.status === 'invalid' ? cubics : flattenCubics(cubics.value, tolerance, budget);
}

/** Projection is already validated/ordered by Core. Two neighbors on either
 * side preserve the full interpolant's local derivatives at viewport edges. */
export function visibleSplineCommands(points: readonly SplineCoordinate[], minX: number, maxX: number, budget = MAX_PATH_COMMANDS, parameters?: readonly number[]): ChartResult<readonly PathCommand[]> {
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || minX > maxX) return invalid('INVALID_DOMAIN', 'BAD_VIEWPORT', 'spline.viewport');
  if (!Array.isArray(points) || points.length > 100000) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'spline.points');
  if (points.length < 2 || points[0]!.x > maxX || points[points.length - 1]!.x < minX) return ok(Object.freeze([]));
  const bound = (value: number, upper: boolean): number => {
    let lo = 0, hi = points.length;
    while (lo < hi) { const mid = lo + Math.floor((hi - lo) / 2); if (points[mid]!.x < value || upper && points[mid]!.x === value) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const start = Math.max(0, bound(minX, false) - 2), end = Math.min(points.length, bound(maxX, true) + 2);
  const fullRun = start === 0 && end === points.length;
  const cubics = monotoneCubics(fullRun ? points : points.slice(start, end), fullRun ? parameters : parameters?.slice(start, end));
  if (cubics.status === 'invalid') return cubics;
  if (budget < 2) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'spline.commands');
  return flattenCubics(cubics.value.filter(segment => segment.a.x <= maxX && segment.d.x >= minX), .2, budget);
}
