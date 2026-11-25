import {describe,expect,test} from 'vitest';
import {planChart,transformPlanViewport} from '../../src/plan.js';
import type {PlanContourSpec} from '../../src/public/contour-types.js';
import {clipContourSegment} from '../../src/plan/contour-clip.js';
import {contourSegments} from '../../src/plan/contour-geometry.js';

function source():PlanContourSpec{return {family:'contour',title:'Measured field',axes:{x:{type:'linear'},y:{type:'linear'}},grid:{id:'temperature',x:[0,2],y:[0,5],ids:['top-left','top-right','bottom-left','bottom-right'],values:[0,2,0,2],unit:'°C'},contour:{levels:[{id:'one',value:1}]}};}
function frame(spec=source(),options:Parameters<typeof planChart>[1]={width:390,height:320}){
  const result=planChart(spec,options);if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));expect(result.frame.family).toBe('contour');expect(result.frame.contour).toBeDefined();return result.frame;
}

describe('contour transport limits', () => {
  const options = {width: 390, height: 320};
  test('reconstructs disconnected peaks even when subtracting two finite samples would overflow', () => {
    const segments=contourSegments({x:[0,1],y:[0,1],values:[1.5e308,-1.5e308,-1.5e308,1.5e308]},[1e308]);
    expect(segments.status).toBe('ready');
    expect(segments.segments).toHaveLength(2);
    const [first,last]=segments.segments;
    expect(first?.start.x).toBe(0);
    expect(first?.start.y).toBeCloseTo(1/6,14);
    expect(first?.end.x).toBeCloseTo(1/6,14);
    expect(first?.end.y).toBe(0);
    expect(last?.start.x).toBe(1);
    expect(last?.start.y).toBeCloseTo(5/6,14);
    expect(last?.end.x).toBeCloseTo(5/6,14);
    expect(last?.end.y).toBe(1);
  });
  test('retains a source isoline count when it collapses to one pixel position',()=>{
    const input=source(),{unit:sourceUnit,...grid}=input.grid;
    expect(sourceUnit).toBe('°C');
    const far={type:'linear',domain:[-1e308,1e308]} as const;
    const result=planChart({...input,axes:{x:far,y:far},grid},options);
    expect(result).toMatchObject({status:'empty',frame:{unit:'',observations:[],
      contour:{segmentCount:1,visibleSegments:0}}});
  });
  test.each([0,1,2,3])('keeps a missing value at grid corner %s without inventing an isoline', index => {
    const input=source(),grid={...input.grid,values:input.grid.values.map((value,i)=>i===index?null:value)};
    for(const hiddenSeriesIds of [[],['one']]){
      const result=planChart({...input,grid},{...options,hiddenSeriesIds});
      if(result.status==='invalid')throw Error(JSON.stringify(result.diagnostic));
      expect(result.frame.contour).toMatchObject({missingCells:1,knownSamples:3,visibleSegments:0});
      expect(result.frame.observations).toEqual([]);
      expect(result.frame.series.every(series=>(series.commands?.length??0)===0)).toBe(true);
    }
  });
  test.each([
    [{axes: {x: {type: 'time'}, y: {type: 'linear'}}}, 'CONTOUR_LINEAR_AXIS_ONLY', 'spec.axes.x.type'],
    [{grid: {...source().grid, ids: ['same', 'same', 'lower-left', 'lower-right']}}, 'DUPLICATE_ID', 'spec.grid.ids'],
    [{contour: {...source().contour, segmentBudget: 1.5}}, 'CONTOUR_SEGMENT_BUDGET', 'spec.contour.segmentBudget'],
  ] as const)('rejects unsupported coordinates, cell identity or segment limits (case %#)', (patch, reason, path) => {
    expect(planChart({...source(), ...patch} as PlanContourSpec, options)).toMatchObject({
      status: 'invalid', diagnostic: {reason, path},
    });
  });
  test('rejects an out-of-bounds viewport before replacing measured samples with a blank result', () => {
    expect(planChart(source(), {...options, viewport: {axes: 'x', value: {x: [0, 5]}}})).toMatchObject({
      status: 'invalid', diagnostic: {path: 'viewport.value.x'},
    });
  });
});

