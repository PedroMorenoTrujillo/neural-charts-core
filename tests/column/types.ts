import { createColumnChart } from '../../src/column.js';
import type { ColumnChartSpec, ColumnPointActivation, ColumnPoint } from '../../src/column.js';
type IsAny<T> = 0 extends (1 & T) ? true : false;
const noAny: readonly [IsAny<ColumnChartSpec>,IsAny<ColumnPointActivation<{key:string}>['point']['datum']>] = [false,false];
void noAny;
function compileOnly(host:HTMLElement):void {
  const spec:ColumnChartSpec<{key:string}>={family:'column',title:'Strict Column',orientation:'horizontal',axes:{x:{kind:'category',values:[{id:'a',label:'A'}]},y:{kind:'linear',domain:[-10,10]}},series:[{id:'open',name:'Open',data:[{id:'a',x:'a',y:0,datum:{key:'original'}}]}],references:[{id:'target',axis:'y',value:2}]};
  const event=(e:ColumnPointActivation<{key:string}>)=>{const x:string=e.point.x;const value:number|null=e.point.y;const datum:string|undefined=e.point.datum?.key;void[x,value,datum];};
  const result=createColumnChart(host,spec,{instanceId:'strict',onPointActivate:event});
  if(result.status==='ok'){const status=result.value.update({...spec,theme:'dark'});result.value.refresh();result.value.getState();result.value.getSnapshot();result.value.destroy();void status;}
  // @ts-expect-error Column category identity is a string.
  const numeric:ColumnPoint={id:'a',x:1,y:2};
  // @ts-expect-error Undefined is not a missing observation; null is explicit.
  const absent:ColumnPoint={id:'a',x:'a',y:undefined};
  // @ts-expect-error Wrong family cannot enter this public factory.
  createColumnChart(host,{...spec,family:'line'},{instanceId:'invalid'});
  // @ts-expect-error Category axes cannot be replaced by temporal axes.
  createColumnChart(host,{...spec,axes:{x:{kind:'time'},y:{kind:'linear'}}},{instanceId:'invalid'});
  // @ts-expect-error Stacking belongs to the later 0.5 gate.
  createColumnChart(host,{...spec,stacking:'sum'},{instanceId:'invalid'});
  // @ts-expect-error Rounding is excluded from NC-01C.
  createColumnChart(host,{...spec,radius:8},{instanceId:'invalid'});
  // @ts-expect-error A series does not accept a Line curve.
  createColumnChart(host,{...spec,series:[{id:'s',name:'S',data:[],curve:'step-mid'}]},{instanceId:'invalid'});
  // @ts-expect-error Zero inclusion is an automatic baseline policy, not a disable switch.
  createColumnChart(host,{...spec,axes:{...spec.axes,y:{kind:'linear',includeZero:false}}},{instanceId:'invalid'});
  // @ts-expect-error Logical references are Y magnitude only in this slice.
  createColumnChart(host,{...spec,references:[{id:'x',axis:'x',value:'a'}]},{instanceId:'invalid'});
  // @ts-expect-error Arbitrary callbacks/markup are not label configuration.
  createColumnChart(host,{...spec,axes:{...spec.axes,y:{kind:'linear',labels:{formatter:()=>'<b>x</b>'}}}},{instanceId:'invalid'});
  // @ts-expect-error Outputs carry domain events, not DOM mouse events.
  createColumnChart(host,spec,{instanceId:'invalid',onPointActivate:(_event:MouseEvent)=>{}});
  // @ts-expect-error Exact optional properties reject explicit undefined.
  createColumnChart(host,{...spec,groupGap:undefined},{instanceId:'invalid'});
  void[numeric,absent];
}
void compileOnly;
