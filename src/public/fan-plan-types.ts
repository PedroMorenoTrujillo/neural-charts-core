import type {PlanLineSpec} from './plan-types.js';
export interface PlanFanBand{readonly id:string;readonly label:string;readonly coverage:number;readonly color?:string;}
export interface PlanFanInterval{readonly bandId:string;readonly low:number|null;readonly high:number|null;}
export interface PlanFanPoint<TX=string|number>{readonly id:string;readonly x:TX;readonly value:number|null;readonly intervals:readonly PlanFanInterval[];}
type FanInput<T>=T extends {axes:infer A;series:readonly{data:readonly{x:infer X}[]}[]}?Readonly<{family:'fan';title:string;description?:string;axes:A;bands:readonly PlanFanBand[];data:readonly PlanFanPoint<X>[];centerName?:string;centerColor?:string}>:never;
/** Caller-supplied central estimates and nested uncertainty intervals. Does not calculate forecasts. */
export type PlanFanSpec=FanInput<PlanLineSpec>;
export type PlanFanValue=Readonly<{kind:'center'}>|Readonly<{kind:'interval';coverage:number;low:number;high:number}>;
export interface PlanFanLayout{readonly bands:readonly Readonly<{id:string;label:string;coverage:number}>[];readonly centerId:'center';}
