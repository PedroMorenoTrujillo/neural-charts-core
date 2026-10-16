import type { ChartState, ChartResult } from '../public/chart-types.js';
import type { ScatterChartSpec, ScatterDescription, ScatterPointActivation } from '../public/scatter-types.js';
import type { ChartViewportValue, ChartNumericWindow } from '../public/viewport-types.js';
import type { FamilyPolicy, FamilyTableSource } from '../internal/chart/family.js';
import { createDataTableFrame } from '../internal/accessibility/table-frame.js';
import { assignment } from '../internal/chart/presentation.js';
import { planAxes } from '../internal/axes/plan.js';
import { emptyLayers, axesScene, referenceScene } from '../internal/axes/scene.js';
import { ellipsis } from '../internal/layout/text.js';
import { detailText } from '../internal/tooltip/model.js';
import { ok } from '../internal/diagnostics.js';
import { seriesIdentities } from '../internal/interaction/identities.js';
import { datumKey } from '../internal/interaction/selection.js';
import { requestViewport, sameViewport } from '../internal/interaction/viewport.js';
import { viewportShell, createViewportView } from '../internal/interaction/viewport-view.js';
import { withViewportAxes, withViewportDomains } from '../internal/interaction/viewport-axes.js';
import { scatterViewport, scatterViewportDescription } from './viewport.js';
import { normalizeScatter, scatterDomains, targetKey, type NormalizedScatter } from './data.js';
import { describeScatterData } from './describe.js';
import { projectScatter, pickScatter, navigateScatter, type ScatterProjection, type ScatterTarget } from './geometry.js';
import { scatterScene, scatterFocusScene, scatterMarkerShape } from './scene.js';
import { validateScatter, validateScatterOptions } from './validate.js';

