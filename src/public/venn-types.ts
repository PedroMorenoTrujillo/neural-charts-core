import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame} from './plan-types.js';

export interface PlanVennSet {readonly id:string;readonly label:string;}
/** Inclusive measurements: A∩B includes the A∩B∩C population. */
export interface PlanVennMeasure {readonly id:string;readonly sets:readonly string[];readonly value:number|null;}
export interface PlanVennSpec {
  readonly family:'venn';readonly title:string;readonly description?:string;
  /** One to three explicitly named sets. */
  readonly sets:readonly PlanVennSet[];
  /** Every nonempty combination must be explicit, including zero or null. */
  readonly data:readonly PlanVennMeasure[];
  readonly padding?:number;
}
export interface PlanVennCircle {readonly id:string;readonly bit:number;readonly cx:number;readonly cy:number;readonly radius:number;readonly value:number;}
export interface PlanVennValue {
  readonly kind:'inclusive-intersection';readonly sets:readonly string[];readonly mask:number;
  /** Membership uses the exact circles in vennLayout, not a polygon surrogate. */
  readonly geometry:'placed'|'omitted';
}
export interface PlanVennSummary {
  readonly id:Readonly<{seriesId:string;pointId:string}>;readonly sets:readonly string[];
  readonly value:number|null;readonly visible:boolean;readonly label:string;
}
export interface PlanVennAreaError {readonly sets:readonly string[];readonly expected:number;readonly actual:number;}
export interface PlanVennLayout {
  readonly circles:readonly PlanVennCircle[];
  readonly status:'exact'|'approximate'|'unknown'|'allZero'|'hidden'|'noSource';
  readonly errors:readonly PlanVennAreaError[];
  /** Absolute area residual as a fraction of the largest visible set measure. */
  readonly maxErrorRatio:number;
  readonly objectiveEvaluations:number;readonly budgetExhausted:boolean;
  readonly omittedAnchors:number;
}
export interface PlanVennFrame extends Omit<PlanFrame,'family'> {
  readonly family:'venn';readonly vennData:readonly PlanVennSummary[];readonly vennLayout:PlanVennLayout;
}
export type PlanVennResult=Readonly<{status:'ok'|'empty';frame:PlanVennFrame}>|Readonly<{status:'invalid';diagnostic:ChartDiagnostic}>;
