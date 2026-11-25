import { expect, it } from 'vitest';
import { invalid } from '../../src/internal/diagnostics.js';
import { planAxes } from '../../src/internal/axes/plan.js';
import type { AxisInput } from '../../src/internal/axes/plan.js';
import { referenceBandAxes } from '../../src/internal/axes/reference-band-axes.js';
import { planChart } from '../../src/plan.js';
import { withPlanReferenceBands } from '../../src/plan/reference-bands.js';
import { withPlanReferences } from '../../src/plan/references.js';

const horizontal: AxisInput = {type: 'category', values: [{id: 'north'}, {id: 'south'}]};
const vertical: AxisInput = {type: 'category', values: [{id: 'a', label: 'Repeated'}, {id: 'b', label: 'Repeated'}, {id: 'c'}]};
const regular = {
  x: horizontal, y: vertical, domains: {x: null, y: null}, width: 480, height: 300,
  font: {family: 'sans-serif', size: 14, weight: 400}, direction: 'ltr',
  labels: new Map([['north', 'North'], ['south', 'South']]),
  measurer: {measure: (value: string) => ({width: value.length * 8, height: 14, baseline: 11}), invalidate() {}, destroy() {}},
} as const;

function accept(input: Parameters<typeof planAxes>[0]) {
  const result = planAxes(input);
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  return result.value;
}

it('disambiguates duplicated row labels and reverses identity positions without changing their order', () => {
  const forward = accept(regular);
  const reverse = accept({...regular, y: {...vertical, reversed: true}, x: {...horizontal, reversed: true}});
  expect(forward.y.labels.map(label => label.full)).toEqual(['a', 'b', 'c']);
  expect(forward.x.labels.map(label => label.full)).toEqual(['North', 'South']);
  expect(reverse.mapX('north')).toBe(forward.mapX('south'));
  expect(reverse.mapX(0)).toBeNull();
  expect(reverse.mapY(0)).toBe(forward.mapY(2));
  expect(reverse.y.labels.map(label => label.value)).toEqual(['a', 'b', 'c']);
});

it('preserves a compact title gutter and keeps an empty categorical axis unmapped', () => {
  const fx = {...regular, x: {type: 'category'} as const, y: {...vertical, title: 'Rows'}};
  const plain = accept(fx);
  const compact = accept({...fx, compact: true});
  expect(compact.yTitle).toBe('Rows');
  expect(plain.plot.y).toBe(28);
  expect(compact.plot.y).toBe(20);
  expect(compact.x.labels).toEqual([]);
  expect(compact.mapX('north')).toBeNull();
  expect(accept({...fx, y: {type: 'category'}}).tooSmall).toBe(true);
});

it('reassigns reference bands from logical axes to physical slots for a horizontal bar', () => {
  const y = {type: 'linear' as const, domain: [-5, 5] as const};
  const x = {type: 'category' as const, values: [{id: 'b'}], reversed: true};
  const plot = accept({...regular, x: y, y: x, domains: {x: y.domain, y: null}});
  const slots = referenceBandAxes(plot, {x, y}, {x: vertical, y}, true);
  expect(slots.x).toMatchObject({type: 'category', dimension: 'y', first: 1, last: 1});
  expect(slots.y).toMatchObject({type: 'linear', dimension: 'x', domain: [-5, 5]});
  if (slots.x.type !== 'category' || slots.y.type === 'category') throw Error('Incorrect axis roles');
  expect(slots.x.slot(1)).toEqual([plot.plot.y + plot.plot.height, plot.plot.y]);
  expect(slots.x.slot(0)).toBeNull();
  expect(slots.y.map(0)).toBe(plot.mapX(0));
  const empty = referenceBandAxes(plot, {x: {type: 'category'}, y});
  if (empty.x.type !== 'category') throw Error('Incorrect source axis');
  expect(empty.x).toMatchObject({first: 0, last: -1});
  expect(empty.x.slot(0)).toBeNull();
});

it('preserves the projection diagnostic from an external categorical scale', () => {
  const result = planAxes({...regular, categoryX: () => invalid('INVALID_DOMAIN', 'UNREPRESENTABLE', 'centers')});
  expect(result).toMatchObject({status: 'invalid', diagnostic: {reason: 'UNREPRESENTABLE', path: 'centers'}});
});

