import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const root=path.resolve(import.meta.dirname,'../..');
for(const name of ['window','document','HTMLElement','ResizeObserver','requestAnimationFrame'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('Unexpected host access: '+name);}});
const {planChart}=await import(pathToFileURL(path.join(root,'dist/plan.js')).href);
const checks=[];
function check(name,run){run();checks.push(name);console.log('PASS '+name);}
function planned(spec,options={}){const result=planChart(spec,{width:400,height:300,...options});assert.notEqual(result.status,'invalid',JSON.stringify(result.diagnostic));return result.frame;}
function invalid(spec,options){const result=planChart(spec,{width:400,height:300,...options});assert.equal(result.status,'invalid');return result.diagnostic;}
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const reference=(frame,id)=>{const found=frame.references?.find(item=>item.id===id);assert(found);return found;};
const numberLine={family:'line',title:'Numeric references',axes:{x:{type:'linear',domain:[0,100]},y:{type:'linear',domain:[0,100]}},series:[{id:'s',name:'Series',data:[{id:'start',x:0,y:0},{id:'middle',x:50,y:25},{id:'end',x:100,y:100}]}]};
const categories=['a','b','c','d'].map(id=>({id,label:'Same label'}));
const categoryLine={...numberLine,title:'Category references',axes:{x:{type:'category',values:categories},y:{type:'linear',domain:[0,100]}},series:[{id:'s',name:'Series',data:categories.map((category,index)=>({id:'point-'+category.id,x:category.id,y:20+index*10}))}]};
const column={family:'column',title:'Primitive IDs',axes:{x:{type:'category',values:[{id:'a'},{id:'b'}]},y:{type:'linear'}},series:[{id:'first',name:'First',data:[{id:'first-b',x:'b',y:20},{id:'first-a',x:'a',y:10}]},{id:'second',name:'Second',data:[{id:'second-a',x:'a',y:30},{id:'second-b',x:'b',y:40}]}]};
const bubbles={family:'bubble',title:'Coincident bubbles',axes:{x:{type:'linear',domain:[0,100]},y:{type:'linear',domain:[0,100]}},series:[{id:'s',name:'Series',data:[{id:'large',x:50,y:50,z:40},{id:'small',x:50,y:50,z:10},{id:'zero',x:80,y:20,z:0},{id:'missing',x:null,y:40,z:30}]}]};

