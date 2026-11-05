import type {ChartDiagnostic} from './chart-types.js';
import type {PlanFrame,PlanObservation,PlanHierarchyGroup} from './plan-types.js';

export interface PlanRelationshipNode {
  readonly id:string;
  readonly label:string;
  readonly groupId?:string;
}
export interface PlanRelationshipLink {
  readonly id:string;
  readonly from:string;
  readonly to:string;
  readonly value:number|null;
}
export interface PlanRelationshipSource {
  readonly title:string;
  readonly description?:string;
  readonly nodes:readonly PlanRelationshipNode[];
  readonly links:readonly PlanRelationshipLink[];
  readonly groups?:readonly PlanHierarchyGroup[];
}
export interface PlanDependencyWheelSpec extends PlanRelationshipSource {
  readonly family:'dependencywheel';
  /** Degrees clockwise from twelve o'clock. */
  readonly startAngle?:number;
  /** Requested angular separation; proportionally reduced when necessary. */
  readonly nodePadding?:number;
  readonly nodeWidth?:number;
}
export interface PlanChordSpec extends PlanRelationshipSource {
  readonly family:'chord';
  readonly startAngle?:number;
  readonly nodePadding?:number;
  readonly nodeWidth?:number;
}
export interface PlanArcDiagramSpec extends PlanRelationshipSource {
  readonly family:'arcdiagram';
  readonly reversed?:boolean;
  /** Requested maximum; dense layouts reduce it to45% of node spacing. */
  readonly nodeRadius?:number;
  readonly linkWidth?:number;
}
export type PlanRelationshipSpec=PlanDependencyWheelSpec|PlanChordSpec|PlanArcDiagramSpec;
export type PlanRelationshipMetadata=(
  | Readonly<{type:'node';incoming:number;outgoing:number;incident:number}>
  | Readonly<{type:'link';from:string;to:string;fromLabel:string;toLabel:string;directed:boolean}>
) & Readonly<{geometryOmitted?:true}>;
export type PlanRelationshipObservation=PlanObservation&Readonly<{relationship:PlanRelationshipMetadata}>;
export type PlanRelationshipFrame=Omit<PlanFrame,'family'|'observations'>&Readonly<{
  family:PlanRelationshipSpec['family'];
  observations:readonly PlanRelationshipObservation[];
}>;
export type PlanRelationshipResult=
  | Readonly<{status:'ok'|'empty';frame:PlanRelationshipFrame}>
  | Readonly<{status:'invalid';diagnostic:ChartDiagnostic}>;
