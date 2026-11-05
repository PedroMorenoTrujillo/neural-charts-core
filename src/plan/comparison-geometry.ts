import type {Plot} from '../internal/layout/frame.js';
import type {PlanHitRegion} from '../public/plan-types.js';

/** A touch target can be larger than the datum, but never changes its geometry. */
export function comparisonHit(left: number, top: number, right: number, bottom: number, plot: Plot): PlanHitRegion {
  const x = left / 2 + right / 2, y = top / 2 + bottom / 2;
  const halfWidth = Math.max(12, (right - left) / 2), halfHeight = Math.max(12, (bottom - top) / 2);
  return {type: 'polygon', vertices: [
    {x: Math.max(plot.x, x - halfWidth), y: Math.max(plot.y, y - halfHeight)},
    {x: Math.min(plot.x + plot.width, x + halfWidth), y: Math.max(plot.y, y - halfHeight)},
    {x: Math.min(plot.x + plot.width, x + halfWidth), y: Math.min(plot.y + plot.height, y + halfHeight)},
    {x: Math.max(plot.x, x - halfWidth), y: Math.min(plot.y + plot.height, y + halfHeight)},
  ]};
}