check('numeric references align with existing point maps and do not expand domains',()=>{
  const base=planned(numberLine),frame=planned(numberLine,{references:[{id:'x',axis:'x',value:50},{id:'y',axis:'y',value:25},{id:'outside',axis:'x',value:101},{id:'lower',axis:'y',value:-1}]});
  const point=frame.observations.find(item=>item.id.pointId==='middle');close(reference(frame,'x').line.x1,point.x);close(reference(frame,'x').line.x2,point.x);close(reference(frame,'y').line.y1,point.y);
  assert.equal(reference(frame,'outside').status,'outside');assert(!Object.hasOwn(reference(frame,'outside'),'line'));assert.equal(reference(frame,'lower').status,'outside');
  assert.deepEqual({...frame,references:undefined},{...base,references:undefined});assert(Object.isFrozen(frame.references));assert(Object.isFrozen(reference(frame,'x').line));
});
check('line Y inversion reuses its projected coordinate',()=>{
  const spec={...numberLine,axes:{...numberLine.axes,y:{...numberLine.axes.y,reversed:true}}};
  const normal=planned(numberLine,{references:[{id:'r',axis:'y',value:25}]}),frame=planned(spec,{references:[{id:'r',axis:'y',value:25}]});
  close(reference(frame,'r').line.y1,frame.observations.find(item=>item.id.pointId==='middle').y);assert(reference(frame,'r').line.y1<reference(normal,'r').line.y1);
});
check('numeric viewport uses displayed bounds and outside states before clamped projection',()=>{
  const frame=planned(numberLine,{viewport:{axes:'xy',value:{x:[25,75],y:[10,40]}},references:[{id:'in',axis:'x',value:50},{id:'out-x',axis:'x',value:0},{id:'out-y',axis:'y',value:100}]});
  close(reference(frame,'in').line.x1,frame.observations.find(item=>item.id.pointId==='middle').x);assert.equal(reference(frame,'out-x').status,'outside');assert.equal(reference(frame,'out-y').status,'outside');
});
check('known domains remain available when a viewport contains no point target',()=>{
  const line={...numberLine,series:[{...numberLine.series[0],data:[numberLine.series[0].data[0],numberLine.series[0].data[2]]}]};
  const frame=planned(line,{viewport:{axes:'x',value:{x:[25,75]}},references:[{id:'in',axis:'x',value:50},{id:'out',axis:'x',value:0}]});
  assert.equal(frame.observations.length,0);assert.equal(reference(frame,'in').status,'visible');assert.equal(reference(frame,'out').status,'outside');
});
check('category references use IDs and current window, never duplicate labels',()=>{
  const frame=planned(categoryLine,{viewport:{axes:'x',value:{x:{firstId:'b',lastId:'c'}}},references:[{id:'first',axis:'x',value:'a'},{id:'shown',axis:'x',value:'b'}]});
  assert.equal(reference(frame,'first').status,'outside');close(reference(frame,'shown').line.x1,frame.observations.find(item=>item.id.pointId==='point-b').x);
  invalid(categoryLine,{references:[{id:'bad',axis:'x',value:'unknown'}]});invalid(categoryLine,{references:[{id:'bad',axis:'x',value:0}]});
});
check('time references use exact UTC data coordinates',()=>{
  const start=Date.UTC(2026,0,1),middle=Date.UTC(2026,0,2),end=Date.UTC(2026,0,3);
  const spec={...numberLine,axes:{x:{type:'time',domain:[start,end]},y:numberLine.axes.y},series:[{id:'s',name:'Series',data:[{id:'a',x:start,y:0},{id:'b',x:middle,y:25},{id:'c',x:end,y:100}]}]};
  const frame=planned(spec,{references:[{id:'utc',axis:'x',value:middle},{id:'early',axis:'x',value:start-1}]});
  close(reference(frame,'utc').line.x1,frame.observations.find(item=>item.id.pointId==='b').x);assert.equal(reference(frame,'early').status,'outside');
});
check('grouped, summed and percent references preserve semantic Y across both orientations and inversion',()=>{
  for(const orientation of ['vertical','horizontal'])for(const reversed of [false,true])for(const stacking of [undefined,'sum','percent']){
    const spec={...column,orientation,axes:{...column.axes,y:{type:'linear',reversed}}},value=stacking==='percent'?25:10;
    const options={...(stacking?{stacking}:{}),references:[{id:'threshold',axis:'y',value},{id:'out',axis:'y',value:10000}]};
    const frame=planned(spec,options),point=frame.observations.find(item=>item.id.seriesId==='first'&&item.id.pointId==='first-a'),line=reference(frame,'threshold').line;
    if(orientation==='vertical'){close(line.y1,point.y);close(line.y2,point.y);assert(line.x2>line.x1);}else{close(line.x1,point.x);close(line.x2,point.x);assert(line.y2>line.y1);}
    assert.equal(reference(frame,'out').status,'outside');invalid(spec,{references:[{id:'category',axis:'x',value:'a'}]});
  }
});
check('bar Y windows compare references in the displayed semantic value scale',()=>{
  const frame=planned({...column,orientation:'horizontal'},{viewport:{axes:'y',value:{y:[10,20]}},references:[{id:'in',axis:'y',value:15},{id:'out',axis:'y',value:30}]});
  assert.equal(reference(frame,'in').status,'visible');assert.equal(reference(frame,'out').status,'outside');
});
check('bar primitive IDs remain real after input reorder, category filtering and hidden series',()=>{
  for(const stacking of [undefined,'sum','percent']){
    const spec={...column,series:[...column.series].reverse()},frame=planned(spec,{...(stacking?{stacking}:{}),hiddenSeriesIds:['second'],viewport:{axes:'x',value:{x:{firstId:'a',lastId:'a'}}}});
    assert.equal(frame.series.length,1);assert.equal(frame.series[0].id,'first');assert.deepEqual(frame.series[0].bars.map(bar=>bar.pointId),['first-a']);
    for(const series of frame.series)for(const bar of series.bars)assert(frame.observations.some(point=>point.id.seriesId===series.id&&point.id.pointId===bar.pointId));
  }
});
check('coincident bubble primitive IDs are not paired by coordinates or array index',()=>{
  for(const points of [bubbles.series[0].data,[...bubbles.series[0].data].reverse()]){
    const frame=planned({...bubbles,series:[{...bubbles.series[0],data:points}]},{references:[{id:'x',axis:'x',value:50},{id:'y',axis:'y',value:50}]});
    const circles=new Map(frame.series[0].circles.map(circle=>[circle.pointId,circle]));assert.deepEqual([...circles.keys()].sort(),['large','small','zero']);
    close(circles.get('large').cx,circles.get('small').cx);close(circles.get('large').cy,circles.get('small').cy);assert(circles.get('large').radius>circles.get('small').radius);assert.equal(circles.get('zero').radius,0);
    for(const point of frame.observations)close(circles.get(point.id.pointId).radius,point.hit.radius);
    close(reference(frame,'x').line.x1,circles.get('large').cx);close(reference(frame,'y').line.y1,circles.get('large').cy);
  }
});
check('bubble reversal and numeric windows use the existing scale and mark outside values',()=>{
  const spec={...bubbles,axes:{x:{...bubbles.axes.x,reversed:true},y:{...bubbles.axes.y,reversed:true}}};
  const frame=planned(spec,{viewport:{axes:'xy',value:{x:[40,90],y:[10,60]}},references:[{id:'x',axis:'x',value:50},{id:'y',axis:'y',value:50},{id:'out',axis:'x',value:10}]});
  const point=frame.observations.find(item=>item.id.pointId==='large');close(reference(frame,'x').line.x1,point.x);close(reference(frame,'y').line.y1,point.y);assert.equal(reference(frame,'out').status,'outside');
});
check('empty data and all-hidden data return unavailable without invented lines',()=>{
  for(const spec of [numberLine,categoryLine,column,bubbles]){
    for(const empty of [true,false]){
      const input=empty?{...spec,series:spec.series.map(series=>({...series,data:[]}))}:spec;
      const frame=planned(input,{...(empty?{}:{hiddenSeriesIds:spec.series.map(series=>series.id)}),references:[{id:'r',axis:'y',value:10}]});
      assert.equal(reference(frame,'r').status,'unavailable');assert(!Object.hasOwn(reference(frame,'r'),'line'));
    }
  }
});
check('complete percent zero is 0%, while a zero-total category has no percentage or invented rectangle',()=>{
  const spec={...column,series:[{id:'zero',name:'Zero',data:[{id:'z-a',x:'a',y:0},{id:'z-b',x:'b',y:0}]},{id:'value',name:'Value',data:[{id:'v-a',x:'a',y:20},{id:'v-b',x:'b',y:0}]}]};
  const frame=planned(spec,{stacking:'percent',references:[{id:'baseline',axis:'y',value:0}]});
  assert.equal(frame.observations.find(point=>point.id.pointId==='z-a').percentage,0);assert.equal(frame.observations.find(point=>point.id.pointId==='v-a').percentage,100);
  for(const point of frame.observations.filter(point=>point.id.pointId.endsWith('-b'))){assert.equal(point.value,0);assert.equal(point.percentage,undefined);}
  assert(!frame.series.some(series=>series.bars.some(bar=>bar.pointId.endsWith('-b'))));assert.equal(reference(frame,'baseline').status,'visible');
});
check('incomplete displayed percent categories are diagnosed instead of losing known values',()=>{
  const missing={...column,series:[...column.series,{id:'missing',name:'Missing',data:[{id:'m-a',x:'a',y:null},{id:'m-b',x:'b',y:20}]}]};
  const diagnostic=invalid(missing,{stacking:'percent'});assert.equal(diagnostic.reason,'INCOMPLETE_PERCENT_CATEGORY');assert.match(diagnostic.message,/null|missing/);
  planned(missing,{stacking:'sum'});planned(missing,{stacking:'percent',hiddenSeriesIds:['missing']});
  planned(missing,{stacking:'percent',viewport:{axes:'x',value:{x:{firstId:'b',lastId:'b'}}}});
});
check('reference schema enforces bounds, unique IDs, semantics, finite values and radial rejection',()=>{
  for(const references of [null,{},Array.from({length:17},(_,i)=>({id:String(i),axis:'y',value:i})),[{id:'',axis:'y',value:0}],[{id:'x'.repeat(65),axis:'y',value:0}],[{id:'r',axis:'y',value:0},{id:'r',axis:'y',value:1}],[{id:'r',axis:'z',value:1}],[{id:'r',axis:'y',value:'1'}],[{id:'r',axis:'x',value:'50'}],[{id:'r',axis:'y',value:NaN}],[{id:'r',axis:'y',value:Infinity}],[{id:'r',axis:'y',value:1,color:'#123456'}]])invalid(numberLine,{references});
  for(const spec of [{family:'pie',title:'Pie',data:[{id:'a',label:'A',value:1}]},{family:'donut',title:'Donut',data:[{id:'a',label:'A',value:1}]},{family:'gauge',title:'Gauge',value:1,domain:[0,2]}])invalid(spec,{references:[]});
  let reads=0;const refs=[];Object.defineProperty(refs,'0',{enumerable:true,get(){reads++;return {id:'r',axis:'y',value:1};}});invalid(numberLine,{references:refs});assert.equal(reads,0);
});
fs.writeFileSync(path.join(root,'work/reports/core-plan-references-current.json'),JSON.stringify({date:new Date().toISOString(),status:'passed',checks,domFree:true,source:'isolated staged public Core entry',published:false,installedArtifactChanged:false},null,2));
