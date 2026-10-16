import { createLineChart as mountLine } from './line/controller.js';
import type { ChartResult } from './public/chart-types.js';
import type { LineChartSpec, LineMountOptions, LineController } from './public/line-types.js';
export function createLineChart<T = unknown>(host: HTMLElement, spec: LineChartSpec<T>, options: LineMountOptions<T>): ChartResult<LineController<T>> {
  return mountLine<T>(host, spec, options);
}
export type {
  LinePoint, LineSeries, LineTickSpec, LineLabelSpec, LineCategory,
  LineCategoryAxis, LineContinuousXAxis, LineYAxis, LineReference,
  LineTooltipSpec, LineLegendSpec, LineFont, LineChartSpec,
  LinePointActivation, LineMountOptions, LineSnapshot, LineController,
} from './public/line-types.js';
