# Tilemap and shared color-axis contract

Tilemap renders a regular abstract grid of cells. It has no geographic coordinates or projection. Every cell belongs to one original series, retains its point ID, and has real polygon or circle geometry with its own color.

## Source and options

`PlanTilemapSpec` uses `family: 'tilemap'`, title/description, optional value unit and exactly one source series. Points have `{id, x, y, value, name?}`. Coordinates are safe integers within ±1,000,000; the occupied span may not exceed 4,096 per axis. Y increases downwards. Source cells have unique IDs and unique coordinate pairs, including null cells.

`value` is a finite number or `null`. Zero remains a number. Original source values, names and coordinates are preserved; neither missing colors nor percentages replace data.

The source cap is 2,048 points. Point IDs/names allow 256/512 code units; series IDs/names allow 128/256; title/description allow 512/2048. The shared defensive JSON boundary also limits total input size. These are data limits, not a promise that the densest possible grid is readable on a phone.

Geometry settings are explicit:

- `tileShape`: `'hexagon'` (default), `'circle'`, `'diamond'` or `'square'`.
- `pointPadding`: inset from each cell edge, default 1, range 0–32 logical units. Adjacent edges therefore have twice this gap.
- `opacity`: 0–1, default 1. Zero opacity produces no invisible touch target.
- `colorAxis`: the typed continuous/class scale below. Omitted uses the default blue continuous scale and a missing color.

Hexagons, circles and diamonds use alternating offset columns. Squares use a regular grid. Actual source-column parity, including negative coordinates and gaps, determines the offset. One aspect-preserving transform fits the occupied extent. The renderer must not recompute tile geometry.

Cartesian axes, viewport/zoom, stacking and references are unsupported and reject. Native facades should expose `data` plus grouped `options.layout.tilemap` and `options.colorAxis`; Core `family` stays internal to that adapter.

## Shared color axis

`PlanColorAxisSpec` is a discriminated union:

```ts
interface PlanContinuousColorAxisSpec {
  readonly kind: 'continuous';
  readonly domain?: readonly [number, number];
  readonly stops: readonly {readonly at: number; readonly color: string}[];
  readonly missingColor: string;
}
interface PlanClassColorAxisSpec {
  readonly kind: 'classes';
  readonly classes: readonly PlanColorClass[];
  readonly missingColor: string;
  readonly unclassifiedColor: string;
}
```

Continuous stops number 2–8, increase strictly from 0 to 1 and use six-digit hex colors. An explicit domain must increase strictly. Without it, the domain comes from **all valid original numeric values**, including hidden data. Legend hide/restore cannot change its color mapping. An inferred constant domain remains `[value, value]` and maps to the middle of the scale. All-missing/absent data has a null inferred domain, not an invented zero range.

Values outside an explicit domain retain their exact number. Only the color ratio is clamped, and `PlanValueColor.clamped` records that decision. Finite extreme/subnormal values are supported without overflowing the color ratio.

Classes number 1–16, have stable IDs/labels, and use named `minInclusive` / `maxExclusive` bounds. They must be ordered and nonoverlapping. The first minimum and final maximum may be omitted. Gaps are valid: a numeric value in a gap is `unclassified`, retains a numeric observation and uses `unclassifiedColor`. Unknown/null values are `missing` and use `missingColor`. These states remain distinct.

`frame.colorAxis` contains the full resolved continuous domain/stops/domain source or class definitions. It is a separate color legend model, not fake per-color data series. The pure internal mapping helper accepts at most 4,096 values for future cell owners; Tilemap itself remains capped at 2,048. All public owners must pass defensive JSON ownership and typed scale validation first.

## Paint, selection and source roles

`PlanSeries.cells` contains `PlanCellPaint`: original `pointId`, resolved color, explicit opacity and true polygon/circle geometry. All cells remain on the original series. Numeric observations refer to that same geometry and retain exact source values and source X/Y metadata.

Null cells may paint their missing color. They have **no numeric observation or touch hit** in this contract. An adapter must not fabricate zero to show a missing-cell tooltip or treat every decorative cell shape as selectable. Their complete source rows remain available through `frame.tilemapData` for accessible data viewing. A future null-selection feature needs an explicit separate contract.

Known cells whose geometry is consumed by padding, has radius below 0.5 logical units, or has zero opacity are `noInk`: no paint/hit is fabricated, and their original source rows remain accessible. No silent sampling or data deletion occurs.

`frame.tilemapLayout.status` distinguishes `noSource`, `allMissing`, `allHidden`, `noInk` and `ready`, with full source/known/missing/painted/observed/omitted counts. A populated all-missing grid can have `PlanResult.status: 'empty'` and still contain missing-color paint cells. Generic adapter empty handling must inspect the layout status and preserve that grid; it must not report an absent dataset.

## Adapter promotion gates

Native requires owned per-cell paint/color/opacity/source ports, four shape rendering cases, polygon/circle hit ownership with original IDs, color-axis legend metadata, long source text preservation before visual truncation, and accessible missing/noInk data access. Source IDs of 256 code units and point names of 512 exceed some existing generic Native slots; extend only the bounded Tilemap metadata port, not unrelated global guards.

Labels need actual renderer measurements or a clearly bounded optional presentation policy; do not estimate fit in Core or truncate identity/value to fit. Runtime checks must cover iOS/Android, holes/gaps, negative-column parity, hidden restore, missing versus zero, tooltip scrub/toggle/replay, reduced motion, tablet/orientation and dense plot scrolling. Pure geometry tests and Node timings do not certify native pixels, mobile FPS, memory behavior or gestures.
