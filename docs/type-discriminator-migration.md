# Migrating chart discriminators from `kind` to `type`

This breaking Core contract change uses `type` for every public discriminator previously named `kind`. The chart-family field remains `family`; it is a separate contract. Consumers must adapt before installing this release.

- Source axes: `axes.x.type`, `axes.y.type` and the equivalent nested category, numeric and time axes.
- Mixed series: `series[].type`, including range and line compositions.
- Waterfall points: `series[].data[].type` for delta, subtotal and total.
- Log scales and viewport bounds: `scales.x.type`, `scales.y.type`, and the returned viewport axis discriminator.
- Colour scales, frames and value classifications: `colorAxis.type`, mapped colour `type`, and continuous/classes/missing/unclassified decisions.
- Returned geometry: commands use `type: 'M' | 'L' | ...`; hit regions and cell geometry use `type: 'circle' | 'polygon' | ...`.
- Returned labels and observations: numeric/time labels, timeline events, fan intervals/centres, regression samples/fits, word-cloud decisions and their typed summaries use `type`.
- Public low-level Cartesian/financial types and every exported Core planning entry follow the same discriminator convention.

```ts
// Before
const axis = {kind: 'category', values: [{id: 'monday'}]};
const series = {id: 'visits', name: 'Visits', kind: 'column', data: []};

// After
const axis = {type: 'category', values: [{id: 'monday'}]};
const series = {id: 'visits', name: 'Visits', type: 'column', data: []};
```

Legacy `kind` keys are not compatibility aliases. A source object with only the obsolete discriminator is invalid. Supplying both `type` and `kind` is also invalid in validated chart configuration. This avoids silently selecting the wrong chart, scale or point behavior. Required values and supported combinations are unchanged.

The mathematical operations, domains, projected coordinates, source identities and values are unchanged. Nine actual pre-migration planner outputs from Core commit `ac64b2172a60665283cc5c3fa00ac21cbfcd3bd1` are retained as regression fixtures; only their discriminator keys were renamed. The regression compares complete results, including geometry and metadata, and checks that source objects are not mutated.

Internal plural map names such as `kinds` and descriptive names such as `computedKind` are not discriminator keys and do not change. Core has no browser `postMessage` protocol. Renderers may retain private protocol message classifiers named `kind`; those do not belong to Core's chart data/options contract.
