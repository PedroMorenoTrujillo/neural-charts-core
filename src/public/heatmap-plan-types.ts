import type {PlanFrame,PlanObservation,PlanOptions,PlanResult} from './plan-types.js';
import type {PlanColorAxisSpec,PlanColorAxisFrame,PlanValueColor} from './color-axis-types.js';
export interface PlanHeatmapCategory {readonly id:string;readonly label?:string;}
export interface PlanHeatmapAxis {readonly kind:'category';readonly values:readonly PlanHeatmapCategory[];readonly reversed?:boolean;}
export interface PlanHeatmapCell {readonly id:string;readonly rowId:string;readonly columnId:string;readonly value:number|null;}
export interface PlanHeatmapSpec {
  readonly family:'heatmap';readonly title:string;readonly description?:string;readonly unit?:string;
  readonly axes:Readonly<{x:PlanHeatmapAxis;y:PlanHeatmapAxis}>;
  /** Sparse original cells; absent coordinates are not materialized. */
  readonly data:readonly PlanHeatmapCell[];
  readonly gapRatio?:number;readonly opacity?:number;readonly colorAxis?:PlanColorAxisSpec;
}
export interface PlanHeatmapValue {readonly rowId:string;readonly columnId:string;readonly rowLabel:string;readonly columnLabel:string;readonly color:Exclude<PlanValueColor,{kind:'missing'}>;}
export interface PlanHeatmapSummary extends PlanHeatmapCell {readonly row:number;readonly column:number;readonly rowLabel:string;readonly columnLabel:string;readonly color:PlanValueColor;readonly painted:boolean;}
export interface PlanHeatmapLayout {
  readonly status:'ready'|'noSource'|'allMissing'|'noInk';readonly rowCount:number;readonly columnCount:number;
  readonly sourceCount:number;readonly knownCount:number;readonly missingCount:number;readonly absentCount:number;readonly paintedCellCount:number;
  readonly gapRatio:number;readonly opacity:number;
}
export interface PlanHeatmapFrame extends Omit<PlanFrame,'family'> {readonly family:'heatmap';readonly heatmapData:readonly PlanHeatmapSummary[];readonly heatmapLayout:PlanHeatmapLayout;readonly colorAxis:PlanColorAxisFrame;}
export interface PlanHeatmapObservation extends PlanObservation {readonly heatmap:PlanHeatmapValue;}
export type PlanHeatmapResult=Extract<PlanResult,{status:'invalid'}>|Readonly<{status:'ok'|'empty';frame:PlanHeatmapFrame}>;
export type PlanHeatmapOptions=Pick<PlanOptions,'width'|'height'|'hiddenSeriesIds'|'stacking'|'viewport'|'references'>;
