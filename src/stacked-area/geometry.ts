import type { ChartState, ChartResult } from '../public/chart-types.js';
import type { AxesPlan } from '../internal/axes/plan.js';
import type { PathCommand } from '../internal/geometry/path.js';
import { MAX_PATH_COMMANDS } from '../internal/geometry/path.js';
import type { LineProjection, ProjectedPoint, ProjectedSeries } from '../line/geometry.js';
import { pointKey } from '../line/normalize.js';
import { buildHitIndex, type HitIndex } from '../line/hit-index.js';
import { invalid, ok } from '../internal/diagnostics.js';
import type { AreaStack, StackedAreaData } from './data.js';
import { stackAreaBands, type AreaBand } from './bands.js';

export type StackedAreaProjection<T> = LineProjection<T> & Readonly<{
  kind: 'category' | 'linear' | 'time'; labels: ReadonlyMap<string, string>; tooltipMode: 'point' | 'shared';
  index: HitIndex<T>; stack: AreaStack<T>; fills: ReadonlyMap<string, readonly PathCommand[]>;
  segments: ReadonlyMap<string, Readonly<{ base: number; end: number; percentage: number | null }>>;
}>;
export function projectStackedArea<T>(data: StackedAreaData<T>, state: ChartState, stack: AreaStack<T>, axes: AxesPlan, preparedBands?: readonly AreaBand[]): ChartResult<StackedAreaProjection<T>> {
  if (axes.tooSmall) {
    const projection: LineProjection<T> = { plot: axes.plot, series: [], mapX: axes.mapX, mapY: axes.mapY };
    return ok({ ...projection, kind: data.spec.axes.x.kind, labels: data.line.labels, tooltipMode: data.spec.tooltip?.mode === 'shared' ? 'shared' : 'point', index: buildHitIndex(projection, () => 0), stack, segments: new Map(), fills: new Map() });
  }
  const hidden = new Set(state.hiddenSeriesIds), series: ProjectedSeries<T>[] = [], segments = new Map<string, { base: number; end: number; percentage: number | null }>();
  const top = new Map<string, PathCommand[]>(), fills = new Map<string, PathCommand[]>();
  const bands = preparedBands ? ok(preparedBands) : stackAreaBands(data, stack); if (bands.status === 'invalid') return bands;
  let commandCount = 0;
  for (const band of bands.value) {
    const pixels: { x: number; base: number; end: number }[] = [];
    for (const vertex of band.vertices) {
      const first = axes.mapX(data.coordinates[vertex.left]!), last = axes.mapX(data.coordinates[vertex.right]!), base = axes.mapY(vertex.base), end = axes.mapY(vertex.end);
      if (first === null || last === null || base === null || end === null) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'stackedArea');
      const x = first === last ? first : first * (1 - vertex.fraction) + last * vertex.fraction;
      if (![x, base, end].every(Number.isFinite)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'stackedArea');
      pixels.push({ x, base, end });
    }
    if ((commandCount += 7) > MAX_PATH_COMMANDS) return invalid('INVALID_CONFIG', 'RESOURCE_LIMIT', 'stackedArea.commands');
    const a = pixels[0]!, b = pixels[1]!, fill = fills.get(band.seriesId) ?? [], outline = top.get(band.seriesId) ?? [];
    fill.push({ kind: 'M', x: a.x, y: a.end }, { kind: 'L', x: b.x, y: b.end }, { kind: 'L', x: b.x, y: b.base }, { kind: 'L', x: a.x, y: a.base }, { kind: 'Z' });
    outline.push({ kind: 'M', x: a.x, y: a.end }, { kind: 'L', x: b.x, y: b.end });
    fills.set(band.seriesId, fill); top.set(band.seriesId, outline);
  }
  for (const normalized of data.line.series) if (!hidden.has(normalized.spec.id)) {
    const points: ProjectedPoint<T>[] = [];
    const rawById = new Map(stack.series.find(series => series.id === normalized.spec.id)!.segments.map(segment => [segment.point.id, segment]));
    for (const original of normalized.valid) {
      const row = stack.categories.get(data.coordinateIds[data.coordinateIndex.get(original.x)!]!)!, segment = rawById.get(original.id);
      if (!segment || !row.complete || stack.mode === 'percent' && !row.percentageDefined) continue;
      const x = axes.mapX(original.x), y = axes.mapY(segment.end);
      if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return invalid('INVALID_DOMAIN', 'UNREPRESENTABLE_GEOMETRY', 'stackedArea');
      points.push(Object.freeze({ point: original, x, y, index: normalized.byId.get(original.id)! }));
      segments.set(pointKey(normalized.spec.id, original.id), segment);
    }
    const eligible = Object.freeze(points.filter(point => point.x >= axes.plot.x && point.x <= axes.plot.x + axes.plot.width && point.y >= axes.plot.y && point.y <= axes.plot.y + axes.plot.height));
    const automatic = eligible.length <= 200 && eligible.every((point, i) => !i || point.x - eligible[i - 1]!.x >= 8);
    const markers = normalized.spec.markers === 'off' || normalized.spec.markers !== 'on' && !automatic ? Object.freeze([]) : eligible;
    series.push(Object.freeze({ series: normalized, points: Object.freeze(points), eligible, markers, commands: Object.freeze((top.get(normalized.spec.id) ?? []).map(command => Object.freeze(command))) }));
  }
  const projection: LineProjection<T> = Object.freeze({ plot: axes.plot, series: Object.freeze(series), mapX: axes.mapX, mapY: axes.mapY });
  return ok(Object.freeze({ ...projection, kind: data.spec.axes.x.kind, labels: data.line.labels, tooltipMode: data.spec.tooltip?.mode === 'shared' ? 'shared' : 'point', index: buildHitIndex(projection, value => typeof value === 'string' ? data.coordinateIndex.get(value)! : value), stack, segments, fills: new Map([...fills].map(([id, commands]) => [id, Object.freeze(commands.map(command => Object.freeze(command)))])) }));
}
