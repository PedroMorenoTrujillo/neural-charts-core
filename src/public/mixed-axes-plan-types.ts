export interface PlanMixedYAxisFrame{readonly domain:readonly[number,number]|null;readonly displayed:readonly[number,number]|null;readonly reversed:boolean;}
/** Shared category positions and independent value scales; original source values are never normalized. */
export interface PlanMixedAxesLayout{
  readonly mode:'dual-y';
  readonly primary:PlanMixedYAxisFrame;
  readonly secondary:PlanMixedYAxisFrame;
  readonly series:readonly Readonly<{id:string;yAxis:'primary'|'secondary'}>[];
}
