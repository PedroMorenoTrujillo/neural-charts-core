import type { ChartDiagnostic, ChartResult, ChartState, ChartStateBinding, ChartStateChange, ChartStatus, ChartTheme, ChartDataTable } from './chart-types.js';
import type { SeriesPointId, ChartSelectionBinding, ChartSelectionChange, ChartCrosshair, ChartMotion } from './interaction-types.js';
import type { ChartViewportBinding, ChartViewportValue, ChartViewportChange, ChartNumericWindow } from './viewport-types.js';
export type ScatterPoint<T = unknown> = Readonly<{ id: string; x: number | null; y: number | null; datum?: T }>;
export type ScatterMarkerShape = 'circle' | 'square' | 'diamond';
export type ScatterSeries<T = unknown> = Readonly<{ id: string; name: string; data: readonly ScatterPoint<T>[]; color?: string; marker?: Readonly<{ shape?: ScatterMarkerShape; size?: number }> }>;
export type NumericAxis = Readonly<{ kind: 'linear'; domain?: readonly [number, number]; includeZero?: boolean; reversed?: boolean; nice?: boolean; title?: string; grid?: boolean; ticks?: Readonly<{ targetCount?: number }>; labels?: Readonly<{ maxWidth?: number }> }>;
export type ScatterReferenceLine = Readonly<{ id: string; axis: 'x' | 'y'; value: number; label?: string; color?: string; dash?: 'solid' | 'dashed' | 'dotted' }>;
export type ScatterChartSpec<T = unknown> = Readonly<{
  family: 'scatter'; title: string; description?: string; axes: Readonly<{ x: NumericAxis; y: NumericAxis }>; series: readonly ScatterSeries<T>[];
  selection?: ChartSelectionBinding<SeriesPointId>; crosshair?: ChartCrosshair; motion?: ChartMotion;
  viewport?: ChartViewportBinding<ChartNumericWindow>;
  theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: Readonly<{ family?: 'sans-serif' | 'serif' | 'monospace'; size?: number; weight?: 400 | 500 | 600 | 700 }>;
  legend?: Readonly<{ position?: 'bottom' | 'end' | 'none' }>; tooltip?: Readonly<{ mode?: 'point' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
  labels?: 'auto' | 'off'; references?: readonly ScatterReferenceLine[]; state?: ChartStateBinding; status?: ChartStatus;
}>;
export type ScatterPointActivation<T = unknown> = Readonly<{ seriesId: string; point: ScatterPoint<T>; source: 'pointer' | 'touch' | 'keyboard'; revision: number }>;
export type ScatterMountOptions<T = unknown> = Readonly<{ instanceId: string; initialState?: ChartState; onPointActivate?: (event: ScatterPointActivation<T>) => void; onStateChange?: (event: ChartStateChange) => void; onSelectionChange?: (event: ChartSelectionChange<SeriesPointId>) => void; onViewportChange?: (event: ChartViewportChange<ChartNumericWindow>) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type ScatterSnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-series' | null; size: Readonly<{ width: number; height: number }> }>;
export interface ScatterController<T = unknown> { update(next: ScatterChartSpec<T>): ChartResult<number>; refresh(): ChartResult<number>; getState(): ChartState; getSelection(): readonly SeriesPointId[]; requestSelection(value: readonly SeriesPointId[]): ChartResult<number>; getViewport(): ChartViewportValue<ChartNumericWindow> | null; requestViewport(value: ChartViewportValue<ChartNumericWindow>): ChartResult<number>; getSnapshot(): ScatterSnapshot; destroy(): void; }
export type ScatterDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: NonNullable<ScatterSnapshot['view']>; status: string; context: string; table: ChartDataTable }>;
export type ScatterDescriptionOptions = Readonly<{ initialState?: ChartState }>;
