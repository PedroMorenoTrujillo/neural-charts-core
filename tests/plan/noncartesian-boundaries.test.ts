import { describe, expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import { planAdditional } from '../../src/plan/additional.js';
import { planPolar } from '../../src/plan/polar.js';
import { validateGaugeOptions } from '../../src/gauge/validate.js';
import type { PlanBubbleSpec, PlanOptions, PlanSpec } from '../../src/plan.js';

const size = { width: 480, height: 360 };
const axes = { x: { type: 'linear' }, y: { type: 'linear' } } as const;
const pie = { family: 'pie', title: 'Segments', data: [{ id: 'a', label: 'A', value: 2 }] } as const satisfies PlanSpec;
const gauge = { family: 'gauge', title: 'Reading', domain: [0, 10], value: 3 } as const satisfies PlanSpec;
const bubbles = {
  family: 'bubble', title: 'Sized samples', axes, series: [{ id: 'samples', name: 'Samples', data: [{ id: 'a', x: 2, y: 3, z: 4 }] }],
} as const satisfies PlanSpec;
const network = {
  family: 'networkgraph', title: 'Relationships', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
  links: [{ id: 'a-b', from: 'a', to: 'b' }],
} as const satisfies PlanSpec;
const packed = {
  family: 'packedbubble', title: 'Observed sizes',
  series: [{ id: 'sample', name: 'Sample', data: [{ id: 'a', value: 4 }, { id: 'zero', value: 0 }, { id: 'missing', value: null }] }],
} as const satisfies PlanSpec;
const sun = {
  family: 'sunburst', title: 'Visible contribution', root: { id: 'total', children: [{ id: 'a', value: 2 }, { id: 'b', value: 3 }] },
} as const satisfies PlanSpec;

function result(spec: PlanSpec, options: Partial<PlanOptions> = {}) {
  const plan = planChart(spec, { ...size, ...options });
  if (plan.status === 'invalid') throw Error(plan.diagnostic.reason + ' ' + plan.diagnostic.path);
  return plan;
}

describe('radial and sized observation contracts', () => {
  it('keeps a null gauge reading empty with its original unit', () => {
    const outcome = result({ ...gauge, unit: ' kW', value: null });
    expect(outcome).toMatchObject({ status: 'empty', frame: { family: 'gauge', unit: ' kW', series: [], observations: [] } });
    expect(planAdditional({ ...gauge, unit: ' kW', value: null }, 480, 360, [])).toMatchObject({
      status: 'empty', frame: { family: 'gauge', unit: ' kW', series: [], observations: [] },
    });
  });

  it('reports distinct input faults for oversize radial data, invalid radial/gauge input and unknown legend IDs', () => {
    const radialOverflow = { ...pie, data: Array.from({ length: 17 }, (_, i) => ({ ...pie.data[0], id: String(i) })) };
    expect(planAdditional(radialOverflow, 480, 360, [])).toMatchObject({ status: 'invalid', diagnostic: { reason: 'SLICE_LIMIT', path: 'data' } });
    expect(planAdditional({ ...pie, data: [{ ...pie.data[0], value: -1 }] }, 480, 360, [])).toMatchObject({ status: 'invalid', diagnostic: { path: 'data[0].value' } });
    expect(planAdditional(pie, 480, 360, ['unknown'])).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNKNOWN_SERIES', path: 'options.hiddenSeriesIds' } });
    expect(planAdditional(gauge, 480, 360, ['reading'])).toMatchObject({ status: 'invalid', diagnostic: { reason: 'GAUGE_HAS_NO_LEGEND', path: 'options.hiddenSeriesIds' } });
    expect(planAdditional({ ...gauge, domain: [10, 10] }, 480, 360, [])).toMatchObject({ status: 'invalid', diagnostic: { code: 'INVALID_DOMAIN' } });
  });

  it.each([
    [[{ id: 'samples', name: 'Samples', data: null }], 'INPUT_LIMIT', 'series'],
    [[{ ...bubbles.series[0], invisible: true }], 'UNKNOWN_OPTION', 'series'],
    [[{ ...bubbles.series[0], data: [{ id: 'a', x: 2, y: 3 }] }], 'BAD_BUBBLE_SIZE', 'series.data.z'],
    [[{ ...bubbles.series[0], data: [{ ...bubbles.series[0].data[0], z: -1 }] }], 'BAD_BUBBLE_SIZE', 'series.data.z'],
    [[{ ...bubbles.series[0], data: [{ ...bubbles.series[0].data[0], label: 5 }] }], 'BAD_BUBBLE_LABEL', 'series.data.label'],
    [[{ ...bubbles.series[0], data: [{ ...bubbles.series[0].data[0], label: 'a'.repeat(201) }] }], 'BAD_BUBBLE_LABEL', 'series.data.label'],
    [[{ ...bubbles.series[0], data: [{ ...bubbles.series[0].data[0], color: '#123' }] }], 'UNKNOWN_OPTION', 'series.data'],
  ])('reports invalid bubble input at the original field (case %#)', (series, reason, path) => {
    expect(planChart({ ...bubbles, series } as PlanBubbleSpec, size)).toMatchObject({ status: 'invalid', diagnostic: { reason, path } });
  });

  it('uses only visible, measured samples to scale bubbles and preserves known zero separately from missing', () => {
    const data = [{ id: 'large', x: 2, y: 3, z: 16, label: 'Measured' }, { id: 'small', x: 3, y: 4, z: 4 },
      { id: 'zero', x: 4, y: 5, z: 0 }, { id: 'missing', x: 5, y: null, z: 100 }];
    const visible = { ...bubbles.series[0], data };
    const hidden = { id: 'hidden', name: 'Hidden', data: [{ id: 'hidden', x: 3, y: 4, z: 100 }] };
    const planned = result({ ...bubbles, series: [visible, hidden] }, { hiddenSeriesIds: ['hidden'] });
    expect(planned.frame.observations.map(point => [point.id.pointId, point.label, point.sizeValue])).toEqual([
      ['large', 'Measured', 16], ['small', 'small', 4], ['zero', 'zero', 0],
    ]);
    const radii = planned.frame.series[0]!.circles!.map(circle => circle.radius);
    expect(radii).toEqual([44, 22, 0]);
  });
});

describe('delegated radial calculation plans', () => {
  it('keeps shares finite when a doughnut total is not representable, including raw zero and missing amounts', () => {
    const source = {...pie, family: 'donut', description: 'Large finite inputs', holeRatio: .5, data: [
      {id: 'first', label: 'First', value: Number.MAX_VALUE, color: '#AABBCC'},
      {id: 'second', label: 'Second', value: Number.MAX_VALUE},
      {id: 'zero', label: 'Zero', value: 0},
      {id: 'missing', label: 'Missing', value: null},
    ]} as const;
    const result = planAdditional(source, 480, 360, []);
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.description).toBe('Large finite inputs');
    expect(result.frame.legend.find(item => item.id === 'first')?.color).toBe('#aabbcc');
    expect(result.frame.observations.map(point => [point.id.pointId, point.value, point.percentage])).toEqual([
      ['first', Number.MAX_VALUE, 50], ['second', Number.MAX_VALUE, 50], ['zero', 0, 0],
    ]);
    expect(result.frame.series.find(item => item.id === 'zero')?.commands).toEqual([]);
    expect(result.frame.observations.find(point => point.id.pointId === 'zero')?.hit).toBeUndefined();
    expect(result.frame.annotations?.map(annotation => annotation.text)).toEqual(['—']);
    const single = planAdditional(source, 480, 360, ['second']);
    expect(single).toMatchObject({status: 'ok', frame: {annotations: [{text: String(Number.MAX_VALUE)}]}});
  });

  it('keeps gauge units, preferred band color and default target text in its derived geometry', () => {
    const result = planAdditional({...gauge, unit: ' kW', target: {value: 6}, color: '#AABBCC',
      bands: [{id: 'active', from: 4, to: 8, color: '#123456'}]}, 480, 360, []);
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.series.map(series => [series.id, series.color])).toEqual([
      ['track', '#DDE5EF'], ['reading', '#aabbcc'], ['band:active', '#123456'], ['target', '#718299'],
    ]);
    expect(result.frame.annotations?.map(annotation => [annotation.role, annotation.text])).toEqual([['value', '3 kW'], ['label', 'Target 6 kW']]);
    const unconfigured = planAdditional(gauge, 480, 360, []);
    expect(unconfigured).toMatchObject({status: 'ok', frame: {unit: '', annotations: [{role: 'value', text: '3'}]}});
  });

  it('diagnoses layout bounds that a delegated plot owner cannot project', () => {
    expect(planAdditional(pie, -1, 360, [])).toMatchObject({status: 'invalid'});
    expect(planAdditional(gauge, 480, -1, [])).toMatchObject({status: 'invalid', diagnostic: {reason: 'BAD_GAUGE_BOUNDS'}});
  });
});

