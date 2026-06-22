# LifeMap — Phase 0/1/2 Full Code Review (read-only audit)

Date: 2026-06-18
Scope: entire `src/` (schema, repositories, engine, store, components, pages, router).
Nature: read-only. No source was changed in producing this report.

## Baseline (fresh run)

- `npx tsc -b` → **clean** (no output).
- `npx vitest run` → **80 passed, 15 files**, 0 failures.
- Working tree: clean at audit start.

## Overall health

**Healthy.** No critical/correctness or data-integrity bugs found. The
architecture rules (DB→Repos→Engine→Store→UI), engine purity, and the "no `any`"
rule are all genuinely upheld. Findings are moderate debt (no error handling in
store actions, redundant fetches) and minor cleanup (stub repos, stale comments,
a few inline constants, unused getters).

---

## Critical (correctness / data integrity)

**None found.** Cascade deletes are now transactional; the weekly-review date
window has boundary tests; progress/priority/review math handles empty arrays and
optional fields correctly.

---

## Moderate (architecture / real inconsistencies / debt worth fixing)

### M1 — Store mutations and refreshers have no error handling
`src/store/useGoalStore.ts` — every `addX/editX/removeX/toggleTaskComplete` and
the `refresh*` helpers `await` repository calls with no `try/catch`. The `load*`
wrappers use `try/finally` only to reset a loading flag, never to catch.
- Why it matters: a refresh that rejects mid-`Promise.all` (e.g.
  `Promise.all([refreshCurrentTree(), refreshDashboard(), refreshTopPriority()])`
  in `addTask`/`editTask`/`removeTask`/`toggleTaskComplete`) leaves the slices
  that already `set()` updated and the rest stale, and surfaces as an unhandled
  promise rejection (UI callers like `TaskRow.handleToggle` only `try/finally`).
  The write itself is safe; the cached view can drift until the next load.
- Suggested fix (described): wrap mutation bodies in `try/catch`, surface a
  recoverable error state, and/or re-load the affected views on failure.

### M2 — Dashboard load does two full all-goals/all-tasks compositions
`src/store/useGoalStore.ts` `loadDashboard` runs `refreshTopPriority()` **and**
`refreshGoalsAndProgress()`, and each independently calls `gatherGoalsWithTasks()`
(`getAllGoals` + `getTasksByGoalId` per goal). Plus `refreshDashboard()` issues
its own scheduled-window queries.
- Why it matters: 2× the goal/task fan-out per dashboard mount. Fine at current
  scale; wasteful as data grows. (Documented as known in the last handoff.)
- Suggested fix (described): have `loadDashboard` call `gatherGoalsWithTasks()`
  once and pass the result into both consumers (signature change), or memoize per
  load tick.

---

## Minor (style / dead code / stale comments)

### N1 — Stub repositories are empty and carry stale comments
`dependencyRepository.ts`, `profileRepository.ts`, `snapshotRepository.ts` each
`export const x = {}` and are re-exported by the barrel but referenced nowhere.
- `profileRepository` comment says "CRUD lands in Phase 1" — still empty in Phase 2.
- `snapshotRepository` comment says "used from Phase 2 onward for momentum trends
  and weekly reviews" — **false**: Weekly Review was built to compute live per
  ADR-0001; no snapshot code exists or is wanted yet.
- Why it matters: misleading docs; empty-object exports masquerade as a repo API.
- Suggested fix (described): update the comments to "Phase 0 placeholder, not yet
  implemented" (and align snapshot wording with ADR-0001), or remove until needed.

### N2 — Repository getters with no application caller
`getTasksByStatus`, `getTasksByScheduledDate` (`taskRepository`),
`getSubgoalsByStatus` (`subgoalRepository`), `getMilestonesByStatus`
(`milestoneRepository`), `getGoalsByStatus` (`goalRepository`) are exercised only
by their tests — no store/UI caller (verified by grep).
- Why it matters: speculative API surface; mild tension with the
  "no premature abstractions" guideline.
- Suggested fix (described): keep if intended as deliberate repo API; otherwise
  trim. Not urgent (small, tested, conventional).

### N3 — Inline date constants in the dashboard/review windows
`useGoalStore.refreshDashboard` uses `addDays(now, 1)` / `addDays(now, 7)` and
`computeWeeklyReview` uses a `for (let i = 7; i >= 1; i--)` loop — the upcoming-
window length (7) and the review-window length (7) / "yesterday" (1) are inline.
- Why it matters: the "7-day window" concept recurs unnamed in two subsystems.
- Suggested fix (described): name them (e.g. `UPCOMING_WINDOW_DAYS = 7`,
  `REVIEW_WINDOW_DAYS = 7`).

### N4 — `Task.estimatedMinutes` is unused
Declared on the canonical `Task` type but read/written nowhere.
- Why it matters: dead field (intentionally reserved for AI scheduling per the
  effort-momentum session). Noted, not a defect.
- Suggested fix (described): leave as reserved; revisit in Phase 5.

### N5 — Four creation modals suppress `react-hooks/exhaustive-deps`
`GoalCreationModal`, `SubgoalCreationModal`, `MilestoneCreationModal`,
`TaskCreationModal` each `// eslint-disable-next-line react-hooks/exhaustive-deps`
on the "reset form fields when `open` flips" effect.
- Why it matters: a deliberate, identical pattern; acceptable but a suppressed lint.
- Suggested fix (described): leave as-is, or refactor to a keyed remount.

