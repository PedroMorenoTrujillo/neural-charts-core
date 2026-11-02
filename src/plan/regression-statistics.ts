import type {PlanRegressionModel} from '../public/regression-plan-types.js';
interface Pair{readonly x:number;readonly y:number;}
type Ready=Extract<PlanRegressionModel,{status:'ready'}>;
export type RegressionCalculation=Readonly<{status:'invalid';reason:string}>|Readonly<{status:'ok';summary:PlanRegressionModel;predict?:(x:number)=>number}>;
class Sum{
  value=0;private correction=0;
  add(value:number):void{const next=value-this.correction,total=this.value+next;this.correction=(total-this.value)-next;this.value=total;}
}
/** Scaled, centred two-pass covariance; no sums of raw x² or raw x*y. */
export function describeRegression(sourceSeriesId:string,pairs:readonly Pair[],missingCount:number):RegressionCalculation{
  const counts={sourceSeriesId,fitSeriesId:'ols:'+sourceSeriesId,sampleCount:pairs.length,missingCount};
  if(pairs.length<2)return {status:'ok',summary:{...counts,status:'insufficient-data'}};
  const originX=pairs[0]!.x,originY=pairs[0]!.y;
  let minX=Infinity,maxX=-Infinity,xScale=0,yScale=0,xMagnitude=0,yMagnitude=0,shiftX=true,shiftY=true;
  for(const p of pairs){const dx=p.x-originX,dy=p.y-originY;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);xMagnitude=Math.max(xMagnitude,Math.abs(p.x));yMagnitude=Math.max(yMagnitude,Math.abs(p.y));if(Number.isFinite(dx))xScale=Math.max(xScale,Math.abs(dx));else shiftX=false;if(Number.isFinite(dy))yScale=Math.max(yScale,Math.abs(dy));else shiftY=false;}
  if(minX===maxX)return {status:'ok',summary:{...counts,status:'constant-x'}};
  xScale=(shiftX?xScale:xMagnitude)||1;yScale=(shiftY?yScale:yMagnitude)||1;
  const normalizeX=(v:number)=>(shiftX?v-originX:v)/xScale,normalizeY=(v:number)=>(shiftY?v-originY:v)/yScale;
  const sumX=new Sum(),sumY=new Sum();for(const p of pairs){sumX.add(normalizeX(p.x));sumY.add(normalizeY(p.y));}
  const meanX=sumX.value/pairs.length,meanY=sumY.value/pairs.length,variance=new Sum(),covariance=new Sum(),totalResponse=new Sum();
  for(const p of pairs){const dx=normalizeX(p.x)-meanX,dy=normalizeY(p.y)-meanY;variance.add(dx*dx);covariance.add(dx*dy);totalResponse.add(dy*dy);}
  if(!(variance.value>0))return {status:'invalid',reason:'UNREPRESENTABLE_REGRESSION_VARIANCE'};
  const normalizedSlope=covariance.value/variance.value,yOrigin=shiftY?originY:0,xOrigin=shiftX?originX:0;
  const predict=(value:number)=>{const normalized=meanY+normalizedSlope*(normalizeX(value)-meanX),direct=yOrigin+normalized*yScale,scale=Math.max(Math.abs(yOrigin),yScale),estimated=Number.isFinite(direct)?direct:scale*(yOrigin/scale+normalized*(yScale/scale));return estimated===0?0:estimated;};
  const candidates=[normalizedSlope*(yScale/xScale),(normalizedSlope/xScale)*yScale,(normalizedSlope*yScale)/xScale];
  let slope=normalizedSlope===0?0:candidates.find(v=>Number.isFinite(v)&&v!==0);
  if(slope===undefined){const magnitude=Math.exp(Math.log(Math.abs(normalizedSlope))+Math.log(yScale)-Math.log(xScale));slope=Math.sign(normalizedSlope)*magnitude;}
  const offset=meanY-normalizedSlope*meanX,directIntercept=(yOrigin-slope*xOrigin)+offset*yScale,interceptScale=Math.max(Math.abs(yOrigin),Math.abs(xOrigin),yScale),intercept=Number.isFinite(directIntercept)?directIntercept:interceptScale*(yOrigin/interceptScale-slope*(xOrigin/interceptScale)+offset*(yScale/interceptScale));
  if(!Number.isFinite(slope)||normalizedSlope!==0&&slope===0||!Number.isFinite(intercept)||!Number.isFinite(predict(minX))||!Number.isFinite(predict(maxX)))return {status:'invalid',reason:'UNREPRESENTABLE_REGRESSION_MODEL'};
  const residual=new Sum();for(const p of pairs){const error=normalizeY(p.y)-(meanY+normalizedSlope*(normalizeX(p.x)-meanX));residual.add(error*error);}
  const rSquared=totalResponse.value===0?null:Math.max(0,Math.min(1,1-residual.value/totalResponse.value));
  const summary:Ready={...counts,status:'ready',slope:slope===0?0:slope,intercept:intercept===0?0:intercept,rSquared,minX,maxX};
  return {status:'ok',summary,predict};
}
