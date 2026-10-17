import type { ChartState, ChartResult } from '../public/chart-types.js';
import type { StackedAreaChartSpec, StackedAreaDescription, StackedAreaPointActivation } from '../public/stacked-area-types.js';
import type { ChartViewportValue } from '../public/viewport-types.js';
import type { FamilyPolicy, FamilyTableSource } from '../internal/chart/family.js';
import { createDataTableFrame } from '../internal/accessibility/table-frame.js';
import { assignment, resolveDashes } from '../internal/chart/presentation.js';
import { planAxes } from '../internal/axes/plan.js';
import { emptyLayers, axesScene, referenceScene } from '../internal/axes/scene.js';
import { ellipsis } from '../internal/layout/text.js';
import { detailText, fullX, tooltipModel } from '../internal/tooltip/model.js';
import { ok } from '../internal/diagnostics.js';
import { seriesIdentities } from '../internal/interaction/identities.js';
import { cartesianRecords } from '../internal/export/records.js';
import { requestViewport, sameViewport } from '../internal/interaction/viewport.js';
import { viewportShell, createViewportView } from '../internal/interaction/viewport-view.js';
import { withViewportAxes, withViewportDomains, extendLineViewportMap } from '../internal/interaction/viewport-axes.js';
import { pointKey } from '../line/normalize.js';
import { navigate, firstTarget, pickPoint, type HitTarget } from '../line/hit-index.js';
import { lineDataLabels } from '../line/labels.js';
import { areaViewport, areaViewportDescription } from './viewport.js';
import { normalizeStackedArea, areaStack, stackAreaDomains, type StackedAreaData, type AreaStack } from './data.js';
import { describeStackedAreaData } from './describe.js';
import { projectStackedArea, type StackedAreaProjection } from './geometry.js';
import { stackedAreaScene } from './scene.js';
import { stackAreaBands, type AreaBand } from './bands.js';
import { validateStackedArea, validateStackedAreaOptions } from './validate.js';

