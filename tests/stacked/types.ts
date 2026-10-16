import { createStackedChart } from '../../src/stacked.js';
import type { StackedChartSpec, StackedController, StackedPointActivation } from '../../src/stacked.js';
import type { ColumnChartSpec } from '../../src/column.js';
declare const host: HTMLElement;
const spec: StackedChartSpec<{ sku: string }> = {
  family: 'stacked', stacking: 'percent', orientation: 'horizontal', title: 'Visible share',
  axes: { x: { kind: 'category', values: [{ id: 'a', label: 'January' }] }, y: { kind: 'linear' } },
  series: [{ id: 's', name: 'Observed', data: [{ id: 'p', x: 'a', y: 2, datum: { sku: 'SKU1' } }] }],
};
createStackedChart(host, spec, { instanceId: 'share', onPointActivate(event) { const sku: string | undefined = event.point.datum?.sku; void sku; } });
declare const handle: StackedController<{ sku: string }>;
handle.update({ ...spec, stacking: 'sum', orientation: 'vertical' });
// @ts-expect-error grouped subslot spacing does not belong to one-band stacking
const badGap: StackedChartSpec = { ...spec, barGap: .2 };
// @ts-expect-error percent semantics have an explicit finite mode inventory
const badMode: StackedChartSpec = { ...spec, stacking: 'normalize' };
// @ts-expect-error category IDs are strings, not arbitrary XY coordinates
const badPoint: StackedChartSpec = { ...spec, series: [{ id: 's', name: 'S', data: [{ id: 'p', x: 1, y: 2 }] }] };
// @ts-expect-error immutable source observations must not be mutated
spec.series[0]!.data[0]!.y = 4;
declare const column: ColumnChartSpec;
// @ts-expect-error controller family identity is not interchangeable
handle.update(column);
declare const activation: StackedPointActivation;
// @ts-expect-error outputs are domain events, never DOM events
const native: Event = activation;
void badGap; void badMode; void badPoint; void native;