describe('gauge band and adapter limits', () => {
  const band = { id: 'target', from: 4, to: 6, color: '#AABBCC' };
  it.each([
    [{ domain: [0] }, 'BAD_SPEC', 'domain'],
    [{ bands: [band, { ...band, from: 7, to: 8 }] }, 'DUPLICATE_ID', 'bands[1].id'],
    [{ bands: [{ ...band, to: 3 }] }, 'OVERLAPPING_OR_UNORDERED_BANDS', 'bands[0]'],
    [{ bands: [band, { ...band, id: 'late', from: 5, to: 7 }] }, 'OVERLAPPING_OR_UNORDERED_BANDS', 'bands[1]'],
  ])('keeps a rejection attached to the faulty band or domain (case %#)', (patch, reason, path) => {
    expect(planChart({ ...gauge, ...patch } as PlanSpec, size)).toMatchObject({
      status: 'invalid', diagnostic: { reason, path },
    });
  });

  it('preserves gauge diagnostics callback identity and rejects unreadable host options', () => {
    const onDiagnostic = () => {};
    expect(validateGaugeOptions({ instanceId: 'current-1', onDiagnostic })).toEqual({
      status: 'ok', value: { instanceId: 'current-1', onDiagnostic },
    });
    expect(validateGaugeOptions({ instanceId: '1current' })).toMatchObject({
      status: 'invalid', diagnostic: { reason: 'BAD_INSTANCE_ID', path: 'options.instanceId' },
    });
    expect(validateGaugeOptions({ instanceId: 'current', onDiagnostic: 'log' })).toMatchObject({
      status: 'invalid', diagnostic: { path: 'options.onDiagnostic' },
    });
    const unreadable = new Proxy({}, { ownKeys() { throw Error('host options'); } });
    expect(validateGaugeOptions(unreadable)).toMatchObject({ status: 'invalid', diagnostic: { reason: 'BAD_OPTIONS', path: 'options' } });
  });
});

