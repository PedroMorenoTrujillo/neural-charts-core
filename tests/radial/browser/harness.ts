import { createPieChart, describePie } from '../../../src/pie.js';
import { createDonutChart, describeDonut } from '../../../src/donut.js';
Object.assign(globalThis, { NCRadial: { createPieChart, createDonutChart, describePie, describeDonut } });