describe('contour explicit domain and named level transport', () => {
  test('keeps the original interpolated values with reversed scales, custom colors and scoped Y', () => {
    const spec = source();
    const named = {
      ...spec, description: 'Signed original measurements',
      axes: {x: {type: 'linear', domain: [0,2], nice: false}, y: {type: 'linear', domain: [0,5], nice: false, reversed: true}},
      contour: {...spec.contour, levels: [{id: 'one', name: 'Threshold', value: 1, color: '#AABBCC'}]},
    } as const satisfies PlanContourSpec;
    const result = frame(named, {width: 390, height: 320, viewport: {axes: 'y', value: {y: [1,4]}}});
    expect(result.description).toBe('Signed original measurements');
    expect(result.legend[0]).toMatchObject({id: 'one', name: 'Threshold', color: '#aabbcc'});
    expect(result.viewport?.displayed.y).toEqual([1,4]);
    expect(result.observations).toHaveLength(1);
    const observation = result.observations[0]!;
    expect(observation.value).toBe(1);
    expect(observation.contour).toMatchObject({sourceValues: [0,2,2,0], start: {x: 195, y: 0}, end: {x: 195, y: 320}});
  });

  test.each([0, 1, 2, 3])('drops the complete measured cell when corner %i is missing', blank => {
    const spec = source();
    const values = spec.grid.values.map((value, index) => index === blank ? null : value);
    const result = frame({...spec, grid: {...spec.grid, values}});
    expect(result.contour).toMatchObject({knownSamples: 3, missingCells: 1, emptyReason: 'missing'});
    expect(result.observations).toEqual([]);
  });
});

