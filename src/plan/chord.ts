import type {PlanOptions} from '../public/plan-types.js';
import type {PlanChordSpec} from '../public/relationship-types.js';
import {planRadialRelationships} from './dependencywheel.js';

/** Undirected relations share a port model, never a second overlaid chart. */
export const planChord=(spec:PlanChordSpec,options:PlanOptions)=>planRadialRelationships(spec,options,'chord');
