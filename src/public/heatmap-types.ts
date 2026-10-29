import type { ChartTheme, ChartStatus, ChartResult, ChartDiagnostic, ChartDataTable } from './chart-types.js';
import type { ChartSelectionBinding, ChartSelectionChange, ChartMotion, ChartCrosshair } from './interaction-types.js';
import type { ChartViewportBinding, ChartViewportValue, ChartViewportChange, ChartCategoryWindow } from './viewport-types.js';
import type { LineCategoryAxis, LineFont, LineLegendSpec } from './line-types.js';
import type { ChartColorScale } from './color-types.js';
import type { ChartReferenceBand } from './reference-types.js';
export type HeatmapAxis = Omit<LineCategoryAxis, 'edgeSpacing'> & Readonly<{ reversed?: boolean }>;
export type HeatmapReference = Readonly<{ id: string; axis: 'x' | 'y'; value: string; label?: string; color?: string; dash?: 'solid' | 'dashed' | 'dotted' }>;
export type HeatmapCell<T = unknown> = Readonly<{ id: string; rowId: string; columnId: string; value: number | null; datum?: T }>;
export type HeatmapCellId = Readonly<{ pointId: string; seriesId?: never }>;
export type HeatmapViewportValue = ChartViewportValue<ChartCategoryWindow, ChartCategoryWindow>;
export type HeatmapViewportChange = ChartViewportChange<ChartCategoryWindow, ChartCategoryWindow>;
export type HeatmapChartSpec<T = unknown> = Readonly<{
  family: 'heatmap'; title: string; description?: string; axes: Readonly<{ x: HeatmapAxis; y: HeatmapAxis }>;
  data: readonly HeatmapCell<T>[]; colorScale?: ChartColorScale; gapRatio?: number; labels?: 'auto' | 'off';
  referenceBands?: readonly ChartReferenceBand<string, string>[];
  references?: readonly HeatmapReference[];
  theme?: ChartTheme; direction?: 'ltr' | 'rtl'; font?: LineFont; legend?: LineLegendSpec;
  tooltip?: Readonly<{ mode?: 'point' | 'off'; placement?: 'top' | 'bottom' | 'start' | 'end' }>;
  status?: ChartStatus; selection?: ChartSelectionBinding<HeatmapCellId>; crosshair?: ChartCrosshair; motion?: ChartMotion;
  viewport?: ChartViewportBinding<ChartCategoryWindow, ChartCategoryWindow>;
}>;
export type HeatmapPointActivation<T = unknown> = Readonly<{ rowId: string; columnId: string; cell: HeatmapCell<T> | null; source: 'pointer' | 'touch' | 'keyboard'; revision: number }>;
export type HeatmapMountOptions<T = unknown> = Readonly<{ instanceId: string; onPointActivate?: (event: HeatmapPointActivation<T>) => void; onSelectionChange?: (event: ChartSelectionChange<HeatmapCellId>) => void; onViewportChange?: (event: HeatmapViewportChange) => void; onDiagnostic?: (diagnostic: ChartDiagnostic) => void }>;
export type HeatmapState = Readonly<{}>;
export type HeatmapSnapshot = Readonly<{ phase: 'suspended' | 'active' | 'faulted' | 'destroyed'; revision: number; committedRevision: number; view: 'ready' | 'loading' | 'empty' | 'error' | null; size: Readonly<{ width: number; height: number }> }>;
export interface HeatmapController<T = unknown> {
  update(spec: HeatmapChartSpec<T>): ChartResult<number>; refresh(): ChartResult<number>;
  getState(): HeatmapState; getSnapshot(): HeatmapSnapshot; getSelection(): readonly HeatmapCellId[];
  requestSelection(value: readonly HeatmapCellId[]): ChartResult<number>;
  getViewport(): HeatmapViewportValue | null; requestViewport(value: HeatmapViewportValue): ChartResult<number>; destroy(): void;
}
export type HeatmapDescription = Readonly<{ title: string; description: string; direction: 'ltr' | 'rtl'; view: NonNullable<HeatmapSnapshot['view']>; status: string; context: string; table: ChartDataTable }>;
