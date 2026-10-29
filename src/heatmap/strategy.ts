import type { HeatmapChartSpec, HeatmapDescription, HeatmapPointActivation, HeatmapState, HeatmapViewportValue } from '../public/heatmap-types.js';
import type { FamilyPolicy, FamilyTableSource } from '../internal/chart/family.js';
import type { HeatmapData } from './data.js';
import { ok } from '../internal/diagnostics.js';
import { createDataTableFrame } from '../internal/accessibility/table-frame.js';
import { sliceIdentities } from '../internal/interaction/identities.js';
import { requestViewport, sameViewport } from '../internal/interaction/viewport.js';
import { viewportShell, createViewportView } from '../internal/interaction/viewport-view.js';
import { withViewportAxes } from '../internal/interaction/viewport-axes.js';
import { planAxes } from '../internal/axes/plan.js';
import { axesScene, emptyLayers } from '../internal/axes/scene.js';
import { drawReferenceBands } from '../internal/axes/reference-band-view.js';
import { heatmapReferencesScene } from './references.js';
import { detailText } from '../internal/tooltip/model.js';
import { validateHeatmap, validateHeatmapOptions } from './validate.js';
import { describeHeatmapData } from './describe.js';
import { heatmapViewport } from './viewport.js';
import { heatmapColors } from './color.js';
import { heatmapScene } from './scene.js';
import { heatmapLegendLayout, offsetHeatmapAxes, heatmapLegendScene } from './legend.js';
import { projectHeatmap, heatmapIdentity, reconcileHeatmap, pickHeatmap, navigateHeatmap, type HeatmapProjection, type HeatmapTarget } from './geometry.js';

