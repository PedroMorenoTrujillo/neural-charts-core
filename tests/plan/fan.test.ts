import {describe,it,expect} from 'vitest';
import {planChart,type PlanFanSpec} from '../../src/plan.js';
const spec:PlanFanSpec={family:'fan',title:'Prediction intervals',axes:{x:{kind:'linear'},y:{kind:'linear',title:'ms'}},bands:[{id:'inner',label:'50%',coverage:.5},{id:'outer',label:'95%',coverage:.95}],data:[{id:'past',x:0,value:10,intervals:[]},{id:'a',x:1,value:12,intervals:[{bandId:'inner',low:10,high:14},{bandId:'outer',low:8,high:16}]},{id:'b',x:2,value:16,intervals:[{bandId:'inner',low:12,high:20},{bandId:'outer',low:6,high:26}]}]};
const frame=(value:PlanFanSpec=spec,options={width:320,height:300})=>{const r=planChart(value,options);if(r.status==='invalid')throw Error(JSON.stringify(r));return r.frame;};
describe('shared-frame uncertainty bands',()=>{
  it('preserves source estimates, interval endpoints and identities in one domain',()=>{
    const f=frame();expect(f.family).toBe('fan');expect(f.unit).toBe('ms');expect(f.series.map(s=>s.id)).toEqual(['outer','inner','center']);expect(f.observations[0]?.fan?.kind).toBe('center');expect(f.legend?.[0]?.id).toBe('center');expect(f.observations.filter(p=>p.id.seriesId==='center').map(p=>[p.id.pointId,p.value,p.fan])).toEqual([['past',10,{kind:'center'}],['a',12,{kind:'center'}],['b',16,{kind:'center'}]]);
    const center=f.observations.find(p=>p.id.seriesId==='center'&&p.id.pointId==='a')!,outer=f.observations.find(p=>p.id.seriesId==='outer'&&p.id.pointId==='a')!;expect(center.x).toBe(outer.x);expect(center.group).toEqual(outer.group);expect(center.lowValue).toBeUndefined();expect(outer.fan).toEqual({kind:'interval',coverage:.95,low:8,high:16});expect(f.series[0]?.areaCommands?.length).toBeGreaterThan(0);expect(f.series.at(-1)?.areaCommands).toBeUndefined();expect(f.series.at(-1)?.circles).toHaveLength(3);
  });
  it('keeps unknown estimates distinct from real zeros and does not bridge gaps',()=>{
    const f=frame({...spec,data:[{id:'zero',x:0,value:0,intervals:[{bandId:'inner',low:0,high:0}]},{id:'unknown',x:1,value:null,intervals:[{bandId:'inner',low:null,high:null}]},{id:'last',x:2,value:0,intervals:[]}]});expect(f.observations.filter(p=>p.id.seriesId==='center').map(p=>p.value)).toEqual([0,0]);expect(f.observations.some(p=>p.id.pointId==='unknown')).toBe(false);expect(f.series.find(s=>s.id==='center')?.commands?.map(c=>c.kind)).toEqual(['M','M']);
  });
  it('honours hidden bands while retaining original central estimates',()=>{
    const r=planChart(spec,{width:320,height:300,hiddenSeriesIds:['outer']});if(r.status==='invalid')throw Error(JSON.stringify(r));expect(r.frame.series.map(s=>s.id)).toEqual(['inner','center']);expect(r.frame.legend?.find(l=>l.id==='outer')?.visible).toBe(false);expect(r.frame.observations.filter(p=>p.fan?.kind==='center').map(p=>p.value)).toEqual([10,12,16]);
  });
  it('styles the central estimate without overriding band colours or source measurements',()=>{
    const before=frame(),after=frame({...spec,centerColor:'#CC2244'});expect(after.series.find(s=>s.id==='center')?.color.toLowerCase()).toBe('#cc2244');expect(after.series.filter(s=>s.id!=='center').map(s=>s.color)).toEqual(before.series.filter(s=>s.id!=='center').map(s=>s.color));expect(after.observations.map(p=>p.value)).toEqual(before.observations.map(p=>p.value));
  });
  it('retains family and band metadata for empty and fully hidden sources',()=>{
    for(const r of [planChart({...spec,data:[]},{width:320,height:300}),planChart(spec,{width:320,height:300,hiddenSeriesIds:['inner','outer','center']})]){expect(r.status).toBe('empty');if(r.status==='invalid')throw Error('Unexpected invalid');expect(r.frame.family).toBe('fan');expect(r.frame.fan?.bands).toHaveLength(2);expect(r.frame.observations).toEqual([]);}
  });
  it('uses the range owner for numeric viewport and reference projection',()=>{
    const r=planChart(spec,{width:320,height:300,viewport:{axes:'x',value:{x:[.5,2]}},references:[{id:'future',axis:'x',value:1}]});if(r.status==='invalid')throw Error(JSON.stringify(r));expect(r.frame.viewport?.axes).toBe('x');expect(r.frame.references?.[0]?.status).toBe('visible');expect(r.frame.observations.filter(p=>p.id.seriesId==='center').map(p=>p.value)).toEqual([12,16]);
  });
  it.each([320,768])('keeps every band and the estimate aligned at width %i',width=>{
    const f=frame(spec,{width,height:360});for(const point of f.observations.filter(p=>p.fan?.kind==='center'))for(const range of f.observations.filter(p=>p.id.pointId===point.id.pointId&&p.fan?.kind==='interval')){expect(range.x).toBe(point.x);expect(range.group?.coordinate).toBe(point.x);}
  });
  it('uses category identities without converting them into numeric positions in the source',()=>{
    const f=frame({family:'fan',title:'Category estimates',axes:{x:{kind:'category',values:[{id:'now',label:'Now'},{id:'next',label:'Next'}]},y:{kind:'linear'}},bands:[{id:'spread',label:'80%',coverage:.8}],data:[{id:'a',x:'now',value:10,intervals:[]},{id:'b',x:'next',value:12,intervals:[{bandId:'spread',low:8,high:16}]}]});expect(f.labels.map(l=>l.label)).toEqual(['Now','Next']);expect(f.observations.filter(p=>p.fan?.kind==='center').map(p=>p.label)).toEqual(['Now','Next']);
  });
  it('uses UTC timestamps through the existing time-axis owner',()=>{
    const from=Date.UTC(2026,0,1),step=86400000,f=frame({family:'fan',title:'Daily estimates',axes:{x:{kind:'time'},y:{kind:'linear'}},bands:[{id:'spread',label:'80%',coverage:.8}],data:[{id:'a',x:from,value:10,intervals:[{bandId:'spread',low:8,high:12}]},{id:'b',x:from+step,value:12,intervals:[{bandId:'spread',low:8,high:16}]}]});expect(f.observations.filter(p=>p.fan?.kind==='center').map(p=>p.xValue)).toEqual([from,from+step]);expect(f.labels.length).toBeGreaterThan(0);
  });
  it('bounds the maximum declared source and preserves every usable value',()=>{
    const bands=Array.from({length:6},(_,i)=>({id:'band-'+i,label:String(i),coverage:(i+1)/8})),f=frame({...spec,bands,data:Array.from({length:1024},(_,i)=>({id:String(i),x:i,value:i,intervals:bands.map((b,j)=>({bandId:b.id,low:i-j-1,high:i+j+1}))}))});expect(f.observations).toHaveLength(7168);expect(f.series).toHaveLength(7);expect(f.observations.every(p=>[p.x,p.y,p.value].every(Number.isFinite))).toBe(true);
  });
  it.each([
    {...spec,bands:[...spec.bands].reverse()},
    {...spec,bands:[{id:'center',label:'Reserved',coverage:.5}]},
    {...spec,bands:[{id:'a',label:'Certain',coverage:1}]},
    {...spec,data:[{id:'a',x:0,value:10,intervals:[{bandId:'inner',low:9,high:11},{bandId:'outer',low:10,high:11}]}]},
    {...spec,data:[{id:'a',x:0,value:10,intervals:[{bandId:'inner',low:11,high:12}]}]},
    {...spec,data:[{id:'a',x:0,value:null,intervals:[{bandId:'inner',low:0,high:1}]}]},
    {...spec,data:[{id:'a',x:0,value:10,intervals:[{bandId:'unknown',low:0,high:1}]}]},
    {...spec,data:[{id:'a',x:0,value:10,intervals:[{bandId:'inner',low:0,high:null}]}]},
  ])('rejects malformed or non-nested uncertainty input',value=>expect(planChart(value as PlanFanSpec,{width:320,height:300}).status).toBe('invalid'));
});
