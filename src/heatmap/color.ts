import type { Palette } from '../internal/chart/presentation.js';
import { insideLabelInk } from '../internal/layout/contrast.js';
import { createColorScale, parseColorScale } from '../internal/color/scale.js';
import type { HeatmapData } from './data.js';

// Original opaque ramps. Shared theme resolution owns light/dark/custom
// surfaces; this module neither queries DOM nor creates a second theme owner.
const light = parseColorScale({ kind: 'sequential', colors: ['#e7f0f8', '#2a72a5', '#153959'] });
const dark = parseColorScale({ kind: 'sequential', colors: ['#1b344d', '#488dbc', '#c1e8fa'] });
export function heatmapColors<T>(data: HeatmapData<T>, palette: Palette) {
  return createColorScale(data.parsedColor ?? (insideLabelInk(palette.surface, palette.surface) === '#ffffff' ? dark : light), data.extent);
}
