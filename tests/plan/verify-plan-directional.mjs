import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart,transformPlanViewport} from '../../dist/plan.js';

const options={width:320,height:300};
const vector={family:'vector',title:'Field',unit:'m/s',axes:{x:{kind:'linear',domain:[0,10]},y:{kind:'linear',domain:[0,10]}},series:[{id:'field',name:'Field',data:[{id:'east',x:2,y:2,dx:3,dy:0},{id:'north',x:5,y:5,dx:0,dy:4},{id:'zero',x:8,y:8,dx:0,dy:0},{id:'missing',x:7,y:2,dx:null,dy:null}]}]};
const wind={family:'windbarb',title:'Wind',axes:{x:{kind:'linear',domain:[0,10]},y:{kind:'linear',domain:[0,150]}},series:[{id:'station',name:'Station',data:[{id:'north',x:1,value:10,direction:0},{id:'east',x:3,value:20,direction:90},{id:'calm',x:5,value:0,direction:180},{id:'unknown',x:7,value:5,direction:null},{id:'missing',x:9,value:null,direction:null}]}]};
const checks=[];const check=(name,run)=>{run();checks.push(name);};
const frame=(data,opts=options)=>{const r=planChart(data,opts);assert.equal(r.status,'ok',JSON.stringify(r));return r.frame;};
const point=(f,id)=>f.observations.find(o=>o.id.pointId===id);
const single=(data,p)=>({...data,series:[{...data.series[0],data:[p]}]});
const invalid=(data,opts=options)=>assert.equal(planChart(data,opts).status,'invalid');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

