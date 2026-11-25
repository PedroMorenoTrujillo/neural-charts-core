import { expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import { planHierarchy } from '../../src/plan/hierarchy.js';
import { planNetworkPacking } from '../../src/plan/network-packing.js';
import type { PlanOptions, PlanSpec } from '../../src/plan.js';

const size = {width: 600, height: 360};
const tree = {
  family: 'treegraph', title: 'Company organization', description: 'Source relationships',
  nodes: [{id: 'root', label: 'Root'}, {id: 'left', label: 'Left'}, {id: 'right', label: 'Right'}],
  links: [{id: 'to-left', from: 'root', to: 'left'}, {id: 'to-right', from: 'root', to: 'right'}],
} as const satisfies PlanSpec;
const sun = {family: 'sunburst', title: 'Original contribution', description: 'Measured groups',
  root: {id: 'total', label: 'Total', children: [{id: 'a', value: 5}, {id: 'b', value: 8}]},
} as const satisfies PlanSpec;
function frame(spec: PlanSpec, options: Partial<PlanOptions> = {}) {
  const result = planChart(spec, {...size, ...options});
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.frame;
}

it.each(['horizontal', 'vertical'] as const)('clips a zoomed treegraph curve without fabricating a source node in %s orientation', orientation => {
  const full = frame(tree, {hierarchy: {orientation}});
  const main = orientation === 'horizontal' ? 'y' : 'x';
  const sizeAxis = main === 'y' ? 'height' : 'width';
  const plot = full.viewport!.plot!;
  const root = full.observations.find(point => point.id.pointId === 'root')!;
  const leaf = full.observations.find(point => point.id.pointId === 'right')!;
  const pixelMid = (root[main] + leaf[main]) / 2;
  const center = (pixelMid - plot[main]) / plot[sizeAxis];
  const narrow = [center - .0005, center + .0005] as const;
  const cropped = frame(tree, {hierarchy: {orientation}, viewport: {axes: 'xy', value: {[main]: narrow}}});
  const marks = cropped.series.find(series => series.id === 'links')?.commands;
  expect(marks?.length).toBeGreaterThan(0);
  for (const mark of marks ?? []) if (mark.type === 'M' || mark.type === 'L') {
    expect(mark[main]).toBeGreaterThanOrEqual(plot[main] - 1e-10);
    expect(mark[main]).toBeLessThanOrEqual(plot[main] + plot[sizeAxis] + 1e-10);
  }
  expect(cropped.observations).toEqual([]);
  expect(cropped.viewport?.displayed[main]).toEqual(narrow);
});

it('retains source groups and clipped range ownership when hierarchy layouts are empty', () => {
  const visible = frame(sun);
  expect(visible.description).toBe('Measured groups');
  expect(visible.observations.find(point => point.id.pointId === 'total')?.value).toBe(13);
  const empty = frame(tree, {hiddenSeriesIds: ['nodes']});
  expect(empty.legend).toEqual([expect.objectContaining({id: 'nodes', visible: false})]);
  expect(empty.observations).toEqual([]);
  expect(empty.series.every(series => !series.commands?.length && !series.circles?.length)).toBe(true);
  const invalidViewport = planHierarchy(sun, {...size, viewport: {axes: 'x'}});
  expect(invalidViewport).toMatchObject({status: 'invalid', diagnostic: {reason: 'SUNBURST_HAS_NO_VIEWPORT'}});
  expect(planHierarchy(tree, {...size, viewport: {axes: 'x'}})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'NODEGRAPH_XY_VIEWPORT_ONLY', path: 'options.viewport.axes'},
  });
});

it('diagnoses fixed hierarchy and undirected packing constraints at their adapter boundary', () => {
  expect(planHierarchy(sun, {...size, stacking: 'sum'})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNSUPPORTED_HIERARCHY_OPTION', path: 'options'},
  });
  expect(planHierarchy(tree, {...size, hiddenSeriesIds: ['nodes', 'nodes']})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_VISIBILITY', path: 'options.hiddenSeriesIds'},
  });
  const network = {...tree, family: 'networkgraph'} as const;
  expect(planNetworkPacking(network, {...size, references: []})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'UNSUPPORTED_LAYOUT_OPTION', path: 'options'},
  });
  expect(planNetworkPacking(network, {...size, hiddenSeriesIds: ['nodes', 'nodes']})).toMatchObject({
    status: 'invalid', diagnostic: {reason: 'BAD_VISIBILITY', path: 'options.hiddenSeriesIds'},
  });
  const manyGroups = {...tree, groups: Array.from({length: 15}, (_, index) => ({id: 'g' + index, label: 'Group ' + index}))};
  expect(planChart(manyGroups, size)).toMatchObject({status: 'invalid', diagnostic: {reason: 'GRAPH_GROUP_LIMIT', path: 'groups'}});
});
