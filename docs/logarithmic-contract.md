# Logarithmic planning

`PlanOptions.scales.x` and `.y` optionally accept `{type: 'log', base: 10}`. Omit an axis to retain its existing category, time or linear projection. The data contract stays in original units: `type: 'linear'` identifies numeric source coordinates, while `scales` chooses how they are displayed.

This projection supports line, scatter and bubble. A log axis requires finite positive known source values, including hidden series and known coordinates in incomplete pairs. Null retains its existing missing/gap meaning. Explicit domains, reference lines, reference bands and controlled numeric windows on that axis must also be positive. Include-zero axes, stacking, filled baselines and unsupported families are rejected explicitly. Bubble Z and area/radius semantics do not change.

Tick values, observations, identities, tooltips and viewport windows retain original values. Equal ratios have equal displayed spacing. Reversal is applied by the existing axis contract. A logarithmic viewport axis is reported as `{type: 'log', base: 10, domain}`. Renderers must handle this additional union member; never apply an additive numeric delta directly to its original domain. `transformPlanViewport` reuses the shared zoom/pan operations in local logarithmic coordinates and returns positive original-unit windows. Reset returns an empty controlled window.

The implementation uses a local log distance, avoiding division overflow and preserving adjacent large doubles whose absolute logarithms coincide. Ticks are bounded; constant and extreme finite sources remain representable where JavaScript numbers permit a nonzero window. A window too narrow to represent is rejected rather than replaced with fabricated values.

Line segments are clipped in geometric coordinates before pixel projection. With linear X and log Y, the segment from `(0, 1)` to `(1, 100)` crosses `x = .5` at `y = 10`. Clipping must preserve that geometry. Clip intersections occur only in path commands and never become observations, selectable data or tooltips. Existing source normalization preserves explicit null gaps and step modes.

No Angular, browser API, platform callback or scheduling is introduced into Core. Device gestures and native rendering require separate adapter acceptance.
