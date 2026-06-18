═══════════════════════════════════════════
ADR-0001: Historical Progress Snapshots (Deferred)
═══════════════════════════════════════════
Status: Proposed, deferred

Context
Weekly Review (Phase 2, 2.5) needs trend data — completed vs. missed tasks,
momentum over time, roadmap advancement. There are two ways to get it:
(a) compute trends live, at render time, from existing per-task fields
(completedAt, scheduledDate, dueDate, effort), or (b) persist periodic
snapshots of aggregate state (daily/weekly momentum, goal progress) into a
new table, preserved independently of later edits to the underlying tasks.

Decision
Defer snapshot tables. Weekly Review v1, and any other Phase 2 history needs,
will compute live from existing fields. Revisit snapshots once: the momentum
formula (effort-based) is stable and not expected to change again; the effort
field is in active use across enough tasks that historical effort data is
meaningful; and Weekly Review v1 has been used long enough in practice to
surface real limitations rather than speculative ones.

Future use cases (why we'll eventually want this)
- An accurate historical record that survives later edits or deletions — live
  computation can't reconstruct "what was momentum on June 1st" if a task
  involved that day has since been edited or removed.
- Trend charts spanning months without re-deriving from the full task table
  every time.
- Fast-loading weekly/monthly review pages once task volume grows.
- Phase 6 AI progress summarization — clean historical summaries are a much
  better context source for the model than reconstructed live queries.
- Reliable streak/consistency tracking, which depends on an immutable
  historical record, not a number that can silently shift retroactively.

Prerequisites before building snapshots
- Momentum calculation finalized (effort-based, weights agreed) — no point
  snapshotting a number whose formula is still moving.
- A decided cadence (daily, weekly, or both) and exactly which fields each
  snapshot row captures.
- An explicit decision on snapshot immutability: editing a task's effort or
  deleting it after the fact should NOT change a past snapshot — that's the
  entire point of having one. This needs to be designed, not assumed.
- Weekly Review v1 live in actual use long enough to know its real pain
  points (performance, drift from edits) rather than guessing them now.

Consequences of deferring now
- Weekly Review v1's trend data is only as good as current raw task data;
  editing a completed task's effort retroactively will quietly change how
  past momentum looks, since there's no immutable record yet. Accepted,
  known limitation until snapshots land.
- Slightly more computation at Weekly Review render time. Acceptable at
  current data scale.
═══════════════════════════════════════════
