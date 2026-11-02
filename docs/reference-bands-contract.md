# Reference bands in planning

`@neural-charts/core/plan` accepts bounded, style-free intervals in the units of
the represented axis. The renderer chooses colors, opacity, labels and accessibility
presentation. A band never becomes a data observation, tooltip target, legend
item or domain contributor.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanReferenceBand} from '@neural-charts/core/plan';

const referenceBands = [
  {id: 'working-week', axis: 'x', from: 'mon', to: 'fri'},
  {id: 'target-range', axis: 'y', from: 40, to: 60},
] as const satisfies readonly PlanReferenceBand[];

const result = planChart(data, {width: 320, height: 260, referenceBands});
if (result.status !== 'invalid') {
  for (const band of result.frame.referenceBands ?? []) {
    if (band.status === 'visible') drawRectangle(band.box);
  }
}
```

## Source contract

`PlanOptions.referenceBands` contains at most 32 `PlanReferenceBand` values.
Every band has a unique nonempty `id` of at most 64 characters, logical `axis`,
`from` and `to`. Logical X remains the category axis in horizontal bars; logical
Y remains the value axis. `valueAxis: 'secondary'` is permitted only for a Y band
on a mixed source with an explicitly declared secondary Y axis.

Ordinary axes use their source-value units. A percent-stacked Y axis uses
percentage units, normally 0–100, rather than the raw series values. For example,
raw values 1000 and 3000 produce a 25%/75% stack; a Y band from 25 to 75 marks the
middle half of that percentage axis. The input values remain 1000 and 3000 in
observations. No automatic conversion of a band's endpoints is performed.
An explicit or zoomed axis window clips that same band in the displayed units.

Numeric endpoints must be finite and satisfy `from < to`. Time endpoints also
follow the existing integer timestamp and supported date-range contract.
Category endpoints are original category IDs, in source order, and are
inclusive. Equal category endpoints highlight one actual category slot. Labels
are never identities, including when multiple categories have the same label.
Unknown IDs, reversed intervals, unsupported families, duplicate band IDs,
unknown properties and invalid secondary-axis assignments return an explicit
`invalid` planning result.

The source supports line, area, spline, area spline, column (including
horizontal bars and stacking), mixed, scatter and bubble planning. Grouped
stacks, stacked area, scalar mixed charts, mixed independent Y axes and the
existing coordinated range/line mixed variant retain their original owners.
Other families reject `referenceBands`, including an explicitly supplied empty
list. Omitting the option retains the previous plan contract.

## Projection contract

`PlanFrame.referenceBands` preserves every validated band's original `id`,
`axis`, `from`, `to` and optional `valueAxis`. Each band has one of three states:

- `visible`: a finite positive-area `box` clipped to the current plot rectangle.
- `outside`: a valid source interval does not intersect the displayed window.
- `unavailable`: its chart has no usable domain or coordinate map, such as an
  empty or fully hidden data source. No rectangle is invented.

Numeric clipping precedes mapping. Existing reversed value-axis maps are used
unchanged, including a mixed secondary Y axis. Viewport changes retain original
endpoints while recomputing only the rectangle. A band does not introduce an
axis-reversal capability absent from the source's existing axis contract.
Category intervals use the current owner's actual category edges or its
existing point-axis slot adapter, never a width inferred from label length or a
new category scale.

## Implementation boundary

The plan adapter reuses the existing `validateReferenceBands`,
`projectReferenceBands` and `referenceBandAxes` owners. Their frozen public
contracts and limits are unchanged; the additive 32-band plan envelope performs
bounded validation through that owner and checks IDs globally. Explicit owner
contexts supply their existing domains, maps and category slots. No mutable
global channel, new mathematics, observation or extra scale is introduced.

The original `PlanOptions.references` line-reference contract remains unchanged
and may coexist with bands. Planning results own and freeze their metadata and
geometry; caller data and options remain untouched.
