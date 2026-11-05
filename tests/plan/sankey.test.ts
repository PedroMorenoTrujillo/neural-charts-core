import {describe,expect,it} from 'vitest';
import {planChart,transformPlanViewport,type PlanFrame,type PlanOptions,type PlanSankeySpec} from '../../src/plan.js';

const dimensions={width:390,height:300} satisfies PlanOptions;
const source=():PlanSankeySpec=>({family:'sankey',title:'Energy flow',nodes:[
  {id:'solar',label:'Solar'},{id:'wind',label:'Wind'},{id:'grid',label:'Grid'},{id:'homes',label:'Homes'},
],links:[{id:'solar-grid',from:'solar',to:'grid',value:8},{id:'wind-grid',from:'wind',to:'grid',value:4},{id:'grid-homes',from:'grid',to:'homes',value:12}]});
function frame(spec:PlanSankeySpec=source(),options:PlanOptions=dimensions):PlanFrame{
  const result=planChart(spec,options);expect(result.status,JSON.stringify(result)).not.toBe('invalid');
  if(result.status==='invalid')throw new Error(result.diagnostic.reason);return result.frame;
}
const invalid=(value:unknown,options:PlanOptions=dimensions)=>planChart(value as PlanSankeySpec,options);
type Vertex=Readonly<{x:number;y:number}>;
function assertSimplePolygon(vertices:readonly Vertex[]):void{
  expect(vertices.length).toBeGreaterThanOrEqual(3);
  const orient=(a:Vertex,b:Vertex,c:Vertex)=>{
    const left=(b.x-a.x)*(c.y-a.y),right=(b.y-a.y)*(c.x-a.x),delta=left-right,tolerance=Number.EPSILON*8*(Math.abs(left)+Math.abs(right));return delta>tolerance?1:delta< -tolerance?-1:0;
  };
  const on=(a:Vertex,b:Vertex,c:Vertex)=>orient(a,b,c)===0&&c.x>=Math.min(a.x,b.x)&&c.x<=Math.max(a.x,b.x)&&c.y>=Math.min(a.y,b.y)&&c.y<=Math.max(a.y,b.y);
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i]!,b=vertices[(i+1)%vertices.length]!;expect(a.x!==b.x||a.y!==b.y).toBe(true);
    for(let j=i+1;j<vertices.length;j++){
      if(j===i+1||i===0&&j===vertices.length-1)continue;
      const c=vertices[j]!,d=vertices[(j+1)%vertices.length]!;
      expect(orient(a,b,c)*orient(a,b,d)<0&&orient(c,d,a)*orient(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)).toBe(false);
    }
  }
}

function curvedSource(seed:number,exponent:number):PlanSankeySpec{
  return {family:'sankey',title:'Quantized ribbons',nodes:Array.from({length:6},(_,index)=>({id:'n'+index,label:'Node '+index})),links:[
    {id:'big',from:'n0',to:'n2',value:1},{id:'big2',from:'n2',to:'n4',value:1},
    {id:'other',from:'n1',to:'n3',value:.13+seed*.01},{id:'other2',from:'n3',to:'n5',value:.13+seed*.01},
    {id:'tiny',from:seed%2?'n0':'n1',to:seed%2?'n5':'n4',value:10**-exponent},
  ]};
}

