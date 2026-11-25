import { describe, expect, it, vi } from 'vitest';
import { backDrilldown, createDrilldownState, drilldownGeneration, enterDrilldown, ownDrilldownGraph, reconcileDrilldown, rememberDrilldownView, restoredDrilldownView } from '../../src/drilldown.js';
import type { DrilldownData, DrilldownView } from '../../src/drilldown.js';

const pie = { type: 'pie', data: [{ id: 'sector' }] };
const column = { type: 'column', series: [{ id: 'sales', data: [{ id: 'closed' }] }] };
const graphTree = { type: 'treegraph', groups: [{ id: 'group' }], nodes: [{ id: 'default' }, { id: 'team', groupId: 'group' }] };
const hierarchy = { type: 'sunburst', root: { id: 'root', children: [{ id: 'division', children: [{ id: 'team' }] }] } };
const leaf = { type: 'donut', data: [] };
const link = (seriesId = 'sector', pointId = 'sector') => ({
  fromNodeId: 'overview', toNodeId: 'detail', datumId: { seriesId, pointId },
});
const fixture = (source: unknown = pie, target = link()) => ({
  rootId: 'overview', nodes: [{ id: 'overview', data: source }, { id: 'detail', data: leaf }], links: [target],
});

describe('drilldown source identity ownership', () => {
  it('keeps a graph node with its implicit group and treats Back at the root as a no-op', () => {
    const tree={type:'treegraph',nodes:[{id:'original'}]};
    const graph=ownDrilldownGraph(fixture(tree,link('nodes','original')));
    if(graph.status==='invalid')throw Error(JSON.stringify(graph.error));
    const root=createDrilldownState(graph.value),token=drilldownGeneration(root);
    expect(backDrilldown(root)).toBe(root);
    const entered=enterDrilldown(root,{...token,datumId:{seriesId:'nodes',pointId:'original'}});
    expect(entered.trail).toEqual(['overview','detail']);
  });

  it('reports the original node when an external identity adapter throws a non-Error value', () => {
    const result=ownDrilldownGraph(fixture(),{source(){throw 'Source unavailable';}});
    expect(result).toMatchObject({status:'invalid',error:{nodeId:'overview',diagnostic:{
      reason:'INVALID_DRILLDOWN_CONFIG',path:'data.nodes[0]',message:'Invalid drilldown configuration.',
    }}});
  });

  it.each([
    [pie, 'sector', 'sector'],
    [column, 'sales', 'closed'],
    [graphTree, 'nodes', 'default'],
    [graphTree, 'group', 'team'],
    [hierarchy, 'division', 'team'],
  ])('resolves a retained link using the original series ID %j', (source, seriesId, pointId) => {
    const result = ownDrilldownGraph(fixture(source, link(seriesId, pointId)));
    if (result.status !== 'ok') throw new Error(result.error.diagnostic.message);
    const { value } = result;
    expect([...value.nodes.values()].map(node => node.id)).toEqual(['overview', 'detail']);
    expect([...value.nodes.entries()].map(([id, node]) => [id, node.data])).toEqual([['overview', source], ['detail', leaf]]);
    const state = createDrilldownState(value);
    expect(reconcileDrilldown(state, value)).toBe(state);
    const selected = enterDrilldown(state, { ...drilldownGeneration(state), datumId: { seriesId, pointId } });
    expect(selected.trail).toEqual(['overview', 'detail']);
  });

  const points = Array.from({ length: 5_001 }, (_, i) => ({ id: 'entry-' + i }));
  let tooDeep: { id: string; children?: readonly unknown[] } = { id: 'deepest' };
  for (let depth = 0; depth < 9; depth++) tooDeep = { id: 'depth-' + depth, children: [tooDeep] };
  it.each([
    [{ ...pie, data: [{ id: 'sector' }, { id: 'sector' }] }, 'Invalid original segment identity.'],
    [{ ...column, series: [column.series[0], column.series[0]] }, 'Invalid original series identity.'],
    [{ ...column, series: [{ id: '', data: [] }] }, 'Invalid original series identity.'],
    [{ ...column, series: [{ id: 'sales', data: [{ id: 'closed' }, { id: 'closed' }] }] }, 'Invalid original point identity.'],
    [{ ...column, series: [{ id: 'a', data: points }, { id: 'b', data: points }] }, 'Original point budget exceeded.'],
    [{ ...graphTree, groups: [{ id: '' }] }, 'Invalid original group identity.'],
    [{ ...graphTree, nodes: [{ id: 'team', groupId: 'missing' }] }, 'Invalid original graph node identity.'],
    [{ ...graphTree, nodes: [{ id: 'team' }, { id: 'team' }] }, 'Invalid original graph node identity.'],
    [{ ...hierarchy, root: { id: 'branch', children: [{ id: 'branch' }] } }, 'Invalid or cyclic original hierarchy.'],
    [{ ...hierarchy, root: tooDeep }, 'Original hierarchy budget exceeded.'],
  ])('rejects a defective identity descriptor (case %#)', (source, message) => {
    expect(ownDrilldownGraph(fixture(source))).toMatchObject({
      status: 'invalid',
      error: { nodeId: 'overview', diagnostic: { reason: 'INVALID_DRILLDOWN_CONFIG', path: 'data.nodes.overview.data', message } },
    });
  });

  it.each([
    [{ rootId: 'missing' }, 'UNKNOWN_DRILLDOWN_ROOT', 'data.rootId'],
    [{ rootId: '' }, 'UNKNOWN_DRILLDOWN_ROOT', 'data.rootId'],
    [{ nodes: [{ id: 'overview', data: pie }, { id: 'overview', data: leaf }] }, 'INVALID_DRILLDOWN_NODE_ID', 'data.nodes[1]'],
    [{ nodes: [{ id: 'overview', data: { ...pie, type: 'area' } }] }, 'UNSUPPORTED_DRILLDOWN_TYPE', 'data.nodes[0]'],
    [{ links: [{ ...link(), toNodeId: 'missing' }] }, 'UNKNOWN_DRILLDOWN_NODE', 'data.links[0]'],
    [{ links: [{ ...link(), toNodeId: 'overview' }] }, 'DRILLDOWN_ROOT_HAS_PARENT', 'data.links[0]'],
    [{ links: [link('sector', '')] }, 'INVALID_DRILLDOWN_CONFIG', 'data.links[0]'],
    [{ links: Object.assign([link()], { extra: 1 }) }, 'INVALID_DRILLDOWN_CONFIG', 'data.rootId'],
    [{ nodes: Array(2) }, 'INVALID_DRILLDOWN_CONFIG', 'data'],
    [{ nodes: [Object.assign(Object.create({ extra: true }), fixture().nodes[0])] }, 'INVALID_DRILLDOWN_CONFIG', 'data.nodes[0]'],
    [{ nodes: [{ ...fixture().nodes[0], [Symbol('metadata')]: false }] }, 'INVALID_DRILLDOWN_CONFIG', 'data.nodes[0]'],
  ] as const)('rejects malformed graph data (case %#)', (patch, reason, path) => {
    const result = ownDrilldownGraph({ ...fixture(), ...patch } as DrilldownData);
    expect(result).toMatchObject({ status: 'invalid', error: { diagnostic: { reason, path } } });
  });

  it('reads a cached graph descriptor with the exact adapter that provided it', () => {
    const input = fixture();
    const toDescriptor = (payload: unknown) => payload as { type: 'pie'; data: { id: string }[] };
    const first = vi.fn(toDescriptor);
    const other = vi.fn(toDescriptor);
    expect(ownDrilldownGraph(input, { source: first }).status).toBe('ok');
    expect(ownDrilldownGraph(input, { source: first, semantics: { overview: 'Quarter' } }).status).toBe('ok');
    expect(ownDrilldownGraph(input, { source: other }).status).toBe('ok');
    expect(first).toHaveBeenCalledTimes(2);
    expect(other).toHaveBeenCalledTimes(2);
  });
});

it('rejects an invalid saved viewport without replacing the last valid drilldown view', () => {
  const prepared = ownDrilldownGraph(fixture());
  if (prepared.status !== 'ok') throw new Error(prepared.error.diagnostic.message);
  const state = createDrilldownState(prepared.value);
  const event = drilldownGeneration(state);
  const view = { hiddenSeriesIds: [], viewport: { x: { firstId: 'a', lastId: 'c' }, y: [1, 20] } } as const;
  const updated = rememberDrilldownView(state, event, view);
  for (const viewport of [{ y: { firstId: 'a', lastId: 'c' } }, { x: [5, 1] }, { x: [1, 1] }, { x: { firstId: '', lastId: 'c' } }]) {
    expect(() => rememberDrilldownView(updated, event, { ...view, viewport } as DrilldownView)).toThrow();
    expect(restoredDrilldownView(updated)).toEqual(view);
    expect(drilldownGeneration(updated)).toEqual(event);
  }
});
