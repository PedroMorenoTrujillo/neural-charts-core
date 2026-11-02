/** A stable partition of original column series. Every source series belongs to exactly one group. */
export interface PlanStackGroup{readonly id:string;readonly label:string;readonly seriesIds:readonly string[];}
export interface PlanStackGroupsLayout{readonly groups:readonly PlanStackGroup[];readonly placement:'grouped';readonly stacking:'sum'|'percent';}
