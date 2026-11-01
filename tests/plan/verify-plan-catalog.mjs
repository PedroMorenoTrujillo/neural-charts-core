import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {planChart}=await import(pathToFileURL(path.resolve('dist/plan.js')));
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const line=family=>({family,title:'Measured data',axes:{x:{kind:'linear'},y:{kind:'linear'}},series:[{id:'s',name:'Long source name',data:[{id:'a',x:0,y:2},{id:'b',x:1,y:7},{id:'gap',x:2,y:null},{id:'c',x:3,y:-2},{id:'d',x:4,y:4}]}]});
const options={width:390,height:300};
for(const family of ['area','spline','scatter']){
  const spec=line(family),result=planChart(spec,options);
  check(family+' raw values, negative, gaps and identities',()=>{assert.equal(result.status,'ok');assert.equal(result.frame.family,family);assert.deepEqual(result.frame.observations.map(p=>p.id.pointId),['a','b','c','d']);assert.deepEqual(result.frame.observations.map(p=>p.value),[2,7,-2,4]);assert.equal(result.frame.series.length,1);});
  check(family+' hidden/empty',()=>{const hidden=planChart(spec,{...options,hiddenSeriesIds:['s']});assert.equal(hidden.status,'empty');assert.equal(hidden.frame.legend[0].visible,false);assert.equal(hidden.frame.observations.length,0);});
  check(family+' references and zoom',()=>{const view=planChart(spec,{...options,viewport:{axes:'xy',value:{x:[0,1]}},references:[{id:'mean',axis:'y',value:3}]});assert.equal(view.status,'ok');assert(view.frame.viewport);assert.equal(view.frame.references[0].status,'visible');assert(view.frame.observations.every(p=>p.id.pointId==='a'||p.id.pointId==='b'));});
  check(family+' invalid duplicates',()=>{assert.equal(planChart({...spec,series:[{...spec.series[0],data:[{id:'a',x:0,y:1},{id:'a',x:2,y:2}]}]},options).status,'invalid');});
  if(family==='area')check('area uses zero baseline and separate fill runs',()=>{assert(result.frame.grid.some(t=>t.label==='0'));const commands=result.frame.series[0].areaCommands;assert.equal(commands.filter(c=>c.kind==='Z').length,2);assert(result.frame.series[0].commands.length);});
  if(family==='spline')check('spline preserves gap and uses curved geometry',()=>{const dense={...spec,series:[{...spec.series[0],data:[{id:'a',x:0,y:0},{id:'b',x:1,y:10},{id:'c',x:2,y:5},{id:'d',x:3,y:8}]}]};const smooth=planChart(dense,options),straight=planChart({...dense,family:'line'},options);assert.equal(smooth.status,'ok');assert(smooth.frame.series[0].commands.length>straight.frame.series[0].commands.length);assert.equal(result.frame.series[0].commands.filter(c=>c.kind==='M').length,2);});
  if(family==='scatter')check('scatter fixed owner markers, no fake bubble size',()=>{assert.equal(result.frame.series[0].circles.length,4);assert(result.frame.series[0].circles.every(c=>c.radius===3));assert(result.frame.observations.every(p=>!Object.hasOwn(p,'sizeValue')&&Number.isFinite(p.xValue)));});
}
check('area rejects nonzero-only scale',()=>assert.equal(planChart({...line('area'),axes:{x:{kind:'linear'},y:{kind:'linear',includeZero:false}}},options).status,'invalid'));
check('spline rejects competing curve option',()=>assert.equal(planChart({...line('spline'),series:[{...line('spline').series[0],curve:'step'}]},options).status,'invalid'));
writeFileSync('work/reports/core-plan-catalog-current.json',JSON.stringify({date:new Date().toISOString(),status:'passed',checks,source:'staged public Core plan entry',newMathematics:false,published:false},null,2));
console.log('PASS '+checks.length+' new catalog public Core checks.');
