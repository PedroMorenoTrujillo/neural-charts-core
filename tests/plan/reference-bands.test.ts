import {describe,expect,it} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanColumnSpec,PlanFrame,PlanLineSpec,PlanMixedSpec,PlanOptions,PlanReferenceBand,PlanSpec} from '../../src/plan.js';

const line:PlanLineSpec={family:'line',title:'Source units',axes:{x:{type:'linear',domain:[0,10],nice:false},y:{type:'linear',domain:[0,100],nice:false}},series:[{id:'series',name:'Original',data:[{id:'zero',x:0,y:0},{id:'middle',x:5,y:50},{id:'missing',x:7,y:null},{id:'last',x:10,y:100}]}]};
const column:PlanColumnSpec={family:'column',title:'Category identities',groupGap:0,axes:{x:{type:'category',values:[{id:'a',label:'Same'},{id:'b',label:'Same'},{id:'c'},{id:'d'}]},y:{type:'linear',domain:[0,100],nice:false}},series:[{id:'one',name:'One',data:[{id:'a',x:'a',y:10},{id:'b',x:'b',y:20},{id:'c',x:'c',y:30},{id:'d',x:'d',y:40}]},{id:'two',name:'Two',data:[{id:'a',x:'a',y:5},{id:'b',x:'b',y:10},{id:'c',x:'c',y:15},{id:'d',x:'d',y:20}]}]};
const options={width:320,height:300} as const;
function frame(spec:PlanSpec=line,extra:Partial<PlanOptions>={}):PlanFrame{
  const result=planChart(spec,{...options,...extra});
  if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));
  return result.frame;
}
function bandBox(f:PlanFrame,index=0){const band=f.referenceBands?.[index];if(band?.status!=='visible')throw Error('Expected visible band: '+JSON.stringify(band));return band.box;}
const numericBands:readonly PlanReferenceBand[]=[{id:'x-range',axis:'x',from:2,to:6},{id:'y-range',axis:'y',from:20,to:60}];

