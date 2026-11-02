import {describe,it,expect} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanPieSpec,PlanDonutSpec,PlanGaugeSpec,PlanOptions,PlanFrame} from '../../src/plan.js';
const pie={family:'pie',title:'Original shares',data:[{id:'a',label:'A',value:1},{id:'b',label:'B',value:3}]} as const satisfies PlanPieSpec;
const gauge={family:'gauge',title:'Original measurement',value:72,domain:[0,100],unit:'%',bands:[{id:'safe',from:0,to:80,color:'#638A35'}],target:{value:80,label:'Target'}} as const satisfies PlanGaugeSpec;
function frame(spec:PlanPieSpec|PlanDonutSpec|PlanGaugeSpec,options:Partial<PlanOptions>={}):PlanFrame{const r=planChart(spec,{width:390,height:320,...options});if(r.status==='invalid')throw Error(JSON.stringify(r));return r.frame;}
function finiteDrawing(f:PlanFrame){for(const s of f.series)for(const c of [...s.commands??[],...s.areaCommands??[]])for(const value of Object.values(c))if(typeof value==='number')expect(Number.isFinite(value)).toBe(true);for(const p of f.observations)expect([p.x,p.y,p.value].every(Number.isFinite)).toBe(true);}
describe('bounded circular display without changing source values',()=>{
 it.each(['pie','donut'] as const)('%s maps the supplied sweep and keeps original IDs, quantities and percentages',family=>{
  const spec=family==='pie'?pie:{...pie,family:'donut' as const,holeRatio:.6},f=frame(spec,{circular:{startAngle:-90,endAngle:90}});
  expect(f.observations.map(p=>p.value)).toEqual([1,3]);expect(f.observations.map(p=>p.percentage)).toEqual([25,75]);expect(f.observations.map(p=>p.id.pointId)).toEqual(['a','b']);
  expect(f.circular).toMatchObject({style:'sectors',startAngle:-90,endAngle:90});const hits=f.observations.map(p=>p.hit);expect(hits[0]?.kind).toBe('sector');
  if(hits[0]?.kind!=='sector'||hits[1]?.kind!=='sector')throw Error('Expected original sectors');expect(hits[0].start).toBeCloseTo(3*Math.PI/2);expect(hits[0].end-hits[0].start).toBeCloseTo(Math.PI/4);expect(hits[1].end).toBeCloseTo(5*Math.PI/2);expect(hits[0].end).toBe(hits[1].start);
  expect(f.circular!.bounds.height).toBeLessThan(f.circular!.bounds.width*.65);finiteDrawing(f);
 });
 it.each([{startAngle:0,endAngle:90},{startAngle:90,endAngle:450},{startAngle:270,endAngle:630},{startAngle:-360,endAngle:-359}])('fits a finite original arc for $startAngle to $endAngle',circular=>{
  for(const size of [64,320,768]){const f=frame(pie,{width:size,height:size,circular}),b=f.circular!.bounds;expect(b.width).toBeGreaterThan(0);expect(b.height).toBeGreaterThan(0);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(size);expect(b.y+b.height).toBeLessThanOrEqual(size);finiteDrawing(f);}
 });
 it('makes percentages relative to a known subtotal explicit and never replaces unknown values with zero',()=>{
  const f=frame({...pie,data:[{id:'a',label:'A',value:1},{id:'unknown',label:'Unknown',value:null},{id:'zero',label:'Actual zero',value:0}]},{circular:{startAngle:-90,endAngle:90}});
  expect(f.radialSummary).toEqual({knownTotal:1,overflow:false,missingCount:1,hiddenCount:0,knownCount:2,percentageBasis:'known-visible-subtotal'});expect(f.observations.map(p=>p.id.pointId)).toEqual(['a','zero']);expect(f.observations[1]?.value).toBe(0);expect(f.observations[1]?.hit).toBeUndefined();
 });
 it('preserves safe normalized fractions when the original total cannot be represented',()=>{
  const f=frame({...pie,data:pie.data.map(p=>({...p,value:Number.MAX_VALUE}))},{circular:{}});expect(f.radialSummary).toMatchObject({knownTotal:null,overflow:true,knownCount:2,percentageBasis:'complete-visible-total'});expect(f.observations.map(p=>p.value)).toEqual([Number.MAX_VALUE,Number.MAX_VALUE]);expect(f.observations.map(p=>p.percentage)).toEqual([50,50]);finiteDrawing(f);
 });
 it.each(['unknown','zero','hidden'] as const)('retains deliberate %s semantics without fake ink or an unknown total of zero',mode=>{
  const source:PlanDonutSpec={...pie,family:'donut',data:pie.data.map(p=>({...p,value:mode==='unknown'?null:0}))},f=frame(source,{circular:{startAngle:-90,endAngle:90},...(mode==='hidden'?{hiddenSeriesIds:['a','b']}:{})});
  expect(f.observations).toHaveLength(mode==='zero'?2:0);expect(f.series.every(s=>!s.commands?.length)).toBe(true);expect(f.radialSummary?.knownTotal).toBe(mode==='zero'?0:null);expect(f.annotations?.[0]?.text).toBe(mode==='zero'?'0':'—');
 });
 it('hides and restores original segments without changing source data or losing the known denominator',()=>{
  const f=frame(pie,{circular:{startAngle:0,endAngle:270},hiddenSeriesIds:['b']});expect(f.observations).toHaveLength(1);expect(f.observations[0]).toMatchObject({value:1,percentage:100});expect(f.legend.find(s=>s.id==='b')?.visible).toBe(false);expect(f.radialSummary?.knownTotal).toBe(1);expect(pie.data[1].value).toBe(3);
 });
 it('the ordinary full-circle owner remains unchanged unless the new layout is requested',()=>{
  expect(frame(pie).circular).toBeUndefined();expect(frame(gauge).circular).toBeUndefined();expect(frame(pie).observations.map(p=>p.value)).toEqual(frame(pie,{circular:{}}).observations.map(p=>p.value));
 });
 it('normalizes path starts for later sectors and bands crossing the angular seam',()=>{
  const f=frame({...pie,data:[{id:'a',label:'A',value:48},{id:'b',label:'B',value:32},{id:'c',label:'C',value:20}]},{width:300,height:280,circular:{startAngle:-90,endAngle:90}});
  expect(f.observations).toHaveLength(3);expect(f.observations.at(-1)?.hit?.kind).toBe('sector');finiteDrawing(f);
  const dial=frame({...gauge,bands:[{id:'first',from:0,to:60,color:'#638A35'},{id:'last',from:85,to:100,color:'#CB536D'}]},{circular:{gaugeStyle:'needle'}});
  expect(dial.series.some(s=>s.id==='band:last')).toBe(true);finiteDrawing(dial);
 });
 it('needle geometry, ticks, bands and target share one true angular scale',()=>{
  const f=frame(gauge,{circular:{gaugeStyle:'needle',tickCount:7}}),c=f.circular!;expect(c.style).toBe('needle-gauge');expect(c.domain).toEqual([0,100]);expect(c.valueState).toBe('within');expect(c.needle?.from).toBeCloseTo(3*Math.PI/2);expect(c.needle?.to).toBeCloseTo(3*Math.PI/2+Math.PI*.72);expect(f.observations[0]?.value).toBe(72);expect(f.series.find(s=>s.id==='reading')?.commands?.some(c=>c.kind==='Z')).toBe(true);expect(f.series.find(s=>s.id==='reading')?.circles?.[0]?.pointId).toBe('value');expect(c.ticks!.length).toBeGreaterThan(1);expect(c.ticks!.length).toBeLessThanOrEqual(16);expect(f.series.some(s=>s.id==='band:safe')).toBe(true);expect(f.series.some(s=>s.id==='target')).toBe(true);finiteDrawing(f);
 });
 it.each([{value:-20,state:'under',fraction:0},{value:0,state:'within',fraction:0},{value:150,state:'over',fraction:1}])('keeps original scalar $value while bounding only the needle',({value,state,fraction})=>{
  const f=frame({...gauge,value},{circular:{gaugeStyle:'needle'}});expect(f.observations[0]?.value).toBe(value);expect(f.circular?.valueState).toBe(state);expect(f.circular!.needle!.to!-f.circular!.needle!.from).toBeCloseTo(Math.PI*fraction);finiteDrawing(f);
 });
 it('a missing scalar paints no invented pointer or reading of zero',()=>{
  const r=planChart({...gauge,value:null},{width:320,height:320,circular:{gaugeStyle:'needle'}});if(r.status==='invalid')throw Error('Rejected missing value');expect(r.status).toBe('empty');expect(r.frame.observations).toEqual([]);expect(r.frame.circular?.needle?.to).toBeNull();expect(r.frame.circular?.valueState).toBe('missing');expect(r.frame.series.some(s=>s.id==='reading')).toBe(false);expect(r.frame.annotations?.find(a=>a.role==='value')?.text).toBe('—');
 });
 it('full-circle needles do not duplicate the coincident first and last tick',()=>{
  const f=frame({...gauge,preset:'ring'},{circular:{gaugeStyle:'needle',tickCount:12}});expect(f.circular?.ticks?.some(t=>t.value===100)).toBe(false);expect(f.circular?.ticks?.some(t=>t.value===0)).toBe(true);finiteDrawing(f);
 });
 it('custom solid gauge sweeps keep a genuine sector fill',()=>{
  const f=frame(gauge,{circular:{startAngle:-135,endAngle:135,gaugeStyle:'solid'}});expect(f.circular?.style).toBe('solid-gauge');expect(f.circular?.needle).toBeUndefined();expect(f.series.find(s=>s.id==='reading')?.commands?.some(c=>c.kind==='A')).toBe(true);finiteDrawing(f);
 });
 it.each([[-360,720],[0,0],[1,0],[0,.5],[0,361],[361,400],[NaN,90]])('rejects the unusable sweep %s to %s',(startAngle,endAngle)=>{expect(planChart(pie,{width:320,height:300,circular:{startAngle,endAngle}}).status).toBe('invalid');});
 it.each([1,13,2.5,NaN])('rejects an unbounded or invalid needle tick count %s',tickCount=>{expect(planChart(gauge,{width:320,height:300,circular:{gaugeStyle:'needle',tickCount}}).status).toBe('invalid');});
 it('rejects foreign family options, hidden scalar readings, radial references and malformed envelopes',()=>{
  expect(planChart(pie,{width:320,height:300,circular:{gaugeStyle:'needle'}}).status).toBe('invalid');expect(planChart(gauge,{width:320,height:300,circular:{tickCount:5}}).status).toBe('invalid');expect(planChart(gauge,{width:320,height:300,circular:{gaugeStyle:'needle'},hiddenSeriesIds:['reading']}).status).toBe('invalid');expect(planChart(pie,{width:320,height:300,circular:{},references:[]}).status).toBe('invalid');
  for(const circular of [null,[],false,{unrelated:true}])expect(planChart(pie,{width:320,height:300,circular} as unknown as PlanOptions).status).toBe('invalid');
 });
});
