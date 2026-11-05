import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {planChart} from '../../dist/plan.js';

const options={width:320,height:300};
const sunburst={family:'sunburst',title:'Observed hierarchy',root:{id:'root',label:'Root',children:[{id:'a',label:'A',children:[{id:'a1',label:'A1',value:2},{id:'a2',label:'A2',value:4}]},{id:'b',label:'B',value:3}]}};
const tree={family:'treegraph',title:'Directed forest',groups:[{id:'one',label:'One'},{id:'two',label:'Two'}],nodes:[{id:'r',label:'Root',groupId:'one'},{id:'a',label:'Alpha',groupId:'one'},{id:'b',label:'Beta',groupId:'two'},{id:'leaf',label:'Leaf',groupId:'one'},{id:'isolated',label:'Isolated',groupId:'two'}],links:[{id:'ra',from:'r',to:'a'},{id:'rb',from:'r',to:'b'},{id:'al',from:'a',to:'leaf'}]};
const organization={family:'organization',title:'Directed organization',nodes:[{id:'ceo',label:'CEO'},{id:'co',label:'Co-founder'},{id:'engineering',label:'Engineering'},{id:'design',label:'Design'},{id:'delivery',label:'Delivery'}],links:[{id:'ce',from:'ceo',to:'engineering'},{id:'co-e',from:'co',to:'engineering'},{id:'ed',from:'engineering',to:'delivery'},{id:'co-d',from:'co',to:'design'},{id:'dd',from:'design',to:'delivery'}]};
const checks=[];
function check(name,run){run();checks.push(name);}
function frame(spec,opts=options){const result=planChart(spec,opts);assert.equal(result.status,'ok',JSON.stringify(result));return result.frame;}
function close(actual,expected){assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);}
function byId(f,id){return f.observations.find(o=>o.id.pointId===id);}
function deepFrozen(value){if(value&&typeof value==='object'){assert.ok(Object.isFrozen(value));for(const child of Object.values(value))deepFrozen(child);}}

