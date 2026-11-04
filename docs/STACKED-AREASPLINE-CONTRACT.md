# Stacked areaspline — compatible plan extension

The existing `areaspline` family now accepts `options.stacking: 'sum' | 'percent'` in both public planners. It adds a variant, not a new chart family. Source identity, raw observations, signed accumulation, incomplete-row gaps, hidden series, viewport and percent validation reuse the existing stacked-area owners. Percent still rejects negative values; missing rows are not invented as zero. Existing linear stacked-area output is unchanged.

Each already-projected signed band uses common smoothstep interpolation `e(t)=t²(3−2t)` for its lower and upper boundary. This conservative C1 interpolation has zero endpoint derivatives and remains a convex combination of both endpoints. It therefore preserves boundary order and shared zero-crossing splits without independent spline overshoot. Adjacent stacks share exactly the same samples. It is deliberately distinct from unstacked monotone spline tangents.

Flattening uses `n >= sqrt(3*max(abs(deltaY)))` with common subdivision counts per interval: the second-derivative bound `6*abs(deltaY)` limits chord error to .25 projected pixels. The existing global path-command budget still rejects excessive work. No new renderer or runtime dependency; no changes to frozen NC-01A mathematics or Scene.

Evidence: `npm run check`; new `tests/plan/stacked-areaspline.test.ts` exercises public generic/Cartesian imports, sum/percent, signs, raw identity, visibility, viewport, gap topology, matching stack boundaries and bounded endpoint values. The previous package test rejecting sum stacking now explicitly verifies this authorized extension and retains rejection of negative percent data.
