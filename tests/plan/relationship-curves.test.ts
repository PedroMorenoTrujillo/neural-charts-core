import {describe,expect,test} from 'vitest';
import {planChart} from '../../src/plan.js';
import type {PlanCommand,PlanFrame,PlanSpec} from '../../src/public/plan-types.js';

const nodes=[{id:'a',label:'Alpha'},{id:'b',label:'Beta'},{id:'c',label:'Gamma'}];
const links=[{id:'ab',from:'a',to:'b',value:12},{id:'bc',from:'b',to:'c',value:8},{id:'ca',from:'c',to:'a',value:4}];
function run(family:'dependencywheel'|'chord'|'arcdiagram',extra:Record<string,unknown>={},width=390,height=320):PlanFrame{
  const result=planChart({family,title:'Relations',nodes,links,...extra} as PlanSpec,{width,height});
  if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));
  return result.frame;
}
function paths(commands:readonly PlanCommand[]|undefined):readonly (readonly PlanCommand[])[]{
  const result:PlanCommand[][]=[];let path:PlanCommand[]=[];
  for(const command of commands??[]){if(command.kind==='M'){if(path.length)throw Error('Unclosed ribbon');path=[command];}else path.push(command);if(command.kind==='Z'){result.push(path);path=[];}}
  if(path.length)throw Error('Unclosed ribbon');return result;
}
function close(actual:Readonly<{x:number;y:number}>,expected:Readonly<{x:number;y:number}>){
  expect(actual.x).toBeCloseTo(expected.x,3);expect(actual.y).toBeCloseTo(expected.y,3);
}

describe('analytic radial ribbon commands',()=>{
  for(const family of ['dependencywheel','chord'] as const){
    test(`${family} paints six analytic commands per ribbon and retains bounded source hit polygons`,()=>{
      for(const startAngle of [-360,-90,0,125,360]){
        const frame=run(family,{startAngle});
        for(const series of frame.series){
          const ribbons=paths(series.areaCommands),points=frame.observations.filter(p=>p.id.seriesId===series.id&&p.relationship?.kind==='link'&&p.hit?.kind==='polygon');
          expect(ribbons).toHaveLength(points.length);
          ribbons.forEach((path,index)=>{
            expect(path.map(c=>c.kind)).toEqual(['M','A','Q','A','Q','Z']);
            const [move,source,firstCurve,target,lastCurve]=path;
            if(move?.kind!=='M'||source?.kind!=='A'||firstCurve?.kind!=='Q'||target?.kind!=='A'||lastCurve?.kind!=='Q')throw Error('Unexpected ribbon roles');
            expect(source.radius).toBe(target.radius);expect(source.sweep).toBe(1);expect(target.sweep).toBe(1);
            expect(firstCurve.cx).toBe(frame.width/2);expect(firstCurve.cy).toBe(frame.height/2);
            expect(lastCurve.cx).toBe(firstCurve.cx);expect(lastCurve.cy).toBe(firstCurve.cy);
            close(lastCurve,move);
            const hit=points[index]!.hit;if(hit?.kind!=='polygon')throw Error('Missing precise source hit');
            expect(hit.vertices.length).toBeLessThanOrEqual(34);
            close(move,hit.vertices[0]!);
            // The unchanged hit mesh samples the same analytic curves. Distinct
            // port endpoints are present before the first quadratic connector.
            expect(hit.vertices.some(p=>Math.hypot(p.x-source.x,p.y-source.y)<.0002)).toBe(true);
            expect(hit.vertices.some(p=>Math.hypot(p.x-firstCurve.x,p.y-firstCurve.y)<.0002)).toBe(true);
            expect(hit.vertices.some(p=>Math.hypot(p.x-target.x,p.y-target.y)<.0002)).toBe(true);
          });
        }
      }
    });
    test(`${family} preserves original values, visibility and node-sector ports`,()=>{
      const base=run(family),hidden=planChart({family,title:'Relations',nodes,links,groups:[{id:'one',label:'One'},{id:'two',label:'Two'}]} as PlanSpec,{width:390,height:320,hiddenSeriesIds:['nodes']});
      expect(base.observations.filter(p=>p.relationship?.kind==='link').map(p=>[p.id.pointId,p.value])).toEqual([['ab',12],['bc',8],['ca',4]]);
      expect(base.series.flatMap(s=>s.nodeCommands??[]).filter(c=>c.kind==='A')).toHaveLength(6);
      if(hidden.status==='invalid')throw Error(hidden.diagnostic.reason);
      expect(hidden.frame.observations).toHaveLength(0);
      const zeros=run(family,{links:links.map(link=>({...link,value:0}))});
      expect(zeros.series.flatMap(s=>s.areaCommands??[])).toHaveLength(0);
      expect(zeros.observations.filter(p=>p.relationship?.kind==='link').every(p=>p.hit===undefined&&p.value===0)).toBe(true);
    });
  }
});

describe('analytic elliptical arc bands',()=>{
  test.each([false,true])('two ellipse arcs preserve the tapered band and reversal=%s',reversed=>{
    const frame=run('arcdiagram',{reversed});
    for(const series of frame.series){
      const ribbons=paths(series.areaCommands),points=frame.observations.filter(p=>p.id.seriesId===series.id&&p.relationship?.kind==='link'&&p.hit?.kind==='polygon');
      expect(ribbons).toHaveLength(points.length);
      ribbons.forEach((path,index)=>{
        expect(path.map(c=>c.kind)).toEqual(['M','A','A','Z']);
        const [move,outer,inner]=path;
        if(move?.kind!=='M'||outer?.kind!=='A'||inner?.kind!=='A')throw Error('Unexpected elliptical roles');
        expect(outer.radius).toBe(inner.radius);expect(outer.radiusY).toBeGreaterThan(inner.radiusY!);expect(inner.radiusY).toBeGreaterThan(0);
        expect(outer.sweep).toBe(reversed?0:1);expect(inner.sweep).toBe(reversed?1:0);
        close(inner,move);expect(outer.y).toBe(move.y);
        const hit=points[index]!.hit;if(hit?.kind!=='polygon')throw Error('Missing band hit');
        const outerY=move.y+(reversed?1:-1)*outer.radiusY!,actual=reversed?Math.max(...hit.vertices.map(p=>p.y)):Math.min(...hit.vertices.map(p=>p.y));
        expect(actual).toBeCloseTo(outerY,3);
        const middle=(move.x+outer.x)/2;
        expect(points[index]!.x).toBeCloseTo(middle,3);
      });
    }
  });
  test('exact commands remain finite and bounded on phone, tablet and stress dimensions',()=>{
    for(const family of ['dependencywheel','chord','arcdiagram'] as const)for(const width of [64,390,10000])for(const height of [64,320,10000]){
      const frame=run(family,{},width,height);
      for(const command of frame.series.flatMap(s=>s.areaCommands??[])){
        if(command.kind==='Z')continue;
        expect(Number.isFinite(command.x)&&Number.isFinite(command.y)).toBe(true);
        expect(command.x).toBeGreaterThanOrEqual(0);expect(command.x).toBeLessThanOrEqual(width);
        expect(command.y).toBeGreaterThanOrEqual(0);expect(command.y).toBeLessThanOrEqual(height);
        if(command.kind==='A'){expect(command.radius).toBeGreaterThan(0);if(command.radiusY!==undefined)expect(command.radiusY).toBeGreaterThan(0);}
        if(command.kind==='Q'){expect(command.cx).toBe(width/2);expect(command.cy).toBe(height/2);}
      }
    }
  });
});
