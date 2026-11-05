/** Source-owned per-point paint, shared by cell-based chart families. */
export interface PlanCellPoint {readonly x:number;readonly y:number;}
export type PlanCellGeometry=Readonly<{type:'polygon';vertices:readonly PlanCellPoint[]}>|Readonly<{type:'circle';cx:number;cy:number;radius:number}>;
export interface PlanCellPaint {readonly pointId:string;readonly color:string;readonly opacity:number;readonly geometry:PlanCellGeometry;}
