import type { ChartTheme, ChartStateBinding, ChartStatus, ChartState, ChartStateChange, ChartDiagnostic, ChartResult } from './chart-types.js';
import type { SeriesPointId, ChartSelectionBinding, ChartSelectionChange, ChartCrosshair, ChartMotion } from './interaction-types.js';

export type ColumnPoint<T = unknown> = Readonly<{ id: string; x: string; y: number | null; datum?: T }>;
export type ColumnSeries<T = unknown> = Readonly<{ id: string; name: string; data: readonly ColumnPoint<T>[]; color?: string }>;
export type ColumnCategory = Readonly<{ id: string; label?: string }>;
export type ColumnCategoryAxis = Readonly<{ kind: 'category'; values: readonly ColumnCategory[]; title?: string; grid?: boolean; ticks?: Readonly<{ targetCount?: number }>; labels?: Readonly<{ maxWidth?: number }> }>;
export type ColumnValueAxis = Readonly<{ kind: 'linear'; domain?: readonly [number, number]; nice?: boolean; reversed?: boolean; title?: string; grid?: boolean; ticks?: Readonly<{ targetCount?: number }>; labels?: Readonly<{ maxWidth?: number }> }>;
export type ColumnReference = Readonly<{ id: string; axis: 'y'; value: number; label?: string; color?: string; dash?: 'solid' | 'dashed' | 'dotted' }>;
export type ColumnChartSpec<T = unknown> = Readonly<{
  family: 'column'; title: string; description?: string;
  selection?: ChartSelectionBinding<SeriesPointId>; crosshair?: ChartCrosshair; motion?: ChartMotion;
  orientation?: 'vertical' | 'horizontal'; groupGap?: number; barGap?: number; maxBarWidth?: number;
  theme?: ChartTheme; direction?: 'ltr' | 'rtl';
  font?: Readonly<{ family?: 'sans-serif' | 'serif' | 'monospace'; size?: number; weight?: 400 | 500 | 600 | 700 }>;
  axes: Readonly<{ x: ColumnCategoryAxis; y: ColumnValueAxis }>;
  series: readonly ColumnSeries<T>[]; references?: readonly ColumnReference[];
  legend?: Readonly<{ position?: 'bottom' | 'end' | 'none' }>;
  tooltip?: Readonly<{ mode?: 'point' | 'shared' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
  state?: ChartStateBinding; status?: ChartStatus;
}>;
export type ColumnPointActivation<T = unknown> = Readonly<{ seriesId: string; point: ColumnPoint<T>; xKind: 'category'; source: 'pointer' | 'touch' | 'keyboard'; revision: number }>;
export type ColumnMountOptions<T = unknown> = Readonly<{ instanceId: string; initialState?: ChartState; onPointActivate?: (event: ColumnPointActivation<T>) => void; onStateChange?: (event: ChartStateChange) => void; onSelectionChange?: (event: ChartSelectionChange<SeriesPointId>) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type ColumnSnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-series' | null; size: Readonly<{ width: number; height: number }> }>;
export interface ColumnController<T = unknown> {
  update(nextSpec: ColumnChartSpec<T>): ChartResult<number>;
  refresh(): ChartResult<number>;
  getState(): ChartState;
  getSelection(): readonly SeriesPointId[];
  requestSelection(value: readonly SeriesPointId[]): ChartResult<number>;
  getSnapshot(): ColumnSnapshot;
  destroy(): void;
}