type Policy<T> = FamilyPolicy<StackedAreaChartSpec<T>, ChartState, StackedAreaProjection<T>, HitTarget<T>, StackedAreaDescription, StackedAreaPointActivation<T>, ChartViewportValue>;
export function stackedAreaPolicy<T>(): Policy<T> {
  const xKinds = new WeakMap<object, 'category' | 'linear' | 'time'>();
  const bands = new WeakMap<AreaStack<T>, ChartResult<readonly AreaBand[]>>();
  const cache = new WeakMap<StackedAreaChartSpec<T>, Readonly<{ data: StackedAreaData<T>; states: WeakMap<ChartState, ChartResult<AreaStack<T>>>; descriptions: WeakMap<ChartState, StackedAreaDescription> }>>();
  const dataOf = (spec: StackedAreaChartSpec<T>): StackedAreaData<T> => {
    let known = cache.get(spec); if (!known) { known = { data: normalizeStackedArea(spec), states: new WeakMap(), descriptions: new WeakMap() }; cache.set(spec, known); for (const series of spec.series) for (const point of series.data) xKinds.set(point, spec.axes.x.kind); } return known.data;
  };
  const stackOf = (spec: StackedAreaChartSpec<T>, state: ChartState): ChartResult<AreaStack<T>> => {
    const data = dataOf(spec), states = cache.get(spec)!.states; let known = states.get(state); if (!known) { known = areaStack(data, state); states.set(state, known); } return known;
  };
  const bandsOf = (data: StackedAreaData<T>, stack: AreaStack<T>): ChartResult<readonly AreaBand[]> => {
    let known = bands.get(stack); if (!known) { known = stackAreaBands(data, stack); bands.set(stack, known); } return known;
  };
  const tooltip: Policy<T>['tooltip'] = (c, target, revision) => {
    const p = target.point.point, data = c.projection;
    const model = tooltipModel(revision, target.series.series.spec.id, p.id, p.x, data.kind, data.tooltipMode, data.series.map(series => ({ id: series.series.spec.id, name: series.series.spec.name, color: series.series.spec.color ?? c.palette.series[series.series.colorIndex]!, dash: series.series.dash, byX: series.series.byX })), data.labels);
    const segment = data.segments.get(pointKey(target.series.series.spec.id, p.id))!;
    const header = fullX(p.x, data.kind, data.labels), context = data.stack.mode === 'percent' ? 'Visible share: ' + Number(segment.percentage!.toPrecision(6)) + '%. Original value: ' + p.y + '.' : 'Original value: ' + p.y + '. Accumulated range: ' + segment.base + ' to ' + segment.end + '.';
    return Object.freeze({ ...model, header, displayHeader: header, context, isolateText: true });
  };
  return {
    parse: validateStackedArea<T>, options: validateStackedAreaOptions<T>,
    viewport: {
      // This family's context always has a numeric Y axis; the private owner
      // also supports category Y for other families.
      prepare: (spec, state, previous) => areaViewport(dataOf(spec), state, previous), value: viewport => viewport.value as ChartViewportValue,
      request: requestViewport, same: sameViewport, shell: viewportShell, createView: createViewportView,
      viewState: (spec, model, axes) => ({ model, plot: axes.plot, domains: { x: axes.x.domain, y: axes.y.domain }, horizontal: false, xReversed: false, yReversed: !!spec.axes.y.reversed, categorySpacing: spec.axes.x.kind === 'category' ? spec.axes.x.edgeSpacing ?? .5 : .5, enabled: (spec.status?.kind ?? 'ready') === 'ready' && !axes.tooSmall }),
    },
    validateData(spec, state) { const stack = stackOf(spec, state); if (stack.status === 'invalid') return stack; const data = dataOf(spec), result = bandsOf(data, stack.value); return result.status === 'invalid' ? result : stackAreaDomains(data, stack.value); },
    ids: spec => spec.series.map(series => series.id), hidden: state => state.hiddenSeriesIds,
    state: hidden => Object.freeze({ hiddenSeriesIds: Object.freeze([...hidden]) }), names: spec => spec.series.map(series => series.name),
    selectable: seriesIdentities, datumId: target => ({ seriesId: target.series.series.spec.id, pointId: target.point.point.id }),
    selectedTarget: (projection, id) => projection.index.byId.get(pointKey(id.seriesId, id.pointId)) ?? null,
    exportRecords: (spec, state, _computed, selection) => cartesianRecords(spec, state.hiddenSeriesIds, selection),
    compute(spec, state, shell, palette, font, measurer, viewport = null) {
      const data = dataOf(spec), stack = stackOf(spec, state); if (stack.status === 'invalid') return stack;
      const domains = stackAreaDomains(data, stack.value); if (domains.status === 'invalid') return domains;
      const scoped = withViewportAxes(spec.axes, viewport); if (scoped.status === 'invalid') return scoped;
      const planned = planAxes({ x: scoped.value.x, y: scoped.value.y, domains: withViewportDomains(domains.value, viewport), width: shell.body.width, height: shell.body.height, font, direction: spec.direction ?? 'ltr', labels: data.line.labels, measurer, compact: shell.body.width < 480 }); if (planned.status === 'invalid') return planned;
      const extended = extendLineViewportMap(planned.value, viewport); if (extended.status === 'invalid') return extended;
      const axes = extended.value, worldBands = bandsOf(data, stack.value); if (worldBands.status === 'invalid') return worldBands;
      const projected = projectStackedArea(data, state, stack.value, axes, worldBands.value); if (projected.status === 'invalid') return projected;
      const projection = projected.value, descriptions = cache.get(spec)!.descriptions;
      let baseDescription = descriptions.get(state); if (!baseDescription) { baseDescription = describeStackedAreaData(data, state, stack.value); descriptions.set(state, baseDescription); }
      const description = areaViewportDescription(baseDescription, viewport), layers = emptyLayers();
      const dashes = resolveDashes(data.line.series, new Set(state.hiddenSeriesIds), palette);
      if (description.view === 'ready') {
        axesScene(axes, spec.axes.x, spec.axes.y, palette, layers, shell.body.width < 480);
        if (!axes.tooSmall) stackedAreaScene(projection, palette, layers, dashes);
        referenceScene(spec.references ?? [], axes, palette, layers, (text, cap) => { const fitted = ellipsis(text, cap, text => measurer.measure(text, font, spec.direction ?? 'ltr')), metrics = measurer.measure(fitted ?? '', font, spec.direction ?? 'ltr'); return { text: fitted, width: metrics.width, height: metrics.height }; }, data.line.ranks);
        if (!axes.tooSmall && spec.labels === 'auto') {
          const labelled = lineDataLabels(projection, palette, font, layers, text => measurer.measure(text, font, spec.direction ?? 'ltr'), spec.direction === 'rtl', (id, point) => stack.value.mode === 'sum' ? String(point.y) : Number(projection.segments.get(pointKey(id, point.id))!.percentage!.toPrecision(6)) + '%');
          if (labelled.status === 'invalid') return labelled;
        }
      }
      return ok({ shell, palette, font, projection, description, layers, axes, legend: spec.series.map((series, index) => ({ id: series.id, name: series.name, color: series.color ?? palette.series[assignment(series.id).colorIndex]!, dash: dashes.get(series.id) ?? 'solid', width: shell.legendPosition === 'end' ? 160 : shell.buttonWidths[index]! })), status: description.view !== 'ready' ? description.status : axes.tooSmall ? 'Chart is too small. Enlarge it or view the data table.' : '' });
    },
    enabled: c => c.description.view === 'ready' && !c.axes?.tooSmall && c.projection.index.byId.size > 0,
    identity: target => pointKey(target.series.series.spec.id, target.point.point.id), order: target => target.seriesIndex * 10001 + target.point.index,
    reconcile(projection, id, order) { if (id && projection.index.byId.has(id)) return projection.index.byId.get(id)!; for (const row of projection.index.targets) for (const target of row) if (target.seriesIndex * 10001 + target.point.index >= order) return target; return firstTarget(projection.index, true); },
    pick: (projection, x, y) => pickPoint(projection.index, { x, y }, { x, y }, (x, y) => ({ x, y })),
    navigate: (projection, target, key, control) => navigate(projection.index, target, key, control), tooltip,
    semantic(c, target) { const model = tooltip(c, target, 0); return { seriesName: target.series.series.spec.name, row: target.seriesIndex + 1, column: c.projection.index.columns.get(target.point.point.x)!, text: target.series.series.spec.name + '. X ' + model.header + '. Y ' + target.point.point.y + '. ' + model.context, detail: detailText(model, c.description.context) }; },
    dimensions: projection => ({ rows: projection.series.length, columns: projection.index.columnCount }),
    focus: (_projection, target, palette, layers) => { layers.interaction.push({ kind: 'circle', key: 'stacked-area-focus', cx: target.point.x, cy: target.point.y, r: 6, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } }); },
    anchor: (_projection, target) => ({ x: target.point.x, y: target.point.y }),
    detailBounds: c => ({ plot: c.projection.plot, body: { x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height } }),
    activate: (target, source, revision) => Object.freeze({ seriesId: target.series.series.spec.id, point: target.point.point, xKind: xKinds.get(target.point.point)!, source, revision }) as StackedAreaPointActivation<T>,
    table: (shell, onOpen) => createDataTableFrame<FamilyTableSource<StackedAreaDescription>>(shell, onOpen, { columns: ['Series', 'X', 'Y', 'Accumulated range', 'Visible share', 'Visibility'], minimumWidthEm: 36, notice: 'Y values are original observations. Derived ranges and shares are available only for complete visible stacks. Missing, hidden, incomplete and clipped raw values remain in the table.', selectionKey: id => id.seriesId === undefined ? null : pointKey(id.seriesId, id.pointId), size: source => source.table.rows.length, rows: (source, first, count) => source.table.rows.slice(first, first + count) }),
    help: 'Left and Right move through complete stack observations in original X order, including RTL. Up and Down move between visible series. Home and End reach series endpoints; Control+Home and Control+End reach chart endpoints. Missing rows are skipped. Escape closes detail. Enter or Space activates the original observation. Tab leaves the chart.',
  };
}
