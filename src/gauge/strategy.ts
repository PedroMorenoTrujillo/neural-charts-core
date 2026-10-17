import type { GaugeChartSpec, GaugeDescription, GaugeState } from '../public/gauge-types.js';
import type { FamilyPolicy, FamilyTableSource } from '../internal/chart/family.js';
import { ok } from '../internal/diagnostics.js';
import { emptyLayers } from '../internal/axes/scene.js';
import { createDataTableFrame } from '../internal/accessibility/table-frame.js';
import { validateGauge, validateGaugeOptions } from './validate.js';
import { describeGaugeSpec, gaugeValue, gaugeRange, gaugeColumns, gaugeRows } from './describe.js';
import { projectGauge, type GaugeProjection } from './geometry.js';
import { gaugeScene } from './scene.js';
type Reading = Readonly<{ pointId: string }>;
type Policy<T> = FamilyPolicy<GaugeChartSpec<T>, GaugeState, GaugeProjection, Reading, GaugeDescription, Reading>;
const unit: GaugeState = Object.freeze({}), reading: Reading = Object.freeze({ pointId: 'measurement' });
export function gaugePolicy<T>(): Policy<T> {
  const owners = new WeakMap<GaugeProjection, GaugeChartSpec<T>>();
  return {
    parse: validateGauge<T>, options: validateGaugeOptions, validateData: spec => ok(spec), ids: () => [], names: () => [], hidden: () => [], state: () => unit,
    selectable: () => new Map(), datumId: () => reading, selectedTarget: () => null, selectionEligible: () => false,
    exportRecords: spec => ({ columns: gaugeColumns, rows: gaugeRows(spec) }),
    compute(spec, _state, shell, palette, font, measurer) {
      const plot = { x: 0, y: 0, width: shell.body.width, height: shell.body.height };
      const projection = projectGauge(spec, plot, font.size); if (projection.status === 'invalid') return projection;
      const description = describeGaugeSpec(spec), layers = emptyLayers(); owners.set(projection.value, spec);
      if (description.view === 'ready') gaugeScene(spec, projection.value, palette, font, layers, measurer);
      return ok({ shell, palette, font, projection: projection.value, description, layers, plot, legend: [], status: projection.value.tooSmall && description.view === 'ready' ? 'Chart is too small. Enlarge it or view the data table.' : description.status });
    },
    enabled: c => c.description.view === 'ready' && c.projection.plot.width >= 24 && c.projection.plot.height >= 24,
    identity: () => 'measurement', order: () => 0, reconcile: () => reading,
    pick(projection, x, y) { const p = projection.plot; return Number.isFinite(x) && Number.isFinite(y) && x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height ? reading : null; },
    navigate: () => null,
    tooltip(c, _target, revision) {
      const spec = owners.get(c.projection)!;
      return { revision, seriesId: 'measurement', pointId: 'measurement', x: 'measurement', header: spec.title, displayHeader: spec.title, isolateText: true,
        rows: [{ seriesId: 'measurement', name: spec.unit ? 'Value (' + spec.unit + ')' : 'Value', value: spec.value, availability: spec.value === null ? 'null' : 'value', color: spec.color ?? c.palette.series[0]!, dash: 'solid' }],
        // Full explanatory prose belongs in the owned description/table. A
        // compact detail communicates raw value, range and target without a
        // tall duplicate paragraph obscuring the scalar on mobile.
        context: gaugeRange(spec.value, spec.domain) + '. Domain ' + spec.domain[0] + ' to ' + spec.domain[1] + '.' + (spec.target ? ' Target ' + spec.target.value + (c.projection.targetOutside ? ' (outside domain)' : '') + '.' : '') };
    },
    semantic(c) { const spec = owners.get(c.projection)!, detail = c.description.context; return { seriesName: spec.title, row: 1, column: 1, text: gaugeValue(spec), detail, meter: { label: spec.title, minimum: spec.domain[0], maximum: spec.domain[1], value: spec.value, text: detail } }; },
    dimensions: () => ({ rows: 1, columns: 1 }),
    focus(projection, _target, palette, layers) { const p = projection.plot; if (p.width > 6 && p.height > 6) layers.interaction.push({ kind: 'rect', key: 'gauge-focus', x: p.x + 3, y: p.y + 3, width: p.width - 6, height: p.height - 6, presentation: { fill: { kind: 'none' }, stroke: { kind: 'solid', value: palette.focus }, strokeWidth: 2 } }); },
    anchor: projection => projection.anchor,
    // This read-only scalar has no selected slice/track. Protect the actual
    // reading, whose conservative ink box is shared with Scene placement.
    detailAnchor: projection => projection.readingBox,
    detailBounds: c => ({ plot: c.projection.plot, body: c.projection.plot }), activate: () => reading,
    table(shell, onOpen) { return createDataTableFrame<FamilyTableSource<GaugeDescription>>(shell, onOpen, { columns: gaugeColumns, notice: 'The original scalar, target and domain intervals are preserved. The visual arc is clamped; this is a read-only indicator.', minimumWidthEm: 48, rowHeaders: true, selectionKey: () => null, size: source => source.table.rows.length, rows: (source, start, limit) => source.table.rows.slice(start, start + limit) }); },
    semanticProfile: 'meter', help: 'Read-only measurement. Tab moves to the chart controls. Enter or Space opens measurement details. Escape closes details. Use the data table for the original value, domain, target and bands. Arrow keys do not change the measurement.',
  };
}