check('sunburst has genuine nested annular levels and original leaf/computed subtotal semantics',()=>{
  const f=frame(sunburst),root=byId(f,'root'),a=byId(f,'a'),a1=byId(f,'a1'),b=byId(f,'b');assert.equal(f.family,'sunburst');assert.equal(f.observations.length,5);assert.deepEqual(f.legend.map(l=>l.id),['a','b']);assert.equal(f.series.length,3);
  assert.equal(root.value,9);assert.equal(root.subtotal,true);assert.equal(a.value,6);assert.equal(a.subtotal,true);assert.equal(a1.value,2);assert.equal(a1.subtotal,undefined);assert.equal(root.hit.innerRadius,0);close(root.hit.radius,a.hit.innerRadius);close(a.hit.radius,a1.hit.innerRadius);close(a1.hit.radius,136);
  close(a.hit.end-a.hit.start,Math.PI*2*6/9);close(a1.hit.end-a1.hit.start,(a.hit.end-a.hit.start)*2/6);close(b.hit.start,a.hit.end);assert.equal(a1.id.seriesId,'a');assert.ok(f.observations.every(o=>o.hit.type==='sector'&&!Object.hasOwn(o,'percentage')));
});
check('sunburst root-branch hiding recomputes pure totals/ring depth while preserving color, legend and restore',()=>{
  const before=frame(sunburst),hidden=frame(sunburst,{...options,hiddenSeriesIds:['a']});assert.deepEqual(hidden.observations.map(o=>o.id.pointId),['root','b']);assert.equal(byId(hidden,'root').value,3);assert.equal(byId(hidden,'b').value,3);assert.equal(hidden.legend.length,2);assert.equal(hidden.legend[0].visible,false);assert.equal(byId(hidden,'b').color,byId(before,'b').color);close(byId(hidden,'b').hit.innerRadius,68);close(byId(hidden,'b').hit.radius,136);
  assert.equal(hidden.series.find(s=>s.id==='b').commands.filter(c=>c.type==='A').length,4);assert.deepEqual(frame(sunburst),before);
  const all=planChart(sunburst,{...options,hiddenSeriesIds:['a','b']});assert.equal(all.status,'empty');assert.equal(all.frame.observations.length,0);assert.equal(all.frame.legend.length,2);assert.equal(planChart(sunburst,{...options,hiddenSeriesIds:['a1']}).status,'invalid');
});
check('sunburst missing leaves preserve incomplete subtotals and zero nodes never acquire invisible sectors',()=>{
  const missing=structuredClone(sunburst);missing.root.children[0].children.push({id:'missing',label:'Missing',value:null});const f=frame(missing);assert.equal(byId(f,'root').incomplete,true);assert.equal(byId(f,'a').incomplete,true);assert.equal(byId(f,'a').value,6);assert.equal(byId(f,'missing'),undefined);
  const zero=structuredClone(sunburst);for(const branch of zero.root.children)if(branch.children)for(const leaf of branch.children)leaf.value=0;else branch.value=0;const z=frame(zero);assert.equal(z.observations.length,5);assert.ok(z.observations.every(o=>o.value===0&&o.hit===undefined));assert.ok(z.series.every(s=>s.commands.length===0));
  const leaf=frame({family:'sunburst',title:'Single root',root:{id:'single',value:5}});assert.equal(leaf.observations.length,1);assert.equal(leaf.series[0].commands.filter(c=>c.type==='A').length,2);assert.equal(leaf.observations[0].id.pointId,'single');
});
check('sunburst exact 512-node/15-branch bounds are real while deep or overflowing trees fail explicitly',()=>{
  const root={id:'root',children:Array.from({length:15},(_,i)=>({id:'g'+i,children:Array.from({length:i===0?34:33},(_,j)=>({id:`g${i}n${j}`,value:1}))}))},f=frame({family:'sunburst',title:'Bounded hierarchy',root});assert.equal(f.observations.length,512);assert.equal(f.legend.length,15);assert.equal(f.series.length,16);
  root.children[0].children.push({id:'overflow',value:1});assert.equal(planChart({family:'sunburst',title:'Too many',root},options).status,'invalid');
  let deep={id:'leaf',value:1};for(let i=0;i<9;i++)deep={id:'level'+i,children:[deep]};assert.equal(planChart({family:'sunburst',title:'Deep',root:deep},options).status,'invalid');
  const overflow=planChart({family:'sunburst',title:'Overflow',root:{id:'root',children:[{id:'a',value:Number.MAX_VALUE},{id:'b',value:Number.MAX_VALUE}]}},options);assert.equal(overflow.status,'invalid');assert.equal(overflow.diagnostic.reason,'HIERARCHY_SUM_OVERFLOW');
});
check('treegraph has one source-node observation with exact computed visible directed degree/depth',()=>{
  const f=frame(tree);assert.equal(f.unit,'Connections');assert.deepEqual(f.observations.map(o=>o.id.pointId),tree.nodes.map(n=>n.id));assert.deepEqual(f.legend.map(l=>l.id),['one','two']);assert.ok(!f.legend.some(l=>l.id==='links'));assert.equal(f.series[0].id,'links');assert.ok(f.series[0].commands.length>0);
  const expected={r:[0,2,0],a:[1,1,1],b:[1,0,1],leaf:[1,0,2],isolated:[0,0,0]};for(const o of f.observations){const [incoming,outgoing,depth]=expected[o.id.pointId];assert.deepEqual(o.node,{incoming,outgoing,depth});assert.equal(o.value,incoming+outgoing);assert.equal(o.hit.type,'circle');assert.equal(o.label,tree.nodes.find(n=>n.id===o.id.pointId).label);}
  assert.equal(f.series.flatMap(s=>s.circles??[]).length,5);assert.deepEqual(f.viewport.bounds.x.domain,[0,1]);assert.deepEqual(f.viewport.bounds.y.domain,[0,1]);assert.deepEqual(f.grid,[]);assert.deepEqual(f.labels,[]);
});
check('tree tidy leaf spans center parents; layouts remain deterministic across link order and do not invent nodes',()=>{
  const f=frame(tree);close(byId(f,'r').x,(byId(f,'a').x+byId(f,'b').x)/2);close(byId(f,'a').x,byId(f,'leaf').x);assert.ok(byId(f,'r').y<byId(f,'a').y&&byId(f,'a').y<byId(f,'leaf').y);
  const reordered=frame({...tree,links:[...tree.links].reverse()});assert.deepEqual(reordered.observations.map(o=>({id:o.id,x:o.x,y:o.y,node:o.node})),f.observations.map(o=>({id:o.id,x:o.x,y:o.y,node:o.node})));
  const curve=f.series.find(s=>s.id==='links').commands;assert.ok(curve.length>tree.links.length*2,'smooth connectors have real interpolation samples');assert.ok(curve.every(c=>c.type==='M'||c.type==='L'));assert.ok(f.observations.every(o=>tree.nodes.some(n=>n.id===o.id.pointId)));
  const branched=frame({family:'treegraph',title:'Left and right',nodes:[{id:'r',label:'Root'},{id:'left',label:'Left'},{id:'right',label:'Right'}],links:[{id:'left-edge',from:'r',to:'left'},{id:'right-edge',from:'r',to:'right'}]});assert.equal(branched.observations.length,3);assert.ok(byId(branched,'left').x<byId(branched,'r').x&&byId(branched,'r').x<byId(branched,'right').x);const paths=branched.series.find(s=>s.id==='links').commands;assert.ok(paths.some(c=>c.x<byId(branched,'r').x)&&paths.some(c=>c.x>byId(branched,'r').x));
});
check('organization allows multi-parent DAGs and emits real rectangular boxes and orthogonal connectors',()=>{
  const f=frame(organization);assert.equal(f.observations.length,5);assert.deepEqual(byId(f,'engineering').node,{incoming:2,outgoing:1,depth:1});assert.deepEqual(byId(f,'delivery').node,{incoming:2,outgoing:0,depth:2});assert.equal(byId(f,'engineering').value,3);
  const bars=f.series.flatMap(s=>s.bars??[]);assert.equal(bars.length,5);assert.equal(f.series.flatMap(s=>s.circles??[]).length,0);for(const bar of bars){const o=byId(f,bar.pointId);assert.deepEqual(o.hit.vertices,[{x:bar.x,y:bar.y},{x:bar.x+bar.width,y:bar.y},{x:bar.x+bar.width,y:bar.y+bar.height},{x:bar.x,y:bar.y+bar.height}]);}
  const lines=f.series.find(s=>s.id==='links').commands;for(let i=0;i<lines.length;i+=2){assert.equal(lines[i].type,'M');assert.equal(lines[i+1].type,'L');assert.ok(lines[i].x===lines[i+1].x||lines[i].y===lines[i+1].y);}
  assert.equal(planChart({...organization,family:'treegraph'},options).status,'invalid');
});
check('hidden groups remove incident links and recompute topology/degree without bypassing source DAG validation',()=>{
  const before=frame(tree),hidden=frame(tree,{...options,hiddenSeriesIds:['two']});assert.deepEqual(hidden.observations.map(o=>o.id.pointId),['r','a','leaf']);assert.deepEqual(byId(hidden,'r').node,{incoming:0,outgoing:1,depth:0});assert.equal(byId(hidden,'r').value,1);close(byId(hidden,'r').x,byId(hidden,'a').x);assert.equal(byId(hidden,'r').color,byId(before,'r').color);assert.equal(hidden.legend[1].visible,false);assert.deepEqual(frame(tree),before);
  const all=planChart(tree,{...options,hiddenSeriesIds:['one','two']});assert.equal(all.status,'empty');assert.equal(all.frame.legend.length,2);assert.deepEqual(all.frame.viewport.bounds.x.domain,[0,1]);
  const cyclic={...tree,links:[...tree.links,{id:'back',from:'leaf',to:'r'}]};assert.equal(planChart(cyclic,{...options,hiddenSeriesIds:['one','two']}).status,'invalid');
});
check('normalized graph viewport bounds and layout/degrees stay stable while the scene is cropped',()=>{
  const full=frame(tree),window={x:[.1,.6],y:[.1,.9]},zoom=frame(tree,{...options,viewport:{axes:'xy',value:window}});assert.deepEqual(zoom.viewport.bounds.x.domain,[0,1]);assert.deepEqual(zoom.viewport.bounds.y.domain,[0,1]);assert.deepEqual(zoom.viewport.displayed.x,window.x);assert.deepEqual(zoom.viewport.displayed.y,window.y);
  const raw=byId(full,'r'),cropped=byId(zoom,'r'),normalized=(raw.x-16)/288;close(cropped.x,16+(normalized-.1)/.5*288);assert.deepEqual(cropped.node,raw.node);assert.equal(cropped.value,raw.value);
  for(const c of zoom.series.find(s=>s.id==='links').commands)assert.ok(c.x>=16&&c.x<=304&&c.y>=14&&c.y<=286);
  assert.equal(planChart(tree,{...options,viewport:{axes:'x'}}).status,'invalid');assert.equal(planChart(tree,{...options,references:[{id:'r',axis:'y',value:1}]}).status,'invalid');
});
check('partially cropped tree circles retain actual centers and organization anchors stay on visible boxes',()=>{
  const full=frame(tree),normalized=(byId(full,'r').x-16)/288,start=normalized+.4*6/288,partial=frame(tree,{...options,viewport:{axes:'xy',value:{x:[start,start+.4]}}}),r=byId(partial,'r'),circle=partial.series.flatMap(s=>s.circles??[]).find(c=>c.pointId==='r');close(circle.cx,10);close(r.x,16);assert.equal(r.hit.cx,circle.cx);assert.ok(circle.radius>6&&circle.cx>=0);
  const orgFull=frame(organization),ox=(byId(orgFull,'ceo').x-16)/288,org=frame(organization,{...options,viewport:{axes:'xy',value:{x:[ox+.02,ox+.32]}}}),bar=org.series.flatMap(s=>s.bars??[]).find(b=>b.pointId==='ceo'),obs=byId(org,'ceo');assert.ok(bar&&bar.width>0);assert.equal(bar.x,16);assert.equal(obs.x,16);assert.equal(obs.node.outgoing,1);
});
check('source labels are bounded annotations, never generic numeric degree labels',()=>{
  for(const spec of [tree,organization]){const f=frame(spec);assert.ok(f.annotations.length<=64);for(const a of f.annotations){assert.equal(a.role,'label');assert.ok(f.legend.some(g=>g.id===a.box.seriesId));assert.ok(a.x-a.box.width/2>=16&&a.x+a.box.width/2<=304&&a.y-a.box.height/2>=14&&a.y+a.box.height/2<=286);}}
});
check('node sizes adapt to actual mapped spacing instead of overlapping dense/uneven rows',()=>{
  const nodes=[{id:'root',label:'Root'},{id:'a',label:'A'},{id:'b',label:'B'},...Array.from({length:10},(_,i)=>({id:'c'+i,label:'Chain '+i})),...Array.from({length:90},(_,i)=>({id:'leaf'+i,label:'Leaf '+i}))],links=[{id:'ra',from:'root',to:'a'},{id:'rb',from:'root',to:'b'},{id:'rc',from:'root',to:'c0'}];for(let i=0;i<10;i++){if(i<9)links.push({id:'chain'+i,from:'c'+i,to:'c'+(i+1)});for(let j=0;j<9;j++)links.push({id:'leaflink'+i+'-'+j,from:'c'+i,to:'leaf'+(i*9+j)});}
  const f=frame({family:'treegraph',title:'Uneven forest',nodes,links}),circles=f.series.flatMap(s=>s.circles??[]),a=circles.find(c=>c.pointId==='a'),b=circles.find(c=>c.pointId==='b');assert.ok(a.radius+b.radius<Math.abs(a.cx-b.cx));assert.ok(circles.every(c=>c.radius>0&&c.radius<=12));
  const roots={family:'organization',title:'Wide row',nodes:Array.from({length:10},(_,i)=>({id:'n'+i,label:'N'+i})),links:[]};for(const opts of [options,{...options,viewport:{axes:'xy',value:{x:[.2,.4]}}}]){const bars=frame(roots,opts).series.flatMap(s=>s.bars??[]).sort((a,b)=>a.x-b.x);for(let i=1;i<bars.length;i++)assert.ok(bars[i-1].x+bars[i-1].width<=bars[i].x);assert.ok(bars.every(b=>b.width<=96));}
});
check('source graph budgets and strict IDs, endpoints, groups, payloads and DAG structure are validated',()=>{
  const malformed=[{...tree,nodes:[...tree.nodes,tree.nodes[0]]},{...tree,links:[...tree.links,{id:'ra',from:'r',to:'leaf'}]},{...tree,links:[...tree.links,{id:'duplicate',from:'r',to:'a'}]},{...tree,links:[{id:'unknown',from:'r',to:'missing'}]},{...tree,links:[{id:'self',from:'r',to:'r'}]},{...tree,nodes:[{id:'x',label:'X',groupId:'missing'}],links:[]},{...tree,nodes:[{id:'x',label:'X',value:123}],links:[]},{...tree,groups:[{id:'links',label:'Forbidden'}]},{...tree,nodes:new Array(2)}];for(const spec of malformed)assert.equal(planChart(spec,options).status,'invalid');
  assert.equal(planChart(tree,{...options,hiddenSeriesIds:['links']}).status,'invalid');assert.equal(planChart({...tree,nodes:Array.from({length:129},(_,i)=>({id:'n'+i,label:'N'+i})),links:[]},options).status,'invalid');
  const nodes=Array.from({length:33},(_,i)=>({id:'n'+i,label:'N'+i})),links=[];for(let i=0;i<33;i++)for(let j=i+1;j<33;j++)if(links.length<513)links.push({id:i+'-'+j,from:'n'+i,to:'n'+j});assert.equal(planChart({family:'organization',title:'Too many links',nodes,links},options).status,'invalid');
});
check('exact 128-node forest budget remains real and empty node graphs keep their synthetic viewport',()=>{
  const nodes=Array.from({length:128},(_,i)=>({id:'n'+i,label:'Node '+i})),links=nodes.slice(1).map((n,i)=>({id:'l'+i,from:nodes[i].id,to:n.id})),f=frame({family:'treegraph',title:'Bounded chain',nodes,links});assert.equal(f.observations.length,128);assert.equal(f.series.flatMap(s=>s.circles??[]).length,128);assert.equal(byId(f,'n127').node.depth,127);assert.ok(f.annotations.length<=64);
  const empty=planChart({family:'organization',title:'Empty graph',nodes:[],links:[]},options);assert.equal(empty.status,'empty');assert.equal(empty.frame.family,'organization');assert.deepEqual(empty.frame.viewport.bounds.x.domain,[0,1]);assert.equal(empty.frame.unit,'Connections');
});
check('hierarchy outputs own frozen geometry and do not mutate node/link/tree sources',()=>{
  for(const spec of [sunburst,tree,organization]){const original=structuredClone(spec),snapshot=structuredClone(original),result=planChart(original,options);assert.equal(result.status,'ok');deepFrozen(result);assert.deepEqual(original,snapshot);assert.ok(!Object.isFrozen(original));if(original.root)original.root.children[1].value=999;else original.nodes[0].label='Changed';assert.notEqual(result.frame.observations[0].label,'Changed');assert.notEqual(result.frame.observations[0].value,999);}
});

