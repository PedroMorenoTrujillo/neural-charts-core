import type {ChartResult,ChartState} from '../public/chart-types.js';
import type {MixedData} from '../mixed/data.js';
import {mixedDomains} from '../mixed/data.js';
import {lineDomains} from '../line/normalize.js';
import {stackedDomain} from '../stacked/geometry.js';
import type {Domain} from '../internal/math/domain.js';

/** A single mixed axis contains raw line/area values and accumulated columns. */
export function mixedStackDomain<T>(data:MixedData<T>,state:ChartState,stacking?:'sum'|'percent'):ChartResult<Readonly<{x:Domain|null;y:Domain|null}>> {
  if(!stacking||!data.column.series.length)return mixedDomains(data,state);
  const columns=stackedDomain(data.column,state,stacking);if(columns.status==='invalid')return columns;
  const other=lineDomains({...data.line,series:data.line.series.filter(s=>data.kinds.get(s.spec.id)!=='column')},state);if(other.status==='invalid')return other;
  const a=columns.value,b=other.value.y,y=a&&b?[Math.min(a[0],b[0]),Math.max(a[1],b[1])] as const:a??b;
  return {status:'ok',value:{x:null,y}};
}
