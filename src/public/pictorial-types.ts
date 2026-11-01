import type {PlanCommand,PlanFrame,PlanObservation,PlanOptions,PlanSeries,PlanResult} from './plan-types.js';
export interface PlanPictorialVertex {readonly x:number;readonly y:number;}
export interface PlanPictorialMesh {readonly id:string;readonly aspectRatio:number;readonly vertices:readonly PlanPictorialVertex[];readonly triangles:readonly (readonly [number,number,number])[];}
export interface PlanPictorialPoint {readonly id:string;readonly x:string;readonly y:number|null;}
export interface PlanPictorialSeries {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanPictorialPoint[];}
export type PlanPictorialShape=Readonly<{kind:'preset';name:'person'|'bottle'|'heart'}>|Readonly<{kind:'mesh';mesh:PlanPictorialMesh}>;
export interface PlanPictorialSpec {
  readonly family:'pictorial';readonly title:string;readonly description?:string;
  readonly axes:Readonly<{x:Readonly<{kind:'category';values:readonly Readonly<{id:string;label:string}>[]}>;y:Readonly<{kind:'linear';domain?:readonly [0,number];unit?:string}>}>;
  readonly series:readonly PlanPictorialSeries[];
  readonly pictorial?:Readonly<{shape?:PlanPictorialShape;gap?:number;background?:boolean}>;
}
export type PlanPictorialGlyphId=Readonly<{kind:'grouped';categoryId:string;seriesId:string}>|Readonly<{kind:'stacked';categoryId:string}>;
export interface PlanPictorialGlyph {readonly id:PlanPictorialGlyphId;readonly shapeId:string;readonly categoryId:string;readonly bounds:Readonly<{x:number;y:number;width:number;height:number}>;readonly backgroundCommands:readonly PlanCommand[];}
export interface PlanPictorialFill {readonly pointId:string;readonly glyphId:PlanPictorialGlyphId;readonly shapeId:string;readonly commands:readonly PlanCommand[];}
export interface PlanCompoundPolygonHit {readonly kind:'compoundPolygon';readonly polygons:readonly (readonly PlanPictorialVertex[])[];}
export interface PlanPictorialValue {
  readonly categoryId:string;readonly glyphId:PlanPictorialGlyphId;readonly shapeId:string;
  readonly status:'displayed'|'zero'|'noInk';readonly low:number;readonly high:number;
  readonly capacity:number|null;readonly total:number|null;readonly totalStatus:'known'|'overflow';readonly incomplete:boolean;
}
export interface PlanPictorialObservation extends Omit<PlanObservation,'hit'> {readonly hit?:PlanCompoundPolygonHit;readonly pictorial:PlanPictorialValue;}
export interface PlanPictorialSummary {
  readonly id:Readonly<{seriesId:string;pointId:string}>;readonly categoryId:string;readonly y:number|null;readonly visible:boolean;
  readonly status:'displayed'|'zero'|'null'|'hidden'|'noInk';readonly low:number|null;readonly high:number|null;
  readonly total:number|null;readonly totalStatus:'known'|'overflow';readonly incomplete:boolean;readonly percentage?:number;
}
export interface PlanPictorialLayoutSummary {readonly mode:'grouped'|'sum'|'percent';readonly capacity:number|null;readonly layoutCapacity:number;readonly capacitySource:'domain'|'source'|'none';readonly capacityRoundoff?:Readonly<{maxExcess:number;tolerance:number}>;readonly emptyReason?:'noSource'|'noPositiveValues'|'hidden';}
export interface PlanPictorialFrame extends Omit<PlanFrame,'family'|'series'|'observations'> {
  readonly family:'pictorial';readonly series:readonly (PlanSeries&Readonly<{pictorialFills:readonly PlanPictorialFill[]}>)[];
  readonly observations:readonly PlanPictorialObservation[];readonly pictorialGlyphs:readonly PlanPictorialGlyph[];readonly pictorialData:readonly PlanPictorialSummary[];
  readonly pictorialLayout:PlanPictorialLayoutSummary;
}
export type PlanPictorialResult=Readonly<{status:'ok'|'empty';frame:PlanPictorialFrame}>|Extract<PlanResult,{status:'invalid'}>;
export type PlanPictorialOptions=Omit<PlanOptions,'wordcloudText'>;
