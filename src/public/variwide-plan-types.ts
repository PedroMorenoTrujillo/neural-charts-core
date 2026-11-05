import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame, PlanObservation} from './plan-types.js';
import type {PlanTemporalAxis} from './temporal-plan-types.js';

export interface PlanVariwidePoint {
  readonly id: string;
  readonly x: string;
  readonly y: number | null;
  readonly z: number | null;
}

export interface PlanVariwideSeries {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly data: readonly PlanVariwidePoint[];
}

export interface PlanVariwideSpec {
  readonly family: 'variwide';
  readonly title: string;
  readonly description?: string;
  readonly axes: Readonly<{
    x: Readonly<{type: 'category'; values: readonly Readonly<{id: string; label: string}>[]; reversed?: boolean}>;
    y: Extract<PlanTemporalAxis, {type: 'linear'}>;
  }>;
  /** One measured width per category; multiseries layout is deliberately not implied. */
  readonly series: readonly [] | readonly [PlanVariwideSeries];
  readonly pointPadding?: number;
}

export interface PlanVariwideValue {
  readonly z: number;
  readonly share: number;
  readonly zeroWidth: boolean;
  readonly geometryOmitted: boolean;
}

export interface PlanVariwideCategoryBand {
  readonly categoryId: string;
  readonly label: string;
  readonly pointId?: string;
  readonly z: number | null;
  readonly left: number | null;
  readonly right: number | null;
  readonly status: 'visible' | 'zero' | 'unknown' | 'below-precision' | 'hidden' | 'no-positive-width';
}

export interface PlanVariwideSummary {
  readonly id: Readonly<{seriesId: string; pointId: string}>;
  readonly categoryId: string;
  readonly y: number | null;
  readonly z: number | null;
  readonly visible: boolean;
  readonly missingValue: boolean;
  readonly missingWidth: boolean;
}

export interface PlanVariwideObservation extends PlanObservation {
  readonly variwide: PlanVariwideValue;
}

export interface PlanVariwideFrame extends Omit<PlanFrame, 'family' | 'observations'> {
  readonly family: 'variwide';
  readonly observations: readonly PlanVariwideObservation[];
  readonly categoryBands: readonly PlanVariwideCategoryBand[];
  readonly variwideData: readonly PlanVariwideSummary[];
  readonly variwideLayout: Readonly<{status: 'ready' | 'no-positive-width'; incomplete: boolean}>;
}

export type PlanVariwideResult = Readonly<{status: 'ok' | 'empty'; frame: PlanVariwideFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
