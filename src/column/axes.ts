import type { ColumnChartSpec } from '../public/column-types.js';
import type { ChartResult } from '../public/chart-types.js';
import type { Domain } from '../internal/math/domain.js';
import type { AxesPlan, TickLabel } from '../internal/axes/plan.js';
import type { ResolvedFont } from '../internal/chart/presentation.js';
import type { TextMeasurer } from '../internal/layout/text.js';
import { planAxes, filterLabels, formatAxis } from '../internal/axes/plan.js';
import { createCategoryFrame, createPointScale } from '../internal/math/category.js';
import { createLinearScale } from '../internal/math/linear.js';
import { categoryEllipsis, ellipsis } from '../internal/layout/text.js';
import { ok } from '../internal/diagnostics.js';

export function planColumnAxes<T>(spec: ColumnChartSpec<T>, domain: Domain | null, width: number, height: number, font: ResolvedFont, labels: ReadonlyMap<string,string>, measurer: TextMeasurer, compact: boolean): ChartResult<AxesPlan> {
  const horizontal=spec.orientation==='horizontal', direction=spec.direction??'ltr';
  const top=spec.axes.x.title?26:8,bottom=font.size*1.25+18+(spec.axes.y.title?22:0);
  const categoryCount=spec.axes.x.ticks?.targetCount??Math.max(2,Math.min(12,Math.floor((height-top-bottom)/(font.size*1.25+3))));
  // Select numeric ticks/domain in the shared planner, then lay out category
  // labels vertically without its unrelated horizontal collision reduction.
  const x=horizontal?{...spec.axes.x,ticks:{targetCount:categoryCount},labels:{maxWidth:0}}:spec.axes.x;
  const input={x,y:spec.axes.y,domains:{x:null,y:domain},width:horizontal?height:width,height:horizontal?width:height,font,direction,labels,measurer,compact};
  const selected=planAxes(input);if(selected.status==='invalid'||!horizontal)return selected;
  const measure=(s:string)=>measurer.measure(s,font,direction),numeric=selected.value.y;
  const cap=Math.min(spec.axes.x.labels?.maxWidth??160,width*.38),all=spec.axes.x.values.map(c=>c.label??c.id);
  const names=new Map<string,string>(),duplicates=new Set<string>(),seen=new Set<string>();for(const name of all){if(seen.has(name))duplicates.add(name);seen.add(name);}
  for(const c of spec.axes.x.values)names.set(c.id,duplicates.has(c.label??c.id)?`${c.label??c.id} · ${c.id}`:c.label??c.id);
  const categoryLabels=selected.value.x.ticks.map(id=>names.get(String(id))??String(id));
  let maxWidth=0;for(const s of categoryLabels){const text=categoryEllipsis(s,categoryLabels,cap,measure);if(text)maxWidth=Math.max(maxWidth,measure(text).width);}
  const left=Math.min(width,maxWidth+12),right=Math.min(width*.2,32);
  const plot=Object.freeze({x:left,y:top,width:Math.max(0,width-left-right),height:Math.max(0,height-top-bottom)});
  const category=createCategoryFrame(spec.axes.x.values.map(c=>c.id),[plot.y,plot.y+plot.height],.5);if(category.status==='invalid')return category;
  const points=createPointScale(category.value);
  const values=numeric.domain?createLinearScale(numeric.domain,spec.axes.y.reversed?[plot.x+plot.width,plot.x]:[plot.x,plot.x+plot.width],false):null;if(values?.status==='invalid')return values;
  const mapX=(v:string|number)=>typeof v==='number'&&values?.status==='ok'?values.value.map(v):null;
  const mapY=(rank:number)=>category.value.centerAt(rank);
  const xl:TickLabel[]=numeric.ticks.map(v=>{const full=formatAxis(v,'linear',null,labels),pos=mapX(v)??0,limit=Math.min(spec.axes.y.labels?.maxWidth??96,2*Math.max(0,Math.min(pos,width-pos))),text=ellipsis(full,limit,measure),m=measure(text??'');return{value:v,full,text,position:pos,box:{x:pos-m.width/2,y:plot.y+plot.height+8,width:m.width,height:m.height},baseline:m.baseline};});
  const yl:TickLabel[]=selected.value.x.ticks.map(id=>{const full=names.get(String(id))??String(id),text=categoryEllipsis(full,categoryLabels,Math.max(0,left-10),measure),m=measure(text??''),pos=points.center(String(id))??0;return{value:id,full,text,position:pos,box:{x:left-8-m.width,y:pos-m.height/2,width:m.width,height:m.height},baseline:m.baseline};});
  return ok(Object.freeze({plot,tooSmall:plot.width<48||plot.height<32||!numeric.domain,x:{...numeric,labels:filterLabels(xl)},y:{...selected.value.x,labels:filterLabels(yl,1)},mapX,mapY,xTitle:spec.axes.y.title?ellipsis(spec.axes.y.title,plot.width,measure):null,yTitle:spec.axes.x.title?ellipsis(spec.axes.x.title,Math.max(0,width-plot.x-8),measure):null,font,direction}));
}