check('Vector metadata preserves source components, coordinates, magnitude, zero and missingness',()=>{
  const f=frame(vector);assert.equal(f.family,'vector');assert.equal(f.unit,'m/s');assert.equal(f.observations.length,3);
  assert.deepEqual(point(f,'east').vector,{dx:3,dy:0});assert.equal(point(f,'east').value,3);assert.equal(point(f,'east').xValue,2);assert.equal(point(f,'east').yValue,2);assert.equal(point(f,'zero').value,0);assert.equal(point(f,'missing'),undefined);
});
check('Vector glyphs point east and north without joining separate observations',()=>{
  const f=frame(vector),path=f.series[0].commands;
  assert.equal(path[0].kind,'M');assert.equal(path[1].kind,'L');assert.ok(path[1].x>path[0].x);close(path[1].y,path[0].y);
  assert.equal(path[2].kind,'M');assert.ok(path[3].y<path[2].y);close(path[3].x,path[2].x);
  const lengths=[Math.hypot(path[1].x-path[0].x,path[1].y-path[0].y),Math.hypot(path[3].x-path[2].x,path[3].y-path[2].y)];close(lengths[0]/lengths[1],3/4);
  assert.equal(f.series[0].areaCommands.filter(c=>c.kind==='Z').length,2);
});
check('Reversed numeric axes invert the corresponding vector component',()=>{
  const f=frame({...vector,axes:{x:{...vector.axes.x,reversed:true},y:{...vector.axes.y,reversed:true}}}),p=f.series[0].commands;
  assert.ok(p[1].x<p[0].x);assert.ok(p[3].y>p[2].y);assert.equal(point(f,'east').value,3);
});
check('Wind uses original metres per second and meteorological direction from north',()=>{
  const f=frame(wind),p=f.series[0].commands;
  assert.equal(f.unit,'m/s');assert.equal(f.observations.length,4);assert.equal(point(f,'north').value,10);assert.deepEqual(point(f,'north').wind,{direction:0});
  assert.equal(p[0].kind,'M');assert.equal(p[1].kind,'L');close(p[0].x,p[1].x);assert.ok(p[1].y<p[0].y);assert.equal(point(f,'unknown').wind.direction,null);
});
check('Wind flags encode fifty knots, full and half barbs encode ten and five knots',()=>{
  for(const [knots,closed,lines] of [[50,1,2],[10,0,4],[5,0,4],[0,0,1]]){
    const f=frame(single(wind,{id:'one',x:5,value:knots*1852/3600,direction:0})),s=f.series[0];
    assert.equal(s.areaCommands.filter(c=>c.kind==='Z').length,closed);assert.equal(s.commands.length,knots===0?3:lines);
    assert.equal(f.observations[0].value,knots*1852/3600);
  }
});
check('Unknown wind direction is distinct from calm and retains known speed',()=>{
  const unknown=frame(single(wind,{id:'one',x:5,value:4,direction:null}));assert.equal(unknown.series[0].commands.at(-1).kind,'Z');assert.equal(unknown.observations[0].value,4);
  const calm=frame(single(wind,{id:'one',x:5,value:0,direction:null}));assert.equal(calm.series[0].commands[1].kind,'A');assert.equal(calm.observations[0].value,0);
});
check('Missing coordinates and values omit marks without converting missingness to zero',()=>{
  for(const data of [single(vector,{id:'one',x:null,y:1,dx:2,dy:3}),single(vector,{id:'one',x:1,y:null,dx:2,dy:3}),single(wind,{id:'one',x:1,value:null,direction:0})])assert.equal(planChart(data,options).status,'empty');
});
check('Directional input rejects invalid components, positions, speeds, angles and unknown properties',()=>{
  for(const patch of [{dx:null,dy:2},{dx:Infinity},{dx:undefined},{y:'bad'},{x:NaN},{z:1}])invalid(single(vector,{...vector.series[0].data[0],...patch}));
  for(const patch of [{value:-1},{value:150.1},{value:Infinity},{direction:360},{direction:-1},{direction:undefined},{y:1}])invalid(single(wind,{...wind.series[0].data[0],...patch}));
  invalid({...vector,unit:42});invalid({...vector,unit:'x'.repeat(33)});
});
check('Duplicate identities and unknown visibility are rejected by shared validation',()=>{
  invalid({...vector,series:[vector.series[0],vector.series[0]]});invalid({...vector,series:[{...vector.series[0],data:[vector.series[0].data[0],vector.series[0].data[0]]}]});invalid(vector,{...options,hiddenSeriesIds:['missing']});
});
check('Legend visibility affects glyphs, magnitude scale and empty state consistently',()=>{
  const two={...vector,series:[vector.series[0],{id:'other',name:'Other',data:[{id:'large',x:5,y:5,dx:30,dy:40}]}]};
  const f=frame(two,{...options,hiddenSeriesIds:['other']});assert.equal(f.series.length,1);assert.equal(f.legend.find(l=>l.id==='other').visible,false);assert.equal(f.series[0].commands[3].y-f.series[0].commands[2].y,-28);
  assert.equal(planChart(vector,{...options,hiddenSeriesIds:['field']}).status,'empty');
});
check('Numeric zoom and pan reuse semantic windows and retain original metadata',()=>{
  for(const data of [vector,wind]){
    const f=frame(data,{...options,viewport:{axes:'x'}});assert.ok(f.viewport);const changed=transformPlanViewport(f.viewport,{kind:'zoom',factor:2});assert.notEqual(changed.status,'invalid');
    const zoomed=frame(data,{...options,viewport:{axes:'x',value:changed.value}});for(const o of zoomed.observations){const original=point(f,o.id.pointId);assert.equal(o.value,original.value);assert.deepEqual(o.vector??o.wind,original.vector??original.wind);}
  }
});
check('Numeric reference lines project on the same domains',()=>{
  for(const data of [vector,wind]){const f=frame(data,{...options,references:[{id:'x',axis:'x',value:5},{id:'y',axis:'y',value:5}]});assert.equal(f.references.length,2);assert.equal(f.references[0].id,'x');}
});
check('Every glyph endpoint fits small, phone and tablet frames for all wind directions',()=>{
  for(const size of [64,320,768])for(let direction=0;direction<360;direction+=15){
    const f=frame(single(wind,{id:'edge',x:0,value:150,direction}),{width:size,height:size});
    for(const c of [...f.series[0].commands,...f.series[0].areaCommands])if('x' in c){assert.ok(c.x>=0&&c.x<=size,`x ${c.x}`);assert.ok(c.y>=0&&c.y<=size,`y ${c.y}`);}
  }
});
check('Source, accessor and geometry budgets are finite before projection',()=>{
  for(const data of [vector,wind]){const tooMany={...data,series:[{...data.series[0],data:Array.from({length:2049},(_,i)=>({...data.series[0].data[0],id:String(i)}))}]};invalid(tooMany);}
  let read=false;const unsafe={...vector};Object.defineProperty(unsafe,'title',{enumerable:true,get(){read=true;return 'bad';}});invalid(unsafe);assert.equal(read,false);
  const dense=frame({...wind,series:[{...wind.series[0],data:Array.from({length:2048},(_,i)=>({id:String(i),x:i/2048*10,value:150,direction:i%360}))}]});assert.equal(dense.observations.length,2048);assert.ok(dense.series[0].commands.length+dense.series[0].areaCommands.length<100000);
});
check('Input mutation cannot alter immutable directional metadata and geometry',()=>{
  for(const data of [vector,wind]){const source=structuredClone(data),snapshot=structuredClone(source),f=frame(source);assert.deepEqual(source,snapshot);assert.equal(Object.isFrozen(source),false);assert.equal(Object.isFrozen(f),true);assert.equal(Object.isFrozen(f.observations[0].vector??f.observations[0].wind),true);}
});

writeFileSync(new URL('../../work/reports/core-plan-directional-current.json',import.meta.url),JSON.stringify({status:'passed',checks,semantics:'Vector components retain independent source position and derived magnitude; wind direction is meteorological from north and raw speed remains m/s. Static bounded glyphs; existing numeric projection/viewport owners reused.'},null,2)+'\n');
console.log(`PASS ${checks.length} directional Core contract checks`);
