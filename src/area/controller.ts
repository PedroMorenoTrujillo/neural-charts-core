import type { ChartResult } from '../public/chart-types.js';
import type { AreaChartSpec, AreaController, AreaMountOptions } from '../public/area-types.js';
import { createLineChart } from '../line/controller.js';
import { validateVariant } from '../line/variant.js';
import { areaScene } from './scene.js';
export function mountAreaChart<T>(host: HTMLElement, spec: AreaChartSpec<T>, options: AreaMountOptions<T>): ChartResult<AreaController<T>> {
  return createLineChart<T, AreaChartSpec<T>>(host, spec, options, { parse: value => validateVariant<T>(value, 'area'), render: areaScene });
}
