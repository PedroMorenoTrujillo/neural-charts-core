export interface PlanViolinSample {readonly id:string;readonly value:number|null;}
export interface PlanViolinGroup {readonly id:string;readonly label:string;readonly samples:readonly PlanViolinSample[];readonly color?:string;}
export interface PlanViolinSpec {
  readonly family:'violin';readonly title:string;readonly description?:string;
  readonly groups:readonly PlanViolinGroup[];
  readonly axes?:Readonly<{y:Readonly<{type:'linear';domain?:readonly[number,number];reversed?:boolean;nice?:boolean;unit?:string}>}>;
  /** Compact Epanechnikov kernel width in original measurement units. */
  readonly bandwidth?:number;readonly resolution?:number;
  readonly normalization?:'width'|'area'|'count';readonly gapRatio?:number;
}
export interface PlanViolinValue {
  readonly derived:true;readonly sampleCount:number;readonly missingCount:number;
  readonly minimum:number;readonly q1:number;readonly median:number;readonly q3:number;readonly maximum:number;
  readonly mean:number;readonly bandwidth:number|null;
}
export interface PlanViolinDensity {readonly value:number;readonly density:number;}
export interface PlanViolinGroupFrame {
  readonly id:string;readonly label:string;readonly visible:boolean;
  readonly sampleCount:number;readonly missingCount:number;
  readonly summary?:PlanViolinValue;
  readonly density:readonly PlanViolinDensity[];
}
export interface PlanViolinLayout {
  readonly kernel:'epanechnikov';readonly normalization:'width'|'area'|'count';
  readonly resolution:number;readonly groups:readonly PlanViolinGroupFrame[];
}
