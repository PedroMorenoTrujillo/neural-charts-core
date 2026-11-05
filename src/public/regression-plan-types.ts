import type {PlanScatterSpec} from './plan-types.js';
/** Original XY samples; ordinary least squares is derived without extrapolation. */
export type PlanRegressionSpec=Omit<PlanScatterSpec,'family'>&Readonly<{family:'regression'}>;
interface RegressionCounts{readonly sourceSeriesId:string;readonly fitSeriesId:string;readonly sampleCount:number;readonly missingCount:number;}
export type PlanRegressionModel=RegressionCounts&(
  | Readonly<{status:'ready';slope:number;intercept:number;rSquared:number|null;minX:number;maxX:number}>
  | Readonly<{status:'insufficient-data'|'constant-x'}>
);
export interface PlanRegressionValue{readonly type:'sample'|'fit';readonly modelId:string;}
export interface PlanRegressionLayout{readonly method:'ordinary-least-squares';readonly models:readonly PlanRegressionModel[];}