describe('public Sankey planning',()=>{
  it('preserves source IDs and values for nodes and actual flow ribbons',()=>{
    const chart=frame(),nodes=chart.observations.filter(p=>p.sankey?.type==='node'),links=chart.observations.filter(p=>p.sankey?.type==='link');
    expect(chart.family).toBe('sankey');expect(nodes.map(p=>p.id.pointId)).toEqual(['solar','wind','grid','homes']);
    expect(links.map(p=>[p.id.pointId,p.value])).toEqual([['solar-grid',8],['wind-grid',4],['grid-homes',12]]);
    expect(nodes.find(p=>p.id.pointId==='grid')?.sankey).toEqual({type:'node',incoming:12,outgoing:12});
    expect(nodes.find(p=>p.id.pointId==='grid')?.value).toBe(12);
    expect(links[0]?.sankey).toEqual({type:'link',from:'solar',to:'grid',fromLabel:'Solar',toLabel:'Grid'});
    expect(chart.series[0]?.bars).toHaveLength(4);expect(chart.series[0]?.areaCommands?.filter(c=>c.type==='Z')).toHaveLength(3);
  });

  it('uses the same quantitative scale for flow thickness and node throughput',()=>{
    const chart=frame(),links=chart.observations.filter(p=>p.sankey?.type==='link');
    const thickness=(id:string)=>{const hit=links.find(p=>p.id.pointId===id)!.hit;if(hit?.type!=='polygon')throw Error('Expected ribbon');return Math.abs(hit.vertices[0]!.y-hit.vertices.at(-1)!.y);};
    expect(thickness('solar-grid')/thickness('wind-grid')).toBeCloseTo(2,4);
    const grid=chart.series.flatMap(series=>series.bars??[]).find(bar=>bar.pointId==='grid')!;
    expect(thickness('grid-homes')).toBeCloseTo(grid.height,4);
  });

  it('attaches ribbon endpoints to the corresponding node faces',()=>{
    const chart=frame(),bars=chart.series.flatMap(s=>s.bars??[]),link=chart.observations.find(p=>p.id.pointId==='solar-grid')!;
    if(link.hit?.type!=='polygon')throw Error('Expected ribbon');
    const solar=bars.find(bar=>bar.pointId==='solar')!,grid=bars.find(bar=>bar.pointId==='grid')!;
    expect(link.hit.vertices[0]?.x).toBeCloseTo(solar.x+solar.width,4);
    expect(Math.max(...link.hit.vertices.map(p=>p.x))).toBeCloseTo(grid.x,4);
  });

  it('owns source data and freezes the produced frame without mutating the caller',()=>{
    const input=source(),before=JSON.stringify(input),chart=frame(input);
    expect(JSON.stringify(input)).toBe(before);expect(Object.isFrozen(chart)).toBe(true);expect(Object.isFrozen(chart.observations)).toBe(true);
    expect(frame(input)).toEqual(chart);
  });

  it('supports vertical flow with real rotated node and ribbon geometry',()=>{
    const chart=frame({...source(),orientation:'vertical'}),bars=chart.series.flatMap(s=>s.bars??[]);
    const solar=bars.find(bar=>bar.pointId==='solar')!,grid=bars.find(bar=>bar.pointId==='grid')!,homes=bars.find(bar=>bar.pointId==='homes')!;
    expect(solar.y).toBeLessThan(grid.y);expect(grid.y).toBeLessThan(homes.y);
    expect(solar.height).toBeCloseTo(14,3);expect(chart.observations.some(p=>p.hit?.type==='polygon'&&p.sankey?.type==='link')).toBe(true);
  });

  it('distinguishes missing edges from zero throughput',()=>{
    const base=source(),missing=frame({...base,links:base.links.map(link=>({...link,value:null}))});
    expect(missing.observations.filter(p=>p.sankey?.type==='link')).toHaveLength(0);
    expect(missing.observations.filter(p=>p.sankey?.type==='node').every(p=>p.incomplete===true)).toBe(true);
    const zeros=frame({...base,links:base.links.map(link=>({...link,value:0}))});
    expect(zeros.observations.every(p=>p.value===0&&!p.incomplete)).toBe(true);
    expect(zeros.series.flatMap(s=>s.areaCommands??[])).toHaveLength(0);
  });

  it('keeps known partial node totals explicit when one measurement is absent',()=>{
    const base=source(),chart=frame({...base,links:base.links.map(link=>link.id==='wind-grid'?{...link,value:null}:link)});
    const grid=chart.observations.find(p=>p.id.pointId==='grid')!;
    expect(grid.sankey).toEqual({type:'node',incoming:8,outgoing:12});expect(grid.incomplete).toBe(true);expect(grid.value).toBe(12);
  });

  it('supports parallel source/target flows with distinct stable link identities',()=>{
    const input=source(),chart=frame({...input,links:[...input.links,{id:'solar-grid-extra',from:'solar',to:'grid',value:2}]});
    expect(chart.observations.find(p=>p.id.pointId==='solar-grid-extra')?.value).toBe(2);
    expect(chart.observations.find(p=>p.id.pointId==='solar')?.value).toBe(10);
  });

  it('replans visible groups and connected flows while preserving the controlled legend',()=>{
    const input=source(),grouped:PlanSankeySpec={...input,groups:[{id:'generation',label:'Generation'},{id:'delivery',label:'Delivery'}],nodes:input.nodes.map(node=>({...node,groupId:node.id==='solar'||node.id==='wind'?'generation':'delivery'}))};
    const chart=frame(grouped,{...dimensions,hiddenSeriesIds:['generation']});
    expect(chart.legend.map(item=>[item.id,item.visible])).toEqual([['generation',false],['delivery',true]]);
    expect(chart.observations.map(p=>p.id.pointId).sort()).toEqual(['grid','grid-homes','homes']);
    expect(chart.observations.find(p=>p.id.pointId==='grid')?.sankey).toEqual({type:'node',incoming:0,outgoing:12});
    expect(planChart(grouped,{...dimensions,hiddenSeriesIds:['generation','delivery']}).status).toBe('empty');
  });

  it('returns a meaningful empty frame for an empty graph',()=>{
    const chart=frame({family:'sankey',title:'No data',nodes:[],links:[]});
    expect(chart.observations).toEqual([]);expect(chart.series).toEqual([]);expect(chart.viewport).toBeDefined();
    expect(planChart({family:'sankey',title:'No data',nodes:[],links:[]},dimensions).status).toBe('empty');
  });

  it('renormalizes a tiny visible flow when an extreme group is hidden and restores deterministically',()=>{
    const input:PlanSankeySpec={family:'sankey',title:'Extreme source groups',groups:[{id:'big',label:'Big'},{id:'small',label:'Small'}],nodes:[
      {id:'big-source',label:'Big source',groupId:'big'},{id:'big-target',label:'Big target',groupId:'big'},
      {id:'small-source',label:'Small source',groupId:'small'},{id:'small-target',label:'Small target',groupId:'small'},
    ],links:[{id:'big-flow',from:'big-source',to:'big-target',value:1e308},{id:'small-flow',from:'small-source',to:'small-target',value:1e-15}]};
    const initial=frame(input),hidden=frame(input,{...dimensions,hiddenSeriesIds:['big']});
    const isolated=frame({...input,groups:[{id:'small',label:'Small'}],nodes:input.nodes.filter(node=>node.groupId==='small'),links:input.links.filter(link=>link.id==='small-flow')});
    expect(hidden.observations.map(point=>point.id.pointId).sort()).toEqual(['small-flow','small-source','small-target']);
    expect(hidden.observations.find(point=>point.id.pointId==='small-flow')?.value).toBe(1e-15);
    expect(hidden.series.map(series=>series.areaCommands)).toEqual(isolated.series.map(series=>series.areaCommands));
    expect(hidden.series.flatMap(series=>series.bars??[]).map(bar=>bar.height)).toEqual(isolated.series.flatMap(series=>series.bars??[]).map(bar=>bar.height));
    expect(frame(input)).toEqual(initial);
    expect(planChart({...input,links:[...input.links,{id:'invalid-hidden',from:'big-source',to:'big-target',value:-1}]},{...dimensions,hiddenSeriesIds:['big']}).status).toBe('invalid');
  });

  it('provides controlled xy zoom and clips actual hit polygons and node rectangles',()=>{
    const initial=frame(),transformed=transformPlanViewport(initial.viewport!,{type:'zoom',factor:2,anchor:{x:.5,y:.5}});
    expect(transformed.status).toBe('ok');if(transformed.status!=='ok')throw Error('Expected viewport');
    const chart=frame(source(),{...dimensions,viewport:{axes:'xy',value:transformed.value}});
    for(const observation of chart.observations){
      expect(observation.x).toBeGreaterThanOrEqual(16);expect(observation.x).toBeLessThanOrEqual(374);
      expect(observation.y).toBeGreaterThanOrEqual(14);expect(observation.y).toBeLessThanOrEqual(286);
      if(observation.hit?.type==='polygon')for(const vertex of observation.hit.vertices){expect(vertex.x).toBeGreaterThanOrEqual(16);expect(vertex.x).toBeLessThanOrEqual(374);expect(vertex.y).toBeGreaterThanOrEqual(14);expect(vertex.y).toBeLessThanOrEqual(286);}
    }
    for(const bar of chart.series.flatMap(s=>s.bars??[])){expect(bar.width).toBeGreaterThan(0);expect(bar.height).toBeGreaterThan(0);expect(bar.x+bar.width).toBeLessThanOrEqual(374.0001);expect(bar.y+bar.height).toBeLessThanOrEqual(286.0001);}
  });

  it.each([[64,64],[320,240],[390,300],[768,480],[10000,10000]])('keeps geometry finite and bounded at %i × %i',(width,height)=>{
    const chart=frame(source(),{width,height});
    for(const observation of chart.observations){expect(Number.isFinite(observation.x)).toBe(true);expect(Number.isFinite(observation.y)).toBe(true);}
    for(const series of chart.series)for(const command of series.areaCommands??[])if(command.type!=='Z'){expect(Number.isFinite(command.x)).toBe(true);expect(Number.isFinite(command.y)).toBe(true);}
  });

  it('retains complete labels for inspection while limiting visible label hints',()=>{
    const name='Extremely long source label '.repeat(20),input=source(),chart=frame({...input,nodes:input.nodes.map(node=>node.id==='solar'?{...node,label:name}:node)});
    expect(chart.observations.find(p=>p.id.pointId==='solar')?.label).toBe(name);
    expect(chart.annotations?.every(annotation=>annotation.text.length<name.length)).toBe(true);
  });

  it('bounds layout work and emitted geometry at the public node/link limits',()=>{
    const nodes=Array.from({length:128},(_,index)=>({id:'n'+index,label:'Node '+index}));
    const links:PlanSankeySpec['links'][number][]=[];
    for(let level=0;level<3;level++)for(let index=0;index<32;index++)for(let branch=0;branch<4;branch++)links.push({id:'l'+links.length,from:'n'+(level*32+index),to:'n'+((level+1)*32+(index+branch)%32),value:1+branch});
    for(let index=0;index<128;index++)links.push({id:'l'+links.length,from:'n'+(index%32),to:'n'+(64+index%32),value:1});
    const chart=frame({family:'sankey',title:'Bounded graph',nodes,links},{width:768,height:640});
    expect(chart.observations.length).toBe(640);
    expect(chart.series.flatMap(s=>s.areaCommands??[]).length).toBeLessThanOrEqual(512*35);
    expect(invalid({family:'sankey',title:'Too many nodes',nodes:[...nodes,{id:'overflow',label:'Overflow'}],links}).status).toBe('invalid');
    expect(invalid({family:'sankey',title:'Too many links',nodes,links:[...links,{id:'overflow',from:'n0',to:'n32',value:1}]}).status).toBe('invalid');
  });

  it.each([
    {name:'negative weight',change:{links:[{id:'bad',from:'solar',to:'grid',value:-1}]}},
    {name:'missing endpoint',change:{links:[{id:'bad',from:'unknown',to:'grid',value:1}]}},
    {name:'self edge',change:{links:[{id:'bad',from:'solar',to:'solar',value:1}]}},
    {name:'cycle',change:{links:[{id:'one',from:'solar',to:'grid',value:1},{id:'two',from:'grid',to:'solar',value:1}]}},
    {name:'unknown node group',change:{nodes:[{id:'solar',label:'Solar',groupId:'unknown'}],links:[]}},
    {name:'unknown presentation option',change:{nodeColor:'red'}},
    {name:'bad orientation',change:{orientation:'diagonal'}},
    {name:'duplicate nodes',change:{nodes:[{id:'solar',label:'One'},{id:'solar',label:'Two'}],links:[]}},
    {name:'node/link identity collision',change:{links:[{id:'solar',from:'solar',to:'grid',value:1}]}},
  ])('rejects $name without fabricating a scene',({change})=>{
    expect(invalid({...source(),...change}).status).toBe('invalid');
  });

  it('rejects cycles even when the group is hidden or edge values are missing',()=>{
    const input=source(),links=[{id:'one',from:'solar',to:'grid',value:null},{id:'two',from:'grid',to:'solar',value:null}];
    expect(invalid({...input,links},{...dimensions,hiddenSeriesIds:['nodes']}).status).toBe('invalid');
  });

  it('rejects an unrepresentable total or dynamic range explicitly',()=>{
    const input=source();
    expect(invalid({...input,links:input.links.map(link=>({...link,value:Number.MAX_VALUE}))}).status).toBe('invalid');
    expect(invalid({...input,links:input.links.map((link,index)=>({...link,value:index?1e300:1e-300}))}).status).toBe('invalid');
  });

  it('removes a duplicated closing vertex introduced by clipping a normal 0.17 flow',()=>{
    const chart=frame(curvedSource(4,4),{width:324,height:300}),flow=chart.observations.find(point=>point.id.pointId==='other')!;
    expect(flow.value).toBeCloseTo(.17,14);expect(flow.sankey?.geometryOmitted).toBeUndefined();
    expect(flow.hit?.type).toBe('polygon');if(flow.hit?.type!=='polygon')throw Error('Expected actual ribbon');assertSimplePolygon(flow.hit.vertices);
  });

  it('keeps the positive identity and exact value when a ribbon is below representable precision',()=>{
    const input=curvedSource(0,7),before=JSON.stringify(input),chart=frame(input),flow=chart.observations.find(point=>point.id.pointId==='tiny')!;
    expect(flow.value).toBe(1e-7);expect(flow.sankey?.geometryOmitted).toBe(true);expect(flow.hit).toBeUndefined();
    expect(chart.series.some(series=>series.id===flow.id.seriesId)).toBe(true);expect(JSON.stringify(input)).toBe(before);
    expect(chart.observations.some(point=>point.sankey?.geometryOmitted!==true&&point.hit?.type==='polygon')).toBe(true);
  });

  it('emits simple native-compatible polygons through tiny curved flows and plot-edge clipping',()=>{
    for(let seed=0;seed<16;seed++)for(let exponent=4;exponent<=11;exponent++)for(const options of [
      {width:320+seed,height:300},
      {width:320+seed,height:300,viewport:{axes:'xy' as const,value:{x:[.13,.83] as const,y:[.09,.91] as const}}},
      {width:320+seed,height:300,viewport:{axes:'xy' as const,value:{x:[.45,.6] as const,y:[.35,.63] as const}}},
    ]){
      const chart=frame(curvedSource(seed,exponent),options);
      for(const point of chart.observations)if(point.hit?.type==='polygon')assertSimplePolygon(point.hit.vertices);
    }
  });

  it('rejects incompatible option groups instead of silently ignoring them',()=>{
    expect(planChart(source(),{...dimensions,stacking:'sum'}).status).toBe('invalid');
    expect(planChart(source(),{...dimensions,references:[]}).status).toBe('invalid');
    expect(planChart(source(),{...dimensions,hiddenSeriesIds:['unknown']}).status).toBe('invalid');
    expect(planChart(source(),{...dimensions,viewport:{axes:'x'}}).status).toBe('invalid');
  });
});
