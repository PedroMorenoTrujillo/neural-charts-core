import type {PlanRadarSpec,PlanRadarSeries,PlanPieSpec} from './plan-types.js';

/** Directions are ordered clockwise from twelve o'clock. Values are frequencies. */
export interface PlanWindRoseSpec {
  readonly family:'windrose';
  readonly title:string;
  readonly description?:string;
  readonly axes:PlanRadarSpec['axes'];
  readonly series:readonly PlanRadarSeries[];
  readonly stacking?:'sum'|'percent';
  readonly gapRatio?:number;
}

/** Each original item owns one concentric progress band on a common value scale. */
export interface PlanRadialBarSpec {
  readonly family:'radialbar';
  readonly title:string;
  readonly description?:string;
  readonly unit?:string;
  readonly data:PlanPieSpec['data'];
  readonly domain?:readonly [number,number];
  readonly gapRatio?:number;
  readonly innerRadiusRatio?:number;
}
