import type {PlanFrame,PlanObservation,PlanResult} from './plan-types.js';
import type {PlanTemporalAxis} from './temporal-plan-types.js';

export type PlanContourAxis=Extract<PlanTemporalAxis,{type:'linear'}>;
export interface PlanContourGrid {
  readonly id:string;
  readonly x:readonly number[];
  readonly y:readonly number[];
  /** Original sample IDs and scalar values share the same row-major order. */
  readonly ids:readonly string[];
  readonly values:readonly (number|null)[];
  readonly unit?:string;
}
export interface PlanContourLevel {
  readonly id:string;
  readonly value:number;
  readonly name?:string;
  readonly color?:string;
}
export interface PlanContourSpec {
  readonly family:'contour';
  readonly title:string;
  readonly description?:string;
  readonly axes:Readonly<{x:PlanContourAxis;y:PlanContourAxis}>;
  readonly grid:PlanContourGrid;
  readonly contour:Readonly<{
    readonly levels:readonly PlanContourLevel[];
    /** Complete isoline calculation budget, before viewport clipping. */
    readonly segmentBudget?:number;
  }>;
}
export interface PlanContourPoint {readonly x:number;readonly y:number;}
export interface PlanContourSample extends PlanContourPoint {
  readonly id:string;
  readonly value:number|null;
}
export interface PlanContourValue {
  readonly type:'isoline';
  readonly levelId:string;
  readonly level:number;
  readonly gridId:string;
  readonly row:number;
  readonly column:number;
  readonly sourceIds:readonly [string,string,string,string];
  readonly sourceValues:readonly [number,number,number,number];
  /** Interpolated source coordinates, not additional measured samples. */
  readonly sourceStart:PlanContourPoint;
  readonly sourceEnd:PlanContourPoint;
  /** Plot-local clipped segment used for drawing and bounded native picking. */
  readonly start:PlanContourPoint;
  readonly end:PlanContourPoint;
}
export interface PlanContourLayout {
  readonly method:'marching-squares-bilinear';
  readonly gridId:string;
  readonly columns:number;
  readonly rows:number;
  readonly missingCells:number;
  readonly knownSamples:number;
  readonly segmentCount:number;
  readonly visibleSegments:number;
  readonly segmentBudget:number;
  readonly samples:readonly PlanContourSample[];
  readonly levels:readonly Readonly<{id:string;value:number}>[];
  readonly emptyReason?:'hidden'|'missing'|'noCrossings'|'outsideViewport';
}
export interface PlanContourObservation extends Omit<PlanObservation,'hit'> {
  readonly contour:PlanContourValue;
  readonly hit?:never;
}
export interface PlanContourFrame extends Omit<PlanFrame,'family'|'observations'> {
  readonly family:'contour';
  readonly observations:readonly PlanContourObservation[];
  readonly contour:PlanContourLayout;
}
export type PlanContourResult=Readonly<{status:'ok'|'empty';frame:PlanContourFrame}>|Extract<PlanResult,{status:'invalid'}>;
