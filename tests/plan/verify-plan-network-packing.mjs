import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart,transformPlanViewport} from '../../dist/plan.js';

const options={width:320,height:300};
const network={family:'networkgraph',title:'Undirected observed relationships',groups:[{id:'one',label:'One'},{id:'two',label:'Two'}],nodes:[{id:'a',label:'Alpha',groupId:'one'},{id:'b',label:'Beta',groupId:'one'},{id:'c',label:'Gamma',groupId:'two'},{id:'isolated',label:'Isolated',groupId:'two'}],links:[{id:'ab',from:'a',to:'b'},{id:'bc',from:'b',to:'c'},{id:'ca',from:'c',to:'a'}]};
const packed={family:'packedbubble',title:'Observed amounts',series:[{id:'a',name:'A',data:[{id:'one',label:'One',value:1},{id:'four',label:'Four',value:4},{id:'zero',label:'Zero',value:0},{id:'missing',label:'Missing',value:null}]},{id:'b',name:'B',data:[{id:'sixteen',label:'Sixteen',value:16}]}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected,tolerance=1e-8){assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);}
function byId(f,id){return f.observations.find(o=>o.id.pointId===id);}
function circles(f){return f.series.flatMap(s=>(s.circles??[]).map(c=>({...c,seriesId:s.id})));}
function circle(f,series,id){return circles(f).find(c=>c.seriesId===series&&c.pointId===id);}
function nonoverlap(items){for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)assert.ok(Math.hypot(items[i].cx-items[j].cx,items[i].cy-items[j].cy)+1e-8>=items[i].radius+items[j].radius,`${items[i].pointId}/${items[j].pointId} overlap`);}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}

