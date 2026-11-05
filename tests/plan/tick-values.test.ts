import {expect, it} from 'vitest';
import {planChart, type PlanSpec} from '../../src/plan.js';

it('exposes original numeric/time ticks independently of their display labels', () => {
  const dates=[Date.UTC(2026,2,28),Date.UTC(2026,2,30)];
  for(const type of ['linear','time'] as const) {
    const source={family:'line',title:'Ticks',axes:{x:{type},y:{type:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:type==='time'?dates[0]!:0,y:1234.56789},{id:'b',x:type==='time'?dates[1]!:1,y:2345.67891}]}]} as const satisfies PlanSpec;
    const r=planChart(source,{width:600,height:300});if(r.status==='invalid')throw Error(r.diagnostic.reason);
    expect(r.frame.labels.length).toBeGreaterThan(0);expect(r.frame.grid.length).toBeGreaterThan(0);
    expect(r.frame.labels.every(t=>Number.isFinite(t.value)&&t.type===(type==='time'?'time':'number'))).toBe(true);
    expect(r.frame.grid.every(t=>Number.isFinite(t.value)&&t.type==='number')).toBe(true);
    expect(r.frame.observations.map(o=>o.value)).toEqual([1234.56789,2345.67891]);
  }
});
it('never treats numeric-looking category labels as numeric ticks', () => {
  const source={family:'column',title:'Categories',orientation:'horizontal',axes:{x:{type:'category',values:[{id:'a',label:'1234.56789'},{id:'b',label:'1234.56789'}]},y:{type:'linear'}},series:[{id:'s',name:'Series',data:[{id:'a',x:'a',y:-4.1234},{id:'b',x:'b',y:8.2345}]}]} as const satisfies PlanSpec;
  const r=planChart(source,{width:600,height:300});if(r.status==='invalid')throw Error(r.diagnostic.reason);
  expect(r.frame.labels.every(t=>typeof t.value==='number')).toBe(true);
  expect(r.frame.yLabels?.map(t=>t.label)).toEqual(['1234.56789','1234.56789']);
  expect(r.frame.yLabels?.every(t=>!('value' in t))).toBe(true);
});
