# Exact Line plan projection

Performance continuation, 2026-11-04. Preserve the frozen NC-01A foundation and all public input, viewport, error and datum-identity semantics.

For Line plans above 2,048 non-null points, build path commands directly through the existing scales and shared step-segment writer. Allocate projected datum objects only for the visible observation set. Avoid the full projection ID Map, full wrapper array and remapped run arrays. Smaller Line plans and the richer Area/Spline projections retain their existing path.

Every raw vertex is still mapped and validated, including offscreen values. Full path prefixes are deliberately retained: clipping them would change dash phases and could invalidate offscreen-coordinate errors. This first pass reduces allocation rather than claiming to process only a cropped X window. No approximate geometry reduction or changed public command representation is introduced here.

Differential tests compare exact commands, eligibility, source identities, hidden series, all four curve modes, connected/broken gaps, isolated category points with repeated labels and offscreen error paths. Follow with the full Core/package gate and same-scenario packed Web/browser timings before retaining the change.

The first same-scenario measurement showed regressions with a generic `for in` frame freezer. Restore the original generic freezer rather than retain an unproven micro-optimization. Construct Line observation IDs/groups/records already deeply frozen (their children are known immutable primitives/identities), and cache stable identity/group-key arrays weakly by normalized series. Never cache viewport coordinates or formatted labels. Preserve the unfavorable first candidate timings as separate evidence.

Rejected optimization: borrowing arbitrary frozen caller objects to remove the ownership copy. Frozen proxies, non-enumerable properties and prototype semantics prevent a general safe ownership guarantee. Existing bounded copying and mutation/alias protections remain intact.
