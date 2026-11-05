import {createDrilldownState,enterDrilldown,drilldownGeneration,ownDrilldownGraph} from '../../dist/drilldown.js';
import type {DrilldownData,DrilldownSourceAdapter,DrilldownView} from '../../dist/drilldown.js';

const data={
  rootId:'root',
  nodes:[
    {id:'root',data:{type:'pie',data:[{id:'segment',value:0}]}},
    {id:'child',data:{type:'column',series:[{id:'series',data:[{id:'point',y:0}]}]}},
  ],
  links:[{fromNodeId:'root',datumId:{seriesId:'segment',pointId:'segment'},toNodeId:'child'}],
} as const satisfies DrilldownData;

const result=ownDrilldownGraph(data);
if(result.status==='ok'){
  const source:typeof data.nodes[number]['data']|undefined=result.value.nodes.get('root')?.data;
  // @ts-expect-error Node data must retain its exact inferred union.
  const bad:number=result.value.nodes.get('root')!.data;
  const state=createDrilldownState({...result.value,host:'native' as const});
  const next=enterDrilldown(state,{...drilldownGeneration(state),datumId:{seriesId:'segment',pointId:'segment'}});
  const host:'native'=next.graph.host;
  void source;void bad;void host;
}

const payload={ids:['row']};
const adapter:DrilldownSourceAdapter<typeof payload>=input=>({type:'column',series:[{id:'s',data:input.ids.map(id=>({id}))}]});
const generic=ownDrilldownGraph({rootId:'r',nodes:[{id:'r',data:payload}],links:[]},{source:adapter});
if(generic.status==='ok'){
  const ids:readonly string[]=generic.value.nodes.get('r')!.data.ids;
  void ids;
}
// @ts-expect-error A source adapter cannot substitute a truthy validation bypass.
const invalidAdapter:DrilldownSourceAdapter<typeof payload>=()=>true;
// @ts-expect-error A saved view does not accept selection or tooltip state.
const view:DrilldownView={hiddenSeriesIds:[],pinned:true};
void invalidAdapter;void view;
