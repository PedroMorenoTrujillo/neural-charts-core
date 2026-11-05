# Pictorial contract

Pictorial fills an original vector silhouette by value. The proportion measures height; it does not represent filled area or physical volume. The Core emits real clipped geometry with no renderer-specific image or clipping dependency.

## Input and layout

`PlanPictorialSpec` has `family: 'pictorial'`, a category x axis, a zero-based linear y axis, and readonly series of `{id, x, y}` points. `y` is a finite nonnegative number or `null`. IDs remain the original source identities. Negative values, duplicate IDs/categories and unknown categories reject, including when their series is hidden.

`spec.pictorial.shape` selects the original `person`, `bottle` or `heart` preset, or a typed normalized triangle mesh. A custom mesh is numeric geometry, never SVG/XML or a URL. It must be conforming, nonoverlapping and manifold, with full normalized bounds and an explicit aspect ratio. A shared chart shape makes the common scale meaningful.

`options.stacking` selects the arrangement:

- Omitted: each visible series has its own silhouette.
- `'sum'`: series divide one shared silhouette into cumulative bands.
- `'percent'`: known positive values divide one shared silhouette into normalized bands.

The explicit capacity is `axes.y.domain: [0, positiveMaximum]`. There is no second competing capacity setting. Without it, grouped capacity is the largest original value and sum capacity is the largest original known category total. Source-derived capacity remains fixed when filtering the legend. Percent rejects a raw domain and uses the known subset; null/missing members mark it incomplete.

An actual capacity excess rejects. A multi-member sum may reach the silhouette edge within its bounded IEEE-754 summation residue. That case exposes `pictorialLayout.capacityRoundoff` with the actual excess and tolerance; original values and the computed IEEE total are preserved. A single over-capacity value has no summation allowance. For example, `.1 + .2` may fill a `.3` capacity with explicit roundoff metadata; `.30001` rejects.

## Output roles and identities

`frame.pictorialGlyphs` contains decorative silhouette backgrounds once per occurrence. `series.pictorialFills` contains the actual opaque value fills. The roles are separate; backgrounds are not data series.

`PlanPictorialGlyphId` is a typed identity:

```ts
type PlanPictorialGlyphId =
  | Readonly<{type: 'grouped'; categoryId: string; seriesId: string}>
  | Readonly<{type: 'stacked'; categoryId: string}>;
```

Fill and observation metadata refer to the same glyph identity. Shape IDs identify geometry, source point IDs identify data, and glyph IDs identify occurrences. Renderers must preserve these meanings and must not truncate, hash or invent composite public source IDs.

## Additive hit-region union member

`PlanHitRegion` now includes `PlanCompoundPolygonHit`:

```ts
interface PlanCompoundPolygonHit {
  readonly type: 'compoundPolygon';
  readonly polygons: readonly (readonly Readonly<{x: number; y: number}>[])[];
}
```

One source datum may occupy several disconnected real pieces. Its hit is the union of those convex pieces; holes and unfilled background are excluded. There remains one observation per datum. Bounding-box/circle fallback and duplicated observations per triangle are incorrect.

Although the new member is additive, consumers with exhaustive switches must add it. Owning, validating, projecting and testing hit geometry all need the new case before an adapter can support Pictorial. An unsupported adapter must report that limitation explicitly.

## Source, empty states and limits

`frame.pictorialData` retains every original datum, including hidden, null, zero and positive `noInk` rows. Null is unknown, missing is absent and zero has zero coloured area. Zero and positive values with no representable ink remain keyboard/source observations without invented touch regions. Incomplete percentage metadata describes only the known subset.

Without positive source values, automatic `capacity` is `null`. `layoutCapacity` is a separately named layout fallback, never an invented observation, total or maximum. Empty-source, no-positive and all-hidden states remain explicit.

The source cap is 8 series, 32 categories and 64 total points. A mesh has at most 192 vertices/64 triangles. A clipped triangle has at most five vertices; compound hits are bounded to 64 pieces per observation and 4,096 across the chart. Limits are validation boundaries, not a promise that maximum density is legible on a phone. No source data is silently dropped to meet them.

Viewport/zoom, references, shared-x tooltips, negative values, arbitrary SVG and unrelated per-series silhouettes are unsupported in this increment and reject where configured. An adapter may offer plot-only horizontal scrolling, preserving the width of titles, legends and controls.

## Native adapter promotion gate

The Core contract does not certify an adapter. Native integration requires the new data/facade family, typed background/fill ownership and rendering, compound-hit ownership/projection/selection, full source metadata, accessible zero/noInk behavior and honest empty-state messaging.

Core title/description/name limits are 512/2048/256 code units. An adapter must retain that source metadata before applying visual truncation in bounded name slots; it must not weaken unrelated validation globally. Source text is untrusted and belongs in native Text/escaped text content, never raw SVG markup.

Android and iOS runtime verification must cover actual pixels, grouped/sum/percent, hole touches, legend restore, tooltip scrubbing/toggle/replay, reduced motion, narrow screens and tablets. Pure Node geometry timings and numeric SVG serialization are separate evidence and do not establish mobile FPS or gesture quality.
