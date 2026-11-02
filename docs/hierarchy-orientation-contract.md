# Directed hierarchy orientation

`PlanOptions.hierarchy.orientation` accepts `horizontal` or `vertical` for treegraph and organization. The default is vertical. Source nodes, edges, groups and counts keep their existing contracts; orientation belongs to planning options.

The directed owner changes physical node positions before mapping, then derives node sizes, connection ports, connector controls, bounded labels, clipping and hit regions for that direction. Both directions retain physical XY viewport semantics over the normalized layout. Topological depth and incoming/outgoing counts remain original semantic metadata, independent of the selected direction.

This option is rejected for networkgraph, sunburst and other families. It does not imply a layout change for arbitrary cartesian axes or circular charts. Renderer-specific animation, touch recognition and device acceptance remain outside Core.
