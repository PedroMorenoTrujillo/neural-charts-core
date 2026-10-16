import type { PieSlice, RadialChartSpec, RadialDescription, RadialState, RadialPointActivation } from '../public/radial-types.js';
import type { FamilyPolicy } from '../internal/chart/family.js';
import { assignment } from '../internal/chart/presentation.js';
import { emptyLayers } from '../internal/axes/scene.js';
import { detailText } from '../internal/tooltip/model.js';
import { ok } from '../internal/diagnostics.js';
import { validateRadial, validateRadialOptions } from './validate.js';
import { normalizeRadial, pickRadial, type RadialSlice } from './math.js';
import { projectRadial, radialFocusAnchor, type RadialProjection } from './geometry.js';
import { describeRadialData, sliceShareText } from './describe.js';
import { radialScene, radialFocusScene } from './scene.js';
import { createRadialTable } from './table.js';

type Target<T> = RadialSlice<PieSlice<T>>;
function names<T>(spec: RadialChartSpec<T>): readonly string[] {
  const seen = new Set<string>(), duplicates = new Set<string>();
  for (const point of spec.data) { if (seen.has(point.label)) duplicates.add(point.label); seen.add(point.label); }
  return spec.data.map(point => duplicates.has(point.label) && point.label !== point.id ? point.label + ' (' + point.id + ')' : point.label);
}
export function radialPolicy<T>(family: 'pie' | 'donut'): FamilyPolicy<RadialChartSpec<T>, RadialState, RadialProjection<T>, Target<T>, RadialDescription, RadialPointActivation<T>> {
  const tooltip: ReturnType<typeof radialPolicy<T>>['tooltip'] = (c, target, revision) => {
    const value = target.point.value, share = sliceShareText(value, target.fraction, c.projection.data.positive > 0), total = c.description.total, header = c.description.table.rows[target.index]!.cells[0]!;
    return Object.freeze({ revision, seriesId: 'slices', pointId: target.point.id, x: target.point.id, header, displayHeader: header, rows: Object.freeze([{ seriesId: target.point.id, name: 'Value', value, availability: value === null ? 'null' as const : 'value' as const, color: target.point.color ?? c.palette.series[assignment(target.point.id).colorIndex]!, dash: 'solid' as const }]), isolateText: true, context: share + ' of visible total. ' + (total === null ? 'Total unavailable.' : (c.description.totalIncomplete ? 'Known total: ' : 'Total: ') + total + '.') });
  };
  return {
    parse: value => validateRadial<T>(value, family), options: validateRadialOptions<T>,
    validateData: (spec, state) => normalizeRadial(spec.data, new Set(state.hiddenSliceIds)),
    ids: spec => spec.data.map(point => point.id), hidden: state => state.hiddenSliceIds,
    state: hidden => Object.freeze({ hiddenSliceIds: Object.freeze([...hidden]) }), names,
    compute(spec, state, shell, palette, font, measurer) {
      const projected = projectRadial(spec, state, { x: 0, y: 0, width: shell.body.width, height: shell.body.height }); if (projected.status === 'invalid') return projected;
      const projection = projected.value, description = describeRadialData(spec, state, projection.data), layers = emptyLayers(), labels = names(spec);
      const painted = radialScene(projection, spec, description, palette, font, text => measurer.measure(text, font, spec.direction ?? 'ltr'), layers); if (painted.status === 'invalid') return painted;
      return ok({ shell, palette, font, projection, description, layers, legend: spec.data.map((point, index) => ({ id: point.id, name: labels[index]!, color: point.color ?? palette.series[assignment(point.id).colorIndex]!, dash: 'solid' as const, swatch: 'square' as const, width: shell.legendPosition === 'end' ? 160 : shell.buttonWidths[index]! })), status: description.view === 'ready' && projection.tooSmall ? 'Chart is too small to display slices. Enlarge the chart or view the data table.' : description.status });
    },
    enabled: c => c.description.view === 'ready' && !c.projection.tooSmall,
    identity: target => target.point.id, order: target => target.index,
    reconcile(projection, id, order) {
      if (id && projection.byId.has(id)) return projection.byId.get(id)!;
      const targets = projection.data.eligible; let low = 0, high = targets.length;
      while (low < high) { const middle = (low + high) >>> 1; if (targets[middle]!.index < order) low = middle + 1; else high = middle; }
      return targets[Math.min(low, targets.length - 1)] ?? null;
    },
    pick: (projection, x, y) => pickRadial(projection.data, projection.frame, x, y),
    navigate(projection, current, key) {
      const targets = projection.data.eligible, rank = projection.rankById.get(current.point.id)!;
      const index = key === 'Home' ? 0 : key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, rank + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1)));
      return targets[index] ?? null;
    },
    tooltip,
    semantic(c, target) { const model = tooltip(c, target, 0); return { seriesName: 'Slices', row: 1, column: c.projection.rankById.get(target.point.id)! + 1, text: model.header + '. Value ' + target.point.value + '. ' + model.context, detail: detailText(model, c.description.context) }; },
    dimensions: projection => ({ rows: 1, columns: projection.data.eligible.length }),
    focus: radialFocusScene, anchor: radialFocusAnchor,
    detailBounds: c => { const body = { x: 0, y: 0, width: c.shell.body.width, height: c.shell.body.height }; return { plot: body, body }; },
    activate: (target, source, revision) => Object.freeze({ point: target.point, percentage: target.point.value !== null && (target.point.value === 0 || target.fraction > 0) ? target.fraction * 100 : null, source, revision }),
    table: createRadialTable,
    help: 'Use Left or Up for the previous slice and Right or Down for the next slice in data order, including right-to-left charts. Home and End move to endpoints. Zero values have no sector but remain available by keyboard and data table. Escape closes detail. Enter or Space activates a slice. Tab leaves the chart.',
  };
}
