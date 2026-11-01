import type {PlanCommand} from './plan-types.js';
export interface PlanParallelAxis {
  readonly id:string;
  readonly label?:string;
  readonly kind:'linear';
  readonly unit?:string;
  readonly domain?:readonly [number,number];
  readonly reversed?:boolean;
  readonly nice?:boolean;
  readonly ticks?:Readonly<{targetCount?:number}>;
}
export interface PlanParallelPoint {readonly id:string;readonly axisId:string;readonly value:number|null;}
export interface PlanParallelSeries {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanParallelPoint[];}
export interface PlanParallelSpec {
  readonly family:'parallel';
  readonly title:string;
  readonly description?:string;
  readonly axes:readonly PlanParallelAxis[];
  readonly series:readonly PlanParallelSeries[];
  readonly coordinates?:'cartesian'|'polar';
}
export interface PlanParallelValue {readonly axisId:string;readonly axisLabel:string;readonly unit:string;}
export interface PlanParallelAxisFrame {
  readonly id:string;readonly label:string;readonly unit:string;
  readonly sourceCount:number;readonly domain?:readonly [number,number];
  readonly from:Readonly<{x:number;y:number}>;readonly to:Readonly<{x:number;y:number}>;
  readonly labelAnchor:Readonly<{x:number;y:number}>;
  readonly ticks:readonly Readonly<{value:number;label:string;x:number;y:number}>[];
}
export interface PlanParallelLayout {
  readonly coordinates:'cartesian'|'polar';
  readonly axes:readonly PlanParallelAxisFrame[];
  readonly commands:readonly PlanCommand[];
}
