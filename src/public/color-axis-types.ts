export interface PlanColorStop {readonly at:number;readonly color:string;}
export interface PlanColorClass {readonly id:string;readonly label:string;readonly minInclusive?:number;readonly maxExclusive?:number;readonly color:string;}
export interface PlanContinuousColorAxisSpec {readonly kind:'continuous';readonly domain?:readonly [number,number];readonly stops:readonly PlanColorStop[];readonly missingColor:string;}
export interface PlanClassColorAxisSpec {readonly kind:'classes';readonly classes:readonly PlanColorClass[];readonly missingColor:string;readonly unclassifiedColor:string;}
export type PlanColorAxisSpec=PlanContinuousColorAxisSpec|PlanClassColorAxisSpec;
export type PlanValueColor=Readonly<{kind:'missing';color:string}>
  |Readonly<{kind:'continuous';value:number;ratio:number;clamped:boolean;color:string}>
  |Readonly<{kind:'class';value:number;classId:string;color:string}>
  |Readonly<{kind:'unclassified';value:number;color:string}>;
export interface PlanValueColorMapping {readonly values:readonly PlanValueColor[];readonly domain:readonly [number,number]|null;readonly classes:readonly PlanColorClass[];}
export interface PlanContinuousColorAxisFrame {readonly kind:'continuous';readonly domain:readonly [number,number]|null;readonly domainSource:'explicit'|'source'|'none';readonly stops:readonly PlanColorStop[];readonly missingColor:string;}
export interface PlanClassColorAxisFrame {readonly kind:'classes';readonly classes:readonly PlanColorClass[];readonly missingColor:string;readonly unclassifiedColor:string;}
export type PlanColorAxisFrame=PlanContinuousColorAxisFrame|PlanClassColorAxisFrame;