describe('polar radius and capability scale boundaries', () => {
  const radarAxes = { x: { type: 'category', values: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }, y: { type: 'linear' } } as const;
  const capabilities = [{ id: 'a', x: 'a', y: 1 }, { id: 'b', x: 'b', y: 4 }, { id: 'c', x: 'c', y: 9 }];
  const series = { id: 'profile', name: 'Profile', data: capabilities };
  const radar = { family: 'radar', title: 'Capabilities', axes: radarAxes, series: [series] } as const satisfies PlanSpec;
  const polar = { ...pie, family: 'polar', title: 'Radial amounts', data: [
    {id: 'a', label: 'A', value: 1}, {id: 'b', label: 'B', value: 4}, {id: 'c', label: 'C', value: 9},
  ] } as const satisfies PlanSpec;

  it.each([
    [{ series: [{...series, lineType: 'straight'}] }, {}, 'BAD_RADAR_SERIES', 'series'],
    [{ series: [{...series, name: ''}] }, {}, 'BAD_LINE_SPEC', 'series[0].name'],
    [{ axes: { ...radarAxes, x: { type: 'category', values: radarAxes.x.values.slice(0, 2) } },
      series: [{...series, data: capabilities.slice(0, 2)}] }, {}, 'RADAR_CATEGORY_LIMIT', 'axes.x'],
    [{ axes: { ...radarAxes, y: { ...radarAxes.y, reversed: true } } }, {}, 'UNKNOWN_RADIAL_AXIS_OPTION', 'axes'],
    [{}, { hiddenSeriesIds: ['unknown'] }, 'UNKNOWN_SERIES', 'options.hiddenSeriesIds'],
  ] as const)('diagnoses the unsupported radar axis or source field (case %#)', (patch, options, reason, path) => {
    expect(planPolar({ ...radar, ...patch }, { ...size, ...options })).toMatchObject({
      status: 'invalid', diagnostic: { reason, path },
    });
  });

  it('rejects excess sectors, unknown legend IDs and malformed radial source values', () => {
    const data = Array.from({ length: 17 }, (_, i) => ({ id: String(i), label: String(i), value: 1 }));
    expect(planPolar({...polar, data}, size)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'POLAR_CATEGORY_LIMIT', path: 'data'},
    });
    expect(planPolar(polar, {...size, hiddenSeriesIds: ['unknown']})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'UNKNOWN_SERIES', path: 'options.hiddenSeriesIds'},
    });
    expect(planPolar({...polar, data: [{id: 'a', label: 'A', value: -1}]}, size)).toMatchObject({
      status: 'invalid', diagnostic: {path: 'data[0].value'},
    });
  });

  it('conserves area ratios without changing the source value or legend identity', () => {
    const area = result({...polar, domain: [0, 9], radiusScale: 'area'}).frame;
    const linear = result({...polar, domain: [0, 9], radiusScale: 'linear'}).frame;
    const radii = (frame: typeof area) => frame.observations.map(point => {
      if (point.hit?.type !== 'sector') throw Error('Expected a closed sector');
      return point.hit.radius;
    });
    expect(area.observations.map(point => point.value)).toEqual([1, 4, 9]);
    expect(area.legend.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(radii(area)[1]! / radii(area)[0]!).toBeCloseTo(2);
    expect(radii(linear)[1]! / radii(linear)[0]!).toBeCloseTo(4);
  });
});

