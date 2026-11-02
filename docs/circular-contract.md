# Circular sweeps and scalar needles

The additive `options.circular` envelope belongs to the public `plan` entrypoint. It supports pie, donut and gauge data. Other families reject it. The existing default owners remain unchanged when the envelope is absent.

```ts
import {planChart} from '@neural-charts/core/plan';
import type {PlanPieSpec, PlanGaugeSpec} from '@neural-charts/core/plan';

const shares = {
  family:'pie', title:'Original shares',
  data:[{id:'a',label:'A',value:1},{id:'b',label:'B',value:3}],
} as const satisfies PlanPieSpec;
const semicircle = planChart(shares,{
  width:390,height:260,circular:{startAngle:-90,endAngle:90},
});

const measurement = {
  family:'gauge',title:'Original measurement',value:72,
  domain:[0,100],unit:'%',target:{value:80,label:'Target'},
} as const satisfies PlanGaugeSpec;
const dial = planChart(measurement,{
  width:390,height:300,circular:{gaugeStyle:'needle',tickCount:7},
});
```

## Angles and fitting

Angles are clockwise degrees from twelve o'clock. Start is between −360 and 360; end is at most 720 and must follow start by 1–360 degrees. Empty, reversed, sub-degree and multiple-turn sweeps are rejected. Pie/donut default to 0–360; an arc gauge defaults to −90–90 and a ring gauge to 0–360. Supplying one endpoint preserves the other endpoint's default; the resulting sweep must still be valid.

Original radial fractions come from the existing compensated normalization. The selected sweep transforms those fractions, not the original quantities or percentages. Wrapped sectors retain their true start/end angles, including an end beyond one turn. Zero remains a known, navigable quantity without fabricated area. Unknown values do not get hit targets.

`frame.circular.bounds` is the bounded drawing extent in original frame coordinates. Renderers fit that extent with a uniform transform, using the same inverse transform for touches and native text placement. They must not fit every sector independently or stretch circles differently along X and Y.

## Totals and missing values

`frame.radialSummary` distinguishes a complete visible total from a known visible subtotal. Its known/missing/hidden counts refer to the current visible source. Percentages with missing values use `percentageBasis:'known-visible-subtotal'`; the host must disclose this basis. A genuinely empty or all-unknown visible source has `knownTotal:null`, while an all-zero known source has `knownTotal:0`. A nonrepresentable sum also has a null total, explicitly identified by `overflow:true`. Safe fractions remain available without rewriting any original value.

## Scalar needles

`gaugeStyle:'needle'` replaces the filled reading with a true needle polygon and pivot. The track, bands, original-domain tick marks and optional target use one angular scale. `tickCount` requests the existing numeric tick planner's density from 2 to 12; it is not an exact mark count. Output is bounded to 16 ticks. A full-circle dial omits the duplicated final tick at the first tick's position. Tick options on solid gauges and gauge styling on pie/donut are rejected.

Only the visual needle fraction is clamped. An original reading below/above the domain keeps its original numeric value and is marked `valueState:'under'|'over'`. A null reading has no needle or invented observation; the dial remains a valid empty display with a missing reading. Hosts must distinguish a missing reading from zero and disclose bounded out-of-range rendering.

Needle frames carry the original domain and a radian `needle.from`/`needle.to` pair. The final polygon already represents the real target angle. Native renderers can animate its rotation around the supplied pivot without replanning data on every frame. Reduced-motion policy belongs to the renderer. These contracts do not create clocks or live timers; hosts supply controlled scalar updates.

Native integration, gesture checks and animations must pass independently before the adapter exposes these options. Core tests establish mathematical and contract behavior, not device acceptance.
