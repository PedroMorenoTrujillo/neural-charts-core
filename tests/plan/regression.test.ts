import {expect,test} from 'vitest';
import {planChart,type PlanRegressionSpec,type PlanSpec} from '../../src/plan.js';
import {describeRegression} from '../../src/plan/regression-statistics.js';
const source:PlanRegressionSpec={family:'regression',title:'Measured XY',axes:{x:{kind:'linear'},y:{kind:'linear',title:'ms'}},series:[{id:'measured',name:'Measured',data:[{id:'a',x:1,y:3},{id:'b',x:2,y:5},{id:'c',x:3,y:7}]}]};
const size={width:320,height:300};
function frame(spec=source,options:Parameters<typeof planChart>[1]=size){const r=planChart(spec,options);if(r.status==='invalid')throw Error(JSON.stringify(r));return r.frame;}
test('real scatter and OLS share a frame while original values remain original',()=>{
  const f=frame();expect(f.family).toBe('regression');expect(f.regression?.method).toBe('ordinary-least-squares');const model=f.regression!.models[0]!;if(model.status!=='ready')throw Error('Expected a fit');expect(model.slope).toBeCloseTo(2,12);expect(model.intercept).toBeCloseTo(1,12);expect(model.rSquared).toBeCloseTo(1,12);expect(model.sampleCount).toBe(3);
  expect(f.observations.filter(p=>p.regression?.kind==='sample').map(p=>[p.id.pointId,p.xValue,p.value])).toEqual([['a',1,3],['b',2,5],['c',3,7]]);expect(f.series.find(s=>s.id==='measured')?.circles).toHaveLength(3);expect(f.series.find(s=>s.id==='ols:measured')?.commands?.map(c=>c.kind)).toEqual(['M','L']);expect(f.observations.filter(p=>p.regression?.kind==='fit').every(p=>p.hit?.kind==='polygon')).toBe(true);
});
test('known noisy observations produce the independent least-squares result',()=>{
  const r=describeRegression('a',[{x:1,y:2},{x:2,y:4},{x:3,y:5},{x:4,y:4},{x:5,y:5}],0);if(r.status!=='ok'||r.summary.status!=='ready')throw Error('Expected model');expect(r.summary.slope).toBeCloseTo(.6,12);expect(r.summary.intercept).toBeCloseTo(2.2,12);expect(r.summary.rSquared).toBeCloseTo(.6,12);expect(r.predict!(3)).toBeCloseTo(4,12);
});
test('shifted timestamps retain small source differences rather than losing precision in raw squares',()=>{
  const r=describeRegression('a',Array.from({length:8},(_,i)=>({x:1e12+i,y:2+3*i})),0);if(r.status!=='ok'||r.summary.status!=='ready')throw Error('Expected shifted model');expect(r.summary.slope).toBeCloseTo(3,12);expect(r.summary.intercept).toBe(-3e12+2);expect(r.predict!(1e12+4)).toBeCloseTo(14,12);expect(r.summary.rSquared).toBe(1);
});
test('large opposite-sign values avoid raw square overflow',()=>{
  const r=describeRegression('a',[{x:-1,y:-1e308},{x:0,y:0},{x:1,y:1e308}],0);if(r.status!=='ok'||r.summary.status!=='ready')throw Error('Expected scaled model');expect(r.summary.slope).toBe(1e308);expect(r.summary.intercept).toBe(0);expect(r.predict!(.5)).toBe(5e307);
});
test('unrepresentable physical coefficients are diagnosed instead of silently becoming zero or infinity',()=>expect(describeRegression('a',[{x:1e-308,y:1e308},{x:2e-308,y:1.5e308}],0).status).toBe('invalid'));
test('constant response is a genuine zero slope with undefined R²',()=>{
  const f=frame({...source,series:[{id:'zero',name:'Actual zero',data:[{id:'a',x:1,y:0},{id:'b',x:2,y:0}]}]});expect(f.regression?.models[0]).toMatchObject({status:'ready',slope:0,intercept:0,rSquared:null});expect(f.observations.every(p=>p.value===0)).toBe(true);
});
test.each([[{id:'a',x:1,y:2}],[{id:'a',x:1,y:2},{id:'b',x:1,y:4}]].map(data=>({data})))('insufficient or constant-X samples keep the original points without inventing a fit',({data})=>{
  const f=frame({...source,series:[{id:'s',name:'Source',data}]});expect(f.regression?.models[0]?.status).toBe(data.length===1?'insufficient-data':'constant-x');expect(f.series.map(s=>s.id)).toEqual(['s']);expect(f.legend).toHaveLength(1);expect(f.observations.every(p=>p.regression?.kind==='sample')).toBe(true);
});
test('unknown coordinates are counted and omitted from fitting rather than converted to zero',()=>{
  const data=[...source.series[0]!.data,{id:'missing-x',x:null,y:5},{id:'missing-y',x:2,y:null}],f=frame({...source,series:[{...source.series[0]!,data}]});expect(f.regression?.models[0]).toMatchObject({sampleCount:3,missingCount:2});expect(f.observations.filter(p=>p.regression?.kind==='sample')).toHaveLength(3);
});
test('a fit crosses a cropped window even when both original fit endpoints are outside it',()=>{
  const f=frame(source,{...size,viewport:{axes:'x',value:{x:[1.2,1.8]}}});expect(f.observations.filter(p=>p.regression?.kind==='sample')).toEqual([]);const fitted=f.observations.filter(p=>p.regression?.kind==='fit');expect(fitted).toHaveLength(2);expect(fitted[0]?.xValue).toBeCloseTo(1.2,12);expect(fitted[0]?.value).toBeCloseTo(3.4,12);expect(fitted[1]?.value).toBeCloseTo(4.6,12);expect(f.series.find(s=>s.id==='ols:measured')?.commands).toHaveLength(2);
});
test('raw and fitted visibility are independent and re-fitting never depends on visibility',()=>{
  const base=frame(),fitOnly=frame(source,{...size,hiddenSeriesIds:['measured']}),rawOnly=frame(source,{...size,hiddenSeriesIds:['ols:measured']});expect(fitOnly.observations.every(p=>p.regression?.kind==='fit')).toBe(true);expect(rawOnly.observations.every(p=>p.regression?.kind==='sample')).toBe(true);expect(fitOnly.regression).toEqual(base.regression);expect(rawOnly.regression).toEqual(base.regression);
});
test('all-unknown input and empty source retain explicit unavailable-model metadata',()=>{
  for(const data of [[],[{id:'a',x:null,y:null}]]){const r=planChart({...source,series:[{id:'s',name:'Source',data}]},size);expect(r.status).toBe('empty');if(r.status==='invalid')throw Error('Unexpected invalid');expect(r.frame.regression?.models[0]?.status).toBe('insufficient-data');expect(r.frame.family).toBe('regression');}
});
test.each([320,768])('bounded original input and derived geometry remain finite at width %i',width=>{
  const data=Array.from({length:4096},(_,i)=>({id:String(i),x:i,y:i*2+Math.sin(i)})),f=frame({...source,series:[{id:'large',name:'Large original input',data}]},{width,height:340});expect(f.observations).toHaveLength(4098);expect(f.regression?.models[0]?.sampleCount).toBe(4096);expect(f.observations.every(p=>[p.x,p.y,p.value].every(Number.isFinite))).toBe(true);
});
test.each([
  {...source,series:[{id:'ols:reserved',name:'Reserved',data:[]}]},
  {...source,series:[{...source.series[0]!,data:[{id:'x',x:Infinity,y:1}]}]},
  {...source,series:[{...source.series[0]!,data:Array.from({length:4097},(_,i)=>({id:String(i),x:i,y:i}))}]},
])('rejects malformed, reserved or excessive original input',value=>expect(planChart(value as PlanSpec,size).status).toBe('invalid'));
