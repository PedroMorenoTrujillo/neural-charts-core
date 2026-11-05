import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {planChart,type PlanOptions,type PlanSpec} from '../../src/plan.js';

interface Fixture {id:string;spec:PlanSpec;options:PlanOptions;result:unknown;}
const baseline=JSON.parse(readFileSync(new URL('../fixtures/type-discriminators/legacy-024-geometry.json',import.meta.url),'utf8')) as {baselineCommit:string;cases:Fixture[]};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
function obsoleteKey(value:Record<string,unknown>,both:boolean):void{
  value['kind']=value['type'];
  if(!both)delete value['type'];
}

describe('public type discriminators',()=>{
  it.each(baseline.cases)('preserves the exact 0.0.24 geometry and original values for $id',fixture=>{
    const spec=clone(fixture.spec),options=clone(fixture.options),before=JSON.stringify({spec,options});
    expect(planChart(spec,options)).toEqual(fixture.result);
    expect(JSON.stringify({spec,options})).toBe(before);
  });

  it.each([false,true])('rejects obsolete kind keys, including ambiguous dual discriminators: both=%s',both=>{
    const routes=[
      {id:'line-zero-missing-negative',path:['axes','x']},
      {id:'line-zero-missing-negative',path:['axes','y']},
      {id:'mixed-lines-area-columns',path:['series',0]},
      {id:'waterfall-checkpoints',path:['series',0,'data',0]},
      {id:'waterfall-checkpoints',path:['series',0,'data',2]},
      {id:'heatmap-colour-classes',path:['axes','x']},
      {id:'heatmap-colour-classes',path:['colorAxis']},
    ] as const;
    for(const route of routes){
      const fixture=baseline.cases.find(item=>item.id===route.id)!;
      const spec=clone(fixture.spec) as unknown as Record<string,unknown>;
      let target:unknown=spec;
      for(const key of route.path)target=(target as Record<string|number,unknown>)[key];
      obsoleteKey(target as Record<string,unknown>,both);
      const before=JSON.stringify(spec);
      expect(planChart(spec as unknown as PlanSpec,fixture.options).status,route.id+': '+route.path.join('.')).toBe('invalid');
      expect(JSON.stringify(spec)).toBe(before);
    }
    const log=baseline.cases.find(item=>item.id==='scatter-log-window')!;
    const options=clone(log.options) as unknown as {scales:{x:Record<string,unknown>}};
    obsoleteKey(options.scales.x,both);
    expect(planChart(log.spec,options as unknown as PlanOptions).status).toBe('invalid');
  });

  it('uses type throughout public results, including commands, hit geometry, colour metadata and viewport bounds',()=>{
    const visited=new Set<string>();
    const inspect=(value:unknown,path:string):void=>{
      if(!value||typeof value!=='object')return;
      for(const [key,child] of Object.entries(value)){
        expect(key,path).not.toBe('kind');
        if(key==='type'&&typeof child==='string')visited.add(child);
        inspect(child,path+'.'+key);
      }
    };
    for(const fixture of baseline.cases)inspect(planChart(fixture.spec,fixture.options),fixture.id);
    for(const discriminator of ['M','L','circle','polygon','classes','missing','center','interval','sample','fit','log'])expect(visited.has(discriminator),discriminator).toBe(true);
  });
});
