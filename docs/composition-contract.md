# Grouped stacks and independent mixed axes

These additive contracts belong to `@neural-charts/core/plan`. The Core computes one frame; the renderer supplies painting, gestures, accessible labels and units. The renderer must preserve the roles described below before exposing these capabilities.

## Grouped stacks

Use `family:'column'`, `options.stacking:'sum'|'percent'` and `options.stackGroups`. Horizontal columns use `orientation:'horizontal'`; they do not require a second calculation engine.

```ts
import type {PlanOptions, PlanStackGroup} from '@neural-charts/core/plan';

const groups = [
  {id:'actual', label:'Actual', seriesIds:['actual-a','actual-b']},
  {id:'planned', label:'Planned', seriesIds:['planned-a','planned-b']},
] as const satisfies readonly PlanStackGroup[];

const options = {
  width:390, height:300, stacking:'sum', stackGroups:groups,
} as const satisfies PlanOptions;
```

The partition contains one to eight nonempty groups and covers every original source series exactly once. A group ID is unique and at most 64 characters; its label is at most 200 characters. Inputs retain the existing limits of 16 source series and 64 categories. Other families, duplicate ownership, unknown or omitted source series, and groups without an explicit stacking mode are rejected.

Each category has adjacent stack slots. Original positive and negative values accumulate separately within their declared group. All groups share the same value domain, ticks and viewport. Slots remain in their declared positions when a whole group is hidden. Percentages use each group's denominator; original values remain unchanged. Unknown members prevent a complete percentage stack. An all-zero denominator produces no invented percentage or area.

`frame.stackGroups` identifies the partition and mode. Bar observations have polygon hit regions matching their own stacked rectangles. Stack annotations describe known positive/negative totals at each group's actual centre; they never claim an incomplete subtotal as a complete total. Colour and semantic series order follow original source identities.

## Mixed charts with independent Y scales

Add `axes.secondaryY` to a mixed source and assign each source series to `yAxis:'primary'|'secondary'`. Omitted assignment means primary. A declared secondary scale requires at least one original series assigned to each scale, even if some series are currently hidden.

```ts
import type {PlanMixedSpec} from '@neural-charts/core/plan';

const source = {
  family:'mixed', title:'Volume and temperature',
  axes:{
    x:{type:'category', values:[{id:'mon'},{id:'tue'}]},
    y:{type:'linear', domain:[0,400]},
    secondaryY:{type:'linear', domain:[0,50]},
  },
  series:[
    {id:'volume', name:'Volume', type:'column', data:[
      {id:'a',x:'mon',y:200},{id:'b',x:'tue',y:300},
    ]},
    {id:'temperature', name:'Temperature', type:'line', yAxis:'secondary', data:[
      {id:'a',x:'mon',y:25},{id:'b',x:'tue',y:30},
    ]},
  ],
} as const satisfies PlanMixedSpec;
```

This produces one category frame, clip, viewport and interaction grouping. Each scale retains its original domain and values. Column slots are allocated across all column series together, including series assigned to different value axes; independent projections do not overlay their rectangles. Area and line series reuse their existing projection owners.

`frame.mixedAxes` records full and displayed domains, reversal and series ownership. `frame.secondaryGrid` contains the secondary numeric ticks. Each observation's `valueAxis` identifies its scale. Renderers must use the correct units and must not reinterpret a secondary value using the primary unit. Visibility never retrains or normalizes measurements. A known all-hidden scale retains its domain for restoration; a genuinely unknown scale stays unknown.

### Zoom and reference values

X navigation uses the shared category window. A Y viewport is expressed in **primary source units**. The secondary window follows the same physical fraction of the plot through its own scale, including independently reversed axes. A numeric primary domain must exist for Y/XY navigation. X-only navigation can still operate with unknown primary values and known secondary data.

A normal Y reference uses the primary scale. Add `yAxis:'secondary'` to a numeric Y reference to target the secondary scale. The projected reference then carries `valueAxis:'secondary'`. A secondary reference on X, on a different family or without a declared secondary axis is rejected. Out-of-window references do not expand domains; unavailable domains do not invent a line.

These are two linear value axes sharing category X. They do not imply arbitrary per-series axes, logarithmic transforms, mixed stacking, pie overlays or independently moving viewports.
