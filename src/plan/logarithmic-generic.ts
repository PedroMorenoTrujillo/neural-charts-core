import type {PlanSpec,PlanOptions} from '../public/plan-types.js';
import {planLogarithmic} from './logarithmic.js';
import {prepareLogScatter} from './log-scatter-source.js';
export const planGeneralLogarithmic=(spec:PlanSpec,options:PlanOptions)=>planLogarithmic(spec,options,prepareLogScatter);
