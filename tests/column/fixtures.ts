import type { ColumnChartSpec } from '../../src/public/column-types.js';
export function columnFixture(name='grouped'):ColumnChartSpec {
  const count=name==='dense'?100:name==='long-labels'?3:name==='single'?1:name==='thirty'?30:10,seriesCount=name==='dense'?10:name==='basic'?1:2;
  const labels=['January','February','March','April','May','June','July','August','September','October'];
  const spec:ColumnChartSpec={family:'column',title:'Open and closed requests',description:'Synthetic monthly requests · supplied target 12',axes:{x:{kind:'category',title:'Month',values:Array.from({length:count},(_,i)=>({id:'m'+i,label:name==='long-labels'?['Customer onboarding and implementation requests with an exceptionally long category label','Enterprise support and product operations requests','International accounts · coordinación y atención al cliente'][i]!:name==='duplicates'&&i<2?'January':labels[i%10]!}))},y:{kind:'linear',title:'Requests'}},series:Array.from({length:seriesCount},(_,s)=>({id:s===0?'open':s===1?'closed':'s'+s,name:s===0?'Open':s===1?'Closed':'Series '+(s+1),data:Array.from({length:count},(_,i)=>({id:`p${s}-${i}`,x:'m'+i,y:name==='negative'?(s===0?1:-1)*(6+(i*7)%23):name==='gaps'&&i===1?null:i===2?0:6+(i*7+s*3)%23,datum:{category:i,series:s}})).filter((_,i)=>!(name==='gaps'&&s===1&&i===3))})),references:[{id:'target',axis:'y',value:12,label:'Target · 12 (provided)'}],tooltip:{mode:'shared'}};
  if(name==='empty')return{...spec,series:[]};
  if(name==='average'){const values=spec.series[0]!.data.map(p=>p.y).filter((v):v is number=>v!==null),mean=values.reduce((a,b)=>a+b,0)/values.length;return{...spec,description:'Mean of provided Open observations; zero included, null excluded; independent of legend visibility.',references:[{id:'open-mean',axis:'y',value:mean,label:`Open mean · ${mean} (provided; zero included)`}]};}
  if(name==='zero')return{...spec,series:spec.series.map(s=>({...s,data:s.data.map(p=>({...p,y:0}))}))};
  if(name==='hidden')return{...spec,state:{mode:'controlled',value:{hiddenSeriesIds:spec.series.map(s=>s.id)}}};
  if(name==='custom')return{...spec,series:spec.series.map((s,i)=>({...s,color:i===0?'#2563eb':'#c2410c'}))};
  if(name==='loading')return{...spec,status:{kind:'loading',message:'Loading request data…'}};
  if(name==='error')return{...spec,status:{kind:'error',message:'Request data could not be loaded.'}};
  return spec;
}
