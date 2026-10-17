import type { ChartResult, ChartDiagnostic, ChartTheme, ChartStatus, ChartDataTable } from './chart-types.js';
import type { ChartSelectionBinding, ChartSelectionChange, ChartMotion } from './interaction-types.js';
import type { ChartColorScale } from './color-types.js';
import type { LineFont, LineLegendSpec } from './line-types.js';
type NodeBase<T> = Readonly<{ id: string; label?: string; datum?: T }>;
export type TreemapLeaf<T = unknown> = NodeBase<T> & Readonly<{ value: number | null; colorValue?: number | null; children?: never }>;
export type TreemapBranch<T = unknown> = NodeBase<T> & Readonly<{ children: readonly TreemapNode<T>[]; value?: never; colorValue?: never }>;
export type TreemapNode<T = unknown> = TreemapLeaf<T> | TreemapBranch<T>;
export type TreemapNodeId = Readonly<{ pointId: string; seriesId?: never }>;
export type TreemapChartSpec<T = unknown> = Readonly<{
  family: 'treemap'; title: string; description?: string; root: TreemapNode<T>;
  color?: Readonly<{ by: 'group' }> | Readonly<{ by: 'value'; scale?: ChartColorScale }>;
  labels?: 'auto' | 'off'; theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: LineFont; legend?: LineLegendSpec;
  tooltip?: Readonly<{ mode?: 'point' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
  status?: ChartStatus; motion?: ChartMotion; selection?: ChartSelectionBinding<TreemapNodeId>;
}>;
export type TreemapPointActivation<T = unknown> = Readonly<{ node: TreemapNode<T>; total: number | null; incomplete: boolean; path: readonly string[]; source: 'pointer' | 'touch' | 'keyboard'; revision: number }>;
export type TreemapMountOptions<T = unknown> = Readonly<{ instanceId: string; onPointActivate?: (event: TreemapPointActivation<T>) => void; onSelectionChange?: (event: ChartSelectionChange<TreemapNodeId>) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type TreemapState = Readonly<{}>;
export type TreemapSnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: 'ready' | 'loading' | 'empty' | 'error' | null; size: Readonly<{ width: number; height: number }> }>;
export interface TreemapController<T = unknown> {
  update(spec: TreemapChartSpec<T>): ChartResult<number>; refresh(): ChartResult<number>; getState(): TreemapState; getSnapshot(): TreemapSnapshot;
  getSelection(): readonly TreemapNodeId[]; requestSelection(value: readonly TreemapNodeId[]): ChartResult<number>; destroy(): void;
}
export type TreemapDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: NonNullable<TreemapSnapshot['view']>; status: string; context: string; table: ChartDataTable }>;
