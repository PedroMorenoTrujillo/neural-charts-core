import {expect,it} from 'vitest';
import {planChart,type PlanSpec,type PlanPictorialSpec,type PlanPictorialGlyphId,type PlanHitRegion,type PlanCommand} from '../../src/plan.js';
import {pictorialExample,exampleIds} from '../fixtures/pictorial/examples.js';
import {maximumSpec} from '../fixtures/pictorial/maximum.js';
const size={width:390,height:360};
const serialize=(commands:readonly PlanCommand[])=>commands.map(c=>c.type==='Z'?'Z':c.type==='M'||c.type==='L'?`${c.type}${c.x} ${c.y}`:(()=>{throw Error('Pictorial must emit only M/L/Z');})()).join('');

for(const locale of ['en','es'] as const)for(const id of exampleIds)it(`dispatches the complete Pictorial ${locale}/${id} example through the public entry`,()=>{
  const {spec,options}=pictorialExample(id,locale),result=planChart(spec,options);
  if(result.status==='invalid')throw Error(result.diagnostic.reason);
  expect(result.frame.pictorialLayout?.mode).toBe(options.stacking??'grouped');
  for(const series of spec.series)for(const point of series.data){
    const original=result.frame.pictorialData?.find(row=>row.id.seriesId===series.id&&row.id.pointId===point.id);
    expect(original?.y).toBe(point.y);
  }
});

it('lets Pictorial report its own percent/domain incompatibility through the public entry',()=>{
  const example=pictorialExample('percent','en'),spec:PlanPictorialSpec={...example.spec,axes:{...example.spec.axes,y:{type:'linear',domain:[0,100]}}};
  const result=planChart(spec,example.options);
  expect(result.status).toBe('invalid');
  if(result.status==='invalid')expect(result.diagnostic.reason).toBe('PERCENT_DOMAIN_UNSUPPORTED');
});

it('exposes typed background/fill/source roles and compound hit through the public entry',()=>{
  const example=pictorialExample('custom-ring','en'),source:PlanSpec=example.spec,result=planChart(source,size);
  if(result.status==='invalid')throw Error(result.diagnostic.reason);
  expect(result.frame.family).toBe('pictorial');
  const glyph=result.frame.pictorialGlyphs![0]!,fill=result.frame.series[0]!.pictorialFills![0]!,observation=result.frame.observations[0]!;
  const id:PlanPictorialGlyphId=glyph.id,hit:PlanHitRegion=observation.hit!;
  expect(fill.glyphId).toBe(id);expect(observation.pictorial?.glyphId).toBe(id);
  expect(hit.type).toBe('compoundPolygon');expect(glyph.backgroundCommands.length).toBeGreaterThan(0);
  expect(Object.isFrozen(hit)).toBe(true);expect(Object.isFrozen(fill.commands[0])).toBe(true);
  expect(result.frame.pictorialData).toHaveLength(source.series.reduce((n,s)=>n+s.data.length,0));
});

it('keeps maximum numeric paths inside explicit current Native transport character budgets without a private dependency',()=>{
  const source=maximumSpec(),result=planChart(source,size);
  if(result.status==='invalid')throw Error(result.diagnostic.reason);
  const frame=result.frame,paths=frame.series.map(s=>serialize(s.pictorialFills!.flatMap(f=>f.commands))),backgrounds=serialize(frame.pictorialGlyphs!.flatMap(g=>g.backgroundCommands));
  expect(paths.every(p=>p.length<1_000_000)).toBe(true);expect(backgrounds.length).toBeLessThan(1_000_000);
  expect(paths.reduce((n,p)=>n+p.length,backgrounds.length)).toBeLessThan(2_000_000);
  expect(frame.observations).toHaveLength(64);expect(frame.pictorialData).toHaveLength(64);
  const hits=frame.observations.map(o=>o.hit).filter((hit):hit is Extract<PlanHitRegion,{type:'compoundPolygon'}>=>hit?.type==='compoundPolygon');
  expect(hits.reduce((n,h)=>n+h.polygons.length,0)).toBeLessThanOrEqual(4096);
  expect(hits.every(h=>h.polygons.length<=64&&h.polygons.every(p=>p.length<=5))).toBe(true);
  // Numeric path budgets only: private Native data/scene adapters and mobile FPS remain separate gates.
});

it('rejects incompatible ports explicitly rather than silently accepting them for Pictorial',()=>{
  const source=pictorialExample('grouped','en').spec;
  for(const options of [{...size,viewport:{axes:'x' as const}},{...size,references:[]},{...size,wordcloudText:{fontKey:'opaque',measurements:[]}}])expect(planChart(source,options).status).toBe('invalid');
});

it('retains full source text limits so an adapter must accommodate metadata before visual truncation',()=>{
  const source:PlanPictorialSpec={...pictorialExample('grouped','en').spec,title:'T'.repeat(512),description:'D'.repeat(2048),series:[{id:'s',name:'N'.repeat(256),data:[{id:'p',x:'a',y:1}]}]};
  const result=planChart(source,size);if(result.status==='invalid')throw Error(result.diagnostic.reason);
  expect(result.frame.title).toHaveLength(512);expect(result.frame.description).toHaveLength(2048);
  expect(result.frame.legend[0]!.name).toHaveLength(256);expect(result.frame.observations[0]!.seriesName).toHaveLength(256);
});

it('public defensive ownership rejects hidden invalid data and does not execute accessors',()=>{
  let calls=0;const source=pictorialExample('grouped','en').spec;
  Object.defineProperty(source,'pictorial',{enumerable:true,get(){calls++;return{};}});
  expect(planChart(source,{...size,hiddenSeriesIds:['s0','s1']}).status).toBe('invalid');expect(calls).toBe(0);
  const invalid={...pictorialExample('grouped','en').spec,series:[{id:'s',name:'Hidden',data:[{id:'p',x:'a',y:-1}]}]} as PlanPictorialSpec;
  expect(planChart(invalid,{...size,hiddenSeriesIds:['s']}).status).toBe('invalid');
});