type Policy<T> = FamilyPolicy<HeatmapChartSpec<T>, HeatmapState, HeatmapProjection<T>, HeatmapTarget<T>, HeatmapDescription, HeatmapPointActivation<T>, HeatmapViewportValue>;
const unit: HeatmapState = Object.freeze({});
export function heatmapPolicy<T>(): Policy<T> {
  const snapshots = new WeakMap<HeatmapChartSpec<T>, HeatmapData<T>>();
  const dataOf = (spec: HeatmapChartSpec<T>): HeatmapData<T> => snapshots.get(spec)!;
  const tooltip: Policy<T>['tooltip'] = (c, target, revision) => {
    const data = c.projection.data, header = (data.rowLabels.get(target.rowId) ?? target.rowId) + ' / ' + (data.columnLabels.get(target.columnId) ?? target.columnId), value = target.cell?.value ?? null;
    return { revision, seriesId: target.rowId, pointId: target.cell?.id ?? heatmapIdentity(target), x: target.columnId, header, displayHeader: header, isolateText: true,
      rows: [{ seriesId: target.rowId, name: 'Value', value, availability: !target.cell ? 'absent' : value === null ? 'null' : 'value', color: c.palette.text, dash: 'solid' }],
      context: !target.cell ? 'No supplied record at this coordinate. This is not a zero.' : value === null ? 'An explicitly missing observation. This is not a zero.' : '',
    };
  };
  return {
    parse(input) { const parsed = validateHeatmap<T>(input); if (parsed.status === 'invalid') return parsed; snapshots.set(parsed.value.spec, parsed.value); return ok(parsed.value.spec); },
    options: validateHeatmapOptions<T>,
    validateData: spec => ok(dataOf(spec)),
    ids: () => [], names: () => [], hidden: () => [], state: () => unit,
    selectable: sliceIdentities,
    selectionEligible: target => !!target.cell && target.cell.value !== null,
    datumId(target) { if (!target.cell || target.cell.value === null) throw Error('Missing coordinates are not selection observations'); return { pointId: target.cell.id }; },
    selectedTarget: (projection, id) => { const target = projection.byId.get(id.pointId); return target?.cell?.value === null ? null : target ?? null; },
    exportRecords(spec, _state, _value, selection) {
      const data = dataOf(spec), selected = selection ? new Set(selection.map(id => id.pointId)) : null;
      return { columns: ['Cell ID', 'Row ID', 'Row', 'Column ID', 'Column', 'Value', ...(selected ? ['Selected'] : [])], rows: spec.data.map(cell => [cell.id, cell.rowId, spec.axes.y.values[data.rows.get(cell.rowId)!]!.label ?? cell.rowId, cell.columnId, spec.axes.x.values[data.columns.get(cell.columnId)!]!.label ?? cell.columnId, cell.value, ...(selected ? [String(selected.has(cell.id))] : [])]) };
    },
    viewport: {
      prepare: (spec, _state, previous) => heatmapViewport(dataOf(spec), previous), value: viewport => viewport.value as HeatmapViewportValue,
      request: requestViewport, same: sameViewport, shell: viewportShell, createView: createViewportView,
      // Shared gesture fractions use bottom-up numeric Y; category rows are
      // top-down unless explicitly reversed. RTL alone changes no axis order.
      viewState: (spec, model, axes) => ({ model, plot: axes.plot, domains: { x: null, y: null }, horizontal: false, xReversed: !!spec.axes.x.reversed, yReversed: !spec.axes.y.reversed, categorySpacing: .5, enabled: (spec.status?.kind ?? 'ready') === 'ready' && !axes.tooSmall }),
    },
    compute(spec, _state, shell, palette, font, measurer, viewport = null) {
      const data = dataOf(spec), scoped = withViewportAxes(spec.axes, viewport); if (scoped.status === 'invalid') return scoped;
      const layout = heatmapLegendLayout(spec, shell, font), planned = planAxes({ x: scoped.value.x, y: scoped.value.y, domains: { x: null, y: null }, width: layout.width, height: layout.height, font, direction: spec.direction ?? 'ltr', labels: data.columnLabels, yLabels: data.rowLabels, measurer, compact: shell.body.width < 480 }); if (planned.status === 'invalid') return planned;
      const axes = offsetHeatmapAxes(planned.value, layout.offsetX), result = projectHeatmap(data, axes, scoped.value); if (result.status === 'invalid') return result;
      const colors = heatmapColors(data, palette); if (colors.status === 'invalid') return colors;
      const description = describeHeatmapData(data, viewport), layers = emptyLayers();
      if (description.view === 'ready' && !axes.tooSmall) {
        axesScene(axes, spec.axes.x, spec.axes.y, palette, layers, shell.body.width < 480);
        const drawn = heatmapScene(result.value, colors.value, palette, font, layers, text => measurer.measure(text, font, 'ltr')); if (drawn.status === 'invalid') return drawn;
        heatmapLegendScene(layout, colors.value, palette, font, layers, measurer);
        heatmapReferencesScene(spec.references, axes, scoped.value, palette, layers, measurer);
        const bands = drawReferenceBands(spec.referenceBands, axes, scoped.value, spec.axes, palette, layers, measurer, false, true); if (bands.status === 'invalid') return bands;
      }
      return ok({ shell, palette, font, projection: result.value, description, layers, axes, legend: [], status: description.view !== 'ready' ? description.status : axes.tooSmall ? 'Chart is too small. Enlarge it or view the data table.' : '' });
    },
    enabled: c => c.description.view === 'ready' && !c.axes?.tooSmall && !!c.projection.rows.length && !!c.projection.columns.length,
    identity: heatmapIdentity,
    order: target => target.rowRank * 10001 + target.columnRank,
    reconcile(projection, id, order) {
      // The shared owner stores a stable order independent of a resized grid.
      const logicalOrder = Math.floor(order / 10001) * projection.data.columns.size + order % 10001;
      return reconcileHeatmap(projection, id, logicalOrder);
    },
    pick: pickHeatmap, navigate: navigateHeatmap, tooltip,
    semantic(c, target) { const model = tooltip(c, target, 0); return { seriesName: c.projection.data.rowLabels.get(target.rowId)!, row: target.row + 1, column: target.column + 1, text: detailText(model, ''), detail: detailText(model, c.description.context) }; },
    dimensions: projection => ({ rows: projection.rows.length, columns: projection.columns.length }),
    focus(_projection, target, palette, layers) { layers.interaction.push({ kind: 'rect', key: 'heatmap-focus', x: target.x, y: target.y, width: target.width, height: target.height, clipKey: 'plot', presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } }); },
    anchor: (_projection, target) => ({ x: target.cx, y: target.cy }),
    detailAnchor: (_projection, target) => ({ x: target.x, y: target.y, width: target.width, height: target.height }),
    detailBounds: c => ({ plot: c.projection.axes.plot, body: { x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height } }),
    activate: (target, source, revision) => Object.freeze({ rowId: target.rowId, columnId: target.columnId, cell: target.cell, source, revision }),
    table: (shell, onOpen) => createDataTableFrame<FamilyTableSource<HeatmapDescription>>(shell, onOpen, { columns: ['Row', 'Column', 'Value'], notice: 'Original supplied observations. Hatched absent coordinates have no supplied record and are not materialized as zero-valued rows.', selectionKey: id => id.seriesId === undefined ? id.pointId : null, size: source => source.table.rows.length, rows: (source, first, count) => source.table.rows.slice(first, first + count) }),
    help: 'Arrow keys move between displayed cells, including missing coordinates. Explicitly reversed axes change arrow direction; RTL alone does not reverse data. Home and End reach row edges; Control+Home and Control+End reach grid corners. Enter or Space activates a coordinate; only observed values can be selected. Escape closes detail. Tab leaves the chart.',
  };
}
