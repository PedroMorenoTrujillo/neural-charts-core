import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame, PlanObservation} from './plan-types.js';
import type {PlanTemporalAxis} from './temporal-plan-types.js';

export interface PlanTimelinePoint {
  readonly id: string;
  readonly x: number | null;
  readonly title: string;
  readonly description?: string;
}

export interface PlanTimelineSeries {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly data: readonly PlanTimelinePoint[];
}

export interface PlanTimelineSpec {
  readonly family: 'timeline';
  readonly title: string;
  readonly description?: string;
  readonly axes: Readonly<{x: PlanTemporalAxis}>;
  readonly series: readonly PlanTimelineSeries[];
  readonly labelPosition?: 'alternate' | 'above' | 'below';
  readonly labelMaxWidth?: number;
  readonly markerRadius?: number;
}

export interface PlanTimelineEvent {
  readonly type: 'linear' | 'time';
  readonly coordinate: number;
  readonly title: string;
  readonly description?: string;
}

export interface PlanTimelineSummary {
  readonly id: Readonly<{seriesId: string; pointId: string}>;
  readonly x: number | null;
  readonly title: string;
  readonly description?: string;
  /** Series/legend visibility; this does not mean the datum is inside the current X window. */
  readonly visible: boolean;
  /** At least one source endpoint/coordinate is null; never a fabricated zero. */
  readonly missing: boolean;
}

export interface PlanTimelineObservation extends PlanObservation {
  readonly event: PlanTimelineEvent;
}

export interface PlanTimelineFrame extends Omit<PlanFrame, 'family' | 'observations'> {
  readonly family: 'timeline';
  readonly observations: readonly PlanTimelineObservation[];
  readonly events: readonly PlanTimelineSummary[];
}

export type PlanTimelineResult = Readonly<{status: 'ok' | 'empty'; frame: PlanTimelineFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