describe('style-free represented-axis reference bands',()=>{
  it('adds clipped rectangles without changing domains, series, observations or legend',()=>{
    const before=JSON.stringify(line),baseline=frame(),f=frame(line,{referenceBands:numericBands});
    expect(f.series).toEqual(baseline.series);expect(f.observations).toEqual(baseline.observations);expect(f.legend).toEqual(baseline.legend);expect(f.grid).toEqual(baseline.grid);expect(f.labels).toEqual(baseline.labels);
    expect(f.observations.some(point=>point.id.pointId==='zero'&&point.value===0)).toBe(true);expect(f.observations.some(point=>point.id.pointId==='missing')).toBe(false);expect(JSON.stringify(line)).toBe(before);
    expect(bandBox(f)).toMatchObject({y:14,height:272});expect(bandBox(f).x).toBeCloseTo(73.6);expect(bandBox(f).width).toBeCloseTo(115.2);expect(bandBox(f,1).x).toBe(16);expect(bandBox(f,1).y).toBeCloseTo(122.8);expect(bandBox(f,1).height).toBeCloseTo(108.8);
    expect(f.referenceBands?.[0]).toMatchObject(numericBands[0]!);expect(Object.isFrozen(f.referenceBands?.[0])).toBe(true);expect(Object.isFrozen(bandBox(f))).toBe(true);
  });
  it('clips numeric intervals before projecting the current viewport and preserves original endpoints',()=>{
    const f=frame(line,{viewport:{axes:'xy',value:{x:[3,7],y:[30,70]}},referenceBands:[{id:'partial',axis:'x',from:2,to:5},{id:'all-y',axis:'y',from:-100,to:1000},{id:'away',axis:'x',from:8,to:9}]});
    expect(bandBox(f)).toEqual({x:16,y:14,width:144,height:272});expect(bandBox(f,1)).toEqual({x:16,y:14,width:288,height:272});expect(f.referenceBands?.[0]).toMatchObject({from:2,to:5});expect(f.referenceBands?.[2]).toEqual({id:'away',axis:'x',from:8,to:9,status:'outside'});
    expect(f.viewport?.displayed).toMatchObject({x:[3,7],y:[30,70]});
  });
  it('uses existing reversed maps without reversing original intervals',()=>{
    const reversed:PlanLineSpec={...line,axes:{...line.axes,y:{...line.axes.y,reversed:true}}},f=frame(reversed,{referenceBands:numericBands});
    expect(bandBox(f).x).toBeCloseTo(73.6);expect(bandBox(f).width).toBeCloseTo(115.2);expect(bandBox(f,1).y).toBeCloseTo(68.4);expect(f.referenceBands?.[0]).toMatchObject({from:2,to:6});
  });
  it('uses original category IDs inclusively and each existing column band edge',()=>{
    const f=frame(column,{referenceBands:[{id:'b',axis:'x',from:'b',to:'b'},{id:'bc',axis:'x',from:'b',to:'c'}]});
    expect(bandBox(f)).toEqual({x:88,y:14,width:72,height:272});expect(bandBox(f,1)).toEqual({x:88,y:14,width:144,height:272});
    expect(planChart(column,{...options,referenceBands:[{id:'label',axis:'x',from:'Same',to:'Same'}]}).status).toBe('invalid');
  });
  it('retains actual category gaps and clips category windows rather than widening the whole source',()=>{
    const spaced:PlanColumnSpec={...column,groupGap:.5},f=frame(spaced,{viewport:{axes:'x',value:{x:{firstId:'b',lastId:'c'}}},referenceBands:[{id:'ab',axis:'x',from:'a',to:'b'},{id:'gone',axis:'x',from:'d',to:'d'}]});
    const first=f.series[0]!.bars![0]!,second=f.series[1]!.bars![0]!,box=bandBox(f);
    expect(box.x).toBeCloseTo(first.x);expect(box.x+box.width).toBeCloseTo(second.x+second.width);expect(box.width).toBeLessThan(144);expect(f.referenceBands?.[1]?.status).toBe('outside');expect(f.referenceBands?.[0]).toMatchObject({from:'a',to:'b'});
  });
  it.each([undefined,'sum','percent'] as const)('supports horizontal columns in logical category/value units with stacking %s',stacking=>{
    const f=frame({...column,orientation:'horizontal'},{...(stacking?{stacking}:{}),referenceBands:[{id:'category',axis:'x',from:'b',to:'b'},{id:'value',axis:'y',from:20,to:60}]});
    expect(f.family).toBe('bar');expect(bandBox(f)).toEqual({x:16,y:82,width:288,height:68});expect(bandBox(f,1).y).toBe(14);expect(bandBox(f,1).height).toBe(272);expect(bandBox(f,1).width).toBeCloseTo(115.2);
  });
  it('connects grouped stacks to their one original category frame',()=>{
    const f=frame(column,{stacking:'sum',stackGroups:[{id:'a',label:'A',seriesIds:['one']},{id:'b',label:'B',seriesIds:['two']}],referenceBands:[{id:'category',axis:'x',from:'b',to:'b'}]});
    expect(bandBox(f)).toEqual({x:88,y:14,width:72,height:272});expect(f.stackGroups?.groups).toHaveLength(2);
  });
  it('uses percentage axis units for percent-stack bands while retaining raw values 1000 and 3000',()=>{
    const source:PlanColumnSpec={...column,series:column.series.map((series,index)=>({...series,data:series.data.map(point=>({...point,y:index===0?1000:3000}))}))};
    const band={id:'middle-percent',axis:'y' as const,from:25,to:75},f=frame(source,{stacking:'percent',referenceBands:[band]});
    expect(f.observations.filter(point=>point.id.pointId==='a').map(point=>[point.value,point.percentage])).toEqual([[1000,25],[3000,75]]);
    expect(f.unit).toBe('');
    const withUnit=frame({...source,axes:{...source.axes,y:{...source.axes.y,title:'kg'}}},{stacking:'percent',referenceBands:[band]});
    expect(withUnit.unit).toBe('kg');expect(withUnit.observations.filter(point=>point.id.pointId==='a').map(point=>[point.value,point.percentage])).toEqual([[1000,25],[3000,75]]);
    expect(Math.max(...f.grid.map(tick=>Number(tick.label)))).toBe(100);expect(bandBox(f)).toEqual({x:16,y:82,width:288,height:136});expect(f.referenceBands?.[0]).toMatchObject(band);
    const zoomed=frame(source,{stacking:'percent',viewport:{axes:'y',value:{y:[25,75]}},referenceBands:[band]});
    expect(bandBox(zoomed)).toEqual({x:16,y:14,width:288,height:272});expect(zoomed.referenceBands?.[0]).toMatchObject(band);expect(zoomed.observations.every(point=>point.value===1000||point.value===3000)).toBe(true);
  });
  it.each(['line','column'] as const)('uses the real single-category %s slot after zoom',family=>{
    const source:PlanSpec=family==='column'?column:{family:'line',title:column.title,axes:column.axes,series:column.series};
    const f=frame(source,{viewport:{axes:'x',value:{x:{firstId:'b',lastId:'b'}}},referenceBands:[{id:'one',axis:'x',from:'b',to:'b'},{id:'crosses',axis:'x',from:'a',to:'c'},{id:'outside',axis:'x',from:'d',to:'d'}]});
    expect(bandBox(f)).toEqual({x:16,y:14,width:288,height:272});expect(bandBox(f,1)).toEqual(bandBox(f));expect(f.referenceBands?.[2]?.status).toBe('outside');expect(f.referenceBands?.[1]).toMatchObject({from:'a',to:'c'});
  });
  it.each(['area','spline','areaspline'] as const)('reuses existing %s maps without changing its geometry',family=>{
    const source={...line,family,axes:{...line.axes,y:{type:'linear' as const,nice:false}}},f=frame(source,{referenceBands:numericBands}),baseline=frame(source);expect(f.series).toEqual(baseline.series);expect(bandBox(f).width).toBeCloseTo(115.2);
  });
  it('supports stacked area and original category slots through the existing point-axis adapter',()=>{
    const source={family:'area' as const,title:column.title,axes:column.axes,series:column.series},f=frame(source,{stacking:'sum',referenceBands:[{id:'point-slot',axis:'x',from:'b',to:'b'}]});
    expect(bandBox(f)).toEqual({x:88,y:14,width:72,height:272});expect(f.referenceBands?.[0]).toMatchObject({from:'b',to:'b',status:'visible'});
  });
  it.each(['scatter','bubble'] as const)('uses the real %s plot, maps and numeric viewport',family=>{
    const source={...line,family,series:line.series.map(series=>({...series,data:series.data.map(point=>family==='bubble'?{...point,z:5}:point)}))} as PlanSpec;
    const f=frame(source,{referenceBands:numericBands});expect(bandBox(f)).toMatchObject({y:48,height:204});expect(bandBox(f).x).toBeCloseTo(92.8);expect(bandBox(f).width).toBeCloseTo(89.6);expect(f.observations.some(point=>point.value===0)).toBe(true);
  });
  it('routes mixed secondary Y bands through the independent original scale and shared viewport',()=>{
    const mixed:PlanMixedSpec={family:'mixed',title:'Mixed',axes:{x:column.axes.x,y:column.axes.y,secondaryY:{type:'linear',domain:[10,30],nice:false}},series:[{...column.series[0]!,type:'column'},{id:'temperature',name:'Temperature',type:'line',yAxis:'secondary',data:[{id:'a',x:'a',y:15},{id:'b',x:'b',y:20},{id:'c',x:'c',y:25},{id:'d',x:'d',y:30}]}]};
    const f=frame(mixed,{referenceBands:[{id:'primary',axis:'y',from:25,to:75},{id:'secondary',axis:'y',valueAxis:'secondary',from:15,to:25}],viewport:{axes:'y',value:{y:[25,75]}}});
    expect(bandBox(f)).toEqual({x:16,y:14,width:288,height:272});expect(bandBox(f,1)).toEqual(bandBox(f));expect(f.referenceBands?.[1]).toMatchObject({valueAxis:'secondary',from:15,to:25});
  });
  it('clips a reversed secondary Y band against its own coupled viewport',()=>{
    const mixed:PlanMixedSpec={family:'mixed',title:'Independent reversed Y',axes:{x:column.axes.x,y:column.axes.y,secondaryY:{type:'linear',domain:[10,30],nice:false,reversed:true}},series:[{...column.series[0]!,type:'column'},{id:'temperature',name:'Temperature',type:'line',yAxis:'secondary',data:[{id:'a',x:'a',y:15},{id:'b',x:'b',y:20},{id:'c',x:'c',y:25},{id:'d',x:'d',y:30}]}]};
    const f=frame(mixed,{viewport:{axes:'y',value:{y:[0,50]}},referenceBands:[{id:'secondary',axis:'y',valueAxis:'secondary',from:15,to:25}]});
    expect(f.mixedAxes?.secondary.displayed).toEqual([20,30]);expect(f.mixedAxes?.secondary.reversed).toBe(true);expect(bandBox(f)).toEqual({x:16,y:14,width:288,height:136});expect(f.referenceBands?.[0]).toMatchObject({from:15,to:25,valueAxis:'secondary'});
  });
  it.each(['column','arearange'] as const)('wires the scalar/range mixed owner with a %s and measured line',type=>{
    const mixed:PlanMixedSpec={family:'mixed',title:'One coordinated frame',axes:column.axes,series:[
      type==='column'?{...column.series[0]!,type}:{id:'spread',name:'Range',type,data:column.series[0]!.data.map(point=>({id:point.id,x:point.x,low:point.y,high:point.y===null?null:point.y+10}))},
      {...column.series[1]!,type:'line'},
    ]};
    const baseline=frame(mixed),f=frame(mixed,{referenceBands:[{id:'category',axis:'x',from:'b',to:'c'},{id:'target',axis:'y',from:20,to:40}]});
    expect(f.series).toEqual(baseline.series);expect(f.observations).toEqual(baseline.observations);expect(f.referenceBands?.every(band=>band.status==='visible')).toBe(true);expect(bandBox(f).width).toBeGreaterThan(0);
  });
  it('retains unavailable source metadata for empty/all-hidden charts without inventing observations',()=>{
    const empty:PlanLineSpec={...line,axes:{x:{type:'linear'},y:{type:'linear'}},series:line.series.map(series=>({...series,data:series.data.map(point=>({...point,y:null}))}))};
    const f=frame(empty,{referenceBands:numericBands});expect(f.referenceBands).toEqual(numericBands.map(band=>({...band,status:'unavailable'})));expect(f.observations).toEqual([]);
    expect(frame(column,{hiddenSeriesIds:['one','two'],referenceBands:[{id:'category',axis:'x',from:'a',to:'b'}]}).referenceBands?.[0]?.status).toBe('unavailable');
  });
  it('coexists with the existing line-reference contract',()=>{
    const f=frame(line,{references:[{id:'line',axis:'y',value:50}],referenceBands:numericBands});expect(f.references?.[0]).toMatchObject({id:'line',status:'visible',line:{y1:150,y2:150}});expect(f.referenceBands).toHaveLength(2);
  });
  it('bounds all 32 IDs globally while leaving the frozen validator limit unchanged',()=>{
    const bands=Array.from({length:32},(_,index)=>({id:'b'+index,axis:'y' as const,from:20,to:40}));expect(frame(line,{referenceBands:bands}).referenceBands).toHaveLength(32);
    expect(planChart(line,{...options,referenceBands:[...bands,{id:'overflow',axis:'y',from:20,to:40}]}).status).toBe('invalid');
    expect(planChart(line,{...options,referenceBands:bands.map((band,index)=>index===31?bands[0]!:band)}).status).toBe('invalid');
  });
  it.each([
    {id:'same',axis:'x',from:1,to:1},
    {id:'reversed',axis:'y',from:3,to:1},
    {id:'nonfinite',axis:'x',from:1,to:Infinity},
    {id:'mixed',axis:'x',from:1,to:'a'},
    {id:'styled',axis:'y',from:1,to:2,color:'#f00'},
    {id:'secondary',axis:'y',from:1,to:2,valueAxis:'secondary'},
    {id:'typo',axis:'y',from:1,to:2,valueAxes:'secondary'},
  ])('rejects malformed band configuration %#',band=>{expect(planChart(line,{...options,referenceBands:[band]} as unknown as PlanOptions).status).toBe('invalid');});
  it('rejects unsupported families, unknown/reversed categories and secondary X explicitly',()=>{
    expect(planChart({family:'pie',title:'Pie',data:[{id:'p',label:'P',value:1}]},{...options,referenceBands:[]}).status).toBe('invalid');
    for(const band of [{id:'unknown',axis:'x',from:'z',to:'z'},{id:'reverse',axis:'x',from:'d',to:'a'},{id:'secondary-x',axis:'x',from:'a',to:'b',valueAxis:'secondary'}])expect(planChart(column,{...options,referenceBands:[band]} as unknown as PlanOptions).status).toBe('invalid');
  });
  it('uses existing time range validation and original timestamps',()=>{
    const day=86400000,source:PlanLineSpec={...line,axes:{x:{type:'time',domain:[0,10*day],nice:false},y:line.axes.y},series:[{id:'series',name:'Time',data:[{id:'a',x:0,y:0},{id:'b',x:10*day,y:100}]}]};
    expect(frame(source,{referenceBands:[{id:'days',axis:'x',from:2*day,to:6*day}]}).referenceBands?.[0]).toMatchObject({from:2*day,to:6*day,status:'visible'});
    expect(planChart(source,{...options,referenceBands:[{id:'fraction',axis:'x',from:.5,to:day}]}).status).toBe('invalid');
  });
});