type Data<T> = NormalizedScatter<T, ScatterChartSpec<T>>;
type NumericViewport = ChartViewportValue<ChartNumericWindow>;
type Policy<T> = FamilyPolicy<ScatterChartSpec<T>, ChartState, ScatterProjection<T>, ScatterTarget<T>, ScatterDescription, ScatterPointActivation<T>, NumericViewport>;
export function scatterPolicy<T>(): Policy<T> {
  // Ephemeron caches cannot keep replaced specs/states alive through a retained
  // destroyed controller. Layout changes reuse normalization and raw table text.
  const cache = new WeakMap<ScatterChartSpec<T>, Readonly<{ data: Data<T>; descriptions: WeakMap<ChartState, ScatterDescription> }>>();
  function dataOf(spec: ScatterChartSpec<T>): ChartResult<Data<T>> {
    const known = cache.get(spec); if (known) return ok(known.data);
    const result = normalizeScatter<T, ScatterChartSpec<T>>(spec); if (result.status === 'ok') cache.set(spec, { data: result.value, descriptions: new WeakMap() }); return result;
  }
  const tooltip: Policy<T>['tooltip'] = (c, target, revision) => {
    const color = target.series.spec.color ?? c.palette.series[assignment(target.series.spec.id).colorIndex]!, header = target.series.spec.name + ' · ' + target.point.id, coincident = c.projection.spatial.query(target.x, target.y, 0).multiplicity;
    return Object.freeze({ revision, seriesId: target.series.spec.id, pointId: target.point.id, x: target.point.x, header, displayHeader: header, isolateText: true, rows: Object.freeze([{ seriesId: target.series.spec.id + '/x', name: 'X', value: target.point.x, availability: 'value' as const, color, dash: 'solid' as const }, { seriesId: target.series.spec.id + '/y', name: 'Y', value: target.point.y, availability: 'value' as const, color, dash: 'solid' as const }]), context: coincident > 1 ? coincident + ' observations share this plotted position. Use keyboard or the data table to inspect each.' : 'Original numeric XY observation.' });
  };
  return {
    parse: validateScatter<T>, options: validateScatterOptions<T>,
    viewport: {
      prepare(spec, state, previous) { if (!spec.viewport) return ok(null); const data = dataOf(spec); return data.status === 'invalid' ? data : scatterViewport(data.value, state, previous); },
      value: viewport => viewport.value as NumericViewport,
      request: requestViewport, same: sameViewport,
      shell: viewportShell, createView: createViewportView,
      viewState: (spec, model, axes) => ({ model, plot: axes.plot, domains: { x: axes.x.domain, y: axes.y.domain }, horizontal: false, xReversed: !!spec.axes.x.reversed, yReversed: !!spec.axes.y.reversed, enabled: (spec.status?.kind ?? 'ready') === 'ready' && !axes.tooSmall }),
    },
    validateData(spec, state) { const data = dataOf(spec); return data.status === 'invalid' ? data : scatterDomains(data.value, state); },
    ids: spec => spec.series.map(series => series.id), hidden: state => state.hiddenSeriesIds,
    state: hidden => Object.freeze({ hiddenSeriesIds: Object.freeze([...hidden]) }), names: spec => spec.series.map(series => series.name),
    selectable: seriesIdentities, datumId: target => ({ seriesId: target.series.spec.id, pointId: target.point.id }),
    selectedTarget: (projection, id) => projection.byKey.get(targetKey(id.seriesId, id.pointId)) ?? null,
    exportRecords(spec, state, _value, selection) { const hidden = new Set(state.hiddenSeriesIds), selected = selection ? new Set(selection.map(datumKey)) : null; return { columns: ['Series ID', 'Series', 'Point ID', 'X', 'Y', 'Visible', ...(selected ? ['Selected'] : [])], rows: spec.series.flatMap(series => series.data.map(point => [series.id, series.name, point.id, point.x, point.y, hidden.has(series.id) ? 'false' : 'true', ...(selected ? [String(selected.has(datumKey({ seriesId: series.id, pointId: point.id })))] : [])])) }; },
    compute(spec, state, shell, palette, font, measurer, viewport = null) {
      const result = dataOf(spec); if (result.status === 'invalid') return result; const data = result.value, domains = scatterDomains(data, state); if (domains.status === 'invalid') return domains;
      const scoped = withViewportAxes(spec.axes, viewport); if (scoped.status === 'invalid') return scoped;
      const planned = planAxes({ x: scoped.value.x, y: scoped.value.y, domains: withViewportDomains(domains.value, viewport), width: shell.body.width, height: shell.body.height, font, direction: spec.direction ?? 'ltr', labels: new Map(), measurer, compact: shell.body.width < 480 }); if (planned.status === 'invalid') return planned;
      const axes = planned.value, projected = projectScatter(data, state, axes); if (projected.status === 'invalid') return projected;
      const projection = projected.value, descriptions = cache.get(spec)!.descriptions; let description = descriptions.get(state); if (!description) { description = describeScatterData(data, state); descriptions.set(state, description); }
      description = scatterViewportDescription(description, viewport);
      const layers = emptyLayers();
      if (description.view === 'ready') {
        axesScene(axes, spec.axes.x, spec.axes.y, palette, layers, shell.body.width < 480);
        referenceScene(spec.references ?? [], axes, palette, layers, (text, cap) => { const fitted = ellipsis(text, cap, text => measurer.measure(text, font, spec.direction ?? 'ltr')), metrics = measurer.measure(fitted ?? '', font, spec.direction ?? 'ltr'); return { text: fitted, width: metrics.width, height: metrics.height }; });
        const painted = scatterScene(projection, spec, palette, font, text => measurer.measure(text, font, spec.direction ?? 'ltr'), layers); if (painted.status === 'invalid') return painted;
      }
      return ok({ shell, palette, font, projection, description, layers, axes, legend: spec.series.map((series, index) => ({ id: series.id, name: series.name, color: series.color ?? palette.series[assignment(series.id).colorIndex]!, dash: 'solid' as const, swatch: scatterMarkerShape(series), width: shell.legendPosition === 'end' ? 160 : shell.buttonWidths[index]! })), status: description.view !== 'ready' ? description.status : axes.tooSmall ? 'Chart is too small to display points. Enlarge the chart or view the data table.' : !projection.targets.length ? 'No observations in the displayed domains. View the data table.' : '' });
    },
    enabled: c => c.description.view === 'ready' && !c.axes?.tooSmall && c.projection.targets.length > 0,
    identity: target => target.key, order: target => target.series.index * 50001 + target.index,
    reconcile(projection, id, order) { if (id && projection.byKey.has(id)) return projection.byKey.get(id)!; return projection.targets.find(target => target.series.index * 50001 + target.index >= order) ?? projection.targets[projection.targets.length - 1] ?? null; },
    pick: pickScatter, navigate: navigateScatter, tooltip,
    semantic(c, target) { const model = tooltip(c, target, 0); return { seriesName: target.series.spec.name, row: c.projection.series.findIndex(series => series.series.spec.id === target.series.spec.id) + 1, column: target.rank + 1, text: model.header + '. X ' + target.point.x + '. Y ' + target.point.y + '. ' + model.context, detail: detailText(model, c.description.context) }; },
    dimensions: projection => ({ rows: projection.series.length, columns: projection.series.reduce((count, series) => Math.max(count, series.targets.length), 0) }),
    focus: scatterFocusScene, anchor: (_projection, target) => ({ x: target.x, y: target.y }),
    detailBounds: c => ({ plot: c.projection.plot, body: { x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height } }),
    activate: (target, source, revision) => Object.freeze({ seriesId: target.series.spec.id, point: target.point, source, revision }),
    table: (shell, onOpen) => createDataTableFrame<FamilyTableSource<ScatterDescription>>(shell, onOpen, { columns: ['Series', 'Observation', 'X', 'Y', 'Visibility'], notice: 'All provided observations are retained in input order.', rowHeaders: true, size: source => source.table.rows.length, rows: (source, first, count) => source.table.rows.slice(first, first + count).map(row => row.cells) }),
    help: 'Left and Right move through observations in original data order, including right-to-left charts. Up and Down move to the closest XY observation in the adjacent visible series. Home and End move to series endpoints; Control+Home and Control+End reach chart endpoints. Missing or clipped pairs are skipped. Escape closes detail. Enter or Space activates an observation. Tab leaves the chart.',
  };
}
