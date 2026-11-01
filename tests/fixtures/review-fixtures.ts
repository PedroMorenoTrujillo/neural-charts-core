import type { LineChartSpec } from '../../src/public/types.js';
import { lineFixture } from './fixtures.js';

export const reviewNames = ['simple-line', 'multi-series', 'gaps', 'steps', 'long-labels', 'references', 'legend', 'tooltip', 'tooltip-edge', 'tooltip-dock', 'focus', 'loading', 'empty', 'error', 'no-visible-series', 'rtl'] as const;
export type ReviewName = typeof reviewNames[number];
type CategorySpec = Extract<LineChartSpec, { axes: { x: { kind: 'category' } } }>;
function isCategory(spec: LineChartSpec): spec is CategorySpec { return spec.axes.x.kind === 'category'; }
export function reviewFixture(name: ReviewName): LineChartSpec {
  const fixture = name === 'multi-series' || name === 'legend' || name === 'tooltip-edge' || name === 'tooltip-dock' ? 'two series' : name === 'gaps' ? 'null break' : name === 'references' ? 'references' : name === 'no-visible-series' ? 'all hidden' : name === 'rtl' ? 'RTL' : name === 'long-labels' ? 'long labels' : name === 'steps' || name === 'loading' || name === 'empty' || name === 'error' ? name : 'simple category';
  const { font: _fixtureFont, ...base } = lineFixture(fixture);
  let spec: LineChartSpec = { ...base, title: 'Weekly activity', description: 'Completed sessions · Last seven days' };
  if (isCategory(spec)) {
    if (name !== 'long-labels') spec = { ...spec, axes: { ...spec.axes, x: { ...spec.axes.x, values: spec.axes.x.values.map((c, i) => ({ ...c, label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]! })), title: 'Day' }, y: { ...spec.axes.y, title: 'Sessions' } } };
    spec = { ...spec, series: spec.series.map((s, i) => ({ ...s, name: i === 0 ? 'Completed' : name === 'steps' ? s.name : 'Planned' })) };
  } else {
    spec = { ...spec, series: spec.series.map((s, i) => ({ ...s, name: i === 0 ? 'Completed' : name === 'steps' ? s.name : 'Planned' })) };
  }
  if (name === 'legend') spec = { ...spec, state: { mode: 'controlled', value: { hiddenSeriesIds: ['other'] } } };
  if (name === 'tooltip') spec = { ...spec, tooltip: { mode: 'point' } };
  if (name === 'steps' && isCategory(spec)) spec = { ...spec, title: 'Step interpolation', description: 'Before · After · Midpoint', series: spec.series.map((s, i) => ({ ...s, name: ['Before', 'After', 'Midpoint'][i]!, data: s.data.map((p, j) => ({ ...p, y: p.y === null ? null : 1 + i * 3 + [0, 2, 1, 2, 0, 1, 2][j]! })) })) };
  if (name === 'error') spec = { ...spec, status: { kind: 'error', message: 'Data is unavailable. Try again later.' } };
  return spec;
}
