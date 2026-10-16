import type { ChartSelectionBinding, ChartSelectionChange, SeriesPointId, SlicePointId } from '@neural-charts/core';
import type { LineController, LineChartSpec } from '@neural-charts/core/line';
import type { PieController, PieChartSpec } from '@neural-charts/core/pie';
import type { ScatterController, ScatterChartSpec } from '@neural-charts/core/scatter';
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