check('sunburst label boxes stay completely inside their actual ring and angular sector at phone and tablet sizes',()=>{
 for(const [width,height]of [[64,64],[320,300],[390,300],[768,520]]){const result=planChart(sunburst,{width,height});assert.equal(result.status,'ok');const f=result.frame;if(width>=320)assert.ok(f.annotations.length>0);
 for(const a of f.annotations){const p=f.observations.find(p=>p.x===a.x&&p.y===a.y&&p.hit?.type==='sector');assert.ok(p,'Source label anchor must be retained');const h=p.hit,w=a.box.width/2,v=a.box.height/2,span=h.end-h.start,mid=(h.start+h.end)/2;
 const nearest=Math.hypot(Math.max(0,Math.abs(a.x-h.cx)-w),Math.max(0,Math.abs(a.y-h.cy)-v));if(h.innerRadius>0)assert.ok(nearest>=h.innerRadius+1.99);
 for(const x of [a.x-w,a.x+w])for(const y of [a.y-v,a.y+v]){assert.ok(Math.hypot(x-h.cx,y-h.cy)<=h.radius-1.99,'Text box exceeds the outer ring');if(span<Math.PI*2-1e-10){const angle=Math.atan2(x-h.cx,h.cy-y),delta=((angle-mid+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;assert.ok(Math.abs(delta)<span/2,'Text box crosses a sibling sector');}}
 }}
});

writeFileSync(new URL('../../work/reports/core-plan-hierarchy-current.json',import.meta.url),JSON.stringify({status:'passed',checks,semantics:'Sunburst leaves retain source values and branches use explicit subtotal/incomplete aggregates. Node graph values are computed visible directed degrees, with incoming/outgoing/depth payload; viewport cropping never changes topology or degrees.'},null,2)+'\n');
console.log(`PASS ${checks.length} hierarchy Core contract checks`);
