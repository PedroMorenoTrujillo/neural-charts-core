import { describe, expect, it } from 'vitest';
import { planChart } from '../../src/plan.js';
import { planParts } from '../../src/plan/parts.js';
import type { PlanOptions } from '../../src/plan.js';

const size = {width: 380, height: 280};
const corners = [[0, 0], [3, 0], [3, 3], [0, 3]].map(([x, y], index) => ({id: String(index), x: x!, y: y!}));
const region = {id: 'region', name: 'Region', data: corners};
const polygon = {family: 'polygon', title: 'Site outline', axes: {x: {type: 'linear'}, y: {type: 'linear'}},
  series: [region]} as const;
const variable = {family: 'variablepie', title: 'Share and radius', data: [
  {id: 'a', label: 'A', value: 2, z: 5, color: '#AABBCC'}, {id: 'b', label: 'B', value: 3, z: 8},
]} as const;
const item = {family: 'item', title: 'Units', data: [{id: 'real', label: 'Real', value: 3}, {id: 'zero', label: 'Zero', value: 0}]} as const;

function project(input: unknown, options: unknown = size) {
  return planParts(input as Parameters<typeof planParts>[0], options as PlanOptions);
}

describe('polygon layout keeps ordered geometry and explicit empty states', () => {
  it('fills only the viewport when the original polygon encloses it without showing any source vertices', () => {
    const result=project({...polygon,description:'Covered territory'}, {...size,viewport:{axes:'xy',value:{x:[1,2],y:[1,2]}}});
    if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));
    expect(result.status).toBe('ok');
    expect(result.frame.description).toBe('Covered territory');
    expect(result.frame.observations).toEqual([]);
    const painted=result.frame.series[0];
    expect(painted?.commands).toEqual([]);
    expect(painted?.circles).toEqual([]);
    expect(painted?.areaCommands?.map(command=>command.type)).toEqual(['M','L','L','L','Z']);
  });

  it('rejects repeated vertex identities before constructing geometry', () => {
    const data=corners.map((point,index)=>index===1?{...point,id:corners[0]!.id}:point);
    expect(project({...polygon,series:[{...region,data}]})).toMatchObject({
      status:'invalid',diagnostic:{reason:'DUPLICATE_POINT_ID',path:'series[0].data[1].id'},
    });
  });

  it('retains visible series identities and reference metadata even when there are no vertices', () => {
    const empty = {
      ...polygon, description: 'Required shape', axes: {...polygon.axes, y: {...polygon.axes.y, title: 'Metres'}},
      series: [{...region, data: [], color: '#AABBCC'}],
    };
    expect(planChart(empty, size)).toMatchObject({
      status: 'empty', frame: {description: 'Required shape', unit: 'Metres', series: [], observations: [],
        legend: [{id: 'region', name: 'Region', color: '#aabbcc', visible: true}]},
    });
    expect(planChart(empty, {...size, hiddenSeriesIds: ['region']})).toMatchObject({
      status: 'empty', frame: {legend: [expect.objectContaining({id: 'region', visible: false})]},
    });
    expect(project({...empty, axes: {...empty.axes, y: {...empty.axes.y, domain: [10, 0]}}})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'BAD_DOMAIN', path: 'axes.y.domain'},
    });
  });

  it.each([
    [{series: [region, region]}, size, 'DUPLICATE_SERIES_ID', 'series[1].id'],
    [{}, {...size, hiddenSeriesIds: ['region', 'region']}, 'BAD_VISIBILITY', 'options.hiddenSeriesIds'],
    [{}, {...size, hiddenSeriesIds: ['missing']}, 'UNKNOWN_SERIES', 'options.hiddenSeriesIds'],
    [{}, {...size, stacking: 'sum'}, 'UNSUPPORTED_STACKING', 'options.stacking'],
    [{axes: {...polygon.axes, y: {...polygon.axes.y, domain: [10, 0]}}}, size, 'BAD_DOMAIN', 'axes.y.domain'],
  ] as const)('diagnoses the schema or viewport option before drawing (case %#)', (patch, options, reason, path) => {
    expect(project({...polygon, ...patch}, options)).toMatchObject({status: 'invalid', diagnostic: {reason, path}});
  });

  it('rejects a collinear axis and nonadjacent contacts in the original polygon path', () => {
    const pointify = (seq: readonly (readonly [number, number])[]) => seq.map(([x, y], i) => ({id: 'p' + i, x, y}));
    expect(project({...polygon, series: [{...region, data: pointify([[1,0], [1,1], [1,2]])}]})).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'DEGENERATE_POLYGON', path: 'series[0].data'},
    });
    for (const points of [
      [[0,0], [4,0], [4,4], [2,0], [0,4]],
      [[0,0], [0,4], [4,4], [2,4], [4,0]],
      [[0,0], [4,0], [4,4], [0,4], [0,2], [3,0], [2,2]],
    ] as const) {
      expect(project({...polygon, series: [{...region, data: pointify(points)}]})).toMatchObject({
        status: 'invalid', diagnostic: {path: 'series[0].data'},
      });
    }
  });
});

describe('item and variable-radius sector input variants', () => {
  it('leaves a hidden family empty and retains the original legend and style', () => {
    expect(planChart(variable, {...size, hiddenSeriesIds: ['a', 'b']})).toMatchObject({
      status: 'empty', frame: {series: [], observations: [], legend: [
        {id: 'a', name: 'A', color: '#aabbcc', visible: false}, {id: 'b', name: 'B', color: expect.any(String), visible: false},
      ]},
    });
    expect(planChart(item, {...size, hiddenSeriesIds: ['real', 'zero']})).toMatchObject({
      status: 'empty', frame: {series: [], observations: []},
    });
  });

  it('uses automatic unit columns and keeps measured zero as a visible legend entry without ink', () => {
    const result = planChart(item, size);
    if (result.status !== 'ok') throw Error(JSON.stringify(result));
    expect(result.frame.observations.map(point => [point.id.pointId, point.value])).toEqual([['real', 3], ['zero', 0]]);
    const populated = result.frame.series.find(series => series.id === 'real')?.circles;
    expect(populated).toHaveLength(3);
    expect(new Set(populated?.map(circle => [circle.cx, circle.cy].join(','))).size).toBe(3);
    expect(result.frame.series.find(series => series.id === 'zero')?.circles).toEqual([]);
  });

  it('rejects Cartesian references or viewport options instead of silently discarding them', () => {
    for (const options of [
      {...size, viewport: {axes: 'x'}},
      {...size, references: [{id: 'line', axis: 'y', value: 1}]},
    ]) expect(project(variable, options)).toMatchObject({
      status: 'invalid', diagnostic: {reason: 'NON_CARTESIAN_PARTS_OPTIONS', path: 'options'},
    });
    expect(project({...variable, zDomain: [3]}, size)).toMatchObject({
      status: 'invalid', diagnostic: {path: 'zDomain'},
    });
  });
});
