import type { ChartState, ChartResult } from '../public/chart-types.js';
import type { MixedChartSpec, MixedDescription, MixedPoint, MixedPointActivation } from '../public/mixed-types.js';
import type { ChartCategoryWindow, ChartViewportValue } from '../public/viewport-types.js';
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
import { navigate, firstTarget, type HitTarget } from '../line/hit-index.js';
import { lineDataLabels } from '../line/labels.js';
import { columnFocusScene } from '../column/scene.js';
import { normalizeMixed, mixedDomains, type MixedData } from './data.js';
import { mixedViewport } from './viewport.js';
import { describeMixedData, mixedColumns } from './describe.js';
import { createMixedCategoryFrame, type MixedCategoryFrame } from './frame.js';
import { projectMixed, pickMixed, type MixedProjection } from './geometry.js';
import { mixedScene } from './scene.js';
import { validateMixed, validateMixedOptions } from './validate.js';
type Policy<T> = FamilyPolicy<MixedChartSpec<T>, ChartState, MixedProjection<T>, HitTarget<T>, MixedDescription, MixedPointActivation<T>, ChartViewportValue<ChartCategoryWindow>>;
export function mixedPolicy<T>(): Policy<T> {
  const cache = new WeakMap<MixedChartSpec<T>, MixedData<T>>(), kinds = new WeakMap<object, MixedPointActivation<T>['kind']>();
  const dataOf = (spec: MixedChartSpec<T>) => { let data = cache.get(spec); if (!data) { data = normalizeMixed(spec); cache.set(spec, data); for (const series of spec.series) for (const point of series.data) kinds.set(point, series.kind); } return data; };
  const tooltip: Policy<T>['tooltip'] = (c, target, revision) => {
    const p = c.projection, point = target.point.point, model = tooltipModel(revision, target.series.series.spec.id, point.id, point.x, 'category', p.data.spec.tooltip?.mode === 'shared' ? 'shared' : 'point', p.line.series.map(series => ({ id: series.series.spec.id, name: series.series.spec.name, color: series.series.spec.color ?? c.palette.series[series.series.colorIndex]!, dash: p.data.kinds.get(series.series.spec.id) === 'column' ? 'solid' : series.series.dash, byX: series.series.byX })), p.data.line.labels, p.data.line.duplicateLabels);
    const header = fullX(point.x, 'category', p.data.line.labels); return { ...model, header, displayHeader: header, isolateText: true, context: 'Kind: ' + p.data.kinds.get(target.series.series.spec.id) + '. Original value: ' + point.y + '.' };
  };
  return {
    parse: validateMixed<T>, options: validateMixedOptions<T>,
    ids: spec => spec.series.map(series => series.id), names: spec => spec.series.map(series => series.name), hidden: state => state.hiddenSeriesIds,
    state: hiddenSeriesIds => Object.freeze({ hiddenSeriesIds: Object.freeze([...hiddenSeriesIds]) }),
    validateData: (spec, state) => mixedDomains(dataOf(spec), state), selectable: seriesIdentities,
    datumId: target => ({ seriesId: target.series.series.spec.id, pointId: target.point.point.id }),
    selectedTarget: (p, id) => p.index.byId.get(pointKey(id.seriesId, id.pointId)) ?? null,
    exportRecords(spec, state, _value, selection) { const raw = cartesianRecords(spec, state.hiddenSeriesIds, selection), kind = dataOf(spec).kinds; return { columns: [...raw.columns.slice(0, 2), 'Kind', ...raw.columns.slice(2)], rows: raw.rows.map(row => [...row.slice(0, 2), kind.get(String(row[0]))!, ...row.slice(2)]) }; },
    viewport: {
      prepare: (spec, state, previous) => mixedViewport(dataOf(spec), state, previous), value: viewport => viewport.value as ChartViewportValue<ChartCategoryWindow>, request: requestViewport, same: sameViewport, shell: viewportShell, createView: createViewportView,
      viewState: (spec, model, axes) => ({ model, plot: axes.plot, domains: { x: axes.x.domain, y: axes.y.domain }, horizontal: false, xReversed: false, yReversed: !!spec.axes.y.reversed, categorySpacing: .5, enabled: (spec.status?.kind ?? 'ready') === 'ready' && !axes.tooSmall }),
    },
    compute(spec, state, shell, palette, font, measurer, viewport = null) {
      const data = dataOf(spec), domains = mixedDomains(data, state); if (domains.status === 'invalid') return domains;
      const scoped = withViewportAxes(spec.axes, viewport); if (scoped.status === 'invalid') return scoped;
      const shared: { value: MixedCategoryFrame | null } = { value: null };
      const planned = planAxes({ x: scoped.value.x, y: scoped.value.y, domains: withViewportDomains(domains.value, viewport), width: shell.body.width, height: shell.body.height, font, direction: spec.direction ?? 'ltr', labels: data.line.labels, measurer, compact: shell.body.width < 480, categoryX(plot) {
        if (!shared.value) { const frame = createMixedCategoryFrame((scoped.value.x.values ?? []).map(category => category.id), plot, spec.groupGap); if (frame.status === 'invalid') return frame; shared.value = frame.value; }
        return ok(shared.value.points);
      } }); if (planned.status === 'invalid') return planned;
      const extended = extendLineViewportMap(planned.value, viewport); if (extended.status === 'invalid') return extended;
      const axes = extended.value, window = viewport?.value.x, projected = projectMixed(data, state, axes, shared.value, window && !Array.isArray(window) && 'firstId' in window ? window : undefined); if (projected.status === 'invalid') return projected;
      const projection = projected.value, base = describeMixedData(data, state), windows = viewport ? Object.entries(viewport.value).map(([key, value]) => 'Applied ' + key + ' viewport ' + (Array.isArray(value) ? value.join(' to ') : 'firstId' in value ? value.firstId + ' through ' + value.lastId : '') + '.') : [];
      const description = windows.length ? { ...base, context: base.context + ' ' + windows.join(' ') } : base;
      const layers = emptyLayers(), dashes = new Map(resolveDashes(data.line.series, new Set(state.hiddenSeriesIds), palette)); for (const series of spec.series) if (series.kind === 'column') dashes.set(series.id, 'solid');
      if (description.view === 'ready') {
        axesScene(axes, spec.axes.x, spec.axes.y, palette, layers, shell.body.width < 480);
        if (!axes.tooSmall) { const marks = mixedScene(projection, palette, layers, dashes); if (marks.status === 'invalid') return marks; }
        referenceScene(spec.references ?? [], axes, palette, layers, (text, cap) => { const fitted = ellipsis(text, cap, text => measurer.measure(text, font, spec.direction ?? 'ltr')), metrics = measurer.measure(fitted ?? '', font, spec.direction ?? 'ltr'); return { text: fitted, width: metrics.width, height: metrics.height }; }, data.line.ranks);
        if (!axes.tooSmall && spec.labels === 'auto') { const labels = lineDataLabels(projection.index.projection, palette, font, layers, text => measurer.measure(text, font, spec.direction ?? 'ltr'), spec.direction === 'rtl'); if (labels.status === 'invalid') return labels; }
      }
      return ok({ shell, palette, font, projection, description, layers, axes, legend: spec.series.map((series, i) => ({ id: series.id, name: series.name, color: series.color ?? palette.series[assignment(series.id).colorIndex]!, dash: dashes.get(series.id) ?? 'solid', width: shell.legendPosition === 'end' ? 160 : shell.buttonWidths[i]! })), status: description.view !== 'ready' ? description.status : axes.tooSmall ? 'Chart is too small. Enlarge it or view the data table.' : '' });
    },
    enabled: c => c.description.view === 'ready' && !c.axes?.tooSmall && c.projection.index.byId.size > 0,
    identity: target => pointKey(target.series.series.spec.id, target.point.point.id), order: target => target.seriesIndex * 10001 + target.point.index,
    reconcile(p, id, order) { if (id && p.index.byId.has(id)) return p.index.byId.get(id)!; for (const row of p.index.targets) for (const target of row) if (target.seriesIndex * 10001 + target.point.index >= order) return target; return firstTarget(p.index, true); },
    pick: pickMixed, navigate: (p, target, key, control) => navigate(p.index, target, key, control), tooltip,
    semantic(c, target) { const model = tooltip(c, target, 0); return { seriesName: target.series.series.spec.name, row: target.seriesIndex + 1, column: c.projection.index.columns.get(target.point.point.x)!, text: target.series.series.spec.name + '. X ' + model.header + '. Y ' + target.point.point.y + '. ' + model.context, detail: detailText(model, c.description.context) }; },
    dimensions: p => ({ rows: p.index.targets.length, columns: p.index.columnCount }),
    focus(p, target, palette, layers) { const rect = p.column?.byId.get(pointKey(target.series.series.spec.id, target.point.point.id)); if (rect) columnFocusScene(rect, palette, layers); else layers.interaction.push({ kind: 'circle', key: 'mixed-focus', cx: target.point.x, cy: target.point.y, r: 6, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } }); },
    anchor: (_p, target) => ({ x: target.point.x, y: target.point.y }),
    detailAnchor(p, target) { const rect = p.column?.byId.get(pointKey(target.series.series.spec.id, target.point.point.id)); return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : { x: target.point.x, y: target.point.y, width: 0, height: 0 }; },
    detailBounds: c => ({ plot: c.projection.plot, body: { x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height } }),
    activate: (target, source, revision) => Object.freeze({ seriesId: target.series.series.spec.id, kind: kinds.get(target.point.point)!, point: target.point.point as MixedPoint<T>, xKind: 'category', source, revision }),
    table: (shell, onOpen) => createDataTableFrame<FamilyTableSource<MixedDescription>>(shell, onOpen, { columns: mixedColumns, minimumWidthEm: 42, notice: 'Original observations include the series kind and stable category/point identities. Missing values are not zero.', selectionKey: id => id.seriesId === undefined ? null : pointKey(id.seriesId, id.pointId), size: source => source.table.rows.length, rows: (source, first, count) => source.table.rows.slice(first, first + count) }),
    help: 'Left and Right move through original category order, including RTL. Up and Down move between visible series. Home and End reach series endpoints; Control+Home and Control+End reach chart endpoints. Missing observations are skipped. Enter or Space activates the original observation. Escape closes details. Tab leaves the chart.',
  };
}
