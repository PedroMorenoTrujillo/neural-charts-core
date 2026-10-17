import type { Palette } from '../chart/presentation.js';
import { insideLabelInk } from '../layout/contrast.js';
import { parseColorScale } from './scale.js';
const light = parseColorScale({ kind: 'sequential', colors: ['#e7f0f8', '#2a72a5', '#153959'] });
const dark = parseColorScale({ kind: 'sequential', colors: ['#1b344d', '#488dbc', '#c1e8fa'] });
export function defaultColorRamp(palette: Palette) { return insideLabelInk(palette.surface, palette.surface) === '#ffffff' ? dark : light; }