describe('public Contour source/derived contract',()=>{
  test('one numeric field yields one shared frame with explicitly interpolated level observations',()=>{
    const f=frame(),p=f.observations[0]!;
    expect(f.observations).toHaveLength(1);expect(f.series).toHaveLength(1);expect(f.series[0]?.commands?.map(c=>c.type)).toEqual(['M','L']);
    expect(p.id.seriesId).toBe('one');expect(p.value).toBe(1);expect(p.contour?.type).toBe('isoline');
    expect(p.contour?.sourceStart).toEqual({x:1,y:0});expect(p.contour?.sourceEnd).toEqual({x:1,y:5});
    expect(p.contour?.start).toEqual({x:195,y:320});expect(p.contour?.end).toEqual({x:195,y:0});
    expect(p.contour?.sourceIds).toEqual(['top-left','top-right','bottom-right','bottom-left']);
    expect(p.contour?.sourceValues).toEqual([0,2,2,0]);expect(p.hit).toBeUndefined();
    expect(f.contour?.samples.map(s=>[s.id,s.x,s.y,s.value])).toEqual([['top-left',0,0,0],['top-right',2,0,2],['bottom-left',0,5,0],['bottom-right',2,5,2]]);
    expect(f.unit).toBe('°C');expect(f.grid.length).toBeGreaterThan(0);expect(f.labels.length).toBeGreaterThan(0);
  });
  test('unknown samples break cells and remain unknown instead of becoming zero',()=>{
    const s=source(),f=frame({...s,grid:{...s.grid,values:[0,null,0,2]}});
    expect(f.observations).toHaveLength(0);expect(f.contour?.missingCells).toBe(1);expect(f.contour?.knownSamples).toBe(3);expect(f.contour?.samples[1]?.value).toBeNull();expect(f.contour?.emptyReason).toBe('missing');
  });
  test('a known flat field has no crossing, not missing original measurements',()=>{
    const s=source(),f=frame({...s,grid:{...s.grid,values:[0,0,0,0]},contour:{levels:[{id:'zero',value:0}]}});
    expect(f.observations).toHaveLength(0);expect(f.contour?.knownSamples).toBe(4);expect(f.contour?.missingCells).toBe(0);expect(f.contour?.emptyReason).toBe('noCrossings');expect(f.contour?.samples.every(s=>s.value===0)).toBe(true);
  });
  test('saddles preserve four-way intersections and distinct derived identities',()=>{
    const s=source(),f=frame({...s,grid:{...s.grid,values:[1,-1,-1,1]},contour:{levels:[{id:'zero',value:0}]}});
    expect(f.observations).toHaveLength(4);expect(new Set(f.observations.map(p=>p.id.pointId)).size).toBe(4);
    for(const p of f.observations)expect(p.contour?.sourceEnd).toEqual({x:1,y:2.5});
  });
  test('hiding and restoring levels preserves full source samples and exact derived IDs',()=>{
    const s=source(),a=frame(s),hidden=frame(s,{width:390,height:320,hiddenSeriesIds:['one']}),restored=frame(s);
    expect(hidden.observations).toHaveLength(0);expect(hidden.legend?.[0]?.visible).toBe(false);expect(hidden.contour?.emptyReason).toBe('hidden');expect(hidden.contour?.samples).toEqual(a.contour?.samples);expect(restored.observations.map(p=>p.id)).toEqual(a.observations.map(p=>p.id));
  });
  test('owns caller data and deeply freezes source and derived metadata',()=>{
    const s=source(),f=frame(s);expect(Object.isFrozen(f)).toBe(true);expect(Object.isFrozen(f.contour?.samples)).toBe(true);expect(Object.isFrozen(f.observations[0]?.contour?.sourceValues)).toBe(true);
    (s.grid.values as (number|null)[])[0]=99;(s.grid.ids as string[])[0]='changed';expect(f.contour?.samples[0]?.value).toBe(0);expect(f.contour?.samples[0]?.id).toBe('top-left');
  });
  test('rejects budget overflow explicitly without returning partial geometry',()=>{
    const s=source(),result=planChart({...s,grid:{id:'checker',x:[0,1,2],y:[0,1,2],ids:Array.from({length:9},(_,i)=>'s'+i),values:[0,1,0,1,0,1,0,1,0]},contour:{levels:[{id:'half',value:.5}],segmentBudget:1}},{width:390,height:320});
    expect(result.status).toBe('invalid');if(result.status==='invalid')expect(result.diagnostic.reason).toBe('CONTOUR_SEGMENT_BUDGET');expect('frame' in result).toBe(false);
  });
  test('rejects malformed source and level contracts through the public entry',()=>{
    const s=source();const bad=[{...s,grid:{...s.grid,ids:['only-one']}},{...s,grid:{...s.grid,x:[2,0]}},{...s,grid:{...s.grid,values:[0,NaN,0,2]}},{...s,contour:{levels:[]}},{...s,contour:{levels:[{id:'two',value:2},{id:'one',value:1}]}},{...s,contour:{levels:[{id:'same',value:1},{id:'same',value:2}]}},{...s,contour:{levels:[{id:'same',value:1}],segmentBudget:32769}}];
    for(const invalid of bad)expect(planChart(invalid,{width:390,height:320}).status).toBe('invalid');
    expect(planChart(s,{width:390,height:320,stacking:'sum'}).status).toBe('invalid');
    expect(planChart(s,{width:390,height:320,hiddenSeriesIds:['not-a-level']}).status).toBe('invalid');
  });
  test('does not invoke accessors while defensively owning input',()=>{
    let calls=0;const s=source(),input={...s,grid:{...s.grid,get values(){calls++;return [0,2,0,2];}}};
    expect(planChart(input,{width:390,height:320}).status).toBe('invalid');expect(calls).toBe(0);
  });
});

