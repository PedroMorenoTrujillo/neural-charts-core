import type { ChartDiagnostic, ChartResult, ChartStatus, ChartTheme, ChartDataTable } from './chart-types.js';
import type { SlicePointId, ChartSelectionBinding, ChartSelectionChange, ChartMotion } from './interaction-types.js';
export type PieSlice<T = unknown> = Readonly<{ id: string; label: string; value: number | null; color?: string; datum?: T }>;
export type RadialState = Readonly<{ hiddenSliceIds: readonly string[] }>;
export type RadialStateBinding = Readonly<{ mode: 'internal' }> | Readonly<{ mode: 'controlled'; value: RadialState }>;
export type RadialStateChange = Readonly<{ state: RadialState; effect: 'proposal' | 'accepted'; source: 'legend' | 'update'; revision: number }>;
export type RadialFont = Readonly<{ family?: 'sans-serif' | 'serif' | 'monospace'; size?: number; weight?: 400 | 500 | 600 | 700 }>;
export type RadialCommon<T> = Readonly<{
  title: string; description?: string; data: readonly PieSlice<T>[];
  selection?: ChartSelectionBinding<SlicePointId>; motion?: ChartMotion;
  theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: RadialFont;
  legend?: Readonly<{ position?: 'bottom' | 'end' | 'none' }>;
  tooltip?: Readonly<{ mode?: 'point' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
  labels?: 'outside' | 'inside' | 'off'; state?: RadialStateBinding; status?: ChartStatus;
}>;
export type PieChartSpec<T = unknown> = RadialCommon<T> & Readonly<{ family: 'pie' }>;
export type DonutChartSpec<T = unknown> = RadialCommon<T> & Readonly<{ family: 'donut'; holeRatio?: number; center?: false | Readonly<{ label?: string; value?: string }> }>;
export type RadialChartSpec<T = unknown> = PieChartSpec<T> | DonutChartSpec<T>;
export type RadialPointActivation<T = unknown> = Readonly<{ point: PieSlice<T>; percentage: number | null; source: 'pointer' | 'touch' | 'keyboard'; revision: number }>;
export type RadialMountOptions<T = unknown> = Readonly<{ instanceId: string; initialState?: RadialState; onPointActivate?: (event: RadialPointActivation<T>) => void; onStateChange?: (event: RadialStateChange) => void; onSelectionChange?: (event: ChartSelectionChange<SlicePointId>) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type RadialSnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: 'ready' | 'loading' | 'empty' | 'error' | 'no-visible-slices' | null; size: Readonly<{ width: number; height: number }> }>;
export interface RadialController<S> { update(nextSpec: S): ChartResult<number>; refresh(): ChartResult<number>; getState(): RadialState; getSelection(): readonly SlicePointId[]; requestSelection(value: readonly SlicePointId[]): ChartResult<number>; getSnapshot(): RadialSnapshot; destroy(): void; }
export type PieController<T = unknown> = RadialController<PieChartSpec<T>>;
export type DonutController<T = unknown> = RadialController<DonutChartSpec<T>>;
export type RadialDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: NonNullable<RadialSnapshot['view']>; status: string; context: string; total: number | null; totalOverflow: boolean; totalIncomplete: boolean; table: ChartDataTable }>;
export type RadialDescriptionOptions = Readonly<{ initialState?: RadialState }>;
