import type { ChartResult } from './public/chart-types.js';
import type { HeatmapChartSpec, HeatmapMountOptions, HeatmapController, HeatmapDescription } from './public/heatmap-types.js';
import { mountHeatmap } from './heatmap/controller.js';
import { describeHeatmap as describe } from './heatmap/describe.js';
export type { ChartColorStop, ChartColorScale } from './public/color-types.js';
export type { HeatmapAxis, HeatmapCell, HeatmapCellId, HeatmapChartSpec, HeatmapMountOptions, HeatmapController, HeatmapState, HeatmapSnapshot, HeatmapDescription, HeatmapPointActivation, HeatmapViewportValue, HeatmapViewportChange } from './public/heatmap-types.js';
export function describeHeatmap<T>(input: unknown): ChartResult<HeatmapDescription> { return describe<T>(input); }
export function createHeatmapChart<T = unknown>(host: HTMLElement, spec: HeatmapChartSpec<T>, options: HeatmapMountOptions<T>): ChartResult<HeatmapController<T>> { return mountHeatmap(host, spec, options); }
export type { HeatmapReference } from './public/heatmap-types.js';
