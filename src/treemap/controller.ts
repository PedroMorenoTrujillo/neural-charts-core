import type { ChartResult } from '../public/chart-types.js';
import type { TreemapChartSpec, TreemapMountOptions, TreemapController } from '../public/treemap-types.js';
import { mountFamily } from '../internal/chart/family-controller.js';
import { treemapPolicy } from './strategy.js';
export function mountTreemap<T>(host: HTMLElement, spec: TreemapChartSpec<T>, options: TreemapMountOptions<T>): ChartResult<TreemapController<T>> { return mountFamily(host, spec, options, treemapPolicy<T>()); }