describe('network and packed bubble retained identities', () => {
  it('keeps an isolated node centered and lets the legend hide its only group', () => {
    const isolated = { ...network, nodes: [network.nodes[0]], links: [] };
    const frame = result(isolated).frame;
    expect(frame.observations).toEqual([expect.objectContaining({
      id: { seriesId: 'nodes', pointId: 'a' }, value: 0, x: 240, y: 180, node: { incoming: 0, outgoing: 0, directed: false },
    })]);
    expect(result(isolated, { hiddenSeriesIds: ['nodes'] })).toMatchObject({
      status: 'empty', frame: { legend: [expect.objectContaining({ id: 'nodes', visible: false })], series: [], observations: [] },
    });
  });

  it.each([
    [{ nodes: [network.nodes[0], network.nodes[0]] }, 'DUPLICATE_NODE_ID', 'nodes[1]'],
    [{ nodes: [{ ...network.nodes[0], groupId: 'missing' }] }, 'UNKNOWN_GROUP', 'nodes[0].groupId'],
    [{ groups: [{ id: 'links', label: 'Reserved' }] }, 'BAD_GROUP_ID', 'groups[0]'],
    [{ groups: Array.from({ length: 15 }, (_, i) => ({ id: 'g' + i, label: String(i) })) }, 'GRAPH_GROUP_LIMIT', 'groups'],
    [{ links: [{ id: 'self', from: 'a', to: 'a' }] }, 'BAD_UNDIRECTED_LINK', 'links[0]'],
    [{ links: [{ id: 'orphan', from: 'a', to: 'missing' }] }, 'BAD_UNDIRECTED_LINK', 'links[0]'],
    [{ links: [network.links[0], { id: 'b-a', from: 'b', to: 'a' }] }, 'BAD_UNDIRECTED_LINK', 'links[1]'],
  ] as const)('reports invalid network transport at the offending graph field (case %#)', (patch, reason, path) => {
    expect(planChart({ ...network, ...patch }, size)).toMatchObject({ status: 'invalid', diagnostic: { reason, path } });
  });

  it('keeps color, empty split clusters, zeros and hidden groups separate', () => {
    const mixed = {
      ...packed,
      series: [{ ...packed.series[0], color: '#AABBCC' }, { id: 'zeros', name: 'Zeros', data: [{ id: 'zero', value: 0 }, { id: 'missing', value: null }] }],
    };
    const frame = result(mixed).frame;
    expect(frame.legend.map(group => [group.id, group.color])).toEqual([['sample', '#aabbcc'], ['zeros', expect.any(String)]]);
    expect(frame.series.map(series => [series.id, series.circles?.length])).toEqual([['sample', 1], ['zeros', 0]]);
    expect(frame.observations.map(point => [point.id.seriesId, point.id.pointId, point.value])).toEqual([
      ['sample', 'a', 4], ['sample', 'zero', 0], ['zeros', 'zero', 0],
    ]);
    expect(result(mixed, { hiddenSeriesIds: ['sample'] }).frame.observations.map(point => point.id.seriesId)).toEqual(['zeros']);
  });

  it.each([
    [{ series: [packed.series[0], packed.series[0]] }, 'DUPLICATE_SERIES_ID', 'series[1].id'],
    [{ series: [{ ...packed.series[0], data: [packed.series[0].data[0], packed.series[0].data[0]] }] }, 'DUPLICATE_POINT_ID', 'series[0].data[1].id'],
    [{ series: [{ ...packed.series[0], data: Array.from({ length: 256 }, (_, i) => ({ id: 'a-' + i, value: 1 })) },
      { ...packed.series[0], id: 'overflow' }] }, 'PACKED_POINT_LIMIT', 'series.data'],
  ] as const)('rejects packing constraints before geometry is generated (case %#)', (patch, reason, path) => {
    expect(planChart({ ...packed, ...patch }, size)).toMatchObject({ status: 'invalid', diagnostic: { reason, path } });
  });
});

describe('sunburst branch transport', () => {
  it('recalculates the root value in visible units and preserves the chosen branch ID', () => {
    const { frame } = result(sun, { hiddenSeriesIds: ['a'] });
    expect(frame.legend.map(branch => [branch.id, branch.visible])).toEqual([['a', false], ['b', true]]);
    expect(frame.observations.map(point => [point.id, point.value])).toEqual([
      [{ seriesId: 'total', pointId: 'total' }, 3], [{ seriesId: 'b', pointId: 'b' }, 3],
    ]);
    expect(result(sun, { hiddenSeriesIds: ['a', 'b'] })).toMatchObject({ status: 'empty', frame: { observations: [] } });
  });

  it.each([{ id: 'a', value: 2, datum: 'payload' }, { id: 'a', value: 2, colorValue: 9 }, { id: 'a', value: 2, label: 'a'.repeat(201) }])
    ('rejects unsupported tree leaf data (case %#)', leaf => {
      const spec = { ...sun, root: { ...sun.root, children: [leaf, sun.root.children[1]] } };
      expect(planChart(spec, size)).toMatchObject({ status: 'invalid', diagnostic: { reason: 'UNSUPPORTED_TREE_FIELD', path: 'root' } });
    });
});