describe('shared XY viewport and references',()=>{
  test('clips interpolated segments to controlled windows without cropping original summaries',()=>{
    const f=frame(source(),{width:390,height:320,viewport:{axes:'xy',value:{x:[.5,1.5],y:[1,4]}}}),p=f.observations[0]!;
    expect(p.contour?.start).toEqual({x:195,y:320});expect(p.contour?.end).toEqual({x:195,y:0});expect(p.contour?.sourceStart.y).toBe(0);expect(p.contour?.sourceEnd.y).toBe(5);
    expect(f.viewport?.displayed).toEqual({x:[.5,1.5],y:[1,4]});expect(f.contour?.samples).toHaveLength(4);
    const reset=transformPlanViewport(f.viewport!,{type:'reset'});expect(reset.status).toBe('ok');
  });
  test('an outside window retains samples and declares the absence of visible isolines',()=>{
    const f=frame(source(),{width:390,height:320,viewport:{axes:'xy',value:{x:[0,.5]}}});expect(f.observations).toHaveLength(0);expect(f.contour?.emptyReason).toBe('outsideViewport');expect(f.contour?.samples).toHaveLength(4);
  });
  test('reversed axes use the same source interpolation and shared scales',()=>{
    const s=source(),f=frame({...s,axes:{x:{type:'linear',reversed:true},y:{type:'linear',reversed:true}},contour:{levels:[{id:'half',value:.5}]}}),p=f.observations[0]!;
    expect(p.contour?.sourceStart).toEqual({x:.5,y:0});expect(p.contour?.start).toEqual({x:292.5,y:0});expect(p.contour?.end).toEqual({x:292.5,y:320});
  });
  test('reference values describe X/Y coordinates, not the scalar contour intensity',()=>{
    const f=frame(source(),{width:390,height:320,references:[{id:'x',axis:'x',value:1},{id:'y',axis:'y',value:4},{id:'outside',axis:'x',value:10}]});
    expect(f.references).toEqual([{id:'x',axis:'x',status:'visible',line:{x1:195,x2:195,y1:0,y2:320}},{id:'y',axis:'y',status:'visible',line:{x1:0,x2:390,y1:expect.closeTo(64,10),y2:expect.closeTo(64,10)}},{id:'outside',axis:'x',status:'outside'}]);
  });
  test('saddle segment identity does not depend on which preceding segments the viewport removes',()=>{
    const s={...source(),grid:{...source().grid,values:[1,-1,-1,1]},contour:{levels:[{id:'zero',value:0}]}} as const;
    const full=frame(s),clipped=frame(s,{width:390,height:320,viewport:{axes:'xy',value:{x:[1.1,2],y:[0,5]}}});
    expect(clipped.observations.length).toBeGreaterThan(0);
    for(const point of clipped.observations){const original=full.observations.find(other=>other.id.pointId===point.id.pointId);expect(original?.contour.sourceStart).toEqual(point.contour.sourceStart);expect(original?.contour.sourceEnd).toEqual(point.contour.sourceEnd);}
  });
  test('labels at plot borders are suppressed rather than overflowing the native scene',()=>{
    const s={...source(),grid:{...source().grid,values:[0,0,2,2]},contour:{levels:[{id:'edge',value:0}]}} as const;
    const f=frame(s);for(const label of f.annotations??[])if(label.box){expect(label.y-label.box.height/2).toBeGreaterThanOrEqual(0);expect(label.y+label.box.height/2).toBeLessThanOrEqual(320);}
  });
  test('large finite coordinate domains do not produce nonfinite commands',()=>{
    const s=source(),f=frame({...s,grid:{...s.grid,x:[-1e100,1e100],y:[-1e100,1e100]}});
    for(const c of f.series.flatMap(s=>s.commands??[]))if(c.type==='M'||c.type==='L')expect(Number.isFinite(c.x)&&Number.isFinite(c.y)).toBe(true);
  });
});

describe('source-space clipping',()=>{
  test('does not invent a diagonal by independently clamping endpoints',()=>{
    expect(clipContourSegment({level:0,cell:0,start:{x:-2,y:.2},end:{x:.2,y:-2}},[0,1],[0,1])).toBeNull();
    expect(clipContourSegment({level:0,cell:0,start:{x:-2,y:.8},end:{x:2,y:.4}},[0,1],[0,1])).toEqual([{x:0,y:.6000000000000001},{x:1,y:.5}]);
  });
  test('handles overflowing source spans and preserves exact boundary coordinates',()=>{
    const clipped=clipContourSegment({level:0,cell:0,start:{x:-1e308,y:0},end:{x:1e308,y:0}},[-1,1],[-1,1]);
    expect(clipped).toEqual([{x:-1,y:0},{x:1,y:0}]);
  });
});
