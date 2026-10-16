import type { ChartResult } from '../public/chart-types.js';
import type { StackedChartSpec, StackedController, StackedMountOptions } from '../public/stacked-types.js';
import { createColumnChart } from '../column/controller.js';
import { validateStacked, stackMode } from './validate.js';
import { projectStacked, stackedDomain, pickStacked } from './geometry.js';
import { stackedScene } from './scene.js';
import { stackContext, stackEmptyStatus, stackedTooltip } from './semantics.js';
export function mountStackedChart<T>(host: HTMLElement, spec: StackedChartSpec<T>, options: StackedMountOptions<T>): ChartResult<StackedController<T>> {
  return createColumnChart<T, StackedChartSpec<T>>(host, spec, options, {
    parse: validateStacked<T>, domain: (data, state) => stackedDomain(data, state, stackMode(data.spec)),
    project: (data, state, plot, domain) => projectStacked(data, state, plot, domain, stackMode(data.spec)),
    render: stackedScene, pick: pickStacked, context: stackContext, emptyStatus: stackEmptyStatus, tooltip: stackedTooltip,
  });
}
