import type {PlanTemporalAxis} from './temporal-plan-types.js';
export interface PlanFlameSpan {
  readonly id:string;readonly label:string;
  readonly start:number;readonly end:number;
  readonly parentId?:string;
}
/** A single-thread call trace. Source start/end coordinates are never accumulated. */
export interface PlanFlameSpec {
  readonly family:'flame';readonly title:string;readonly description?:string;
  readonly axes:Readonly<{x:PlanTemporalAxis}>;
  readonly data:readonly PlanFlameSpan[];
  readonly rowPadding?:number;
}
export interface PlanFlameValue {
  readonly parentId?:string;readonly depth:number;readonly childCount:number;
  /** Derived inclusive duration minus direct-child durations. */
  readonly selfDuration:number;
}
export interface PlanFlameLayout {readonly maxDepth:number;readonly nodeCount:number;readonly rootCount:number;}