it('reduces dense axis ticks and hides collisions while retaining their original identities', () => {
  const values = Array.from({length: 12}, (_, index) => ({id: 'Region-' + index}));
  const axis = {type: 'category' as const, values, ticks: {targetCount: 12}};
  const plan = accept({...regular, width: 275, height: 145, x: axis, y: axis});
  for (const result of [plan.x, plan.y]) {
    expect(result.ticks).toHaveLength(11);
    expect(result.ticks[0]).toBe('Region-0');
    expect(result.ticks.at(-1)).toBe('Region-11');
    expect(result.labels.some(label => label.text === null)).toBe(true);
    expect(result.labels.every(label => label.full === label.value)).toBe(true);
  }
});

it('reports source-declared bands as unavailable when a scoped adapter cannot map their endpoints', () => {
  const axes = {x: {type: 'linear', domain: [0, 4]}, y: {type: 'linear', domain: [0, 10]}} as const;
  const result = planChart({family: 'line', title: 'Limits', axes,
    series: [{id: 'a', name: 'A', data: [{id: 'a', x: 0, y: 1}, {id: 'b', x: 4, y: 9}]}]}, {width: 320, height: 240});
  if (result.status === 'invalid') throw Error(JSON.stringify(result.diagnostic));
  const bands = [{id: 'band-x', axis: 'x', from: 1, to: 3}, {id: 'band-y', axis: 'y', from: 1, to: 3}] as const;
  const plot = {x: 10, y: 10, width: 100, height: 100};
  for (const context of [{plot, domains: {x: axes.x.domain, y: null}}, {plot, domains: {x: axes.x.domain, y: axes.y.domain}, bandSourceAxes: axes}]) {
    expect(withPlanReferenceBands(result.frame, bands, context).referenceBands).toEqual(bands.map(band => ({...band, status: 'unavailable'})));
  }
});

it('preserves secondary identity when host transforms cannot place a declared reference', () => {
  const axes = {x: {type:'linear', domain:[0,4]}, y: {type:'linear',domain:[0,10]}} as const;
  const r = planChart({family:'line',title:'Source',axes,series:[{id:'a',name:'A',data:[{id:'a',x:0,y:1},{id:'b',x:4,y:9}]}]},
    {width:320,height:240});
  if (r.status==='invalid') throw Error(JSON.stringify(r.diagnostic));
  const references = [{id:'missing-scale',axis:'y',value:15,yAxis:'secondary'},{id:'missing-pixel',axis:'y',value:3}] as const;
  const bands = [{id:'secondary-band',axis:'y',from:11,to:17,valueAxis:'secondary'}] as const;
  const context = {
    plot:{x:10,y:10,width:100,height:100}, domains:{x:axes.x.domain,y:axes.y.domain},
    bandSourceAxes:axes, mapY:()=>null,
  };
  const projected=withPlanReferences(r.frame,references,context,bands);
  expect(projected.references).toEqual([
    {id:'missing-scale',axis:'y',valueAxis:'secondary',status:'unavailable'},
    {id:'missing-pixel',axis:'y',status:'unavailable'},
  ]);
  expect(projected.referenceBands).toEqual([{...bands[0],status:'unavailable'}]);
});

it('distinguishes a wholly scoped-out band from an unavailable slot inside a retained category domain', () => {
  const axes = {x:{type:'category',values:[{id:'a'},{id:'b'},{id:'c'}]},y:{type:'linear',domain:[0,10]}} as const;
  const result=planChart({family:'column',title:'Intervals',axes,series:[{id:'s',name:'Source',data:[{id:'b',x:'b',y:4}]}]},
    {width:320,height:240});
  if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));
  const bands=[{id:'slot-b',axis:'x',from:'b',to:'b'}] as const;
  const context={plot:{x:0,y:0,width:90,height:60},domains:{x:null,y:axes.y.domain},bandSourceAxes:axes};
  const hidden=withPlanReferenceBands(result.frame,bands,{...context,categorySlot:()=>null});
  expect(hidden.referenceBands).toEqual([{...bands[0],status:'outside'}]);
  const sparse=withPlanReferenceBands(result.frame,bands,{...context,
    categorySlot:id=>id==='a'?[0,30]:id==='c'?[60,90]:null});
  expect(sparse.referenceBands).toEqual([{...bands[0],status:'unavailable'}]);
});
