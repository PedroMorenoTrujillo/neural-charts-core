import type { ChartResult, ChartState } from '../public/chart-types.js';
import type { ColumnPoint } from '../public/column-types.js';
import type { ChartCategoryWindow } from '../public/viewport-types.js';
import type { Domain } from '../internal/math/domain.js';
import type { Plot } from '../internal/layout/frame.js';
import type { BandScale } from '../internal/math/category.js';
import type { NormalizedColumn, NormalizedColumnSeries } from './normalize.js';
import { columnKey } from './normalize.js';
import { createCategoryFrame, createBandScale } from '../internal/math/category.js';
import { createLinearScale } from '../internal/math/linear.js';
import { invalid, ok } from '../internal/diagnostics.js';
import { viewportBand } from '../internal/interaction/viewport-band.js';

export type ColumnRect<T> = Readonly<{ key: string; point: ColumnPoint<T>; series: NormalizedColumnSeries<T>; seriesIndex: number; categoryIndex: number; eligibleIndex: number; x: number; y: number; width: number; height: number; anchor: Readonly<{ x: number; y: number }> }>;
export type ColumnProjection<T> = Readonly<{ plot: Plot; horizontal: boolean; bands: BandScale; categoryOffset: number; ranks: ReadonlyMap<string,number>; rects: readonly ColumnRect<T>[]; rows: readonly (readonly ColumnRect<T>[])[]; byId: ReadonlyMap<string, ColumnRect<T>>; byCategory: readonly ReadonlyMap<number, ColumnRect<T>>[]; slotWidth: number; slotGap: number; groupWidth: number; mapValue(value: number): number | null }>;
export function projectColumn<T>(data: NormalizedColumn<T>, state: ChartState, plot: Plot, domain: Domain, window?: ChartCategoryWindow): ChartResult<ColumnProjection<T>> {
  if (![plot.x,plot.y,plot.width,plot.height].every(Number.isFinite) || plot.width <= 0 || plot.height <= 0) return invalid('INVALID_CONFIG','BAD_PLOT','plot');
  const horizontal = data.spec.orientation === 'horizontal', hidden = new Set(state.hiddenSeriesIds), visible = data.series.filter(s => !hidden.has(s.spec.id));
  const categoryStart = horizontal ? plot.y : plot.x, categorySize = horizontal ? plot.height : plot.width;
  const scoped = viewportBand(data.spec.axes.x.values.map(c => c.id), data.ranks, window); if (scoped.status === 'invalid') return scoped;
  const frame = createCategoryFrame(scoped.value.ids, [categoryStart, categoryStart + categorySize], .5); if (frame.status === 'invalid') return frame;
  const bands = createBandScale(frame.value, data.spec.groupGap ?? .2); if (bands.status === 'invalid') return bands;
  let range: readonly [number,number] = horizontal ? [plot.x,plot.x+plot.width] : [plot.y+plot.height,plot.y];
  if (data.spec.axes.y.reversed) range = [range[1],range[0]];
  const scale = createLinearScale(domain,range,true); if (scale.status === 'invalid') return scale;
  const baseline = scale.value.map(0); if (baseline === null) return invalid('INVALID_DOMAIN','UNREPRESENTABLE_GEOMETRY','baseline');
  const m = visible.length, q = data.spec.barGap ?? .2, slotWidth = m ? Math.min(bands.value.width/(m+(m-1)*q), data.spec.maxBarWidth ?? Infinity) : 0, slotGap = q*slotWidth, groupWidth = m ? m*slotWidth+(m-1)*slotGap : 0;
  const rects: ColumnRect<T>[] = [], rows: ColumnRect<T>[][] = visible.map(()=>[]), byId = new Map<string,ColumnRect<T>>(), byCategory: Map<number,ColumnRect<T>>[] = data.spec.axes.x.values.map(()=>new Map());
  for (let si=0;si<visible.length;si++) {
    const series=visible[si]!;
    for (const point of series.valid) {
      const v=point.y!, categoryIndex=data.ranks.get(point.x)!;
      if(categoryIndex<scoped.value.offset||categoryIndex>=scoped.value.offset+scoped.value.ids.length)continue;
      const band=bands.value.band(point.x);if(!band)return invalid('INTERNAL_INVARIANT','MISSING_CATEGORY_BAND','viewport.x');
      if (Math.max(0,v)<domain[0] || Math.min(0,v)>domain[1]) continue;
      const end=scale.value.map(v); if(end===null) return invalid('INVALID_DOMAIN','UNREPRESENTABLE_GEOMETRY','series.'+series.spec.id+'.'+point.id);
      const category=band.start+(band.width-groupWidth)/2+si*(slotWidth+slotGap), length=Math.abs(end-baseline), start=Math.min(end,baseline), key=columnKey(series.spec.id,point.id);
      const rect: ColumnRect<T> = Object.freeze({ key,point,series,seriesIndex:si,categoryIndex,eligibleIndex:rows[si]!.length,x:horizontal?start:category,y:horizontal?category:start,width:horizontal?length:slotWidth,height:horizontal?slotWidth:length,anchor:Object.freeze(horizontal?{x:end,y:category+slotWidth/2}:{x:category+slotWidth/2,y:end}) });
      if (![rect.x,rect.y,rect.width,rect.height,rect.anchor.x,rect.anchor.y].every(Number.isFinite)) return invalid('INVALID_DOMAIN','UNREPRESENTABLE_GEOMETRY','rect');
      rects.push(rect);rows[si]!.push(rect);byId.set(key,rect);byCategory[categoryIndex]!.set(si,rect);
    }
  }
  return ok(Object.freeze({plot,horizontal,bands:bands.value,categoryOffset:scoped.value.offset,ranks:data.ranks,rects:Object.freeze(rects),rows:Object.freeze(rows.map(r=>Object.freeze(r))),byId,byCategory:Object.freeze(byCategory),slotWidth,slotGap,groupWidth,mapValue:scale.value.map}));
}
export function pickColumn<T>(projection: ColumnProjection<T>, x: number, y: number): ColumnRect<T> | null {
  const {plot,horizontal,bands,slotWidth,slotGap,groupWidth}=projection;
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<plot.x||x>plot.x+plot.width||y<plot.y||y>plot.y+plot.height||!slotWidth)return null;
  const coordinate=horizontal?y:x, band=bands.bandAt(coordinate);if(!band)return null;
  const start=band.start+(band.width-groupWidth)/2, i=coordinate===start+groupWidth?projection.rows.length-1:Math.floor((coordinate-start)/(slotWidth+slotGap));
  if(i<0||coordinate>start+i*(slotWidth+slotGap)+slotWidth)return null;
  const r=projection.byCategory[band.index+projection.categoryOffset]?.get(i);if(!r)return null;
  const v=horizontal?x:y, low=horizontal?r.x:r.y, length=horizontal?r.width:r.height;
  return v>=low-(length===0?2:0)&&v<=low+length+(length===0?2:0)?r:null;
}
function nearest<T>(row: readonly ColumnRect<T>[], category: number): ColumnRect<T> | null {
  let lo=0,hi=row.length;while(lo<hi){const m=Math.floor((lo+hi)/2);if(row[m]!.categoryIndex<category)lo=m+1;else hi=m;}
  const a=row[Math.max(0,lo-1)],b=row[lo];return !a?b??null:!b?a:category-a.categoryIndex<=b.categoryIndex-category?a:b;
}
export function navigateColumn<T>(p: ColumnProjection<T>, current: ColumnRect<T> | null, key: string, ctrl=false): ColumnRect<T> | null {
  if(!current)return p.rects[0]??null;
  const row=p.rows[current.seriesIndex]??[], index=current.eligibleIndex;
  if(key==='Home'||key==='End'){const target=ctrl?(key==='End'?[...p.rows].reverse():p.rows).find(r=>r.length):row;return target?.[key==='End'?target.length-1:0]??current;}
  if(key==='ArrowLeft'||key==='ArrowRight')return row[index+(key==='ArrowRight'?1:-1)]??current;
  if(key==='ArrowUp'||key==='ArrowDown'){const step=key==='ArrowDown'?1:-1;for(let i=current.seriesIndex+step;i>=0&&i<p.rows.length;i+=step){const next=nearest(p.rows[i]!,current.categoryIndex);if(next)return next;}}
  return current;
}
export function reconcileColumn<T>(p: ColumnProjection<T>, old: ColumnRect<T> | null): ColumnRect<T> | null {
  if(!old)return p.rects[0]??null;
  const exact=p.byId.get(old.key);if(exact)return exact;
  const same=p.rows.find(row=>row[0]?.series.spec.id===old.series.spec.id);
  return (same&&nearest(same,p.ranks.get(old.point.x)??old.categoryIndex))??p.rects[0]??null;
}

// A compact side dock leaves the baseline half of horizontal bars available to touch.
export function columnDockBody(body: Plot, rect: Plot, horizontal: boolean, direction: 'ltr' | 'rtl'): Plot {
  if(!horizontal||body.width<280||body.width>430)return body;
  const width=144,right=body.x+body.width-width,left=body.x;
  const end={x:right,y:body.y,width,height:body.height},start={x:left,y:body.y,width,height:body.height};
  const fitsEnd=rect.x+rect.width+10<=right,fitsStart=rect.x-10>=left+width;
  return direction==='rtl'?(fitsStart?start:fitsEnd?end:body):(fitsEnd?end:fitsStart?start:body);
}
