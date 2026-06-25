═══════════════════════════════════════════
ADR-0002: Roadmap Visual Polish & Interactivity (Deferred)
═══════════════════════════════════════════
Status: Accepted, deferred

Context
The Phase 4 roadmap renders one goal's subgoals as a lightweight custom-SVG
"metro map" (RoadmapView.tsx + RoadmapStationNode.tsx) over a layout-agnostic
engine (engine/roadmap/buildRoadmap), store action (loadRoadmap), and hook
(useRoadmap). It is read-only and static: stations laid out left-to-right by
dependency depth, curved "supports" lines, no pan/zoom/drag/collapse. The map
works and is correct, but the visuals are a placeholder rather than a finished
experience, and it cannot be browser-previewed in the dev harness, so visual
iteration is slow guess-and-check.

The question raised: make the roadmap more interactive/polished now, or later?

Decision
Defer roadmap visual polish and interactivity. Leave RoadmapView/
RoadmapStationNode as-is and treat richer visuals as Phase 7 (Polish &
Stability) work — or sooner if the current map actively gets in the user's way
during real use. Prioritise app internals (correctness, data model, the
remaining engine/store hardening) first.

Why deferring is safe (the architecture was built for this)
- The roadmap's data and math are layout-agnostic: buildRoadmap, loadRoadmap,
  and useRoadmap know nothing about pixels. They are tested and stable.
- All visual concerns are isolated to TWO presentation files: RoadmapView.tsx
  and RoadmapStationNode.tsx. This was already proven once — the simple-list
  view was swapped for the metro map with zero changes to engine/store/hook.
- Therefore the cost of polishing later is ~nil rework; the cost of polishing
  now is real (no browser preview in-harness; pulls a session off internals
  while the data model is still evolving).

Two distinct meanings of "more interactive" — separate when we revisit
1. Visual / navigation interactivity (pan, zoom, drag-to-rearrange, hover
   highlight, collapse). This is what React Flow — already in the LOCKED tech
   stack — is built for, and it would consume the SAME engine output. This is
   the natural "make it fancy" upgrade and is purely a presentation change.
2. Editing on the roadmap (adding/removing dependencies directly there). This
   is a PRODUCT decision, not just visual: today editing lives on Goal Detail
   (roadmap = comprehension, detail = editing), per the "one question per
   screen" principle. Moving editing onto the roadmap must be decided
   deliberately, not slipped in with a visual pass.

Prerequisites / triggers before doing the polish
- The app internals are settled enough that the roadmap's inputs (subgoal
  graph, statuses, completion) are stable.
- Real in-browser use has shown what the map actually needs (density, label
  legibility, cycle handling, scroll feel) rather than guessing now.
- For interactivity specifically: a decision on React Flow vs. extending the
  custom SVG, made against an actual on-screen baseline.

Consequences of deferring now
- The roadmap stays static and read-only; heavily-connected or cyclic goals may
  look a little rough (the cyclic note explains the approximate ordering).
  Accepted, known limitation until the polish pass.
- No rework debt is incurred by waiting, by design.
═══════════════════════════════════════════
