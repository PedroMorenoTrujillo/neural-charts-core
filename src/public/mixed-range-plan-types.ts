import type {MixedChartSpec} from './mixed-types.js';
import type {PlanRangeSeries} from './plan-types.js';
export interface PlanMixedRangeSeries extends PlanRangeSeries<string>{
 readonly type:'arearange'|'areasplinerange';readonly yAxis?:never;
}
export type PlanMixedRangeLineSeries=Extract<MixedChartSpec['series'][number],Readonly<{type:'line'|'area'}>>&Readonly<{type:'line';yAxis?:'primary'}>;
/** One category frame and one original-value scale for supplied ranges and lines. */
export interface PlanMixedRangeSpec{
 readonly family:'mixed';readonly title:string;readonly description?:string;
 readonly axes:MixedChartSpec['axes']&Readonly<{secondaryY?:never}>;
 readonly series:readonly (PlanMixedRangeSeries|PlanMixedRangeLineSeries)[];
 readonly groupGap?:never;readonly barGap?:never;readonly maxBarWidth?:never;
}
export interface PlanMixedRangesLayout{
 readonly mode:'range-line';
 readonly series:readonly Readonly<{id:string;type:'line'|'arearange'|'areasplinerange'}>[];
}
