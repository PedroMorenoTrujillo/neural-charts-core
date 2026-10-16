import type { ChartTheme, ChartStateBinding, ChartStatus, ChartState, ChartStateChange, ChartDiagnostic, ChartResult } from './chart-types.js';
import type { SeriesPointId, ChartSelectionBinding, ChartSelectionChange, ChartCrosshair } from './interaction-types.js';

// @neural-charts/core/line: REQUIRED NOW; references the root types via type imports
export type LinePoint<T = unknown, TX extends string | number = string | number> =
  Readonly<{ id: string; x: TX; y: number | null; datum?: T }>;
export type LineSeries<T = unknown, TX extends string | number = string | number> =
  Readonly<{
    id: string; name: string; data: readonly LinePoint<T, TX>[];
    curve?: 'straight' | 'step-before' | 'step-after' | 'step-mid';
    gaps?: 'break' | 'connect'; markers?: 'auto' | 'on' | 'off';
    dash?: 'solid' | 'dashed' | 'dotted'; color?: string;
  }>;
export type LineTickSpec = Readonly<{ targetCount?: number }>;
export type LineLabelSpec = Readonly<{ maxWidth?: number }>;
export type LineCategory = Readonly<{ id: string; label?: string }>;
export type LineCategoryAxis = Readonly<{
  kind: 'category'; values: readonly LineCategory[]; title?: string;
  grid?: boolean; edgeSpacing?: number; ticks?: LineTickSpec; labels?: LineLabelSpec;
}>;
export type LineContinuousXAxis = Readonly<{
  kind: 'linear' | 'time'; domain?: readonly [number, number]; nice?: boolean;
  title?: string; grid?: boolean; ticks?: LineTickSpec; labels?: LineLabelSpec;
}>;
export type LineYAxis = Readonly<{
  kind: 'linear'; domain?: readonly [number, number]; nice?: boolean;
  includeZero?: boolean; reversed?: boolean; title?: string; grid?: boolean;
  ticks?: LineTickSpec; labels?: LineLabelSpec;
}>;
export type LineReference<TX extends string | number = string | number> =
  | Readonly<{ id: string; axis: 'x'; value: TX; label?: string; color?: string;
      dash?: 'solid' | 'dashed' | 'dotted' }>
  | Readonly<{ id: string; axis: 'y'; value: number; label?: string; color?: string;
      dash?: 'solid' | 'dashed' | 'dotted' }>;
export type LineTooltipSpec = Readonly<{
  mode?: 'point' | 'shared' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end';
}>;
export type LineLegendSpec = Readonly<{ position?: 'bottom' | 'end' | 'none' }>;
export type LineFont = Readonly<{
  family?: 'sans-serif' | 'serif' | 'monospace'; size?: number;
  weight?: 400 | 500 | 600 | 700;
}>;
type LineCommon = Readonly<{
  family: 'line'; title: string; description?: string;
  selection?: ChartSelectionBinding<SeriesPointId>; crosshair?: ChartCrosshair;
  theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: LineFont;
  legend?: LineLegendSpec; tooltip?: LineTooltipSpec;
  state?: ChartStateBinding; status?: ChartStatus;
}>;
export type LineChartSpec<T = unknown> = LineCommon & (
  | Readonly<{ axes: Readonly<{ x: LineCategoryAxis; y: LineYAxis }>;
      series: readonly LineSeries<T, string>[];
      references?: readonly LineReference<string>[] }>
  | Readonly<{ axes: Readonly<{ x: LineContinuousXAxis & { readonly kind: 'linear' };
      y: LineYAxis }>;
      series: readonly LineSeries<T, number>[];
      references?: readonly LineReference<number>[] }>
  | Readonly<{ axes: Readonly<{ x: LineContinuousXAxis & { readonly kind: 'time' };
      y: LineYAxis }>;
      series: readonly LineSeries<T, number>[];
      references?: readonly LineReference<number>[] }>
);
export type LinePointActivation<T = unknown> = Readonly<{
  seriesId: string; source: 'pointer' | 'touch' | 'keyboard'; revision: number;
}> & (
  | Readonly<{ xKind: 'category'; point: LinePoint<T, string> }>
  | Readonly<{ xKind: 'linear' | 'time'; point: LinePoint<T, number> }>
);
export type LineMountOptions<T = unknown> = Readonly<{
  instanceId: string; initialState?: ChartState;
  onPointActivate?: (event: LinePointActivation<T>) => void;
  onStateChange?: (event: ChartStateChange) => void;
  onSelectionChange?: (event: ChartSelectionChange<SeriesPointId>) => void;
  onDiagnostic?: (diagnostic: ChartDiagnostic) => void;
}>;
export type LineSnapshot = Readonly<{
  phase: 'suspended' | 'active' | 'faulted' | 'destroyed';
  revision: number; committedRevision: number;
  view: 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-series' | null;
  size: Readonly<{ width: number; height: number }>;
}>;
export interface LineController<T = unknown> {
  update(nextSpec: LineChartSpec<T>): ChartResult<number>;
  refresh(): ChartResult<number>;
  getState(): ChartState;
  getSelection(): readonly SeriesPointId[];
  requestSelection(value: readonly SeriesPointId[]): ChartResult<number>;
  getSnapshot(): LineSnapshot;
  destroy(): void;
}
