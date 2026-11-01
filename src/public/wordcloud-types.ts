import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame, PlanLegendItem, PlanObservation, PlanOptions, PlanSeries} from './plan-types.js';

export interface PlanWordCloudWord {
  readonly id: string;
  readonly text: string;
  readonly weight: number | null;
  readonly groupId?: string;
}
export interface PlanWordCloudGroup {readonly id: string; readonly label: string;}
export type PlanWordCloudRotation = 0 | 90;
export interface PlanWordCloudSpec {
  readonly family: 'wordcloud';
  readonly title: string;
  readonly description?: string;
  readonly words: readonly PlanWordCloudWord[];
  readonly groups?: readonly PlanWordCloudGroup[];
  readonly minFontSize?: number;
  readonly maxFontSize?: number;
  readonly padding?: number;
  readonly rotations?: readonly PlanWordCloudRotation[];
  readonly seed?: number;
  readonly maxWords?: number;
}
export interface PlanWordCloudMeasurementRequest {
  readonly wordId: string;
  readonly text: string;
  /** Requested logical size; host accessibility scale belongs to fontKey. */
  readonly fontSize: number;
  readonly fontKey: string;
}
export interface PlanWordCloudMeasurement extends PlanWordCloudMeasurementRequest {
  /** Actual unrotated logical bounds supplied by the renderer, not physical pixels. */
  readonly width: number;
  readonly height: number;
}
export interface PlanWordCloudTextInput {
  /** Current resolved font/style key expected by the renderer. */
  readonly fontKey: string;
  readonly measurements?: readonly PlanWordCloudMeasurement[];
}
export interface PlanWordCloudPrepareOptions {
  readonly width: number;
  readonly height: number;
  readonly hiddenSeriesIds?: readonly string[];
  readonly fontKey: string;
}
export interface PlanWordCloudOptions extends PlanOptions {readonly wordcloudText?: PlanWordCloudTextInput;}
export type PlanWordCloudNotDisplayedReason = 'hidden' | 'unknown' | 'zero' | 'budget' | 'noInk' | 'noSpace';
export type PlanWordCloudDecision =
  | Readonly<{kind: 'displayed'; fontSize: number; rotation: PlanWordCloudRotation}>
  | Readonly<{kind: 'notDisplayed'; reason: PlanWordCloudNotDisplayedReason}>;
export interface PlanWordCloudSourceValue {
  readonly id: Readonly<{seriesId: string; pointId: string}>;
  readonly text: string;
  readonly weight: number | null;
}
export interface PlanWordCloudSummary extends PlanWordCloudSourceValue {readonly decision: PlanWordCloudDecision;}
export interface PlanWordCloudPreparedSummary extends PlanWordCloudSourceValue {
  readonly decision: PlanWordCloudDecision | Readonly<{kind: 'measurementPending'; fontSize: number}>;
}
export interface PlanWordCloudPreparation {
  readonly requests: readonly PlanWordCloudMeasurementRequest[];
  readonly source: readonly PlanWordCloudPreparedSummary[];
  readonly legend: readonly PlanLegendItem[];
}
export type PlanWordCloudPrepareResult = Readonly<{status: 'ok'; preparation: PlanWordCloudPreparation}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
export interface PlanWordCloudBounds {readonly x: number; readonly y: number; readonly width: number; readonly height: number;}
/** Geometric text role. Native/Web draws this pose without repeating the packing. */
export interface PlanWordCloudTextGlyph {
  readonly pointId: string;
  readonly text: string;
  readonly fontKey: string;
  readonly fontSize: number;
  readonly rotation: PlanWordCloudRotation;
  readonly center: Readonly<{x: number; y: number}>;
  readonly measured: Readonly<{width: number; height: number}>;
  readonly bounds: PlanWordCloudBounds;
  readonly color: string;
}
export interface PlanWordCloudSeries extends PlanSeries {readonly textGlyphs: readonly PlanWordCloudTextGlyph[];}
export interface PlanWordCloudLayout {
  readonly sourceWords: number;
  readonly requestedWords: number;
  readonly displayedWords: number;
  readonly attempts: number;
  readonly collisionChecks: number;
  readonly budgetExhausted: boolean;
  readonly notDisplayed: Readonly<Record<PlanWordCloudNotDisplayedReason, number>>;
  /** Empty geometry does not imply that the source has no positive words. */
  readonly emptyReason?: 'noSource' | 'noEligibleWords' | 'noInk' | 'noSpace';
}
export interface PlanWordCloudFrame extends Omit<PlanFrame, 'family' | 'series' | 'observations'> {
  readonly family: 'wordcloud';
  readonly series: readonly PlanWordCloudSeries[];
  readonly observations: readonly PlanObservation[];
  readonly wordcloudData: readonly PlanWordCloudSummary[];
  readonly wordcloudLayout: PlanWordCloudLayout;
}
export type PlanWordCloudResult = Readonly<{status: 'ok' | 'empty'; frame: PlanWordCloudFrame}>
  | Readonly<{status: 'invalid'; diagnostic: ChartDiagnostic}>;
