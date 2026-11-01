import {expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanHeatmapSpec} from '../../src/plan.js';
const size={width:390,height:300};
const source:PlanHeatmapSpec={family:'heatmap',title:'Original measurements',axes:{x:{kind:'category',values:[{id:'mon',label:'Monday'},{id:'tue',label:'Tuesday'}]},y:{kind:'category',values:[{id:'morning',label:'Morning'},{id:'evening',label:'Evening'}]}},data:[{id:'known-zero',rowId:'morning',columnId:'mon',value:0},{id:'negative',rowId:'morning',columnId:'tue',value:-4},{id:'unknown',rowId:'evening',columnId:'tue',value:null}]};
function frame(spec=source,options=size){const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r.diagnostic));return r.frame;}
test('public planner keeps zero, negative and explicit unknown cells distinct from absent coordinates',()=>{
  const f=frame();expect(f.family).toBe('heatmap');expect(f.observations.map(p=>({id:p.id.pointId,value:p.value}))).toEqual([{id:'known-zero',value:0},{id:'negative',value:-4}]);
  expect(f.heatmapLayout).toMatchObject({status:'ready',sourceCount:3,knownCount:2,missingCount:1,absentCount:1,paintedCellCount:3});
  expect(f.heatmapData?.map(p=>({id:p.id,value:p.value}))).toEqual(source.data.map(p=>({id:p.id,value:p.value})));
  expect(f.colorAxis).toMatchObject({kind:'continuous',domain:[-4,0],domainSource:'source'});
  expect(f.series[0]?.cells?.map(p=>p.pointId)).toEqual(source.data.map(p=>p.id));
  expect(f.observations[0]?.heatmap).toMatchObject({rowId:'morning',columnId:'mon',rowLabel:'Morning',columnLabel:'Monday'});
});
test('uses independent rectangular bands and exact cell polygons, including a real gap',()=>{
  const f=frame();for(const p of f.observations){expect(p.hit?.kind).toBe('polygon');if(p.hit?.kind!=='polygon')continue;const [a,b,c]=p.hit.vertices;expect(a!.x).toBeLessThan(p.x);expect(b!.x).toBeGreaterThan(p.x);expect(a!.y).toBeLessThan(p.y);expect(c!.y).toBeGreaterThan(p.y);expect(b!.x-a!.x).toBeGreaterThan(c!.y-a!.y);}
  const [a,b]=f.observations;expect(a!.hit?.kind).toBe('polygon');expect(a!.x).toBeLessThan(b!.x);expect(f.annotations?.length).toBe(2);
  for(const p of f.observations){const row=f.heatmapLayout!.rows.find(b=>b.id===p.heatmap!.rowId)!,column=f.heatmapLayout!.columns.find(b=>b.id===p.heatmap!.columnId)!;expect(p.x).toBeGreaterThan(column.from);expect(p.x).toBeLessThan(column.to);expect(p.y).toBeGreaterThan(row.from);expect(p.y).toBeLessThan(row.to);}
  expect(f.heatmapLayout!.columns[0]!.to).toBeLessThan(f.heatmapLayout!.columns[1]!.from);
});
test.each(['x','y'] as const)('reverses %s coordinates while retaining original categories, source order and IDs',axis=>{
  const original=frame(),reversed=frame({...source,axes:{...source.axes,[axis]:{...source.axes[axis],reversed:true}}});
  expect(reversed.observations.map(p=>p.id)).toEqual(original.observations.map(p=>p.id));
  reversed.observations.forEach((p,i)=>{expect(p[axis]+original.observations[i]![axis]).toBeCloseTo(axis==='x'?size.width:size.height,10);expect(p.value).toBe(original.observations[i]!.value);});
});
test('clamps colour only, preserving out-of-domain source numbers',()=>{
  const f=frame({...source,colorAxis:{kind:'continuous',domain:[1,10],stops:[{at:0,color:'#000000'},{at:1,color:'#FFFFFF'}],missingColor:'#CCCCCC'}});
  expect(f.observations.map(p=>p.value)).toEqual([0,-4]);expect(f.observations.every(p=>p.heatmap?.color.kind==='continuous'&&p.heatmap.color.clamped)).toBe(true);expect(f.series[0]?.cells?.find(c=>c.pointId==='unknown')?.color).toBe('#cccccc');
});
test('classifies original values without treating the class as a series or fabricating missing data',()=>{
  const f=frame({...source,colorAxis:{kind:'classes',classes:[{id:'low',label:'Below zero',maxExclusive:0,color:'#0000FF'},{id:'high',label:'Zero or above',minInclusive:0,color:'#FF0000'}],missingColor:'#CCCCCC',unclassifiedColor:'#999999'}});
  expect(f.observations.map(p=>p.heatmap?.color)).toEqual([{kind:'class',value:0,classId:'high',color:'#ff0000'},{kind:'class',value:-4,classId:'low',color:'#0000ff'}]);expect(f.legend).toEqual([]);
});
test('all missing, no source and transparent plots retain explicit source and explain emptiness',()=>{
  expect(frame({...source,data:source.data.map(c=>({...c,value:null}))}).heatmapLayout?.status).toBe('allMissing');
  expect(frame({...source,data:[]}).heatmapLayout).toMatchObject({status:'noSource',absentCount:4,sourceCount:0});
  const f=frame({...source,opacity:0});expect(f.heatmapLayout?.status).toBe('noInk');expect(f.observations).toHaveLength(0);expect(f.series[0]?.cells).toHaveLength(0);expect(f.heatmapData?.map(c=>c.value)).toEqual([0,-4,null]);
});
test('sparse64×64 matrix materializes only supplied cells',()=>{
  const values=Array.from({length:64},(_,i)=>({id:'category-'+i}));
  const f=frame({...source,axes:{x:{kind:'category',values},y:{kind:'category',values}},data:[{id:'only',rowId:'category-63',columnId:'category-63',value:4}]});
  expect(f.heatmapData).toHaveLength(1);expect(f.observations).toHaveLength(1);expect(f.heatmapLayout).toMatchObject({absentCount:4095,paintedCellCount:1});expect(f.annotations).toHaveLength(0);
});
test('complete64×64 matrix has bounded4096 paints and at most64 annotations',()=>{
  const values=Array.from({length:64},(_,i)=>({id:String(i)})),data=values.flatMap((r,i)=>values.map((c,j)=>({id:i+':'+j,rowId:r.id,columnId:c.id,value:i-j})));
  const f=frame({...source,axes:{x:{kind:'category',values},y:{kind:'category',values}},data});expect(f.observations).toHaveLength(4096);expect(f.series[0]?.cells).toHaveLength(4096);expect(f.heatmapLayout?.absentCount).toBe(0);expect(f.annotations!.length).toBeLessThanOrEqual(64);
});
test.each([
  {data:[...source.data,{...source.data[0]!,id:'duplicate-coordinate'}]},
  {data:[...source.data,{...source.data[0]!,columnId:'tue'}]},
  {data:[{...source.data[0]!,rowId:'undeclared'}]},
  {data:[{...source.data[0]!,value:Infinity}]},
  {data:[{...source.data[0]!,datum:{secret:1}}]},
  {gapRatio:.6},{opacity:-1},
  {axes:{...source.axes,x:{kind:'category',values:[{id:'same'},{id:'same'}]}}},
  {axes:{...source.axes,y:{kind:'category',values:Array.from({length:65},(_,i)=>({id:String(i)}))}}},
])('rejects invalid or ambiguous source %#',change=>{expect(Reflect.apply(planChart,undefined,[{...source,...change},size]).status).toBe('invalid');});
test.each([{stacking:'sum'},{viewport:{axes:'xy',zoom:2}},{references:[]},{hiddenSeriesIds:['cells']}])('rejects unsupported matrix contracts %#',option=>{expect(Reflect.apply(planChart,undefined,[source,{...size,...option}]).status).toBe('invalid');});
test('owns data without invoking accessors and freezes the transport',()=>{
  let calls=0;const dangerous={...source};Object.defineProperty(dangerous,'data',{get:()=>{calls++;return []}});expect(planChart(dangerous,size).status).toBe('invalid');expect(calls).toBe(0);
  const mutable=structuredClone(source),f=frame(mutable);Reflect.set(mutable.data[0]!,'value',999);expect(f.observations[0]?.value).toBe(0);expect(Object.isFrozen(f.heatmapData)).toBe(true);expect(Object.isFrozen(f.series[0]?.cells?.[0]?.geometry)).toBe(true);
});
