import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame, PlanObservation} from './plan-types.js';
import type {PlanTemporalAxis} from './temporal-plan-types.js';

export interface PlanXRangeRow {
  readonly id: string;
  readonly label: string;
}

export interface PlanXRangePoint {
  readonly id: string;
  readonly rowId: string;
  readonly start: number | null;
  readonly end: number | null;
  readonly label?: string;
  /** Omit for a plain interval; null means unknown progress. */
  /** null is unknown progress; zero is known 0% completion. */
  readonly completed?: number | null;
}

export interface PlanXRangeSeries {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly data: readonly PlanXRangePoint[];
}

export interface PlanXRangeSpec {
  readonly family: 'xrange';
  readonly title: string;
  readonly description?: string;
  readonly axes: Readonly<{
    x: PlanTemporalAxis;
    y: Readonly<{type: 'category'; values: readonly PlanXRangeRow[]; reversed?: boolean}>;
  }>;
  readonly series: readonly PlanXRangeSeries[];
  readonly grouping?: 'grouped' | 'overlap';
  readonly rowPadding?: number;
}

export interface PlanIntervalValue {
  readonly type: 'linear' | 'time';
  readonly rowId: string;
  readonly rowLabel: string;
  readonly start: number;
  readonly end: number;
  readonly duration: number;
  readonly completed?: number | null;
}

export interface PlanIntervalSummary {
  readonly id: Readonly<{seriesId: string; pointId: string}>;
  readonly label: string;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly start: number | null;
  readonly end: number | null;
  readonly duration: number | null;
  readonly completed?: number | null;
  /** Series/legend visibility; this does not mean the datum is inside the current X window. */
  readonly visible: boolean;
  /** At least one source endpoint/coordinate is null; never a fabricated zero. */
  readonly missing: boolean;
}

export interface PlanXRangeObservation extends PlanObservation {
  readonly interval: PlanIntervalValue;
}

/** Own family/result types keep this owner independently compilable. */
export interface PlanXRangeFrame extends Omit<PlanFrame, 'family' | 'observations'> {
  readonly family: 'xrange';
  readonly observations: readonly PlanXRangeObservation[];
  /** Source summaries include missing and hidden intervals without fabricated geometry. */
  readonly intervals: readonly PlanIntervalSummary[];
}

export type PlanXRangeResult = Readonly<{status: 'ok' | 'empty'; frame: PlanXRangeFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
