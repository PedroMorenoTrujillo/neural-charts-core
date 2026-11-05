import {describe,expect,it} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanMixedSpec,PlanOptions,PlanFrame} from '../../src/plan.js';
const spec:PlanMixedSpec={family:'mixed',title:'Rain and temperature',axes:{x:{type:'category',values:[{id:'a'},{id:'b'},{id:'c'}]},y:{type:'linear',domain:[0,400],nice:false},secondaryY:{type:'linear',domain:[10,40],nice:false}},series:[{id:'rain',name:'Rain',type:'column',data:[{id:'a',x:'a',y:100},{id:'b',x:'b',y:200},{id:'c',x:'c',y:300}]},{id:'temperature',name:'Temperature',type:'line',yAxis:'secondary',data:[{id:'a',x:'a',y:20},{id:'b',x:'b',y:25},{id:'c',x:'c',y:30}]}]};
function result(input:PlanMixedSpec=spec,options:Partial<PlanOptions>={}){return planChart(input,{width:320,height:300,...options});}
function frame(input:PlanMixedSpec=spec,options:Partial<PlanOptions>={}):PlanFrame{const r=result(input,options);if(r.status==='invalid')throw Error(JSON.stringify(r));return r.frame;}
describe('coordinated mixed charts with independent source Y scales',()=>{
  it('retains original values and projects each series using its own scale within the same category frame',()=>{
    const f=frame(),rain=f.observations.find(p=>p.id.seriesId==='rain'&&p.id.pointId==='a')!,temp=f.observations.find(p=>p.id.seriesId==='temperature'&&p.id.pointId==='a')!;expect(rain.value).toBe(100);expect(temp.value).toBe(20);expect(rain.x).toBe(temp.x);expect(rain.y).toBeCloseTo(286-272*.25,10);expect(temp.y).toBeCloseTo(286-272/3,10);expect(temp.valueAxis).toBe('secondary');expect(rain.valueAxis).toBe('primary');expect(f.mixedAxes?.primary.domain).toEqual([0,400]);expect(f.mixedAxes?.secondary.domain).toEqual([10,40]);expect(f.secondaryGrid?.map(t=>Number(t.label))).toContain(40);
  });
  it('allocates column slots globally across axes, preventing independent overlaid columns',()=>{
    const source:PlanMixedSpec={...spec,axes:{...spec.axes,secondaryY:{type:'linear',domain:[0,40],nice:false}},series:spec.series.map(s=>s.id==='temperature'?{...s,type:'column' as const}:s)},f=frame(source),a=f.series.find(s=>s.id==='rain')!.bars![0]!,b=f.series.find(s=>s.id==='temperature')!.bars![0]!;expect(a.x+a.width).toBeLessThan(b.x);expect(a.width).toBe(b.width);expect(f.observations.find(p=>p.id.seriesId==='rain'&&p.id.pointId==='a')!.x).toBe(a.x+a.width/2);expect(f.observations.find(p=>p.id.seriesId==='temperature'&&p.id.pointId==='a')!.x).toBe(b.x+b.width/2);expect(b.height).toBeCloseTo(136,10);
  });
  it('permits independent explicit primary and secondary domains for line and column series',()=>{
    const source:PlanMixedSpec={...spec,axes:{...spec.axes,y:{type:'linear',domain:[50,350],nice:false},secondaryY:{type:'linear',domain:[0,40],nice:false}},series:spec.series.map(s=>({...s,type:s.id==='rain'?'line' as const:'column' as const}))};expect(result(source).status).toBe('ok');
  });
  it('honours the existing explicit cropped-column domain without changing its original value',()=>{const source:PlanMixedSpec={...spec,series:spec.series.map(s=>s.id==='temperature'?{...s,type:'column' as const}:s)},f=frame(source),bar=f.series.find(s=>s.id==='temperature')!.bars![0]!;expect(bar.height).toBeCloseTo(272/3,10);expect(bar.y+bar.height).toBeCloseTo(286,10);expect(f.observations.find(p=>p.id.seriesId==='temperature'&&p.id.pointId==='a')?.value).toBe(20);});
  it('reuses original filled-area geometry with the correct secondary baseline',()=>{
    const source:PlanMixedSpec={...spec,axes:{...spec.axes,secondaryY:{type:'linear',domain:[0,40],nice:false}},series:spec.series.map(s=>s.id==='temperature'?{...s,type:'area' as const}:s)},f=frame(source),area=f.series.find(s=>s.id==='temperature')!;expect(area.areaCommands?.at(-1)?.type).toBe('Z');expect(f.observations.find(p=>p.id.seriesId==='temperature')!.value).toBe(20);
  });
  it('keeps independently known secondary data without inventing primary values or an automatic primary domain',()=>{
    const source:PlanMixedSpec={...spec,axes:{...spec.axes,y:{type:'linear',nice:false}},series:spec.series.map(s=>s.id==='rain'?{...s,data:s.data.map(p=>({...p,y:null}))}:s)},f=frame(source);expect(f.observations.every(p=>p.id.seriesId==='temperature')).toBe(true);expect(f.mixedAxes?.primary.domain).toBeNull();expect(f.grid).toEqual([]);expect(f.secondaryGrid?.length).toBeGreaterThan(0);expect(result(source,{viewport:{axes:'xy'}}).status).toBe('invalid');expect(result(source,{viewport:{axes:'x'}}).status).toBe('ok');
  });
  it('retains empty/hidden axis identities and never invents an unknown zero',()=>{
    const source:PlanMixedSpec={...spec,axes:{...spec.axes,y:{type:'linear'},secondaryY:{type:'linear'}},series:spec.series.map(s=>({...s,data:s.data.map(p=>({...p,y:null}))}))},r=result(source);expect(r.status).toBe('empty');if(r.status==='invalid')throw Error('Invalid unknown data');expect(r.frame.observations).toEqual([]);expect(r.frame.mixedAxes?.primary.domain).toBeNull();expect(r.frame.mixedAxes?.secondary.domain).toBeNull();const hidden=frame(spec,{hiddenSeriesIds:['rain','temperature']});expect(hidden.observations).toEqual([]);expect(hidden.legend?.every(l=>!l.visible)).toBe(true);
  });
  it('uses full source scales when an entire known value axis is hidden',()=>{
    const f=frame(spec,{hiddenSeriesIds:['rain']});expect(f.mixedAxes?.primary.domain).toEqual([0,400]);expect(f.observations.every(p=>p.valueAxis==='secondary')).toBe(true);expect(f.legend?.find(l=>l.id==='rain')?.visible).toBe(false);
  });
  it('couples Y zoom by screen fraction while preserving raw values and independent bounds',()=>{
    const f=frame(spec,{viewport:{axes:'xy',value:{x:{firstId:'b',lastId:'c'},y:[100,300]}}});expect(f.mixedAxes?.primary.displayed).toEqual([100,300]);expect(f.mixedAxes?.secondary.displayed).toEqual([17.5,32.5]);expect(f.viewport?.bounds.y).toMatchObject({domain:[0,400]});expect(f.viewport?.displayed.y).toEqual([100,300]);expect(f.observations.every(p=>p.id.pointId!=='a')).toBe(true);expect(f.observations.find(p=>p.id.seriesId==='temperature'&&p.id.pointId==='b')?.value).toBe(25);
  });
  it('honours independently reversed scales when mapping a common screen zoom window',()=>{
    const source:PlanMixedSpec={...spec,axes:{...spec.axes,secondaryY:{type:'linear',domain:[10,40],nice:false,reversed:true}}},f=frame(source,{viewport:{axes:'y',value:{y:[0,200]}}});expect(f.mixedAxes?.secondary.displayed).toEqual([25,40]);expect(f.mixedAxes?.secondary.reversed).toBe(true);expect(f.mixedAxes?.primary.displayed).toEqual([0,200]);
  });
  it('keeps shared original-X group identities across both value axes',()=>{const f=frame();for(const id of ['a','b','c']){const points=f.observations.filter(p=>p.id.pointId===id);expect(new Set(points.map(p=>p.group?.key)).size).toBe(1);expect(new Set(points.map(p=>p.group?.coordinate)).size).toBe(1);}});
  it('projects primary references through the actual shared value scale',()=>{const f=frame(spec,{references:[{id:'target',axis:'y',value:200}]});expect(f.references?.[0]).toMatchObject({status:'visible',line:{y1:150,y2:150}});});
  it('routes secondary references through their independent source domain and value scale',()=>{
    const f=frame(spec,{references:[{id:'rain',axis:'y',value:200},{id:'temperature',axis:'y',yAxis:'secondary',value:25},{id:'outside',axis:'y',yAxis:'secondary',value:99}]});expect(f.references?.[0]).toMatchObject({status:'visible',line:{y1:150,y2:150}});expect(f.references?.[1]).toMatchObject({status:'visible',valueAxis:'secondary',line:{y1:150,y2:150}});expect(f.references?.[2]).toMatchObject({status:'outside',valueAxis:'secondary'});
  });
  it('preserves secondary reference values while clipping the coordinated viewport',()=>{const f=frame(spec,{viewport:{axes:'y',value:{y:[100,300]}},references:[{id:'temperature',axis:'y',yAxis:'secondary',value:25}]});expect(f.references?.[0]).toMatchObject({status:'visible',valueAxis:'secondary',line:{y1:150,y2:150}});});
  it('rejects secondary references without a secondary axis or on a category X reference',()=>{const single:PlanMixedSpec={...spec,axes:{x:spec.axes.x,y:spec.axes.y},series:spec.series.map(s=>({...s,yAxis:'primary' as const}))};expect(result(single,{references:[{id:'secondary',axis:'y',yAxis:'secondary',value:25}]}).status).toBe('invalid');expect(result(spec,{references:[{id:'wrong',axis:'x',value:'a',yAxis:'secondary'} as unknown as NonNullable<PlanOptions['references']>[number]]}).status).toBe('invalid');});
  it.each([320,768])('keeps original category alignment at width %s',width=>{const f=frame(spec,{width});for(const id of ['a','b','c']){const points=f.observations.filter(p=>p.id.pointId===id);expect(points[0]!.group?.coordinate).toBe(points[1]!.group?.coordinate);}});
  it('accepts an explicit primary-only assignment without creating a duplicate axis',()=>{
    const source:PlanMixedSpec={...spec,axes:{x:spec.axes.x,y:spec.axes.y},series:spec.series.map(s=>({...s,yAxis:'primary' as const}))},f=frame(source);expect(f.mixedAxes).toBeUndefined();expect(f.secondaryGrid).toBeUndefined();
  });
  it.each([{...spec,axes:{x:spec.axes.x,y:spec.axes.y}},{...spec,series:spec.series.map(s=>({...s,yAxis:'secondary'}))},{...spec,series:spec.series.map(s=>({...s,yAxis:'other'}))}].map(source=>({source})))('rejects missing, unused or invalid axis ownership %#',({source})=>{expect(planChart(source as unknown as PlanMixedSpec,{width:320,height:300}).status).toBe('invalid');});
});
