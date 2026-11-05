import type { ColumnProjection, ColumnRect } from './geometry.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette, ResolvedFont } from '../internal/chart/presentation.js';
export function columnScene<T>(projection: ColumnProjection<T>, palette: Palette, layers: Layers): void {
  for(const r of projection.rects)layers.marks.push({type:'rect',key:r.key,x:r.x,y:r.y,width:r.width,height:r.height,clipKey:'plot',presentation:{fill:{type:'solid',value:r.series.spec.color??palette.series[r.series.colorIndex]!}}});
}
export function columnFocusScene<T>(rect: ColumnRect<T>, palette: Palette, layers: Layers): void {
  layers.interaction.push({type:'rect',key:'focus',x:rect.x,y:rect.y,width:Math.max(2,rect.width),height:Math.max(2,rect.height),clipKey:'plot',presentation:{fill:{type:'none'},stroke:{type:'solid',value:palette.focus},strokeWidth:2}});
}

// Reference captions live below the axes so readable text never covers a bar.
export function columnReferenceCaption(layers: Layers, text: string | null, palette: Palette, font: ResolvedFont, direction: 'ltr' | 'rtl', width: number, height: number): void {
  if(!text)return;
  layers.labels.push({type:'text',key:'references-caption',x:direction==='rtl'?width-12:12,y:height-font.size*.75-2,text,anchor:'start',baseline:'middle',fontFamily:font.family,fontSize:font.size,fontWeight:font.weight,presentation:{fill:{type:'solid',value:palette.reference}}});
}
