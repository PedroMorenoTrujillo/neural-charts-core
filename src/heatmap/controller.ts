import type { ChartResult } from '../public/chart-types.js';
import type { HeatmapChartSpec, HeatmapMountOptions, HeatmapController } from '../public/heatmap-types.js';
import { mountFamily } from '../internal/chart/family-controller.js';
import { heatmapPolicy } from './strategy.js';
export function mountHeatmap<T>(host: HTMLElement, spec: HeatmapChartSpec<T>, options: HeatmapMountOptions<T>): ChartResult<HeatmapController<T>> { return mountFamily(host, spec, options, heatmapPolicy<T>()); }
