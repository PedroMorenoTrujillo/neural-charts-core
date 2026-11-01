import {expect, it} from 'vitest';
import {planChart, type PlanRelationshipSpec} from '../../src/plan.js';

it('exports and plans three relationship discriminants with distinct directional metadata', () => {
  for (const family of ['dependencywheel', 'arcdiagram', 'chord'] as const) {
    const spec = {family, title: 'Relations', nodes: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], links: [{id: 'ab', from: 'a', to: 'b', value: 4}]} satisfies PlanRelationshipSpec;
    const result = planChart(spec, {width: 390, height: 320});
    expect(result.status).toBe('ok');
    if (result.status === 'invalid') throw Error(result.diagnostic.reason);
    expect(result.frame.family).toBe(family);
    expect(result.frame.observations.find(point => point.id.pointId === 'ab')?.relationship).toMatchObject({kind: 'link', directed: family === 'dependencywheel'});
    expect(Object.isFrozen(result.frame.observations[0]?.relationship)).toBe(true);
    expect(planChart(spec, {width: 390, height: 320, hiddenSeriesIds: ['nodes']})).toMatchObject({status: 'empty', frame: {observations: []}});
    for (const options of [{viewport: {axes: 'xy' as const}}, {stacking: 'sum' as const}, {references: []}]) expect(planChart(spec, {width: 390, height: 320, ...options}).status).toBe('invalid');
  }
});

it('keeps original malformed relationships invalid even when all groups are hidden', () => {
  const source: PlanRelationshipSpec = {family: 'dependencywheel', title: 'Measured source', nodes: [{id: 'a', label: 'A'}, {id: 'b', label: 'B'}], links: [{id: 'ab', from: 'a', to: 'missing', value: 4}]};
  expect(planChart(source, {width: 390, height: 320, hiddenSeriesIds: ['nodes']})).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNKNOWN_NODE_ID'}});
});

it('supports15 explicit groups plus the default group and rejects an extra explicit group', () => {
  const groups = Array.from({length: 15}, (_, i) => ({id: 'g' + i, label: 'Group ' + i}));
  const nodes = [...groups.map((group, i) => ({id: 'n' + i, label: 'Node ' + i, groupId: group.id})), {id: 'default', label: 'Default node'}];
  for (const family of ['dependencywheel', 'arcdiagram', 'chord'] as const) {
    const spec = {family, title: 'Visibility groups', nodes, groups, links: [{id: 'edge', from: 'n0', to: 'default', value: 1}]} satisfies PlanRelationshipSpec;
    const options = {width: 390, height: 320}, result = planChart(spec, options);
    if (result.status === 'invalid') throw Error(result.diagnostic.reason);
    expect(result.frame.legend).toHaveLength(16);
    expect(planChart(spec, {...options, hiddenSeriesIds: [...groups.map(group => group.id), 'nodes']})).toMatchObject({status: 'empty', frame: {observations: []}});
    expect(planChart({...spec, groups: [...groups, {id: 'extra', label: 'Extra'}]}, options)).toMatchObject({status: 'invalid', diagnostic: {reason: 'RESOURCE_LIMIT'}});
  }
});

it('preserves128-character group, node and link IDs and rejects longer source identities', () => {
  const a = 'a'.repeat(128), b = 'b'.repeat(128), link = 'l'.repeat(128), group = 'g'.repeat(128);
  for (const family of ['dependencywheel', 'arcdiagram', 'chord'] as const) {
    const spec = {family, title: 'Stable identities', groups: [{id: group, label: 'Source'}], nodes: [{id: a, label: 'A', groupId: group}, {id: b, label: 'B', groupId: group}], links: [{id: link, from: a, to: b, value: 0}]} satisfies PlanRelationshipSpec;
    const options = {width: 390, height: 320}, result = planChart(spec, options);
    if (result.status === 'invalid') throw Error(result.diagnostic.reason);
    expect(result.frame.observations.map(point => point.id.pointId).sort()).toEqual([a, b, link].sort());
    expect(planChart(spec, {...options, hiddenSeriesIds: [group]})).toMatchObject({status: 'empty'});
    expect(planChart({...spec, groups: [{id: group + 'x', label: 'Too long'}]}, options).status).toBe('invalid');
    expect(planChart({...spec, nodes: [{id: a + 'x', label: 'Too long'}]}, options).status).toBe('invalid');
    expect(planChart({...spec, links: [{id: link + 'x', from: a, to: b, value: 0}]}, options).status).toBe('invalid');
  }
});
