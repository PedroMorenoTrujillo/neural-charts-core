import type { ChartSelectionBinding, ChartSelectionChange, SeriesPointId, SlicePointId, ChartMotion, ChartViewportBinding, ChartViewportValue, ChartNumericWindow, ChartCategoryWindow } from '../../src/index.js';
import type { ColumnController, ColumnChartSpec } from '../../src/column.js';
import type { LineController, LineChartSpec } from '../../src/line.js';
import type { PieController, PieChartSpec } from '../../src/pie.js';
import type { ScatterController, ScatterChartSpec } from '../../src/scatter.js';
declare const line: LineController;
declare const pie: PieController;
declare const scatter: ScatterController;
const series: ChartSelectionBinding<SeriesPointId> = { mode: 'controlled', value: [{ seriesId: 's', pointId: 'p' }] };
const slices: ChartSelectionBinding<SlicePointId> = { mode: 'internal', initial: [{ pointId: 'p' }] };
const partialLine: Pick<LineChartSpec, 'selection' | 'crosshair'> = { selection: series, crosshair: 'xy' };
const partialPie: Pick<PieChartSpec, 'selection'> = { selection: slices };
const partialXY: Pick<ScatterChartSpec, 'selection' | 'crosshair'> = { selection: series, crosshair: 'x' };
line.requestSelection([{ seriesId: 's', pointId: 'p' }]); pie.requestSelection([{ pointId: 'p' }]); scatter.requestSelection(line.getSelection());
// @ts-expect-error Cartesian selection requires actual series scope
line.requestSelection([{ pointId: 'p' }]);
// @ts-expect-error radial selection never invents a Cartesian series
pie.requestSelection([{ seriesId: 's', pointId: 'p' }]);
// @ts-expect-error a radial chart has no fictitious axes/crosshair
const radialCrosshair: Pick<PieChartSpec, 'crosshair'> = { crosshair: 'xy' };
// @ts-expect-error controlled state always has an applied value
const missingValue: ChartSelectionBinding = { mode: 'controlled' };
// @ts-expect-error internal configuration has no controlled value
const doubleOwner: ChartSelectionBinding = { mode: 'internal', value: [] };
declare const change: ChartSelectionChange<SeriesPointId>;
// @ts-expect-error readonly immutable domain output
change.selection.push({ seriesId: 's', pointId: 'p' });
// @ts-expect-error domain output cannot be a browser DOM Event
const browserEvent: Event = change;
void partialLine; void partialPie; void partialXY; void radialCrosshair; void missingValue; void doubleOwner; void browserEvent;
const motion: ChartMotion = 'subtle';
const lineMotion: Pick<LineChartSpec, 'motion'> = { motion };
const pieMotion: Pick<PieChartSpec, 'motion'> = { motion: 'none' };
// @ts-expect-error V1 motion is an explicit bounded enum, not arbitrary durations
const unboundedMotion: ChartMotion = { duration: 10000 };
// @ts-expect-error unsupported animation modes cannot silently pretend support
const unsupportedMotion: Pick<ScatterChartSpec, 'motion'> = { motion: 'morph' };
void lineMotion; void pieMotion; void unboundedMotion; void unsupportedMotion;
declare const column: ColumnController;
const numericViewport: ChartViewportBinding<ChartNumericWindow> = { mode: 'controlled', axes: 'xy', value: { x: [0, 1], y: [-1, 1] } };
const categoryViewport: ChartViewportBinding<ChartCategoryWindow> = { mode: 'internal', axes: 'x', initial: { x: { firstId: 'a', lastId: 'b' } } };
scatter.requestViewport({ x: [0, 1], y: [0, 1] }); column.requestViewport({ x: { firstId: 'a', lastId: 'b' } }); line.requestViewport({});
// @ts-expect-error XY uses actual numeric coordinates, never category labels
const categoryXY: Pick<ScatterChartSpec, 'viewport'> = { viewport: categoryViewport };
// @ts-expect-error rectangles have logical categories on X in either orientation
const numericColumn: Pick<ColumnChartSpec, 'viewport'> = { viewport: numericViewport };
// @ts-expect-error radial controllers have no fake Cartesian viewport API
pie.requestViewport({ x: [0, 1] });
// @ts-expect-error controlled viewport requires its applied value
const missingViewport: ChartViewportBinding = { mode: 'controlled', axes: 'x' };
// @ts-expect-error numeric windows have exactly two endpoints
const readonlyViewport: ChartViewportValue<ChartNumericWindow> = { x: [0, 1, 2] };
declare const appliedViewport: ChartViewportValue<ChartNumericWindow>;
if (appliedViewport.x) {
  // @ts-expect-error applied values cannot mutate their readonly tuple
  appliedViewport.x.push(2);
}
void categoryXY; void numericColumn; void missingViewport; void readonlyViewport;
