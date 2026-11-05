# Supplied ranges and original lines

`PlanMixedRangeSpec` extends the public `family:'mixed'` contract with supplied `arearange` or `areasplinerange` series and original `line` series. The composition has one category X axis, original-unit Y domain, viewport, grid and reference-line owner. Scalar values participate in the common domain but do not paint surrogate range geometry.

```ts
import {planChart, type PlanMixedRangeSpec} from '@neural-charts/core/plan';

const data = {
  family:'mixed',title:'Observed temperature and supplied limits',
  axes:{x:{type:'category',values:[{id:'mon'},{id:'tue'}]},y:{type:'linear'}},
  series:[
    {id:'limits',name:'Supplied limits',type:'arearange',data:[
      {id:'mon',x:'mon',low:10,high:30},{id:'tue',x:'tue',low:15,high:35},
    ]},
    {id:'measured',name:'Measured',type:'line',data:[
      {id:'mon',x:'mon',y:20},{id:'tue',x:'tue',y:25},
    ]},
  ],
} as const satisfies PlanMixedRangeSpec;
const result = planChart(data,{width:390,height:300,viewport:{axes:'x'}});
```

At least one original line and one interval series are required. Up to16 original series and10,000 original rows are accepted within the existing path budget. Original series and point IDs remain unchanged. Interval observations expose `lowValue`/`highValue`; their compatible scalar `value` is the midpoint, not a probability or a new original measurement. Scalar observations have no invented interval endpoints. Renderers must show the interval endpoints in detail and accessibility text.

Both interval endpoints must be known or both null; inverted bounds are rejected. Equal endpoints are a known zero-width interval. Missing intervals break their boundary runs. Line gaps and step settings retain the existing validated line policy. Hiding/restoring source series recalculates the same common domain and preserves source identities. The viewport clips the display while retaining original interval bounds in observations.

One boundary interpolation policy applies to the interval layers: supplied straight ranges or supplied smooth ranges. Mixing those policies in one composition, secondary Y axes, columns, areas, stacking, column placement settings and unknown fields are rejected. Existing scalar mixed charts retain their existing independent-axis contract. The supplied intervals carry no invented confidence or coverage metadata.

`frame.mixedRanges` identifies the original series kinds so renderers can distinguish interval and scalar semantics. Paint order puts supplied intervals before scalar lines; legend and observation order retain source order. Both layers use the exact same coordinate maps rather than independently fitted charts.
