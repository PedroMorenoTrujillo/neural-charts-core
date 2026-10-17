import { createTreemapChart, describeTreemap, type TreemapChartSpec, type TreemapNode } from '../../src/treemap.js';
declare const host: HTMLElement;
const leaf = { id: 'a', value: 4, datum: { region: 'Europe' } } as const;
const root: TreemapNode<{ readonly region: string }> = { id: 'all', children: [leaf] };
const spec: TreemapChartSpec<{ readonly region: string }> = { family: 'treemap', title: 'Portfolio', root, color: { by: 'value', scale: { kind: 'sequential', colors: ['#fff', { r: 0, g: 80, b: 140 }] } }, selection: { mode: 'controlled', value: [{ pointId: 'a' }] } };
const result = createTreemapChart(host, spec, { instanceId: 'typed', onPointActivate(event) { const region: string | undefined = event.node.datum?.region; const path: readonly string[] = event.path; const value: number | null = event.total; void [region, path, value]; }, onSelectionChange(event) { const id: string | undefined = event.selection[0]?.pointId; void id; } });
if (result.status === 'ok') { result.value.update(spec); result.value.requestSelection([{ pointId: 'all' }]); result.value.refresh(); result.value.destroy();
  // @ts-expect-error Treemap has no Cartesian viewport owner.
  result.value.requestViewport({ x: [0, 1] });
}
describeTreemap(spec);
// @ts-expect-error A tree node is either a branch or a leaf.
const ambiguous: TreemapNode = { id: 'bad', value: 2, children: [] };
// @ts-expect-error Runtime values remain numeric/null, never strings.
const stringValue: TreemapNode = { id: 'bad', value: '2' };
// @ts-expect-error Independent color metrics belong to leaves.
const branchMetric: TreemapNode = { id: 'bad', children: [], colorValue: 2 };
// @ts-expect-error Flat Cartesian data is not the hierarchy model.
createTreemapChart(host, { family: 'treemap', title: 'Bad', series: [] }, { instanceId: 'bad' });
// @ts-expect-error Node selection is unscoped by series.
createTreemapChart(host, { ...spec, selection: { mode: 'controlled', value: [{ pointId: 'a', seriesId: 'fake' }] } }, { instanceId: 'bad' });
// @ts-expect-error No fake visibility callback on a read-only color key.
createTreemapChart(host, spec, { instanceId: 'bad', onStateChange() {} });
void [ambiguous, stringValue, branchMetric];
