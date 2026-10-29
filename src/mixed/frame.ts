import type { Result } from '../internal/diagnostics.js';
import { ok, invalid } from '../internal/diagnostics.js';
import type { Plot } from '../internal/layout/frame.js';
import { createCategoryFrame, createBandScale, type CategoryFrame, type PointScale, type BandScale } from '../internal/math/category.js';
export type MixedCategoryFrame = Readonly<{ frame: CategoryFrame; points: PointScale; bands: BandScale }>;
/** One category frame and one indexed band scale serve all three mark kinds.
 * A point is at the grouped band center, never at a particular series subslot. */
export function createMixedCategoryFrame(ids: readonly string[], plot: Plot, groupGap = .2): Result<MixedCategoryFrame> {
  if (![plot.x, plot.y, plot.width, plot.height, plot.x + plot.width, plot.y + plot.height].every(Number.isFinite) || plot.width < 0 || plot.height < 0) return invalid('INVALID_CONFIG', 'BAD_MIXED_PLOT', 'plot');
  const frame = createCategoryFrame(ids, [plot.x, plot.x + plot.width], .5); if (frame.status === 'invalid') return frame;
  const bands = createBandScale(frame.value, groupGap); if (bands.status === 'invalid') return bands;
  return ok(Object.freeze({ frame: frame.value, points: bands.value, bands: bands.value }));
}
