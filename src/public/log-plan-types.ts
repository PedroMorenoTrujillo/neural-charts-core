/** Additive planning options. Original data coordinates and observations stay
 * in their original units; only projection and viewport transforms are log. */
export interface PlanLogScale {readonly type:'log';readonly base?:10;}
export interface PlanScales {readonly x?:PlanLogScale;readonly y?:PlanLogScale;}
