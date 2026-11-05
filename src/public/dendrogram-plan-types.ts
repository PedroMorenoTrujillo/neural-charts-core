export interface PlanDendrogramNode {
  readonly id:string;
  readonly label?:string;
  /** Optional merge height. Supply all internal heights together, or none. */
  readonly height?:number;
  readonly children?:readonly PlanDendrogramNode[];
}
export interface PlanDendrogramSpec {
  readonly family:'dendrogram';readonly title:string;readonly description?:string;
  readonly root:PlanDendrogramNode;
  readonly unit?:string;
  readonly orientation?:'horizontal'|'vertical';
}
export interface PlanDendrogramValue {
  readonly type:'leaf'|'cluster';readonly heightMode:'distance'|'topology';
  readonly heightSource:'source'|'topology'|'leafZero';
  readonly leafCount:number;readonly depth:number;readonly unit:string;
}
export interface PlanDendrogramLayout {
  readonly orientation:'horizontal'|'vertical';readonly heightMode:'distance'|'topology';
  readonly maxHeight:number;readonly nodeCount:number;readonly leafCount:number;
  readonly unit:string;
}
