import type {LineChartSpec} from '../../src/public/types.js';
export const fixtureNames=['simple category','two series','irregular linear','irregular time','null break','null connect','steps','marker modes','dash styles','long labels','references','internal legend','controlled legend','all hidden','loading','empty','error','320px','390px','light','dark','RTL','100k table fixture','invalid update preservation','resize','destroy/remount'] as const;
export function lineFixture(name:string):LineChartSpec {
  const categories=Array.from({length:7},(_,i)=>({id:'c'+i,label:name==='long labels'?'A long category label with details '+i:'Category '+i}));
  const data=categories.map((c,i)=>({id:'p'+i,x:c.id,y:name.startsWith('null')&&i===3?null:[2,7,4,8,3,6,5][i]!}));
  const base:LineChartSpec={family:'line',title:name,description:'Private Neural Charts acceptance fixture',axes:{x:{type:'category',values:categories,title:'Period'},y:{type:'linear',domain:[0,10],title:'Value'}},series:[{id:'s',name:'Observed',data}],tooltip:{mode:'shared'}};
  if(name==='irregular linear'||name==='irregular time'||name==='100k table fixture'){
    const type=name==='irregular time'?'time':'linear',count=name==='100k table fixture'?100000:7;
    const points=Array.from({length:count},(_,i)=>({id:'p'+i,x:type==='time'?1700000000000+i*i*1000:i*i,y:i%20===1?null:2+Math.sin(i*.3)*2}));
    return {...base,axes:{x:{type,title:type},y:{type:'linear'}},series:[{id:'s',name:'Observed',data:points}]} as LineChartSpec;
  }
  if(name==='two series')return {...base,series:[base.series[0]!,{id:'other',name:'Expected',data:data.map(p=>({...p,y:p.y===null?null:10-p.y}))}]} as LineChartSpec;
  if(name==='null connect')return {...base,series:[{...base.series[0]!,gaps:'connect'}]} as LineChartSpec;
  if(name==='steps')return {...base,series:['step-before','step-after','step-mid'].map((curve,i)=>({...base.series[0]!,id:'step'+i,name:curve,curve}))} as LineChartSpec;
  if(name==='marker modes')return {...base,series:['auto','on','off'].map((markers,i)=>({...base.series[0]!,id:'marker'+i,name:markers,markers}))} as LineChartSpec;
  if(name==='dash styles')return {...base,series:['solid','dashed','dotted'].map((dash,i)=>({...base.series[0]!,id:'dash'+i,name:dash,dash}))} as LineChartSpec;
  if(name==='references')return {...base,references:[{id:'x',axis:'x',value:'c3',label:'Reference X'},{id:'y',axis:'y',value:5,label:'Target'}]} as LineChartSpec;
  if(name==='controlled legend')return {...base,state:{mode:'controlled',value:{hiddenSeriesIds:[]}}};
  if(name==='all hidden')return {...base,state:{mode:'controlled',value:{hiddenSeriesIds:['s']}}};
  if(name==='loading'||name==='empty')return {...base,status:{type:name}};
  if(name==='error')return {...base,status:{type:'error',message:'Fixture error'}};
  if(name==='dark'||name==='light')return {...base,theme:name};
  if(name==='RTL')return {...base,direction:'rtl'};
  return base;
}
