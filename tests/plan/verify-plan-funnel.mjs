import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const source={family:'funnel',title:'Conversion',description:'Section heights show shares, not polygon areas.',data:[{id:'visits',label:'Visits',value:6},{id:'qualified',label:'Qualified',value:3},{id:'orders',label:'Orders',value:1}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec=source,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);}
function bounds(vertices){return {left:Math.min(...vertices.map(v=>v.x)),right:Math.max(...vertices.map(v=>v.x)),top:Math.min(...vertices.map(v=>v.y)),bottom:Math.max(...vertices.map(v=>v.y))};}
function inside(vertices,x,y){let found=false;for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){const a=vertices[i],b=vertices[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)found=!found;}return found;}
function polygonArea(vertices){let result=0;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];result+=a.x*b.y-b.x*a.y;}return Math.abs(result)/2;}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}

check('source order, original values and visible percentages drive proportional section HEIGHTS',()=>{
  const f=frame();assert.equal(f.family,'funnel');assert.deepEqual(f.observations.map(o=>o.id),source.data.map(p=>({seriesId:p.id,pointId:p.id})));
  assert.deepEqual(f.observations.map(o=>o.value),[6,3,1]);assert.deepEqual(f.observations.map(o=>o.percentage),[60,30,10]);
  assert.deepEqual(f.legend.map(l=>l.id),source.data.map(p=>p.id));
  for(const o of f.observations){const b=bounds(o.hit.vertices);close((b.bottom-b.top)/(options.height-28),o.value/10);}
  const first=f.observations[0].hit.vertices;close(bounds(first).left,16);close(bounds(first).right,304);
  assert.notEqual(polygonArea(first)/polygonArea(f.observations[1].hit.vertices),2,'area is deliberately not the value encoding');
});
check('a neck-crossing section has six exact drawing/hit vertices and no rectangular corner target',()=>{
  const f=frame(),o=f.observations[1],vertices=o.hit.vertices;
  assert.equal(o.hit.kind,'polygon');assert.equal(vertices.length,6);assert.equal(f.series[1].commands.at(-1).kind,'Z');
  assert.deepEqual(f.series[1].commands.slice(0,-1).map(({x,y})=>({x,y})),vertices);
  const neckY=14+(options.height-28)*.75;assert.equal(vertices.filter(v=>v.y===neckY).length,2);
  const neckLeft=160-(options.width-32)*.3/2;close(vertices.find(v=>v.y===neckY).x,neckLeft);
  const b=bounds(vertices);assert.equal(inside(vertices,b.left+1,b.bottom-1),false);assert.equal(inside(vertices,o.x,o.y),true);
  const bottom=bounds(f.observations[2].hit.vertices);close(bottom.right-bottom.left,(options.width-32)*.3);
});
check('reversal reflects the funnel envelope while stage order and heights remain stable',()=>{
  const normal=frame(),reversed=frame({...source,reversed:true});
  assert.deepEqual(reversed.observations.map(o=>o.id),normal.observations.map(o=>o.id));
  for(let i=0;i<normal.observations.length;i++){close(reversed.observations[i].y,normal.observations[i].y);close(reversed.observations[i].percentage,normal.observations[i].percentage);}
  const topVertices=reversed.observations[0].hit.vertices,top=bounds(topVertices).top;
  const topXs=topVertices.filter(v=>v.y===top).map(v=>v.x);close(Math.max(...topXs)-Math.min(...topXs),(options.width-32)*.3);
  const bottom=bounds(reversed.observations.at(-1).hit.vertices);close(bottom.right-bottom.left,options.width-32);
  assert.equal(topVertices.length,6,'reversed neck crossing stays explicit');
});
check('pyramid defaults to an upper apex and supports the opposite orientation without a neck',()=>{
  const pyramid={family:'pyramid',title:'Hierarchy',data:source.data},f=frame(pyramid),first=f.observations[0].hit.vertices;
  assert.equal(f.family,'pyramid');assert.equal(first.length,3);assert.deepEqual(first.filter(v=>v.y===14),[{x:160,y:14}]);
  const bottom=bounds(f.observations.at(-1).hit.vertices);close(bottom.right-bottom.left,288);
  const inverted=frame({...pyramid,reversed:false});assert.equal(inverted.observations.at(-1).hit.vertices.length,3);
  for(const o of f.observations)assert.ok(o.hit.vertices.length<=4);
  assert.equal(planChart({...pyramid,neckWidth:0},options).status,'invalid');assert.equal(planChart({...pyramid,neckHeight:0},options).status,'invalid');
});
check('zero and all-zero stages retain identity and percentage semantics without invisible hits',()=>{
  const data=[{id:'zero',label:'Zero',value:0},...source.data,{id:'last-zero',label:'Last zero',value:0}],f=frame({...source,data});
  for(const id of ['zero','last-zero']){const i=f.observations.findIndex(o=>o.id.pointId===id);assert.equal(f.observations[i].value,0);assert.equal(f.observations[i].percentage,0);assert.equal(f.observations[i].hit,undefined);assert.deepEqual(f.series[i].commands,[]);}
  const allZero=frame({...source,data:source.data.map(p=>({...p,value:0}))});assert.equal(allZero.observations.length,3);assert.ok(allZero.observations.every(o=>o.value===0&&o.hit===undefined&&!Object.hasOwn(o,'percentage')));assert.ok(allZero.series.every(s=>s.commands.length===0));
  const empty=planChart({...source,data:[]},options);assert.equal(empty.status,'empty');assert.deepEqual(empty.frame.observations,[]);
});
check('hiding stages reflows visible shares while stable colors, legend and restore are preserved',()=>{
  const before=frame(),hidden=frame(source,{...options,hiddenSeriesIds:['visits']}),restored=frame();
  assert.deepEqual(hidden.observations.map(o=>o.id.pointId),['qualified','orders']);assert.deepEqual(hidden.observations.map(o=>o.percentage),[75,25]);
  assert.equal(hidden.legend[0].visible,false);assert.equal(hidden.legend.length,3);assert.equal(hidden.series[0].color,before.series[1].color);
  close(bounds(hidden.observations[0].hit.vertices).top,14);close(bounds(hidden.observations[0].hit.vertices).bottom,218);
  assert.deepEqual(restored,before);
  const all=planChart(source,{...options,hiddenSeriesIds:source.data.map(p=>p.id)});assert.equal(all.status,'empty');assert.equal(all.frame.legend.length,3);assert.ok(all.frame.legend.every(l=>!l.visible));
  for(const hiddenSeriesIds of [['missing'],['visits','visits']])assert.equal(planChart(source,{...options,hiddenSeriesIds}).status,'invalid');
});
check('huge finite and subnormal values never overflow; hidden huge stages release the tiny stage',()=>{
  const data=[{id:'huge-a',label:'Huge A',value:Number.MAX_VALUE},{id:'huge-b',label:'Huge B',value:Number.MAX_VALUE},{id:'tiny',label:'Tiny',value:Number.MIN_VALUE}],f=frame({...source,data});
  assert.deepEqual(f.observations.map(o=>o.value),data.map(p=>p.value));assert.deepEqual(f.observations.map(o=>o.percentage),[50,50,0]);assert.equal(f.observations[2].hit,undefined);
  const numbers=JSON.stringify(f);assert.ok(!numbers.includes('null'),'no nonfinite coordinates/percentages are serialized');
  const tiny=frame({...source,data},{...options,hiddenSeriesIds:['huge-a','huge-b']});assert.equal(tiny.observations[0].value,Number.MIN_VALUE);assert.equal(tiny.observations[0].percentage,100);assert.ok(tiny.observations[0].hit);
});
check('all neck fraction boundaries have defined geometry and zero-width regions remain untargetable',()=>{
  for(const neckWidth of [0,.3,1])for(const neckHeight of [0,.25,1])for(const reversed of [false,true]){
    const f=frame({...source,neckWidth,neckHeight,reversed});
    for(const o of f.observations)if(o.hit){assert.ok(o.hit.vertices.length>=3&&o.hit.vertices.length<=6);assert.ok(polygonArea(o.hit.vertices)>0);}
    if(neckWidth===0&&neckHeight===1)assert.ok(f.observations.every(o=>!o.hit));
    if(neckWidth===1)for(const o of f.observations)close(bounds(o.hit.vertices).right-bounds(o.hit.vertices).left,288);
  }
  const f=frame({...source,neckWidth:0,neckHeight:.75});assert.equal(f.observations[0].hit.vertices.length,3);assert.ok(f.observations.slice(1).every(o=>!o.hit));
});
check('phone, tablet, short and tall sizes keep every polygon and anchor within the frame',()=>{
  for(const [width,height]of [[64,64],[390,220],[220,1000],[1024,768],[10000,10000]])for(const family of ['funnel','pyramid']){
    const f=frame({...source,family},{width,height});
    for(const o of f.observations){assert.ok(Number.isFinite(o.x)&&Number.isFinite(o.y));assert.ok(o.x>=0&&o.x<=width&&o.y>=0&&o.y<=height);for(const v of o.hit?.vertices??[])assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=width&&v.y>=0&&v.y<=height);}
  }
});
check('the full sixteen-stage contract preserves every identity and contiguous allocation',()=>{
  const data=Array.from({length:16},(_,i)=>({id:'stage-'+i,label:'Stage '+i,value:i+1})),f=frame({...source,data});
  assert.equal(f.observations.length,16);assert.equal(f.series.length,16);assert.equal(f.legend.length,16);
  close(f.observations.reduce((sum,o)=>sum+o.percentage,0),100);
  for(const [i,o]of f.observations.entries()){
    assert.equal(o.id.pointId,data[i].id);assert.ok(o.hit.vertices.length<=6);assert.ok(inside(o.hit.vertices,o.x,o.y));
    const b=bounds(o.hit.vertices);close((b.bottom-b.top)/272,(i+1)/136);
    if(i)close(b.top,bounds(f.observations[i-1].hit.vertices).bottom);
  }
});
check('valid results own frozen nested arrays and never freeze or mutate caller input',()=>{
  const original=structuredClone(source);original.data[0].color='#AbC';const snapshot=structuredClone(original),result=planChart(original,options);
  assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(original,snapshot);assert.ok(!Object.isFrozen(original));assert.ok(!Object.isFrozen(original.data));
  original.data[0].value=999;original.data[0].label='Changed';assert.equal(result.frame.observations[0].value,6);assert.equal(result.frame.observations[0].label,'Visits');assert.equal(result.frame.legend[0].color,'#abc');
});
check('complete bounded values, unique IDs, descriptor-safe JSON and known fields are required',()=>{
  const malformed=[null,undefined,NaN,Infinity,-Infinity,-1,'2'].map(value=>({...source,data:[{id:'a',label:'A',value}]}));
  malformed.push({...source,data:[source.data[0],source.data[0]]},{...source,data:Array.from({length:17},(_,i)=>({id:String(i),label:'Stage',value:1}))},{...source,data:[{id:'x',label:'X',value:1,unknown:true}]},{...source,unknown:true},{...source,data:[{id:'x',label:'X',value:1,color:'red'}]},{...source,reversed:1},{...source,title:''});
  for(const neckWidth of [NaN,Infinity,-.1,1.1,null,'30%'])malformed.push({...source,neckWidth});
  for(const neckHeight of [NaN,Infinity,-.1,1.1,null,'25%'])malformed.push({...source,neckHeight});
  for(const spec of malformed)assert.equal(planChart(spec,options).status,'invalid');
  let reads=0;const getter={...source,data:[{id:'x',label:'X',get value(){reads++;return 1;}}]};assert.equal(planChart(getter,options).status,'invalid');assert.equal(reads,0);
  const sparse={...source,data:new Array(2)};assert.equal(planChart(sparse,options).status,'invalid');
});
check('unsupported options and invalid viewports fail explicitly for both owners',()=>{
  for(const family of ['funnel','pyramid'])for(const patch of [{stacking:'sum'},{viewport:{axes:'x'}},{references:[{id:'r',axis:'y',value:1}]},{width:0},{height:Infinity},{width:10001},{unknown:true}])assert.equal(planChart({...source,family},{...options,...patch}).status,'invalid');
});

writeFileSync(new URL('../../work/reports/core-plan-funnel-current.json',import.meta.url),JSON.stringify({status:'passed',checks,encoding:'Section height is proportional to visible values; polygon area is not the encoding.',zero:'Visible zeros remain semantic observations without hit polygons; percentage is 0 with a positive visible total and omitted with an all-zero total.'},null,2)+'\n');
console.log(`PASS ${checks.length} funnel/pyramid Core contract checks`);
