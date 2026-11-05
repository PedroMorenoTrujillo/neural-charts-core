import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame, PlanObservation} from './plan-types.js';
import type {PlanTemporalAxis} from './temporal-plan-types.js';

export interface PlanBulletPoint {
  readonly id: string;
  readonly x: string;
  readonly y: number | null;
  readonly target?: number | null;
}
export interface PlanBulletSeries {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly data: readonly PlanBulletPoint[];
}
/** Decorative qualitative range: never an observation, legend series or domain input. */
export interface PlanBulletBand {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly label?: string;
  readonly color?: string;
}
export interface PlanBulletSpec {
  readonly family: 'bullet';
  readonly title: string;
  readonly description?: string;
  readonly axes: Readonly<{
    x: Readonly<{type: 'category'; values: readonly Readonly<{id: string; label: string}>[]; reversed?: boolean}>;
    y: Extract<PlanTemporalAxis, {type: 'linear'}>;
  }>;
  readonly series: readonly PlanBulletSeries[];
  readonly bands?: readonly PlanBulletBand[];
  readonly orientation?: 'horizontal' | 'vertical';
  readonly pointPadding?: number;
}
export interface PlanBulletValue {
  readonly type: 'measure' | 'target';
  readonly measure: number | null;
  readonly target?: number | null;
}
export interface PlanBulletSummary {
  readonly id: Readonly<{seriesId: string; pointId: string}>;
  readonly categoryId: string;
  readonly measure: number | null;
  readonly target?: number | null;
  readonly visible: boolean;
}
export interface PlanBulletBandGeometry {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly label: string;
  readonly color: string;
  readonly status: 'visible' | 'outside';
  readonly rect?: Readonly<{x: number; y: number; width: number; height: number}>;
}
export interface PlanBulletTargetGeometry {
  readonly id: Readonly<{seriesId: string; pointId: string}>;
  readonly value: number;
  readonly status: 'visible' | 'outside';
  readonly line?: Readonly<{x1: number; y1: number; x2: number; y2: number}>;
}
export interface PlanBulletObservation extends PlanObservation {readonly bullet: PlanBulletValue;}
export interface PlanBulletFrame extends Omit<PlanFrame, 'family' | 'observations'> {
  readonly family: 'bullet';
  readonly observations: readonly PlanBulletObservation[];
  readonly bulletData: readonly PlanBulletSummary[];
  readonly bulletBands: readonly PlanBulletBandGeometry[];
  readonly bulletTargets: readonly PlanBulletTargetGeometry[];
  readonly bulletOrientation: 'horizontal' | 'vertical';
  /** Explicit lines allow horizontal value grids without abusing a categorical y scale. */
  readonly bulletGrid: readonly Readonly<{x1: number; y1: number; x2: number; y2: number}>[];
}
export type PlanBulletResult = Readonly<{status: 'ok' | 'empty'; frame: PlanBulletFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