### N6 — Duplicated `makeTask` factory across test files
Several `*.test.ts` redefine a near-identical `makeTask` helper.
- Why it matters: test-only duplication.
- Suggested fix (described): a shared test factory module (optional).

---

## Checklist results (quick confirmations)

- **Type safety:** no `any` (type position) anywhere in `.ts`/`.tsx`. ✓
- **Architecture layering:** no component/page imports `@/engine` or `@/database`
  (grep clean). Store delegates math to engine; no inline derived math. ✓
- **Engine purity:** no engine **source** reads `new Date()`/`Date.now()` or
  touches DB/store (only test fixtures construct dates). `scoreTask`, `rankTasks`,
  `computeWeeklyReview` all take `now` as a parameter. ✓
- **Prop-driven components avoid engine imports:** `MomentumBar`,
  `PriorityTaskPanel`, `GoalProgressSnapshot` confirmed engine-free (the last
  types its prop as `Record<ID, {percent:number}>` to stay so). ✓
- **Prohibitions / Phase-3 leaks:** no Redux/backend/auth/AI; `'locked'`
  milestone status exists in the canonical type + labels but is **never set** by
  any code (`reconcileMilestone` only toggles completed↔active and *preserves* a
  pre-existing locked) — defined-but-dormant per the canonical model, not a leak. ✓
- **Do-not-touch drift:** MomentumBar is effort-based (intended change),
  `computeCompletion` + the two remaining aliases intact, priority/progress/review
  paths match their handoffs. ✓
- **Test coverage:** every pure engine fn has a `.test.ts`
  (completion/goal/subgoal/effort/isMilestoneComplete/scoreTask/rankTasks/
  weeklyReview); repositories + cascade + sweep covered. Store integration layer
  has no automated tests (known; that's where M1's risk lives).

---

## SECTION 12 — Milestone-less task support (feeds the rehome-vs-destroy decision)

A task with **no `milestoneId`** (attached directly to a subgoal) is a
first-class, fully-supported state today. Per-layer:

- **Repositories — SUPPORTED.** `createTask` simply omits `milestoneId` when not
  given; `getTasksBySubgoalId` / `getTasksByGoalId` return loose tasks (keyed by
  `subgoalId`); `getTasksByMilestoneId` correctly *excludes* them; `getGoalTree`
  partitions tasks into `looseTasks` (milestoneId undefined) vs per-milestone
  buckets. Nothing assumes `milestoneId` is present.
  - Rehome note: `updateTask` accepts a partial that can include `milestoneId`.
    To rehome, an implementation would set `milestoneId` to undefined — verify
    Dexie's `update({ milestoneId: undefined })` actually clears the indexed
    property (it does delete the key, but confirm when implementing).

- **Store — SUPPORTED.** `addTask` computes `order` by grouping on
  `t.milestoneId === input.milestoneId` (undefined matches the loose group);
  `toggleTaskComplete` only calls `reconcileMilestone` when `task.milestoneId`
  is set; `tasksOfSubgoal` includes `looseTasks`.

- **Progress calculations — SUPPORTED.** `computeCompletion` /
  `computeGoalProgress` / `computeSubgoalProgress` count by `status` over arrays
  that already include loose tasks (via `getTasksBySubgoalId` and the tree's
  `looseTasks`). No milestone assumption; loose tasks are counted, not dropped.

- **Priority engine — SUPPORTED.** `scoreTask`/`rankTasks` never read
  `milestoneId`; `rankTasks` ranks the flat `getTasksByGoalId` union, which
  includes loose tasks.

- **Weekly review — SUPPORTED.** `computeWeeklyReview` filters by
  `completedAt`/`scheduledDate`/`status` only; the store's goal-grouping uses
  `getTaskLineages` keyed by `subgoalId`, which every task (loose or not) has, so
  loose tasks are counted and grouped under their goal.

- **Goal tree rendering — SUPPORTED.** `SubgoalSection` renders `looseTasks` —
  under an "Other tasks" header when the subgoal also has milestones, or directly
  when it has none. `MilestoneCard` only renders its own milestone's tasks (correct).

- **Task creation/edit flows — PARTIAL (one real gap).**
  - **Create loose: SUPPORTED.** The subgoal-level "Add task" opens
    `TaskCreationModal` with only `subgoalId` (no `milestoneId`) → a loose task.
  - **Reparent via edit: NOT POSSIBLE TODAY (BLOCKER for manual reparenting).**
    `TaskCreationModal` (edit mode) has no milestone selector and `editTask` is
    never passed `milestoneId`, so a user cannot move a task between a milestone
    and loose through the UI. This does **not** block the proposed
    deleteMilestone→rehome behavior (that rehome would be done programmatically in
    the store by clearing `milestoneId`), but it does mean users have no manual
    reparent control.

### Section 12 verdict
**Milestone-less tasks are fully supported across data, store, engine, review,
and rendering.** Rehoming a deleted milestone's tasks to its subgoal (set
`milestoneId` undefined) lands them in a state every layer already handles and
displays (the "Other tasks" section). The only related gap is cosmetic/UX: the
task form can't reparent a task, and rehomed tasks keep their old per-milestone
`order` values (consider re-sequencing `order` within the loose group on rehome
to avoid odd ordering). No blockers to the rehome direction.
```
