# Immutable plan-input reuse

`ownPlanInput` may reuse an owned copy only after the complete source subtree has been validated and proven frozen, including every object/array descendant. A shallowly frozen container with mutable children is always inspected/copied again. Mutable caller objects, accessors, cycles, sparse arrays and invalid numbers retain their previous handling.

The WeakMap caches source identity without retaining source keys globally. Cache records are limited to call roots and coarse arrays (at least64 visited nodes), rather than allocating metadata for every individual datum. Descendant immutability is propagated separately, so skipping a small record never mistakes a mutable child for an immutable one. Each entry records total visited nodes, total string characters and subtree height. Every cache hit charges all those costs against the current call's limits and depth, so warming a permissive call cannot bypass a later restrictive capacity or deep nesting check. Cached owned copies are frozen before reuse; no caller object is frozen or modified.

This removes repeated allocation/inspection of Web's already-owned immutable series and axes during geometry/viewport updates. It does not skip normalization, domain calculation or geometry. It introduces no public API or runtime dependency and changes no frozen mathematics or scene module.

Validation: 80 unit/property files, 985 tests, every plan integration script, and isolated npm-pack consumer/import/README/DOM-boundary checks passed. Performance and retained-heap effects must be measured in the actual downstream renderer rather than inferred from these tests.
