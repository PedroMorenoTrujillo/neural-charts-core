import type { ChartDataTable, ChartDiagnostic, ChartResult, ChartState, ChartStateChange, ChartStateBinding, ChartTheme, ChartStatus } from './chart-types.js';
import type { ChartSelectionBinding, ChartSelectionChange, SeriesPointId, ChartCrosshair, ChartMotion } from './interaction-types.js';
import type { ChartViewportBinding, ChartViewportValue, ChartViewportChange, ChartCategoryWindow } from './viewport-types.js';
import type { LinePoint, LineSeries, LineFont, LineYAxis, LineReference, LineTooltipSpec, LineLegendSpec, LineSnapshot } from './line-types.js';
import type { ColumnCategoryAxis, ColumnSeries } from './column-types.js';
import type { ChartReferenceBand } from './reference-types.js';
export type MixedPoint<T = unknown> = LinePoint<T, string>;
export type MixedSeries<T = unknown> =
  | (LineSeries<T, string> & Readonly<{ type: 'line' | 'area' }>)
  | (ColumnSeries<T> & Readonly<{ type: 'column'; curve?: never; gaps?: never; markers?: never; dash?: never }>);
export type MixedChartSpec<T = unknown> = Readonly<{
  family: 'mixed'; title: string; description?: string; series: readonly MixedSeries<T>[];
  axes: Readonly<{ x: ColumnCategoryAxis; y: LineYAxis }>;
  groupGap?: number; barGap?: number; maxBarWidth?: number;
  theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: LineFont; status?: ChartStatus; state?: ChartStateBinding;
  legend?: LineLegendSpec; tooltip?: LineTooltipSpec; references?: readonly LineReference<string>[]; referenceBands?: readonly ChartReferenceBand<string>[];
  selection?: ChartSelectionBinding<SeriesPointId>; crosshair?: ChartCrosshair; motion?: ChartMotion; labels?: 'auto' | 'off';
  viewport?: ChartViewportBinding<ChartCategoryWindow>;
}>;
export type MixedPointActivation<T = unknown> = Readonly<{ seriesId: string; type: MixedSeries<T>['type']; point: MixedPoint<T>; xKind: 'category'; source: 'pointer' | 'touch' | 'keyboard'; revision: number }>;
export type MixedMountOptions<T = unknown> = Readonly<{ instanceId: string; initialState?: ChartState; onPointActivate?: (event: MixedPointActivation<T>) => void; onStateChange?: (event: ChartStateChange) => void; onSelectionChange?: (event: ChartSelectionChange<SeriesPointId>) => void; onViewportChange?: (event: ChartViewportChange<ChartCategoryWindow>) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type MixedSnapshot = LineSnapshot;
export interface MixedController<T = unknown> {
  update(spec: MixedChartSpec<T>): ChartResult<number>; refresh(): ChartResult<number>; getState(): ChartState;
  getSelection(): readonly SeriesPointId[]; requestSelection(value: readonly SeriesPointId[]): ChartResult<number>;
  getViewport(): ChartViewportValue<ChartCategoryWindow> | null; requestViewport(value: ChartViewportValue<ChartCategoryWindow>): ChartResult<number>;
  getSnapshot(): MixedSnapshot; destroy(): void;
}
export type MixedDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: 'ready' | 'empty' | 'loading' | 'error' | 'no-visible-series'; status: string; context: string; table: ChartDataTable }>;
