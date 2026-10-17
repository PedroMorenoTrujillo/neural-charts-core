import type { ChartResult, ChartDiagnostic, ChartTheme, ChartStatus, ChartDataTable } from './chart-types.js';
import type { ChartMotion } from './interaction-types.js';
import type { LineFont } from './line-types.js';
export type GaugeBand = Readonly<{ id: string; from: number; to: number; color: string; label?: string }>;
export type GaugeTarget = Readonly<{ value: number; label?: string }>;
export type GaugeChartSpec<T = unknown> = Readonly<{
  family: 'gauge'; title: string; description?: string; value: number | null; domain: readonly [number, number]; datum?: T;
  preset?: 'arc' | 'ring'; unit?: string; color?: string; bands?: readonly GaugeBand[]; target?: GaugeTarget;
  theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: LineFont; motion?: ChartMotion; status?: ChartStatus;
  tooltip?: Readonly<{ mode?: 'point' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
}>;
export type GaugeMountOptions = Readonly<{ instanceId: string; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type GaugeState = Readonly<{}>;
export type GaugeSnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: 'ready' | 'loading' | 'empty' | 'error' | null; size: Readonly<{ width: number; height: number }> }>;
/** A read-only scalar has neither selectable data identities nor a viewport. */
export interface GaugeController<T = unknown> {
  update(spec: GaugeChartSpec<T>): ChartResult<number>; refresh(): ChartResult<number>; getState(): GaugeState; getSnapshot(): GaugeSnapshot; destroy(): void;
}
export type GaugeDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: NonNullable<GaugeSnapshot['view']>; status: string; context: string; table: ChartDataTable }>;
