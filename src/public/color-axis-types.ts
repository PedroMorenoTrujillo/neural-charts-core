export interface PlanColorStop {readonly at:number;readonly color:string;}
export interface PlanColorClass {readonly id:string;readonly label:string;readonly minInclusive?:number;readonly maxExclusive?:number;readonly color:string;}
export interface PlanContinuousColorAxisSpec {readonly type:'continuous';readonly domain?:readonly [number,number];readonly stops:readonly PlanColorStop[];readonly missingColor:string;}
export interface PlanClassColorAxisSpec {readonly type:'classes';readonly classes:readonly PlanColorClass[];readonly missingColor:string;readonly unclassifiedColor:string;}
export type PlanColorAxisSpec=PlanContinuousColorAxisSpec|PlanClassColorAxisSpec;
export type PlanValueColor=Readonly<{type:'missing';color:string}>
  |Readonly<{type:'continuous';value:number;ratio:number;clamped:boolean;color:string}>
  |Readonly<{type:'class';value:number;classId:string;color:string}>
  |Readonly<{type:'unclassified';value:number;color:string}>;
export interface PlanValueColorMapping {readonly values:readonly PlanValueColor[];readonly domain:readonly [number,number]|null;readonly classes:readonly PlanColorClass[];}
export interface PlanContinuousColorAxisFrame {readonly type:'continuous';readonly domain:readonly [number,number]|null;readonly domainSource:'explicit'|'source'|'none';readonly stops:readonly PlanColorStop[];readonly missingColor:string;}
export interface PlanClassColorAxisFrame {readonly type:'classes';readonly classes:readonly PlanColorClass[];readonly missingColor:string;readonly unclassifiedColor:string;}
export type PlanColorAxisFrame=PlanContinuousColorAxisFrame|PlanClassColorAxisFrame;
