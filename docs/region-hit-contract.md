# Projected region membership

`preparePlanRegionHit(frame)` creates an immutable query handle for Venn, Contour and Pictorial frames. Build it once per geometry revision, call `query(x,y)` in logical plot coordinates, and release the handle with its owner. Unsupported families return undefined and retain their delegated primitive/point-index strategy. No DOM, global registry, observer or event state belongs to this calculation.

Venn uses the exact circles and membership bits in `vennLayout`, then looks up the corresponding inclusive intersection identity. The top SVG circle and the nearest annotation are not substitutes for region membership. An omitted/unrepresented combination does not select an unrelated observation.

Contour and Pictorial use the supplied projected hit polygons. A private bounding hierarchy skips unrelated regions; rank pruning returns the last-painted matching observation. Construction owns and sorts private entries, never the consumer frame. Queries do not scan all source observations. Tests use1000 separated regions to check the number of actual shape predicates, along with a real planned Venn frame.

`containsPlanHit` supports polygon, compound polygon, circle and sector membership. Polygon boundaries count as hits; empty/degenerate polygons and zero-angle sectors do not create an area. `hitTestPlanRegion` is the one-shot convenience form; repeated pointer queries should use the prepared index. Coordinates and geometry come from a valid Core-produced frame. Browser pixel conversion remains the renderer's responsibility.

This is an additive public planning capability. No frozen mathematical foundation, Scene contract or existing family calculation is modified.
