import type { ColumnProjection, ColumnRect } from './geometry.js';
import type { Layers } from '../internal/axes/scene.js';
import type { Palette } from '../internal/chart/presentation.js';
export function columnScene<T>(projection: ColumnProjection<T>, palette: Palette, layers: Layers): void {
  for(const r of projection.rects)layers.marks.push({kind:'rect',key:r.key,x:r.x,y:r.y,width:r.width,height:r.height,clipKey:'plot',presentation:{fill:{kind:'solid',value:r.series.spec.color??palette.series[r.series.colorIndex]!}}});
}
export function columnFocusScene<T>(rect: ColumnRect<T>, palette: Palette, layers: Layers): void {
  layers.interaction.push({kind:'rect',key:'focus',x:rect.x,y:rect.y,width:Math.max(2,rect.width),height:Math.max(2,rect.height),clipKey:'plot',presentation:{fill:{kind:'none'},stroke:{kind:'solid',value:palette.focus},strokeWidth:2}});
}
