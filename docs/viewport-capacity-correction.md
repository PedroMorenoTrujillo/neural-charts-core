# Plan viewport category capacity correction

The previous transform rejected more than 256 category IDs on both axes, even though Cartesian planning explicitly accepts up to 10,000 logical X categories through `capacity.categories`. This made large Column/Bar zoom and pan return `BAD_VIEWPORT_AXIS` after successful planning.

The logical X viewport limit now shares the planner's bounded `MAX_PLAN_CATEGORIES = 10000`. Horizontal bars retain logical X category identity; orientation does not change this limit. Category Y remains bounded at 256, matching interval-row contracts. No default capacity is increased and duplicate IDs, malformed windows, bad input/accessors and over-capacity states remain invalid.

Tests exercise 257, 1,000 and 10,000 categories, duplicate display labels, both orientations, applied replan, pan/reset and rejection above 10,000. Existing interval-category guard tests remain unchanged. No frozen mathematics files were edited.

During package verification, an older exact root-export assertion was brought up to date with the pre-existing financial and region-hit exports of this candidate branch. No runtime export was added by that test correction. Tests/property suite and isolated package consumer verification were both executed; the first package attempt hit the sandbox's global npm cache permissions and was rerun with a task-local cache, without changing global permissions.

Local-only correction; no publication or version bump. Web consumes a hashed npm-pack candidate from this shared Core Git repository.
