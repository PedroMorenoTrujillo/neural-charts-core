/** Clockwise degrees from twelve o'clock; one sweep from 1 to 360 degrees. */
export interface PlanCircularOptions{
  readonly startAngle?:number;
  readonly endAngle?:number;
  /** Gauge-only presentation, preserving the original scalar and domain. */
  readonly gaugeStyle?:'solid'|'needle';
  /** Needle gauge only; requested scale density, bounded to2–12. */
  readonly tickCount?:number;
}
export interface PlanCircularGeometry{
  readonly startAngle:number;readonly endAngle:number;
  readonly cx:number;readonly cy:number;readonly radius:number;readonly innerRadius:number;
  /** Tight drawing extent plus bounded reading/label space, in frame coordinates. */
  readonly bounds:Readonly<{x:number;y:number;width:number;height:number}>;
}
export interface PlanSectorCircularFrame extends PlanCircularGeometry{
  readonly style:'sectors';readonly domain?:never;readonly valueState?:never;readonly needle?:never;readonly ticks?:never;
}
export interface PlanGaugeCircularBase extends PlanCircularGeometry{
  readonly domain:readonly[number,number];readonly valueState:'missing'|'under'|'within'|'over';
}
export interface PlanSolidGaugeFrame extends PlanGaugeCircularBase{
  readonly style:'solid-gauge';readonly needle?:never;readonly ticks?:never;
}
export interface PlanNeedleGaugeFrame extends PlanGaugeCircularBase{
  readonly style:'needle-gauge';
  /** Radians identify the true final needle and its entry-animation origin. */
  readonly needle:Readonly<{from:number;to:number|null}>;
  readonly ticks:readonly Readonly<{value:number;x:number;y:number}>[];
}
export type PlanCircularFrame=PlanSectorCircularFrame|PlanSolidGaugeFrame|PlanNeedleGaugeFrame;
export interface PlanRadialSummary{
  readonly knownTotal:number|null;
  readonly overflow:boolean;
  readonly missingCount:number;readonly hiddenCount:number;readonly knownCount:number;
  readonly percentageBasis:'complete-visible-total'|'known-visible-subtotal';
}
