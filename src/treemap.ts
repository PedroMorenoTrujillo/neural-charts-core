import type { ChartResult } from './public/chart-types.js';
import type { TreemapChartSpec, TreemapMountOptions, TreemapController, TreemapDescription } from './public/treemap-types.js';
import { mountTreemap } from './treemap/controller.js';
import { describeTreemap as describe } from './treemap/describe.js';
export type { TreemapLeaf, TreemapBranch, TreemapNode, TreemapNodeId, TreemapChartSpec, TreemapMountOptions, TreemapController, TreemapState, TreemapSnapshot, TreemapDescription, TreemapPointActivation } from './public/treemap-types.js';
export type { ChartColorStop, ChartColorScale } from './public/color-types.js';
export function describeTreemap<T = unknown>(input: unknown): ChartResult<TreemapDescription> { return describe<T>(input); }
export function createTreemapChart<T = unknown>(host: HTMLElement, spec: TreemapChartSpec<T>, options: TreemapMountOptions<T>): ChartResult<TreemapController<T>> { return mountTreemap(host, spec, options); }
