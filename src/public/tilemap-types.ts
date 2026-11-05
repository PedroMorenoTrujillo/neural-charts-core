import type {PlanColorAxisSpec,PlanValueColor,PlanColorAxisFrame} from './color-axis-types.js';
import type {PlanCellPaint,PlanCellGeometry,PlanCellPoint} from './cell-types.js';
import type {PlanFrame,PlanSeries,PlanObservation,PlanOptions,PlanResult} from './plan-types.js';
export type PlanTileShape='hexagon'|'circle'|'diamond'|'square';
export interface PlanTilemapPoint {readonly id:string;readonly x:number;readonly y:number;readonly value:number|null;readonly name?:string;}
export interface PlanTilemapSeries {readonly id:string;readonly name:string;readonly color?:string;readonly data:readonly PlanTilemapPoint[];}
export interface PlanTilemapSpec {readonly family:'tilemap';readonly title:string;readonly description?:string;readonly unit?:string;readonly series:readonly [PlanTilemapSeries];readonly tileShape?:PlanTileShape;readonly pointPadding?:number;readonly opacity?:number;readonly colorAxis?:PlanColorAxisSpec;}
export interface PlanTilemapValue {readonly sourceX:number;readonly sourceY:number;readonly name?:string;readonly color:Exclude<PlanValueColor,{type:'missing'}>;}
export interface PlanTilemapSummary {readonly id:Readonly<{seriesId:string;pointId:string}>;readonly x:number;readonly y:number;readonly value:number|null;readonly name?:string;readonly visible:boolean;readonly geometryDecision:'painted'|'noInk'|'hidden';readonly color:PlanValueColor;readonly observed:boolean;}
export interface PlanTilemapLayout {readonly status:'noSource'|'allMissing'|'allHidden'|'noInk'|'ready';readonly shape:PlanTileShape;readonly sourceCount:number;readonly knownCount:number;readonly missingCount:number;readonly paintedCellCount:number;readonly observedCellCount:number;readonly omittedCellCount:number;readonly scale:number;readonly bounds:Readonly<PlanCellPoint&{width:number;height:number}>|null;}
export interface PlanTilemapObservation extends Omit<PlanObservation,'hit'> {readonly hit:PlanCellGeometry;readonly tilemap:PlanTilemapValue;}
export interface PlanTilemapFrame extends Omit<PlanFrame,'family'|'series'|'observations'> {readonly family:'tilemap';readonly series:readonly (PlanSeries&Readonly<{cells:readonly PlanCellPaint[]}>)[];readonly observations:readonly PlanTilemapObservation[];readonly tilemapData:readonly PlanTilemapSummary[];readonly tilemapLayout:PlanTilemapLayout;readonly colorAxis:PlanColorAxisFrame;}
export type PlanTilemapResult=Readonly<{status:'ok'|'empty';frame:PlanTilemapFrame}>|Extract<PlanResult,{status:'invalid'}>;
export type PlanTilemapOptions=Omit<PlanOptions,'wordcloudText'>;