check('network cycles are valid and source-node metrics are explicit exact undirected degree',()=>{
  const f=frame(network);assert.equal(f.family,'networkgraph');assert.equal(f.unit,'Connections');assert.deepEqual(f.observations.map(o=>o.id.pointId),network.nodes.map(n=>n.id));assert.equal(circles(f).length,4);assert.equal(f.series[0].id,'links');assert.ok(!f.legend.some(g=>g.id==='links'));
  for(const id of ['a','b','c']){const o=byId(f,id);assert.equal(o.value,2);assert.deepEqual(o.node,{incoming:1,outgoing:1,directed:false});assert.equal(Object.hasOwn(o.node,'depth'),false);assert.equal(o.hit.kind,'circle');}
  const isolated=byId(f,'isolated');assert.equal(isolated.value,0);assert.deepEqual(isolated.node,{incoming:0,outgoing:0,directed:false});assert.ok(circle(f,'two','isolated'));assert.deepEqual(f.grid,[]);assert.deepEqual(f.labels,[]);
});
check('bounded force layout is static/deterministic and independent of undirected edge order/orientation',()=>{
  const f=frame(network);assert.deepEqual(frame(network),f);const reordered=frame({...network,links:[...network.links].reverse()});assert.deepEqual(reordered.observations.map(o=>({id:o.id,x:o.x,y:o.y})),f.observations.map(o=>({id:o.id,x:o.x,y:o.y})));
  const reversed=frame({...network,links:network.links.map(l=>({...l,from:l.to,to:l.from}))});assert.deepEqual(reversed.observations.map(o=>({id:o.id,x:o.x,y:o.y})),f.observations.map(o=>({id:o.id,x:o.x,y:o.y})));nonoverlap(circles(f));assert.ok(circles(f).every(c=>c.radius>0&&c.radius<=12));
});
check('network group hiding removes incident links and recomputes only visible endpoint-role counts',()=>{
  const full=frame(network),hidden=frame(network,{...options,hiddenSeriesIds:['two']});assert.deepEqual(hidden.observations.map(o=>o.id.pointId),['a','b']);assert.deepEqual(byId(hidden,'a').node,{incoming:0,outgoing:1,directed:false});assert.deepEqual(byId(hidden,'b').node,{incoming:1,outgoing:0,directed:false});assert.equal(byId(hidden,'a').value,1);assert.equal(byId(hidden,'a').color,byId(full,'a').color);assert.equal(hidden.legend[1].visible,false);assert.deepEqual(frame(network),full);
  const all=planChart(network,{...options,hiddenSeriesIds:['one','two']});assert.equal(all.status,'empty');assert.equal(all.frame.legend.length,2);assert.deepEqual(all.frame.viewport.bounds.x.domain,[0,1]);
});
check('network viewport crops true positions/links without changing fixed global layout or degree semantics',()=>{
  const full=frame(network),a=byId(full,'a'),nx=(a.x-16)/288,start=Math.max(0,Math.min(.5,nx-.25)),zoom=frame(network,{...options,viewport:{axes:'xy',value:{x:[start,start+.5]}}}),selected=byId(zoom,'a');assert.deepEqual(zoom.viewport.bounds.x.domain,[0,1]);assert.deepEqual(zoom.viewport.bounds.y.domain,[0,1]);assert.deepEqual(selected.node,a.node);close(selected.x,16+(nx-start)/.5*288);close(selected.y,a.y);
  for(const c of zoom.series.find(s=>s.id==='links')?.commands??[])assert.ok(c.x>=16&&c.x<=304&&c.y>=14&&c.y<=286);assert.equal(planChart(network,{...options,viewport:{axes:'x'}}).status,'invalid');
});
check('network strict source identity and undirected pair limits reject loops/duplicates without rejecting cycles',()=>{
  for(const spec of [{...network,links:[...network.links,{id:'reverse',from:'b',to:'a'}]},{...network,links:[{id:'self',from:'a',to:'a'}]},{...network,links:[{id:'missing',from:'a',to:'unknown'}]},{...network,nodes:[...network.nodes,network.nodes[0]]},{...network,nodes:[{id:'x',label:'X',value:123}],links:[]},{...network,groups:[{id:'links',label:'Reserved'}]}])assert.equal(planChart(spec,options).status,'invalid');
  assert.equal(planChart(network,{...options,hiddenSeriesIds:['links']}).status,'invalid');for(const patch of [{stacking:'sum'},{references:[{id:'r',axis:'y',value:1}]}])assert.equal(planChart(network,{...options,...patch}).status,'invalid');
  const nodes=Array.from({length:34},(_,i)=>({id:'n'+i,label:'N'+i})),links=[];for(let i=0;i<34;i++)for(let j=i+1;j<34;j++)if(links.length<513)links.push({id:i+'-'+j,from:'n'+i,to:'n'+j});assert.equal(planChart({...network,groups:[],nodes,links},options).status,'invalid');
});
check('network exact 128-node limit has no fake or dropped isolated observations and bounded name labels',()=>{
  const nodes=Array.from({length:128},(_,i)=>({id:'n'+i,label:'Node '+i})),f=frame({family:'networkgraph',title:'Bounded nodes',nodes,links:[]});assert.equal(f.observations.length,128);assert.equal(circles(f).length,128);assert.ok(f.observations.every(o=>o.value===0&&o.node.directed===false&&!Object.hasOwn(o.node,'depth')));assert.ok(f.annotations.length<=64);
  assert.equal(planChart({family:'networkgraph',title:'Overflow',nodes:[...nodes,{id:'too-many',label:'Too many'}],links:[]},options).status,'invalid');const empty=planChart({family:'networkgraph',title:'Empty',nodes:[],links:[]},options);assert.equal(empty.status,'empty');assert.deepEqual(empty.frame.viewport.bounds.x.domain,[0,1]);
});
check('packed circles retain one GLOBAL area scale across split source series, without parent observations',()=>{
  const f=frame(packed);assert.equal(f.family,'packedbubble');assert.deepEqual(f.observations.map(o=>o.id.pointId),['one','four','zero','sixteen']);assert.deepEqual(f.observations.map(o=>o.value),[1,4,0,16]);assert.equal(f.series.length,2);assert.deepEqual(f.legend.map(l=>l.id),['a','b']);assert.equal(circles(f).length,3);
  const one=circle(f,'a','one'),four=circle(f,'a','four'),sixteen=circle(f,'b','sixteen');close(four.radius/one.radius,2);close(sixteen.radius/one.radius,4);const scale=one.radius*one.radius;close(four.radius*four.radius/4,scale);close(sixteen.radius*sixteen.radius/16,scale);nonoverlap(circles(f));
  for(const c of circles(f)){const o=f.observations.find(o=>o.id.seriesId===c.seriesId&&o.id.pointId===c.pointId);assert.deepEqual(o.hit,{kind:'circle',cx:c.cx,cy:c.cy,radius:c.radius});assert.equal(o.x,c.cx);assert.equal(o.y,c.cy);assert.equal(Object.hasOwn(o,'node'),false);}
});
check('split packing keeps true enclosing group extents apart; unsplit mode preserves raw area ratios',()=>{
  const split=frame(packed),envelope=id=>{const cs=circles(split).filter(c=>c.seriesId===id),left=Math.min(...cs.map(c=>c.cx-c.radius)),right=Math.max(...cs.map(c=>c.cx+c.radius)),top=Math.min(...cs.map(c=>c.cy-c.radius)),bottom=Math.max(...cs.map(c=>c.cy+c.radius)),x=left/2+right/2,y=top/2+bottom/2;return {x,y,radius:Math.max(...cs.map(c=>Math.hypot(c.cx-x,c.cy-y)+c.radius))};},a=envelope('a'),b=envelope('b');assert.ok(Math.hypot(a.x-b.x,a.y-b.y)+1e-8>=a.radius+b.radius);
  const unsplit=frame({...packed,splitSeries:false});nonoverlap(circles(unsplit));close(circle(unsplit,'b','sixteen').radius/circle(unsplit,'a','one').radius,4);assert.ok(circles(unsplit).some(c=>c.cx!==circle(split,c.seriesId,c.pointId).cx||c.cy!==circle(split,c.seriesId,c.pointId).cy));assert.deepEqual(frame({...packed,splitSeries:true}),split);
});
check('packing is deterministic and visibility reflows all remaining circles without changing source IDs/colors',()=>{
  const before=frame(packed);assert.deepEqual(frame(packed),before);const hidden=frame(packed,{...options,hiddenSeriesIds:['b']});assert.deepEqual(hidden.observations.map(o=>o.id.pointId),['one','four','zero']);assert.equal(hidden.legend.length,2);assert.equal(hidden.legend[1].visible,false);assert.equal(hidden.series[0].color,before.series[0].color);close(circle(hidden,'a','four').radius/circle(hidden,'a','one').radius,2);nonoverlap(circles(hidden));assert.deepEqual(frame(packed),before);
});
check('packed zero metrics stay semantic without fake circles; null observations are omitted',()=>{
  const f=frame(packed),zero=byId(f,'zero');assert.equal(zero.value,0);assert.equal(zero.hit,undefined);assert.equal(circle(f,'a','zero'),undefined);assert.equal(byId(f,'missing'),undefined);
  const zeros=frame({family:'packedbubble',title:'Zeros',series:[{id:'z',name:'Z',data:[{id:'zero',value:0},{id:'missing',value:null}]}]});assert.equal(zeros.observations.length,1);assert.equal(circles(zeros).length,0);assert.equal(zeros.observations[0].value,0);
  const empty=planChart({...packed,series:[]},options);assert.equal(empty.status,'empty');assert.deepEqual(empty.frame.viewport.bounds.x.domain,[0,1]);
});
check('packing square viewport declares isotropic zoom8 limits and public zoom intent clamps at them',()=>{
  const single={family:'packedbubble',title:'Single value',series:[{id:'s',name:'S',data:[{id:'p',value:4}]}]},f=frame(single),v=f.viewport;assert.equal(v.plot.width,v.plot.height);assert.deepEqual(v.bounds.x.domain,[0,1]);assert.deepEqual(v.bounds.y.domain,[0,1]);assert.deepEqual(v.bounds.x.limits,{minSpan:.125});assert.deepEqual(v.bounds.y.limits,{minSpan:.125});
  const intent=transformPlanViewport(v,{kind:'zoom',factor:100});assert.equal(intent.status,'ok');close(intent.value.x[1]-intent.value.x[0],.125);close(intent.value.y[1]-intent.value.y[0],.125);const zoom=frame(single,{...options,viewport:{axes:'xy',value:intent.value}});close(circles(zoom)[0].radius/circles(f)[0].radius,8);assert.equal(zoom.observations[0].value,4);
  const atLimit=transformPlanViewport(zoom.viewport,{kind:'zoom',factor:2});assert.equal(atLimit.status,'ok');close(atLimit.value.x[0],intent.value.x[0]);close(atLimit.value.x[1],intent.value.x[1]);close(atLimit.value.y[0],intent.value.y[0]);close(atLimit.value.y[1],intent.value.y[1]);
  const layout=frame(packed),cropped=frame(packed,{...options,viewport:{axes:'xy',value:{x:[.25,.75],y:[.25,.75]}}});for(const c of circles(cropped)){const original=circle(layout,c.seriesId,c.pointId),plot=layout.viewport.plot;close(c.cx,plot.x+((original.cx-plot.x)/plot.width-.25)/.5*plot.width);close(c.cy,plot.y+((original.cy-plot.y)/plot.height-.25)/.5*plot.height);close(c.radius,original.radius*2);}
  for(const value of [{x:[0,.5],y:[0,.75]},{x:[0,.1],y:[0,.1]},{x:[0,.5]}])assert.equal(planChart(single,{...options,viewport:{axes:'xy',value}}).status,'invalid');
});
check('partially cropped large packed discs keep true signed centers/radii and clamped visible anchors',()=>{
  const spec={family:'packedbubble',title:'Cropped circle',series:[{id:'s',name:'S',data:[{id:'p',value:4}]}]},f=frame(spec),zoom=frame(spec,{...options,viewport:{axes:'xy',value:{x:[.775,.9],y:[.4375,.5625]}}}),c=circles(zoom)[0],o=zoom.observations[0];assert.ok(c.cx<0);assert.ok(c.radius>320);assert.equal(o.x,zoom.viewport.plot.x);assert.equal(o.hit.cx,c.cx);assert.equal(o.hit.radius,c.radius);close(c.radius/circles(f)[0].radius,8);assert.equal(o.value,4);assert.deepEqual(zoom.viewport.bounds.x.domain,[0,1]);
});
check('exact 256-point packing budget produces genuinely disjoint circles in both modes',()=>{
  const spec={family:'packedbubble',title:'Bounded dense packing',series:[{id:'s',name:'S',data:Array.from({length:256},(_,i)=>({id:'p'+i,value:1+(i%7)}))}]};for(const splitSeries of [false,true]){const f=frame({...spec,splitSeries});assert.equal(f.observations.length,256);assert.equal(circles(f).length,256);nonoverlap(circles(f));assert.ok(circles(f).every(c=>Number.isFinite(c.cx)&&Number.isFinite(c.cy)&&c.radius>0));}
  spec.series[0].data.push({id:'overflow',value:1});assert.equal(planChart(spec,options).status,'invalid');
});
check('finite extreme metrics preserve true raw values and finite radius scaling without overflow',()=>{
  const f=frame({family:'packedbubble',title:'Large values',series:[{id:'s',name:'S',data:[{id:'big',value:1e300},{id:'small',value:1e298}]}]});assert.equal(byId(f,'big').value,1e300);assert.equal(byId(f,'small').value,1e298);close(circle(f,'s','big').radius/circle(f,'s','small').radius,10);nonoverlap(circles(f));
  const extreme=frame({family:'packedbubble',title:'Extreme dynamic range',series:[{id:'s',name:'S',data:[{id:'max',value:Number.MAX_VALUE},{id:'min',value:Number.MIN_VALUE}]}]});assert.ok(circle(extreme,'s','min').radius>0);assert.equal(byId(extreme,'min').value,Number.MIN_VALUE);assert.ok(circles(extreme).every(c=>Number.isFinite(c.cx)&&Number.isFinite(c.cy)&&Number.isFinite(c.radius)));nonoverlap(circles(extreme));
});
check('strict packed source fields and options reject negatives, nonfinite values, duplicates and unsupported families',()=>{
  const bad=[-1,Infinity,NaN,'4'].map(value=>({...packed,series:[{id:'s',name:'S',data:[{id:'p',value}]}]}));bad.push({...packed,splitSeries:'yes'},{...packed,series:[{id:'s',name:'S',data:[{id:'p',value:1},{id:'p',value:2}]}]},{...packed,series:[{id:'s',name:'S',data:[{id:'p',value:1,x:3}]}]},{...packed,series:[{id:'s',name:'S',data:new Array(2)}]});for(const spec of bad)assert.equal(planChart(spec,options).status,'invalid');
  for(const patch of [{stacking:'sum'},{references:[{id:'r',axis:'y',value:1}]},{hiddenSeriesIds:['unknown']}])assert.equal(planChart(packed,{...options,...patch}).status,'invalid');
  assert.equal(planChart({...packed,series:Array.from({length:17},(_,i)=>({id:'s'+i,name:'S',data:[]}))},options).status,'invalid');
});
check('network/packing results own frozen closed frames and never mutate caller sources',()=>{
  for(const spec of [network,packed]){const original=structuredClone(spec),snapshot=structuredClone(original),result=planChart(original,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(original,snapshot);assert.ok(!Object.isFrozen(original));if(original.nodes)original.nodes[0].label='Changed';else original.series[0].data[0].value=999;assert.notEqual(result.frame.observations[0].label,'Changed');assert.notEqual(result.frame.observations[0].value,999);}
});

writeFileSync(new URL('../../work/reports/core-plan-network-packing-current.json',import.meta.url),JSON.stringify({status:'passed',checks,semantics:'Network value is computed undirected degree with explicit endpoint-role counts and no depth. Packed bubble areas share one global scale across groups; deterministic static nonoverlap packing, zero semantic/no circle, null omitted, isotropic viewport maxzoom8.'},null,2)+'\n');
console.log(`PASS ${checks.length} network/packing Core contract checks`);
