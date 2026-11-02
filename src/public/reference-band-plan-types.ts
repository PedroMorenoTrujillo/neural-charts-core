/** A style-free interval in represented axis units. Percent-stacked Y uses
 * percentage units (0–100); observations still retain raw source values.
 * Category endpoints are inclusive original IDs. */
export type PlanReferenceBand =
  | Readonly<{id:string;axis:'x';from:string;to:string;valueAxis?:never}>
  | Readonly<{id:string;axis:'x';from:number;to:number;valueAxis?:never}>
  | Readonly<{id:string;axis:'y';from:number;to:number;valueAxis?:'secondary'}>;

/** Source identities/values survive clipping. Only a visible interval has a box. */
export type PlanProjectedReferenceBand = PlanReferenceBand & (
  | Readonly<{status:'visible';box:Readonly<{x:number;y:number;width:number;height:number}>}>
  | Readonly<{status:'outside'|'unavailable';box?:never}>
);
