import { createColumnChart as mountColumn } from './column/controller.js';
import type { ChartResult } from './public/chart-types.js';
import type { ColumnChartSpec, ColumnController, ColumnMountOptions } from './public/column-types.js';
export function createColumnChart<T=unknown>(host:HTMLElement,spec:ColumnChartSpec<T>,options:ColumnMountOptions<T>):ChartResult<ColumnController<T>> {
  return mountColumn<T>(host,spec,options);
}
export type { ColumnPoint, ColumnSeries, ColumnCategory, ColumnCategoryAxis, ColumnValueAxis, ColumnReference, ColumnChartSpec, ColumnPointActivation, ColumnMountOptions, ColumnSnapshot, ColumnController } from './public/column-types.js';
