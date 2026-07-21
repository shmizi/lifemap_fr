// Goal store — the single place the UI reads goal-list and goal-tree state from,
// and the only place (besides repositories) that orchestrates writes.
//
// Locked data flow: Database -> Repositories -> Store action -> Hook -> UI.
// UI components never import a repository directly; they call these actions.
//
// State kept deliberately small:
//   - goals[]          : the flat list shown on the Goals page
//   - todaysTasks[]    : tasks scheduled for today, for the Dashboard
//   - selectedGoalId   : which goal the user is focused on
//   - currentGoalTree  : the assembled read-only tree for the Goal Detail View
// No derived/health/priority values are cached here — those are engine concerns
// in later phases.

import { create } from 'zustand'
import { format, addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import type {
  Goal,
  Subgoal,
  Milestone,
  Task,
  GoalTree,
  TaskLineage,
  Dependency,
  DeadlineHardness,
  StrategyBrief,
  SlipReason,
  ID,
} from '@/core/types'
import { computeEffortMomentum } from '@/engine/progress/computeEffortMomentum'
import type { Completion } from '@/engine/progress/computeCompletion'
import {
  computeGoalProgress,
  type GoalProgress,
} from '@/engine/progress/computeGoalProgress'
import {
  computeSubgoalProgress,
  type SubgoalProgress,
} from '@/engine/progress/computeSubgoalProgress'
import {
  computeGoalHealth,
  type GoalHealth,
} from '@/engine/health/computeGoalHealth'
import { computeLaggingFoundation } from '@/engine/health/computeLaggingFoundation'
import {
  computeGoalProjection,
  type GoalProjection,
} from '@/engine/health/computeGoalProjection'
import {
  computeReliability,
  type Reliability,
} from '@/engine/health/computeReliability'
import { computeRisk, type Risk } from '@/engine/health/computeRisk'
import {
  computeGoalInsights,
  type GoalInsight,
} from '@/engine/health/computeGoalInsights'
import {
  computeSlipInsights,
  type SlipPattern,
} from '@/engine/health/computeSlipInsights'
import { isMilestoneComplete } from '@/engine/progress/isMilestoneComplete'
import { rankTasks, DEFAULT_TOP_N } from '@/engine/priority/rankTasks'
import { partitionScheduledAndBacklog } from '@/engine/planning/partitionTasks'
import { findDuplicateTaskIds } from '@/engine/planning/dedupeTasks'
import { computeActiveSupportCounts } from '@/engine/priority/dependencyBoost'
import { buildRoadmap } from '@/engine/roadmap/buildRoadmap'
import { computeLifeMapLayout } from '@/engine/roadmap/computeLifeMapLayout'
import {
  computeWeeklyReview,
  type WeeklyReviewData,
} from '@/engine/review/computeWeeklyReview'
import {
  computePhaseCheckIn,
  type PhaseCheckInData,
} from '@/engine/review/computePhaseCheckIn'
import {
  computeRoadmapDigest,
  type RoadmapDigest,
} from '@/engine/review/computeRoadmapDigest'
import { computeStrengthenedFoundations } from '@/engine/review/computeStrengthenedFoundations'
import { buildMilestonePrompt } from '@/engine/ai/prompts/milestones'
import { parseMilestoneSuggestions } from '@/engine/ai/parsers/milestones'
import { buildSubgoalPrompt } from '@/engine/ai/prompts/subgoals'
import { parseSubgoalSuggestions } from '@/engine/ai/parsers/subgoals'
import { buildDailyPlanPrompt } from '@/engine/ai/prompts/dailyPlan'
import { buildStrategyBriefPrompt } from '@/engine/ai/prompts/strategyBrief'
import { buildStructurePrompt } from '@/engine/ai/prompts/structure'
import { parseStructure } from '@/engine/ai/parsers/structure'
import { buildScopeCutPrompt } from '@/engine/ai/prompts/scopeCut'
import { parseScopeCut } from '@/engine/ai/parsers/scopeCut'
import { resolveScopeCutTarget } from '@/engine/planning/resolveScopeCutTarget'
import {
  buildIntakePrompt,
  MAX_INTAKE_QUESTIONS,
} from '@/engine/ai/prompts/intake'
import { parsePlannedSessions } from '@/engine/ai/parsers/plannedSessions'
import { parseStrategyBrief } from '@/engine/ai/parsers/strategyBrief'
import { parseIntakeQuestions } from '@/engine/ai/parsers/intake'
import {
  scheduleDailyTasks,
  expandRecurringSessions,
  computePlanWindow,
} from '@/engine/ai/scheduleDailyTasks'
import {
  packSessionsIntoDays,
  type PackSession,
} from '@/engine/ai/packSessionsIntoDays'
import { rescheduleOverdue } from '@/engine/ai/rescheduleOverdue'
import type {
  MilestoneSuggestion,
  MilestoneSuggestionContext,
  SubgoalSuggestion,
  SubgoalSuggestionContext,
  DailyPlanRequest,
  ScheduledDailyTask,
  AIUserContext,
  AIGoalContext,
  PlannedSession,
  IntakeExchange,
  PlannedTrack,
  ScopeCutProposal,
  ScopeCutSuggestion,
} from '@/engine/ai/types'
import { aiProvider } from '@/services/ai'
import {
  DAILY_PLAN_HORIZON,
  DAILY_PLAN_LOW_WINDOW,
  MAX_RECURRING_SESSIONS,
  DEFAULT_DAILY_MINUTES,
  DEFAULT_SUBGOAL_STATUS,
  DEFAULT_MILESTONE_STATUS,
  DEFAULT_TASK_STATUS,
  DEFAULT_TASK_PRIORITY,
  LIFE_SITUATION_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  WORK_RHYTHM_OPTIONS,
  WEEKDAY_LABELS,
} from '@/core/constants'
import {
  getAllGoals,
  getGoalById,
  createGoal,
  updateGoal,
  deleteGoal,
  getGoalTree,
  getSubgoalsByGoalId,
  getSubgoalById,
  createSubgoal,
  updateSubgoal,
  deleteSubgoal,
  getSubgoalsByStatus,
  getMilestonesBySubgoalId,
  getMilestoneById,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  getTasksBySubgoalId,
  getTasksByMilestoneId,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getTasksScheduledBetween,
  getTasksScheduledBefore,
  getTaskLineages,
  getTasksByGoalId,
  getAllTasks,
  getDependenciesByType,
  deleteGoalContext,
  getUserContext,
  getGoalContext,
  saveStrategyBrief,
  getStrategyBrief,
  getProfile,
  createSlipEvents,
  getSlipEventsByGoalId,
  deleteSlipEventsByGoalId,
} from '@/database/repositories'

// User-facing copy for the store's NON-FATAL failure states. Kept calm and
// generic — the user gets a gentle nudge, never a stack trace. WHY defined here
// and not in core/constants: these belong to the store's error plumbing, not the
// shared UI vocabulary other components reach for.
const REFRESH_ERROR_MESSAGE =
  'Something went wrong updating the view. What you see may be out of date.'
const LOAD_ERROR_MESSAGE =
  'Something went wrong loading your data. Please try again.'

// ── "New X" input shapes (creation forms) ───────────────────────────────────
// The repository owns id + timestamps; the store action owns `order` where the
// entity has one. So the form supplies neither id/timestamps nor order.
export type NewGoalInput = Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>
export type NewSubgoalInput = Omit<
  Subgoal,
  'id' | 'createdAt' | 'updatedAt' | 'order'
>
export type NewMilestoneInput = Omit<Milestone, 'id' | 'createdAt' | 'order'>
export type NewTaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'order'>

// ── "Changes" shapes (edit forms) ───────────────────────────────────────────
// Patchable fields only; immutable id/timestamps are excluded (repositories
// manage timestamps). Each is assignable to its repository's update() parameter.
export type GoalChanges = Partial<Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>>
export type SubgoalChanges = Partial<
  Omit<Subgoal, 'id' | 'createdAt' | 'updatedAt'>
>
export type MilestoneChanges = Partial<Omit<Milestone, 'id' | 'createdAt'>>
export type TaskChanges = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>

// ── Weekly Review view-model ─────────────────────────────────────────────────
// The pure engine result (WeeklyReviewData) plus the goal-grouping the store
// assembles on top (completed-task counts per goal, via the lineage mechanism).
// Grouping is here, not in the engine, because it needs a repository lookup.
export interface CompletedGoalCount {
  goalTitle: string
  count: number
}
// The Weekly Review's dependency signal, resolved to a title for display: a
// foundational subgoal the user advanced this week (see computeStrengthenedFoundations).
// Per the "one question per screen" principle, the dependency graph appears in
// the review as leverage GAINED ("why did this week's work matter?"), distinct
// from the dashboard's to-do framing and the roadmap's connection map.
export interface StrengthenedFoundationNote {
  subgoalTitle: string
  activeSupportCount: number
}
export type WeeklyReview = WeeklyReviewData & {
  completedByGoal: CompletedGoalCount[]
  strengthenedFoundations: StrengthenedFoundationNote[]
}

// ── Goal Health view-model (Phase 3 pace + Phase 4 dependency signal) ─────────
// A goal's health for the UI: the PACE signal (computeGoalHealth) PLUS the
// SEPARATE dependency signal (computeLaggingFoundation), resolved to subgoal
// titles. The two are kept as distinct fields and never blended — the card shows
// the pace badge and, independently, a one-line "foundation lagging" note. Adding
// the second signal as its own field (not a new status) is what keeps the pace
// score a single, explainable contributor.
export interface LaggingFoundationNote {
  foundationTitle: string
  dependentTitle: string
}
export type GoalHealthView = GoalHealth & {
  laggingFoundation: LaggingFoundationNote | null
  // Phase 9: a concrete "delayed, and by how much" read — the projected finish
  // date at the current pace and the days it overshoots the target. A SEPARATE
  // field from the pace status, never blended. `deadlineHardness` (from the goal's
  // intake context) lets the card phrase a hard deadline as "must speed up" and
  // never as "move the date".
  projection: GoalProjection
  deadlineHardness: DeadlineHardness | null
  // The SEPARATE reliability signal (engine/health/computeReliability) — "how
  // trustworthy have my plans been over time?" Never blended into the pace score/
  // status: a slip (reschedule / late finish / open miss) dents this durably, and it
  // recovers with recent consistency, whereas pace fully heals the moment completion
  // catches up. The card shows both, each on its own line.
  reliability: Reliability
  // The blended top-line (engine/health/computeRisk) — Low/Med/High "chance of
  // missing this goal", folding pace + reliability + projection. Unlike the signals
  // above it is deliberately combined, but stays explainable by its inputs.
  risk: Risk
  // Plain-language interpretation of the signals (engine/health/computeGoalInsights),
  // ranked; the card shows the top line. Empty when there's nothing to say.
  insights: GoalInsight[]
}

// Outcome of applyScopeCut (Phase 10) — how many approved suggestions took effect,
// split by kind, plus the free-text targets that couldn't be matched to a track or
// phase (surfaced so the user knows what to handle by hand). `compressAdvised` counts
// "do less" suggestions: those are advisory only (there is no safe automatic way to
// "do less"), so the UI prompts the user to act on them rather than auto-trimming.
export interface ScopeCutApplyResult {
  deferred: number
  cut: number
  compressAdvised: number
  unmatched: string[]
}

// Plain-language statement of how far a goal is projected to miss its deadline — the
// `behindSummary` the scope-cut prompt frames its ask around, derived from the pure
// projection. Falls back to a generic line when the pace isn't projectable yet (the
// nudge only fires when daysBehind > 0, so this branch is a belt-and-braces default).
function describeBehind(
  projection: GoalProjection,
  targetDate: string,
): string {
  if (projection.daysBehind <= 0 || projection.projectedDate === null) {
    return 'At the current pace, this goal is at risk of missing its hard deadline.'
  }
  const span =
    projection.daysBehind < 10
      ? `${projection.daysBehind} day${projection.daysBehind === 1 ? '' : 's'}`
      : `~${Math.round(projection.daysBehind / 7)} week${Math.round(projection.daysBehind / 7) === 1 ? '' : 's'}`
  return `At the current pace, projected to finish ${projection.projectedDate} — about ${span} after the ${targetDate} deadline.`
}

// ── Roadmap view-model (Phase 4) ─────────────────────────────────────────────
// The dependency-ordered "stations" for ONE goal: each subgoal joined to its
// resolved supporters / supported subgoals (so the UI has titles, not bare ids)
// and its active-support count. The pure engine (buildRoadmap) produces the
// ordering and graph facts over ids; the store joins those ids back to Subgoal
// objects here, keeping the roadmap UI dumb — exactly how WeeklyReview's
// completed-by-goal grouping is assembled on top of its engine result.
export interface RoadmapStation {
  subgoal: Subgoal
  // How many still-active subgoals this one supports ("Supports N active subgoals").
  activeSupportCount: number
  // The subgoals that strengthen this one (resolved from the engine's ids).
  supportedBy: Subgoal[]
  // The subgoals this one strengthens (resolved from the engine's ids).
  supports: Subgoal[]
}
export interface RoadmapView {
  goalId: ID
  stations: RoadmapStation[]
  // A support cycle made a complete ordering impossible; the UI shows a calm note.
  cyclic: boolean
}

// ── Life-map view-model (the dashboard "living map") ─────────────────────────
// The whole life as ONE map: every goal is a CITY, every subgoal a TOWN,
// positioned by the pure layout engine (computeLifeMapLayout) and joined here to
// live titles, progress and state. Roads are soft subgoal dependencies (kept
// even across goals — the interconnection is the point); membership links tie a
// town to its city. Unlike currentRoadmap (one goal), this is the single
// cross-goal map the dashboard shows; like it, it's a read-only cached slot the
// store assembles from engine facts + repository data.
export type LifeMapNodeState = 'done' | 'active' | 'here' | 'todo'
export interface LifeMapNode {
  id: ID
  kind: 'city' | 'town'
  goalId: ID
  x: number
  y: number
  label: string
  sublabel?: string
  // Raw target date (ISO), kept alongside the formatted sublabel so the Upcoming
  // panel can sort/filter by it. Undefined when the goal/subgoal has no deadline.
  date?: string
  state: LifeMapNodeState
  percent: number
}
export interface LifeMapLink {
  id: string
  source: ID
  target: ID
  kind: 'dep' | 'member'
  // A "paved" road: its source town is complete. Drives the solid-vs-dashed look.
  done: boolean
}
export interface LifeMapView {
  nodes: LifeMapNode[]
  links: LifeMapLink[]
  width: number
  height: number
}

// A goal paired with all its tasks — the shared shape gatherGoalsWithTasks
// produces and the two cross-goal refreshers (progress/health and top-priority)
// both consume. Named so loadDashboard can fetch it once and pass it to both.
type GoalWithTasks = { goal: Goal; tasks: Task[] }

// ── AI personalization context loaders (Phase 9) ─────────────────────────────
// Map the persisted context (UserContext / GoalContext / profile) into the
// AI-facing shapes the prompt builders consume, resolving stored enum values to
// human labels. Kept here (store side) because they read the DB via repositories;
// the engine stays pure and just receives plain strings. Both return undefined
// when nothing is captured, so a prompt simply omits that context block.
const labelOf = <T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T | undefined,
): string | undefined =>
  value === undefined
    ? undefined
    : (options.find((o) => o.value === value)?.label ?? value)

const loadAIUserContext = async (): Promise<AIUserContext | undefined> => {
  const [ctx, profile] = await Promise.all([getUserContext(), getProfile()])
  if (!ctx && !profile) return undefined
  const result: AIUserContext = {}
  if (ctx) {
    result.situation = labelOf(LIFE_SITUATION_OPTIONS, ctx.situation)
    result.situationDetail = ctx.situationDetail
    result.lightDays = ctx.lightDays
      .map((i) => WEEKDAY_LABELS[i])
      .filter((l): l is string => Boolean(l))
    result.bestTimeOfDay = labelOf(TIME_OF_DAY_OPTIONS, ctx.bestTimeOfDay)
    result.workRhythm = labelOf(WORK_RHYTHM_OPTIONS, ctx.workRhythm)
    result.about = ctx.about
  }
  if (profile) result.availableHoursPerDay = profile.availableHoursPerDay
  return result
}

const loadAIGoalContext = async (
  goalId: ID,
): Promise<AIGoalContext | undefined> => {
  const ctx = await getGoalContext(goalId)
  if (!ctx) return undefined
  return {
    successDefinition: ctx.successDefinition,
    startingLevel: ctx.startingLevel,
    priorExperience: ctx.priorExperience,
    deadlineHardness: ctx.deadlineHardness,
    motivation: ctx.motivation,
    learnings: ctx.learnings,
  }
}

interface GoalState {
  // --- goal list ---
  goals: Goal[]
  // Task-completion momentum per goal, keyed by goalId, computed by the engine
  // (never inline). Feeds the calm progress ring on each GoalCard. Refreshed
  // whenever the goal list is (re)loaded or a goal is added/edited/removed.
  goalProgress: Record<ID, GoalProgress>
  // Per-goal health, keyed by goalId, computed by the engine in the SAME pass as
  // goalProgress so a card's progress and health never disagree. Two SEPARATE,
  // each-explainable signals (never blended): pace vs. deadline (status/score)
  // and the dependency "lagging foundation" note. GoalCard reads its own entry;
  // 'no_tasks' goals render no pace badge, and laggingFoundation is null unless
  // a foundation is trailing the work that leans on it.
  goalHealth: Record<ID, GoalHealthView>
  isLoadingGoals: boolean
  loadGoals: () => Promise<void>
  addGoal: (input: NewGoalInput) => Promise<Goal>
  editGoal: (id: ID, changes: GoalChanges) => Promise<void>
  removeGoal: (id: ID) => Promise<void>

  // --- dashboard (today + overdue + upcoming) ---
  // Three scheduled-task windows the dashboard shows side by side. All keyed off
  // the local calendar day (scheduledDate is date-only YYYY-MM-DD):
  //   overdueTasks  : scheduled before today AND not completed (still owed)
  //   todaysTasks   : scheduled for today
  //   thisWeekTasks : scheduled tomorrow .. 7 days out (rolling upcoming window)
  overdueTasks: Task[]
  todaysTasks: Task[]
  thisWeekTasks: Task[]
  // "Why it matters" lineage for every task shown across the three windows,
  // keyed by subgoalId (lineage is shared by all tasks under a subgoal). The
  // dashboard reads it to render each task's "Subgoal · Goal" context.
  // Refreshed in the same pass as the windows so a row and its lineage agree.
  taskLineages: Record<ID, TaskLineage>
  // Effort-based momentum for today's scheduled tasks ("how much work today",
  // not "how many tasks"): completed/total are EFFORT UNITS, not counts. Computed
  // by the engine (never inline) over todaysTasks; MomentumBar reads it.
  todayEffort: Completion
  // A small focus list: the top-scored INCOMPLETE tasks across ALL goals, ranked
  // by the priority engine — independent of whether they are scheduled for today.
  // This is a different lens from todaysTasks (which is "what I planned today").
  // Refreshed on dashboard load and after any task mutation.
  topPriorityTasks: Task[]
  // Active-support count per subgoalId (how many not-yet-complete subgoals it
  // supports), computed from the soft dependency graph. Feeds two things in one
  // pass: the dependencyBoost applied inside the priority ranking above, AND the
  // "Supports N active subgoals" explanation the Priority panel shows for a
  // boosted task. Keyed by subgoalId because the count is a property of the
  // subgoal, shared by all its tasks.
  subgoalSupportCounts: Record<ID, number>
  isLoadingDashboard: boolean
  loadDashboard: () => Promise<void>

  // --- selection ---
  selectedGoalId: ID | null
  setSelectedGoalId: (id: ID | null) => void
  clearSelectedGoal: () => void

  // --- goal tree (consumed by the Goal Detail View via useGoalTree) ---
  currentGoalTree: GoalTree | null
  // Per-subgoal task-completion momentum for the on-screen tree, keyed by
  // subgoalId, computed by the engine from the tree the store already holds.
  // Each SubgoalSection reads its own entry to draw a progress ring. Rebuilt
  // every time currentGoalTree is (re)assembled so the two never disagree.
  subgoalProgress: Record<ID, SubgoalProgress>
  // Per-phase (milestone) end-of-phase check-in recap for the on-screen tree, keyed
  // by milestoneId, computed by the engine from the same tree in the same pass as
  // subgoalProgress. `phaseComplete` flags a phase whose work is finished (the
  // data-driven "ready to check in" signal); the recap fields feed the check-in
  // screen (Phase 10). Assembled here in lockstep with the tree.
  phaseCheckIns: Record<ID, PhaseCheckInData>
  // Whole-goal task-completion momentum for the on-screen tree (every task
  // across all its subgoals), shown in the Goal Detail header. Derived from the
  // same tree, in the same pass, so it never drifts from the per-subgoal rings.
  currentGoalProgress: GoalProgress
  // Phase 10 — the OPEN goal's finish projection + deadline hardness, computed from
  // the tree + goal context on load (and refreshed after task mutations). These gate
  // the hard-deadline scope-cut nudge CHEAPLY (no AI): it shows only when
  // projection.daysBehind > 0 AND deadlineHardness === 'hard' — the date can't move,
  // so the plan itself must shrink. Null until a goal is open.
  currentGoalProjection: GoalProjection | null
  currentGoalDeadlineHardness: DeadlineHardness | null
  // Stage 3 — the open goal's dominant slip PATTERN (why its tasks keep slipping),
  // computed from its reschedule reason log over a recent window. null when there's
  // no clear pattern (too few reasoned slips, or none dominates). Loaded with the
  // tree and refreshed after a reschedule records new reasons.
  currentGoalSlipInsight: SlipPattern | null
  isLoadingTree: boolean
  loadGoalTree: (id: ID) => Promise<void>

  addSubgoal: (input: NewSubgoalInput) => Promise<Subgoal>
  editSubgoal: (id: ID, changes: SubgoalChanges) => Promise<void>
  removeSubgoal: (id: ID) => Promise<void>

  addMilestone: (input: NewMilestoneInput) => Promise<Milestone>
  editMilestone: (id: ID, changes: MilestoneChanges) => Promise<void>
  removeMilestone: (id: ID) => Promise<void>

  addTask: (input: NewTaskInput) => Promise<Task>
  editTask: (id: ID, changes: TaskChanges) => Promise<void>
  removeTask: (id: ID) => Promise<void>
  toggleTaskComplete: (task: Task) => Promise<void>
  // Sweep near-identical task titles across the whole goal and delete the later
  // copies (provider-independent; see engine/planning/dedupeTasks). Runs at the end
  // of generateFullRoadmap and on demand from Goal Detail. Returns how many were removed.
  dedupeGoalTasks: (goalId: ID) => Promise<number>

  // --- weekly review (its own /reviews route; loaded by that page, NOT bundled
  // into the dashboard load) ---
  weeklyReview: WeeklyReview | null
  isLoadingReview: boolean
  loadWeeklyReview: () => Promise<void>

  // --- roadmap (read-only; one goal at a time; consumed via useRoadmap) ---
  // The dependency-ordered subgoals for the goal the Roadmap page is showing.
  // Read-only by design: creating/removing edges stays on the Goal Detail panel
  // (roadmap = comprehension, detail = editing). Single-slot like currentGoalTree.
  currentRoadmap: RoadmapView | null
  isLoadingRoadmap: boolean
  loadRoadmap: (goalId: ID) => Promise<void>

  // --- life map (the dashboard's cross-goal "living map"; via useLifeMap) ---
  // Single cached slot for the whole-life map (all goals at once). Read-only;
  // rebuilt on dashboard mount. Editing still happens on Goal Detail.
  lifeMap: LifeMapView | null
  isLoadingLifeMap: boolean
  loadLifeMap: () => Promise<void>

  // --- AI assistance (Phase 5) ---
  // Ask the AI provider for milestone suggestions for one subgoal. READ-ONLY: it
  // returns suggestions for the UI to present (accept/edit/reject); it writes
  // nothing. Accepting a suggestion goes through the EXISTING addMilestone path
  // with aiSuggested: true, so there is no separate AI write path. The store
  // talks only to the AIProvider interface (services/ai) and the pure prompt/
  // parser (engine/ai) — it never knows which model, or that a network exists.
  // Unlike the best-effort refreshers, this is user-triggered and awaited, so a
  // transport failure PROPAGATES to the caller (the modal shows it inline, like a
  // failed save) rather than the calm background banner. A malformed response is
  // not a failure: the parser yields [] and the user just adds milestones manually.
  suggestMilestones: (
    context: MilestoneSuggestionContext,
  ) => Promise<MilestoneSuggestion[]>
  // The sibling for goals: suggest the major subgoals a goal breaks into. Same
  // read-only contract — returns suggestions for the UI to accept/edit/reject;
  // accepted ones go through the existing addSubgoal path. Same provider seam.
  suggestSubgoals: (
    context: SubgoalSuggestionContext,
  ) => Promise<SubgoalSuggestion[]>
  // For a consistency subgoal: generate a short, dated daily practice plan. The
  // model supplies the ordered sessions (what); the pure scheduler dates them
  // (when). READ-ONLY — returns the scheduled tasks for the UI to preview/accept;
  // accepted ones go through the existing addTask path with scheduledDate +
  // estimatedMinutes. Same provider seam, same propagate-on-failure contract.
  generateDailyPlan: (
    request: DailyPlanRequest,
  ) => Promise<ScheduledDailyTask[]>

  // Phase 10 — the goal's stored Strategy Brief for the Detail View. Single slot,
  // one goal at a time (like currentGoalTree / currentRoadmap): loadStrategyBrief
  // blanks then reads the persisted brief; generateStrategyBrief refreshes it on
  // success. null means "no brief generated yet for this goal".
  currentStrategyBrief: StrategyBrief | null
  isLoadingStrategyBrief: boolean
  loadStrategyBrief: (goalId: ID) => Promise<void>

  // Phase 10 — the Direction layer. Generate (and persist) a goal's Strategy
  // Brief: the coach's read on the real target + what matters most, produced
  // BEFORE any task breakdown from the person + goal context. READ-shaped like the
  // other AI actions (build prompt -> provider -> pure parser), but this one WRITES
  // its result to the goal's context row (saveStrategyBrief) because the brief is
  // durable — every later generation reads it. Propagate-on-failure (a provider
  // error bubbles to the caller, like suggestMilestones); a malformed reply parses
  // to null, in which case nothing is written and null is returned (the existing
  // brief, if any, is left untouched). `intake` (Stage-0 answers) is optional: when
  // provided the brief is built from a real conversation; when omitted it falls
  // back to the standing user/goal context alone.
  generateStrategyBrief: (
    goalId: ID,
    intake?: IntakeExchange[],
  ) => Promise<StrategyBrief | null>

  // Phase 10 — the phase check-in "anything changed?" ripple (beat 2). Fold the
  // user's free-text note back into the DIRECTION by regenerating the goal's Strategy
  // Brief with the note as a light re-intake exchange, so the refreshed brief — which
  // every later generation reads, including the next phase planned in beat 3 —
  // accounts for what changed. Thin wrapper over generateStrategyBrief (same provider
  // seam, same propagate-on-failure contract); an empty/whitespace note is a no-op
  // that returns null without calling the provider.
  applyCheckInChange: (goalId: ID, note: string) => Promise<StrategyBrief | null>

  // Phase 10, Stage 2 — STRUCTURE. Ask the provider to scope the goal itself into
  // tracks (subgoals) each with ordered phases (milestones), reading the stored
  // Strategy Brief, and write the accepted skeleton through the existing
  // addSubgoal / addMilestone paths — UNDATED (no tasks; those are Stage 3). Only
  // runs when the goal has NO subgoals yet (structure defines the initial arc); a
  // goal that already has subgoals is left untouched and this returns []. Returns
  // the tracks written (empty on a no-op or a malformed reply). Propagates errors
  // like generateFullRoadmap (the caller wraps it).
  generateStructure: (goalId: ID) => Promise<PlannedTrack[]>

  // REVIEW-before-accept split of the structure step. generateStructureProposal is
  // the READ-ONLY half — it produces the tracks/phases and returns them WITHOUT
  // writing, so the UI can let the user edit/trim them; applyStructure writes an
  // approved set through the existing addSubgoal / addMilestone paths (skipping blank
  // titles, guarded so it never appends onto an existing skeleton). The direct
  // generateStructure above is now just proposal→apply.
  generateStructureProposal: (goalId: ID) => Promise<PlannedTrack[]>
  applyStructure: (goalId: ID, tracks: PlannedTrack[]) => Promise<void>

  // Phase 10, Stage 3 — SCHEDULE one phase. Expand a single milestone (a phase of
  // a structured track) into ~2 weeks of dated tasks written UNDER that milestone,
  // reusing the daily-plan pipeline with the milestone as the focus. Self-derives
  // the subgoal + goal + Strategy Brief from the milestoneId. Re-running EXTENDS the
  // phase (window resumes after its last scheduled task); returns the number of
  // tasks created (0 when the phase already reaches the deadline). Propagates errors.
  generatePhaseTasks: (milestoneId: ID) => Promise<number>

  // REVIEW-before-accept split of the phase-schedule step. generatePhaseTasksProposal
  // is the READ-ONLY half — it runs the full daily-plan pipeline and RETURNS the dated
  // tasks without writing; applyPhaseTasks writes an approved (possibly trimmed) set
  // under the milestone and returns how many landed. The direct generatePhaseTasks
  // above is now just proposal→apply.
  generatePhaseTasksProposal: (milestoneId: ID) => Promise<ScheduledDailyTask[]>
  applyPhaseTasks: (
    milestoneId: ID,
    tasks: ScheduledDailyTask[],
  ) => Promise<number>

  // Phase 10, Stage 0 — the intake conversation's questions. Ask the provider for
  // the few highest-leverage, goal-specific questions to put to the user; their
  // answers feed generateStrategyBrief. READ-ONLY (no writes); propagate-on-failure
  // like the suggest* actions; a malformed reply parses to [] (the user can still
  // generate a brief from context alone).
  generateIntakeQuestions: (goalId: ID) => Promise<string[]>

  // Autonomous roadmap generation: from a goal, produce the WHOLE plan in one
  // action — subgoals (if the goal has none yet), then for each subgoal its
  // milestones and a dated run of daily tasks. Orchestrates the three existing AI
  // actions + the existing write paths; writes everything directly (no per-item
  // accept step) so "type a goal, get a full actionable roadmap" is one click.
  // Skips any level that already has data, so it can also fill in an existing goal.
  generateFullRoadmap: (goalId: ID) => Promise<void>

  // Auto top-up of the rolling task window: for each consistency subgoal whose
  // scheduled tasks are running low (fewer than DAILY_PLAN_LOW_WINDOW days still
  // ahead of today), generate and write the next batch — so a long-running goal's
  // daily plan extends itself instead of quietly running dry. Cheap when nothing
  // is low (it only reads dates); fires AI only for subgoals that need it. Meant
  // to be called best-effort on goal load. Subgoals never yet planned are left
  // alone (explicit generation seeds them first).
  topUpRoadmap: (goalId: ID) => Promise<void>

  // Reschedule-on-miss (Phase 10 scheduler). Pull this goal's overdue (missed,
  // incomplete, past-dated) tasks forward onto upcoming working days at the user's
  // daily capacity, so missed work returns to the calendar instead of piling up in
  // the past. Branches on the goal's deadline hardness: a HARD deadline caps the
  // window at the target (overflow compresses onto the last day, never slips past);
  // a soft deadline spreads freely. Returns how many tasks were moved (0 = none
  // overdue). Refreshes the tree/dashboard/cross-goal caches like a task mutation.
  rescheduleOverdueForGoal: (goalId: ID, reason: SlipReason) => Promise<number>

  // Cross-goal reschedule-on-miss (Phase 10) — the DASHBOARD counterpart to
  // rescheduleOverdueForGoal. Pull EVERY goal's overdue (missed, incomplete,
  // past-dated) tasks forward onto upcoming working days under ONE shared daily
  // budget, so a day's recovered work across ALL goals still respects the user's real
  // capacity (the same shared-budget guarantee packSessionsIntoDays gives across
  // subgoals). Oldest first. Spreads UNBOUNDED — the dashboard action is capacity-
  // first; a HARD deadline that must not slip stays the job of that goal's own
  // reschedule (rescheduleOverdueForGoal, which compresses onto the date). Returns how
  // many tasks moved (0 = none overdue). Refreshes the task-date caches.
  rescheduleAllOverdue: (reason: SlipReason) => Promise<number>

  // Hard-deadline scope-cut escalation (Phase 10) — the counterpart to
  // rescheduleOverdueForGoal. A SOFT miss reschedules mechanically (above); a HARD
  // deadline can't move, so when the goal is projected to miss it, rescheduling
  // can't help and the coach must propose TRIMMING SCOPE for the user to approve.
  // generateScopeCutProposal assembles the goal + brief + digest + a plain-language
  // `behindSummary` (from computeGoalProjection) and asks the provider for a
  // proposal. READ-ONLY — it writes nothing; the user reviews, then applyScopeCut
  // enacts only the approved suggestions. Returns null on a gone goal or a malformed
  // reply. Propagates provider errors (the caller wraps them).
  generateScopeCutProposal: (goalId: ID) => Promise<ScopeCutProposal | null>

  // Enact the user-approved scope-cut suggestions. Each `target` is matched to a
  // track (subgoal) or phase (milestone) by title (resolveScopeCutTarget); then:
  // 'cut' removes it (a phase's tasks are deleted first, so none are orphaned);
  // 'defer' unschedules its incomplete tasks so they drop into the undated "Later"
  // backlog (off the dated plan, but kept and reversible); 'compress' ("do less")
  // has no safe automatic form, so it is only ADVISED (counted, never auto-applied).
  // Unmatched targets are returned so the UI can tell the user what to handle by
  // hand. Refreshes the tree/dashboard/cross-goal caches like any task mutation.
  applyScopeCut: (
    goalId: ID,
    suggestions: ScopeCutSuggestion[],
  ) => Promise<ScopeCutApplyResult>

  // --- cross-cutting error state ---
  // A single, calm, NON-FATAL message set when a background load or post-write
  // refresh fails (e.g. an IndexedDB read rejects). Null when all is well. The
  // app shell shows a dismissible banner; clearError dismisses it. WRITES still
  // throw to their caller (forms handle those inline) — this covers the read-back
  // path the user did not directly trigger and could not otherwise see fail.
  error: string | null
  clearError: () => void
}

export const useGoalStore = create<GoalState>()((set, get) => {
  // Re-fetch the on-screen goal's tree in place (no loading flash). Called after
  // any subgoal/milestone/task mutation so the Detail View reflects it. Reads
  // the goal id from the currently-loaded tree, since every such mutation
  // happens while that goal is on screen.
  // Derive each subgoal's task-completion progress from an assembled tree. A
  // subgoal's tasks are its loose tasks plus every task across its milestones —
  // the tree already holds them, so this needs no extra DB read. The engine does
  // the math; this only gathers the inputs and keys the result by subgoalId.
  const subgoalProgressFromTree = (
    tree: GoalTree | null,
  ): Record<ID, SubgoalProgress> => {
    const result: Record<ID, SubgoalProgress> = {}
    if (!tree) return result
    for (const st of tree.subgoals) {
      result[st.subgoal.id] = computeSubgoalProgress(tasksOfSubgoal(st))
    }
    return result
  }

  // Derive each PHASE's (milestone's) check-in recap from the same assembled tree,
  // keyed by milestoneId (Phase = Milestone). The engine reads a MilestoneTree (it
  // needs the milestone's status/title + its tasks). Rebuilt in lockstep with
  // subgoalProgress; a goal with no milestones simply yields an empty map.
  const phaseCheckInsFromTree = (
    tree: GoalTree | null,
  ): Record<ID, PhaseCheckInData> => {
    const result: Record<ID, PhaseCheckInData> = {}
    if (!tree) return result
    for (const st of tree.subgoals) {
      for (const mt of st.milestones) {
        result[mt.milestone.id] = computePhaseCheckIn(mt)
      }
    }
    return result
  }

  // The tasks belonging to one subgoal: its loose tasks plus every task across
  // its milestones. Shared by the per-subgoal and whole-goal progress derivations
  // so they count exactly the same set.
  const tasksOfSubgoal = (st: GoalTree['subgoals'][number]): Task[] => [
    ...st.looseTasks,
    ...st.milestones.flatMap((m) => m.tasks),
  ]

  // Whole-goal progress = every task across every subgoal, computed by the
  // engine. 0/0 when the tree is absent so the header reads as nothing scheduled
  // rather than stale.
  const goalProgressFromTree = (tree: GoalTree | null): GoalProgress =>
    computeGoalProgress(tree ? tree.subgoals.flatMap(tasksOfSubgoal) : [])

  // The bounded roadmap DIGEST for a goal, assembled from its tree — the Phase 10
  // snapshot fed into every rolling generation so a plan stays coherent with reality
  // without ever sending task history. Time is read here (store side), never in the
  // engine. Undefined when the goal is gone.
  const roadmapDigestFor = async (
    goalId: ID,
  ): Promise<RoadmapDigest | undefined> => {
    const tree = await getGoalTree(goalId)
    return tree ? computeRoadmapDigest(tree, new Date()) : undefined
  }

  // The goal's dominant slip pattern from its reschedule reason log (Stage 3). Time
  // is read here (store side); the engine stays pure. null when no clear pattern.
  const slipInsightFor = async (goalId: ID): Promise<SlipPattern | null> => {
    const events = await getSlipEventsByGoalId(goalId)
    return computeSlipInsights(events, new Date())
  }

  const refreshCurrentTree = async () => {
    const goalId = get().currentGoalTree?.goal.id
    if (goalId) {
      const tree = (await getGoalTree(goalId)) ?? null
      const progress = goalProgressFromTree(tree)
      set({
        currentGoalTree: tree,
        subgoalProgress: subgoalProgressFromTree(tree),
        phaseCheckIns: phaseCheckInsFromTree(tree),
        currentGoalProgress: progress,
        // Keep the finish projection in step with the tree, so applying a scope cut
        // (which trims/defers tasks) re-clears the nudge once the goal is back on
        // pace. Hardness is intake-derived and unchanged by task mutations, so it is
        // left as loaded (only loadGoalTree refreshes it).
        currentGoalProjection: tree
          ? computeGoalProjection(
              tree.goal.createdAt,
              tree.goal.targetDate,
              progress,
              new Date(),
            )
          : null,
      })
    }
  }

  // Re-fetch all three dashboard windows in place (no loading-flag flip -> no
  // flicker), mirroring refreshCurrentTree. Called after any task mutation so the
  // dashboard reflects it without a remount. Every bound is a date-only LOCAL day
  // (scheduledDate is stored date-only YYYY-MM-DD); the three reads run in
  // parallel and today's momentum is recomputed via the engine in the same pass
  // so the list and its progress never drift.
  const refreshDashboard = async () => {
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const tomorrow = format(addDays(now, 1), 'yyyy-MM-dd')
    const weekOut = format(addDays(now, 7), 'yyyy-MM-dd')

    const [overdueRaw, todaysTasks, thisWeekTasks] = await Promise.all([
      getTasksScheduledBefore(today),
      getTasksScheduledBetween(today, today),
      getTasksScheduledBetween(tomorrow, weekOut),
    ])

    // Overdue means still owed: drop past tasks that are already done. (The repo
    // returns raw rows; status filtering is the caller's job, per convention.)
    const overdueTasks = overdueRaw.filter((t) => t.status !== 'completed')

    // Resolve each shown task's subgoal -> goal lineage in one deduped pass. This
    // is a second round-trip (it needs the windows' subgoalIds first); fine at
    // this scale, and it keeps lineage in sync with the very tasks displayed.
    const taskLineages = await getTaskLineages([
      ...overdueTasks,
      ...todaysTasks,
      ...thisWeekTasks,
    ])

    set({
      overdueTasks,
      todaysTasks,
      thisWeekTasks,
      taskLineages,
      todayEffort: computeEffortMomentum(todaysTasks),
    })
  }

  // Gather every goal paired with its tasks, composing the existing getters
  // (getAllGoals + getTasksByGoalId). Single source for the two consumers below
  // (per-goal progress AND the flat priority list), so the composition lives in
  // one place. NOTE: this deliberately reaches tasks only via live goals, so a
  // task orphaned by a non-cascading goal/subgoal delete is excluded — same as
  // before. (Weekly Review intentionally uses getAllTasks() for ALL rows; this
  // is a different, goal-scoped view and must stay so.)
  const gatherGoalsWithTasks = async (): Promise<GoalWithTasks[]> => {
    const goals = await getAllGoals()
    return Promise.all(
      goals.map(async (goal) => ({
        goal,
        tasks: await getTasksByGoalId(goal.id),
      })),
    )
  }

  // Reload the goal list and recompute each goal's task-completion progress in
  // one pass, then set both together so a card and its ring never disagree. The
  // per-goal task fetch + engine math is the only place goalProgress is built;
  // every goal-list mutation routes through here. Cheap at this scale (tiny
  // tables); revisit if the goal/task counts ever grow large.
  const refreshGoalsAndProgress = async (
    // loadDashboard fetches these two shared inputs once and passes them in, so
    // the gather + graph read don't run twice per dashboard load. Called with no
    // args everywhere else, where it fetches its own.
    prefetchedGoalsWithTasks?: GoalWithTasks[],
    prefetchedSubgoalEdges?: Dependency[],
  ) => {
    // Goals + their tasks (shared helper) and the subgoal dependency graph, in
    // parallel. The graph feeds the SEPARATE "lagging foundation" health signal.
    const [goalsWithTasks, subgoalEdges] = await Promise.all([
      prefetchedGoalsWithTasks ?? gatherGoalsWithTasks(),
      prefetchedSubgoalEdges ?? getDependenciesByType('subgoal'),
    ])
    // This goal's subgoals — including task-less ones, which still matter as
    // foundations (a 0%-done foundation is exactly what can lag) — fetched per
    // goal in parallel. Used to compute per-subgoal completion and to resolve the
    // lagging-foundation note's titles. Cheap at this scale; same per-goal fan-out
    // pattern as gatherGoalsWithTasks.
    // Per-goal subgoals (for the lagging-foundation signal) AND per-goal intake
    // context (for the deadline-hardness framing on the projection), fetched in
    // parallel. Both are cheap per-goal fan-outs at this scale.
    const [subgoalsPerGoal, goalContexts] = await Promise.all([
      Promise.all(goalsWithTasks.map((g) => getSubgoalsByGoalId(g.goal.id))),
      Promise.all(goalsWithTasks.map((g) => getGoalContext(g.goal.id))),
    ])

    // One `now` for the whole list so every goal's health is judged against the
    // same moment. Completion is computed once per goal and reused for health.
    const now = new Date()
    const entries = goalsWithTasks.map((g, i) => {
      const progress = computeGoalProgress(g.tasks)
      const pace = computeGoalHealth(
        g.goal.createdAt,
        g.goal.targetDate,
        progress,
        now,
      )

      // Per-subgoal completion% for this goal (task-less subgoals -> 0%), keyed by
      // subgoalId. Tasks are already in hand from gatherGoalsWithTasks, so this is
      // pure in-memory grouping — no extra DB read. The pure engine then decides
      // whether any foundation is trailing the work that depends on it.
      const subgoals = subgoalsPerGoal[i]
      const completionBySubgoalId = new Map<ID, number>()
      for (const s of subgoals) {
        const subgoalTasks = g.tasks.filter((t) => t.subgoalId === s.id)
        completionBySubgoalId.set(
          s.id,
          computeSubgoalProgress(subgoalTasks).percent,
        )
      }
      const lagging = computeLaggingFoundation(subgoalEdges, completionBySubgoalId)
      const titleOf = (id: ID): string =>
        subgoals.find((s) => s.id === id)?.title ?? 'a subgoal'
      const laggingFoundation: LaggingFoundationNote | null = lagging
        ? {
            foundationTitle: titleOf(lagging.foundationId),
            dependentTitle: titleOf(lagging.dependentId),
          }
        : null

      // Phase 9: concrete finish projection + the goal's deadline hardness.
      const projection = computeGoalProjection(
        g.goal.createdAt,
        g.goal.targetDate,
        progress,
        now,
      )
      const deadlineHardness = goalContexts[i]?.deadlineHardness ?? null

      // Reliability reads the same tasks already in hand (no extra query): their
      // durable slip history (rescheduleCount) + completed-late vs on-time.
      const reliability = computeReliability(g.tasks, now)

      // Risk blends the signals into one Low/Med/High; insights narrate them.
      const risk = computeRisk({
        paceStatus: pace.status,
        reliabilityStatus: reliability.status,
        daysBehind: projection.daysBehind,
        deadlineHardness,
      })
      const insights = computeGoalInsights({
        progressPercent: progress.percent,
        paceStatus: pace.status,
        reliability,
        riskLevel: risk.level,
      })

      const health: GoalHealthView = {
        ...pace,
        laggingFoundation,
        projection,
        deadlineHardness,
        reliability,
        risk,
        insights,
      }
      return { goal: g.goal, progress, health }
    })
    set({
      goals: entries.map((e) => e.goal),
      goalProgress: Object.fromEntries(
        entries.map((e): [ID, GoalProgress] => [e.goal.id, e.progress]),
      ),
      goalHealth: Object.fromEntries(
        entries.map((e): [ID, GoalHealthView] => [e.goal.id, e.health]),
      ),
    })
  }

  // Recompute the dashboard's top-priority focus list. It ranks EVERY incomplete
  // task across ALL goals, gathered via gatherGoalsWithTasks (goal-scoped, no new
  // repository query). rankTasks does the scoring/sorting/top-N; the store never
  // ranks inline. `new Date()` is read once here so the whole list is scored
  // against a single consistent "now".
  //
  // The soft dependency signal feeds in here too: the subgoal graph plus the set
  // of completed subgoals yield an active-support count per subgoal (engine), which
  // both nudges the ranking (dependencyBoost inside rankTasks) and is cached for
  // the Priority panel's "Supports N active subgoals" explanation. All three reads
  // run in parallel.
  const refreshTopPriority = async (
    // Same shared-input optimisation as refreshGoalsAndProgress (see there).
    prefetchedGoalsWithTasks?: GoalWithTasks[],
    prefetchedSubgoalEdges?: Dependency[],
  ) => {
    const [goalsWithTasks, subgoalEdges, completedSubgoals] = await Promise.all([
      prefetchedGoalsWithTasks ?? gatherGoalsWithTasks(),
      prefetchedSubgoalEdges ?? getDependenciesByType('subgoal'),
      getSubgoalsByStatus('completed'),
    ])
    // Drop the undated "Later" backlog before ranking: this list feeds the
    // dashboard's Today's Focus fallback, and undated phase backlog must inform
    // (in the goal tree) without NAGGING daily (Phase 10). Only dated/near-term
    // work is focus-worthy now; rankTasks then drops completed as usual.
    const allTasks = partitionScheduledAndBacklog(
      goalsWithTasks.flatMap((g) => g.tasks),
    ).scheduled
    const completedSubgoalIds = new Set(completedSubgoals.map((s) => s.id))
    const subgoalSupportCounts = computeActiveSupportCounts(
      subgoalEdges,
      completedSubgoalIds,
    )
    set({
      topPriorityTasks: rankTasks(
        allTasks,
        new Date(),
        DEFAULT_TOP_N,
        subgoalSupportCounts,
      ),
      subgoalSupportCounts,
    })
  }

  // Refresh BOTH cross-goal caches — the top-priority focus list and the
  // goals-list progress/health — from a SINGLE shared fetch. The goals-with-tasks
  // gather and the subgoal-graph read happen once here and feed both refreshers,
  // rather than each fetching its own. Used wherever both must update together:
  // the dashboard load and every task mutation (a completed/added/removed task
  // changes priority AND each goal's progress/health, so they must move in step).
  const refreshCrossGoal = async (): Promise<void> => {
    const [goalsWithTasks, subgoalEdges] = await Promise.all([
      gatherGoalsWithTasks(),
      getDependenciesByType('subgoal'),
    ])
    await Promise.all([
      refreshTopPriority(goalsWithTasks, subgoalEdges),
      refreshGoalsAndProgress(goalsWithTasks, subgoalEdges),
    ])
  }

  // Apply the milestone auto-completion rule after a task changes: a milestone
  // is completed when ALL its tasks are completed, and re-opens (-> active) when
  // one is un-done. Only writes on an actual transition, so a no-op toggle costs
  // nothing. Preserves any other status (e.g. a future Phase-3 'locked') unless
  // the tasks now demand 'completed'. completedAt is stamped/cleared to match.
  const reconcileMilestone = async (milestoneId: ID) => {
    const [milestone, tasks] = await Promise.all([
      getMilestoneById(milestoneId),
      getTasksByMilestoneId(milestoneId),
    ])
    if (!milestone) return

    const shouldComplete = isMilestoneComplete(tasks)
    const isComplete = milestone.status === 'completed'
    if (shouldComplete === isComplete) return // already in the right state

    await updateMilestone(
      milestone.id,
      shouldComplete
        ? { status: 'completed', completedAt: new Date().toISOString() }
        : { status: 'active', completedAt: undefined },
    )
  }

  // Next display position among a set of siblings: max(order)+1, which is
  // collision-proof even if the existing orders have gaps.
  const nextOrder = (orders: number[]): number =>
    orders.length === 0 ? 0 : Math.max(...orders) + 1

  // Run independent refreshers concurrently as BEST EFFORT. Three guarantees:
  //  1. One failing refresh never aborts the others (allSettled, not all) — so a
  //     single bad read can't leave MORE of the view stale than necessary.
  //  2. It never throws — these run AFTER a successful write, so a failed re-read
  //     must not make the mutation look like it failed (the write already landed).
  //     Previously a rejected refresh surfaced as an unhandled promise rejection.
  //  3. It resolves the error flag either way: any rejection raises the calm
  //     refresh message; a fully-successful pass clears a stale error.
  const settleRefreshes = async (
    refreshes: Promise<unknown>[],
  ): Promise<void> => {
    const results = await Promise.allSettled(refreshes)
    set({
      error: results.some((r) => r.status === 'rejected')
        ? REFRESH_ERROR_MESSAGE
        : null,
    })
  }

  return {
    // --- cross-cutting error state ---
    error: null,
    clearError: () => set({ error: null }),

    // --- goal list ---
    goals: [],
    goalProgress: {},
    goalHealth: {},
    isLoadingGoals: false,

    loadGoals: async () => {
      set({ isLoadingGoals: true })
      try {
        await refreshGoalsAndProgress()
        set({ error: null })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingGoals: false })
      }
    },

    addGoal: async (input) => {
      const goal = await createGoal(input)
      await settleRefreshes([refreshGoalsAndProgress()])
      return goal
    },

    editGoal: async (id, changes) => {
      await updateGoal(id, changes)
      // Refresh the list and, if this goal is open in the Detail View, its tree
      // too — concurrently and best-effort (the write already succeeded).
      const refreshes = [refreshGoalsAndProgress()]
      if (get().currentGoalTree?.goal.id === id) refreshes.push(refreshCurrentTree())
      await settleRefreshes(refreshes)
    },

    // deleteGoal cascades its subtree (subgoals/milestones/tasks) AND removes any
    // dependency edges referencing the deleted subgoals/tasks, atomically in the
    // repository transaction. Nothing extra to do here.
    removeGoal: async (id) => {
      await deleteGoal(id)
      // Phase 9: the goal's AI-intake context lives in a separate table, so the
      // goalRepository cascade can't reach it — remove it here so a goalContext
      // row never outlives the goal it describes. Idempotent (no row = no-op).
      await deleteGoalContext(id)
      // Stage 3: same for the goal's slip-event log (its own table, not cascaded).
      await deleteSlipEventsByGoalId(id)
      await settleRefreshes([refreshGoalsAndProgress()])
    },

    // --- dashboard (today + overdue + upcoming) ---
    overdueTasks: [],
    todaysTasks: [],
    thisWeekTasks: [],
    taskLineages: {},
    todayEffort: { completed: 0, total: 0, percent: 0 },
    topPriorityTasks: [],
    subgoalSupportCounts: {},
    isLoadingDashboard: false,

    // Initial load of the dashboard (flips the loading flag for the first paint).
    // Loads the scheduled-task windows, the cross-goal priority list, AND the
    // per-goal progress (for the Goal Progress snapshot) together. Each refresher
    // owns its own data source; refreshGoalsAndProgress is reused as-is so the
    // snapshot is populated on Dashboard mount, not only after a Goals-list visit.
    loadDashboard: async () => {
      set({ isLoadingDashboard: true })
      try {
        // Best-effort: the windows and the cross-goal caches are independent, so a
        // single failing read should not blank the whole dashboard. refreshCrossGoal
        // does the goals-list and priority refresh from one shared fetch.
        // settleRefreshes owns the error flag and never throws (can't reject load).
        await settleRefreshes([refreshDashboard(), refreshCrossGoal()])
      } finally {
        set({ isLoadingDashboard: false })
      }
    },

    // --- selection ---
    selectedGoalId: null,
    setSelectedGoalId: (id) => set({ selectedGoalId: id }),
    clearSelectedGoal: () => set({ selectedGoalId: null }),

    // --- goal tree ---
    currentGoalTree: null,
    subgoalProgress: {},
    phaseCheckIns: {},
    currentGoalProgress: { completed: 0, total: 0, percent: 0 },
    currentGoalProjection: null,
    currentGoalDeadlineHardness: null,
    currentGoalSlipInsight: null,
    isLoadingTree: false,

    // Blanks the tree first (avoids a stale-goal flash when navigating between
    // detail pages); in-place refreshes after a mutation use refreshCurrentTree.
    loadGoalTree: async (id) => {
      set({
        isLoadingTree: true,
        currentGoalTree: null,
        subgoalProgress: {},
        phaseCheckIns: {},
        currentGoalProgress: { completed: 0, total: 0, percent: 0 },
        currentGoalProjection: null,
        currentGoalDeadlineHardness: null,
        currentGoalSlipInsight: null,
      })
      try {
        // The goal context (for deadline hardness) is read alongside the tree so the
        // scope-cut nudge can decide, without AI, whether the goal is behind on a
        // HARD deadline the moment the page lands. The slip pattern (Stage 3) rides
        // along too so the Detail View can show WHY work keeps slipping on arrival.
        const [treeRaw, goalContext, slipInsight] = await Promise.all([
          getGoalTree(id),
          getGoalContext(id),
          slipInsightFor(id),
        ])
        const tree = treeRaw ?? null
        const progress = goalProgressFromTree(tree)
        set({
          currentGoalTree: tree,
          subgoalProgress: subgoalProgressFromTree(tree),
          phaseCheckIns: phaseCheckInsFromTree(tree),
          currentGoalProgress: progress,
          currentGoalProjection: tree
            ? computeGoalProjection(
                tree.goal.createdAt,
                tree.goal.targetDate,
                progress,
                new Date(),
              )
            : null,
          currentGoalDeadlineHardness: goalContext?.deadlineHardness ?? null,
          currentGoalSlipInsight: slipInsight,
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingTree: false })
      }
    },

    // --- subgoals ---
    addSubgoal: async (input) => {
      const siblings = await getSubgoalsByGoalId(input.goalId)
      const order = nextOrder(siblings.map((s) => s.order))
      const subgoal = await createSubgoal({ ...input, order })
      await settleRefreshes([refreshCurrentTree()])
      return subgoal
    },
    editSubgoal: async (id, changes) => {
      await updateSubgoal(id, changes)
      await settleRefreshes([refreshCurrentTree()])
    },
    // deleteSubgoal cascades its milestones + tasks AND removes any dependency
    // edges referencing this subgoal or its deleted tasks, atomically in the
    // repository transaction.
    removeSubgoal: async (id) => {
      await deleteSubgoal(id)
      // Cascade-deleting a subgoal's tasks changes the parent goal's
      // progress/health and the lagging-foundation signal, so refresh the cached
      // goals list too — not just the open tree. (Previously the list stayed
      // stale until the Goals page remounted.)
      await settleRefreshes([refreshCurrentTree(), refreshGoalsAndProgress()])
    },

    // --- milestones ---
    addMilestone: async (input) => {
      const siblings = await getMilestonesBySubgoalId(input.subgoalId)
      const order = nextOrder(siblings.map((m) => m.order))
      const milestone = await createMilestone({ ...input, order })
      await settleRefreshes([refreshCurrentTree()])
      return milestone
    },
    editMilestone: async (id, changes) => {
      await updateMilestone(id, changes)
      await settleRefreshes([refreshCurrentTree()])
    },
    // deleteMilestone REHOMES its tasks (clears milestoneId -> loose under the
    // subgoal) and deletes only the milestone row; no task data is lost.
    removeMilestone: async (id) => {
      await deleteMilestone(id)
      await settleRefreshes([refreshCurrentTree()])
    },

    // --- tasks ---
    addTask: async (input) => {
      // A task's order is scoped to its group: same milestoneId (including both
      // undefined for loose tasks). Partition the subgoal's tasks accordingly.
      const subgoalTasks = await getTasksBySubgoalId(input.subgoalId)
      const groupOrders = subgoalTasks
        .filter((t) => t.milestoneId === input.milestoneId)
        .map((t) => t.order)
      const order = nextOrder(groupOrders)
      const task = await createTask({ ...input, order })
      // A new (pending) task under a completed milestone must re-open it.
      if (input.milestoneId) await reconcileMilestone(input.milestoneId)
      // Refresh every surface a task touches: the goal tree (Detail View), the
      // dashboard windows, and the cross-goal caches (priority list AND goals-list
      // progress/health). Best-effort — each refresher no-ops cheaply for a view
      // that isn't mounted, and one failing refresh must neither abort the others
      // nor reject this (already-saved) add.
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
      return task
    },
    editTask: async (id, changes) => {
      // Capture the task's milestone BEFORE the edit: an edit can change status
      // (affecting completeness) or move the task to a different milestone, so
      // both the old and the new milestone may need reconciling.
      const before = await getTaskById(id)
      // Moving a task to a different milestone changes its group, and `order` is
      // scoped per group (same milestoneId, or both undefined for loose). Recompute
      // it for the destination so the task lands at the END and can't collide with
      // an order already used there. The store owns `order`; the form only sends the
      // chosen milestoneId. A same-group "move" (unchanged milestoneId) skips this.
      let patch = changes
      if (
        before &&
        'milestoneId' in changes &&
        changes.milestoneId !== before.milestoneId
      ) {
        const subgoalTasks = await getTasksBySubgoalId(before.subgoalId)
        const groupOrders = subgoalTasks
          .filter((t) => t.id !== id && t.milestoneId === changes.milestoneId)
          .map((t) => t.order)
        patch = { ...changes, order: nextOrder(groupOrders) }
      }
      await updateTask(id, patch)
      const affected = new Set<ID>()
      if (before?.milestoneId) affected.add(before.milestoneId)
      // 'milestoneId' present in changes means it was (re)assigned, even to
      // undefined; absent means it stayed put.
      const newMilestoneId =
        'milestoneId' in changes ? changes.milestoneId : before?.milestoneId
      if (newMilestoneId) affected.add(newMilestoneId)
      await Promise.all([...affected].map(reconcileMilestone))
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
    },
    removeTask: async (id) => {
      // Removing a task can complete its milestone (if it was the last open
      // one). Read the milestone before the row is gone.
      const before = await getTaskById(id)
      await deleteTask(id)
      if (before?.milestoneId) await reconcileMilestone(before.milestoneId)
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
    },

    // De-duplicate a goal's tasks: gather every task in a stable KEEP-PRIORITY order
    // (subgoals in display order; within each, milestone-phase tasks then loose
    // tasks), let the pure engine flag later near-identical titles, delete those,
    // reconcile any affected milestone, and refresh ONCE. Keeps the first/canonical
    // copy of each cluster. Returns how many were removed (0 = nothing matched).
    dedupeGoalTasks: async (goalId) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return 0

      const ordered: { id: ID; title: string; milestoneId?: ID }[] = []
      for (const st of tree.subgoals) {
        for (const mt of st.milestones) {
          for (const task of mt.tasks) {
            ordered.push({ id: task.id, title: task.title, milestoneId: task.milestoneId })
          }
        }
        for (const task of st.looseTasks) {
          ordered.push({ id: task.id, title: task.title, milestoneId: task.milestoneId })
        }
      }

      const removeIds = new Set(findDuplicateTaskIds(ordered))
      if (removeIds.size === 0) return 0

      const affectedMilestones = new Set<ID>()
      for (const t of ordered) {
        if (!removeIds.has(t.id)) continue
        await deleteTask(t.id)
        if (t.milestoneId) affectedMilestones.add(t.milestoneId)
      }
      for (const mId of affectedMilestones) await reconcileMilestone(mId)
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
      return removeIds.size
    },

    // Flip a task between completed and pending. Completing stamps completedAt
    // (feeds reviews/streaks later); un-completing clears it so a pending task
    // never carries a stale completion time. Binary only — Phase 1 has no UI for
    // in_progress/skipped.
    toggleTaskComplete: async (task) => {
      const markingComplete = task.status !== 'completed'
      await updateTask(
        task.id,
        markingComplete
          ? { status: 'completed', completedAt: new Date().toISOString() }
          : { status: 'pending', completedAt: undefined },
      )
      // Auto-complete (or re-open) the parent milestone per the spec'd rule.
      // Loose tasks (no milestoneId) have no milestone to reconcile. Run before
      // the refreshes so the tree picks up the milestone's new status too.
      if (task.milestoneId) await reconcileMilestone(task.milestoneId)
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
    },

    // --- weekly review ---
    weeklyReview: null,
    isLoadingReview: false,

    // Computed LIVE (no snapshot tables, per ADR-0001): read every task once,
    // run the pure engine for the window/completed/missed/daily-momentum, then
    // assemble the completed-by-goal grouping with the existing lineage getter.
    // Triggered by the Review page itself, not the dashboard load.
    loadWeeklyReview: async () => {
      set({ isLoadingReview: true })
      try {
        // All tasks (for the live review) plus the subgoal graph and which
        // subgoals are complete (for the "foundations strengthened" signal), in
        // parallel — none depends on another.
        const [tasks, subgoalEdges, completedSubgoals] = await Promise.all([
          getAllTasks(),
          getDependenciesByType('subgoal'),
          getSubgoalsByStatus('completed'),
        ])
        const review = computeWeeklyReview(tasks, new Date())

        // Group completed tasks by their parent goal, reusing getTaskLineages
        // (keyed by subgoalId) rather than rebuilding the task->goal walk. A task
        // whose lineage no longer resolves (dangling) is left out of the grouping.
        const lineages = await getTaskLineages(review.completedTasks)
        const counts = new Map<string, number>()
        for (const task of review.completedTasks) {
          const goalTitle = lineages[task.subgoalId]?.goalTitle
          if (goalTitle === undefined) continue
          counts.set(goalTitle, (counts.get(goalTitle) ?? 0) + 1)
        }
        const completedByGoal: CompletedGoalCount[] = [...counts.entries()]
          .map(([goalTitle, count]) => ({ goalTitle, count }))
          .sort((a, b) => b.count - a.count || a.goalTitle.localeCompare(b.goalTitle))

        // Dependency signal: foundational subgoals this week's completed work
        // advanced. The engine returns ids in leverage order; resolve each to its
        // title via the lineages already fetched (the ids are a subset of the
        // completed tasks' subgoals, so they are present — fall back if dangling).
        const completedSubgoalIds = new Set(completedSubgoals.map((s) => s.id))
        const strengthenedFoundations: StrengthenedFoundationNote[] =
          computeStrengthenedFoundations(
            review.completedTasks,
            subgoalEdges,
            completedSubgoalIds,
          ).map((f) => ({
            subgoalTitle: lineages[f.subgoalId]?.subgoalTitle ?? 'a subgoal',
            activeSupportCount: f.activeSupportCount,
          }))

        set({
          weeklyReview: { ...review, completedByGoal, strengthenedFoundations },
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingReview: false })
      }
    },

    // --- roadmap ---
    currentRoadmap: null,
    isLoadingRoadmap: false,

    // Assemble the dependency-ordered roadmap for ONE goal. Read-only: it never
    // mutates the graph (editing lives on the Goal Detail page). Fetches this
    // goal's subgoals, the subgoal dependency graph, and which subgoals are
    // complete — the SAME three inputs refreshTopPriority already uses — then the
    // pure engine orders them and the store joins the resulting ids back to
    // Subgoal objects for the UI. Mirrors loadGoalTree: it flips the loading flag
    // for the first paint, and stamps the result with goalId so the page can tell
    // a freshly-loaded roadmap from a previous goal's still on screen.
    loadRoadmap: async (goalId) => {
      set({ isLoadingRoadmap: true })
      try {
        const [subgoals, subgoalEdges, completedSubgoals] = await Promise.all([
          getSubgoalsByGoalId(goalId),
          getDependenciesByType('subgoal'),
          getSubgoalsByStatus('completed'),
        ])
        const completedIds = new Set(completedSubgoals.map((s) => s.id))
        const layout = buildRoadmap(
          subgoals.map((s) => s.id),
          subgoalEdges,
          completedIds,
        )

        // Resolve the engine's ids back to this goal's Subgoal objects. Ids in
        // the layout always come from `subgoals`, so every lookup hits — the
        // filter is just to satisfy the type, never to drop real data.
        const byId = new Map(subgoals.map((s) => [s.id, s]))
        const resolve = (ids: ID[]): Subgoal[] => {
          const out: Subgoal[] = []
          for (const id of ids) {
            const subgoal = byId.get(id)
            if (subgoal) out.push(subgoal)
          }
          return out
        }

        const stations: RoadmapStation[] = []
        for (const id of layout.order) {
          const subgoal = byId.get(id)
          if (!subgoal) continue
          const node = layout.nodes[id]
          stations.push({
            subgoal,
            activeSupportCount: node.activeSupportCount,
            supportedBy: resolve(node.supportedByIds),
            supports: resolve(node.supportsIds),
          })
        }

        set({
          currentRoadmap: { goalId, stations, cyclic: layout.cyclic },
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingRoadmap: false })
      }
    },

    // --- life map ---
    lifeMap: null,
    isLoadingLifeMap: false,

    // Assemble the dashboard's cross-goal "living map". The pure layout engine
    // (computeLifeMapLayout) owns the geometry; this gathers the live data —
    // every goal, its subgoals, the subgoal dependency graph, and each
    // node's completion — and joins titles/progress/state onto the laid-out
    // nodes. Read-only, single-slot cache; mirrors loadRoadmap but spans ALL
    // goals because the dashboard map is the one place the whole life is shown.
    loadLifeMap: async () => {
      set({ isLoadingLifeMap: true })
      try {
        const goals = await getAllGoals()
        const [subgoalsPerGoal, tasksPerGoal, subgoalEdges] = await Promise.all([
          Promise.all(goals.map((g) => getSubgoalsByGoalId(g.id))),
          Promise.all(goals.map((g) => getTasksByGoalId(g.id))),
          getDependenciesByType('subgoal'),
        ])

        // Index live data and per-node completion. computeSubgoalProgress /
        // computeGoalProgress are the same engine fns the cards use, so the map's
        // state never disagrees with the rest of the app.
        const subgoalsByGoal: Record<ID, ID[]> = {}
        const subgoalById = new Map<ID, Subgoal>()
        const subgoalPercent = new Map<ID, number>()
        const goalPercent = new Map<ID, number>()
        goals.forEach((g, i) => {
          const subs = subgoalsPerGoal[i]
          const tasks = tasksPerGoal[i]
          subgoalsByGoal[g.id] = subs.map((s) => s.id)
          goalPercent.set(g.id, computeGoalProgress(tasks).percent)
          for (const s of subs) {
            subgoalById.set(s.id, s)
            subgoalPercent.set(
              s.id,
              computeSubgoalProgress(tasks.filter((t) => t.subgoalId === s.id))
                .percent,
            )
          }
        })

        const layout = computeLifeMapLayout(
          goals.map((g) => g.id),
          subgoalsByGoal,
          subgoalEdges,
        )

        const goalById = new Map(goals.map((g) => [g.id, g]))
        const townDone = (id: ID): boolean => {
          const s = subgoalById.get(id)
          return s?.status === 'completed' || (subgoalPercent.get(id) ?? 0) >= 100
        }

        // The single "you are here" town: the most-progressed still-unfinished
        // subgoal, biased toward the focused goal if one is selected. Marks
        // current momentum without overstating it (omitted if nothing's underway).
        const focusGoalId = get().selectedGoalId
        let hereId: ID | null = null
        let hereScore = -1
        for (const [id, s] of subgoalById) {
          if (townDone(id)) continue
          const pct = subgoalPercent.get(id) ?? 0
          if (pct <= 0) continue
          const score = (focusGoalId && s.goalId === focusGoalId ? 1000 : 0) + pct
          if (score > hereScore) {
            hereScore = score
            hereId = id
          }
        }

        const nodes: LifeMapNode[] = layout.nodes.map((nd) => {
          if (nd.kind === 'city') {
            const goal = goalById.get(nd.id)
            const pct = goalPercent.get(nd.id) ?? 0
            const done = goal?.status === 'completed' || pct >= 100
            return {
              ...nd,
              label: goal?.title ?? 'Goal',
              sublabel: goal?.targetDate
                ? format(new Date(goal.targetDate), 'MMM yyyy')
                : undefined,
              date: goal?.targetDate,
              state: done ? 'done' : pct > 0 ? 'active' : 'todo',
              percent: pct,
            }
          }
          const sub = subgoalById.get(nd.id)
          const pct = subgoalPercent.get(nd.id) ?? 0
          const state: LifeMapNodeState = townDone(nd.id)
            ? 'done'
            : nd.id === hereId
              ? 'here'
              : pct > 0
                ? 'active'
                : 'todo'
          return {
            ...nd,
            label: sub?.title ?? 'Subgoal',
            sublabel: sub?.targetDate
              ? format(new Date(sub.targetDate), 'MMM yyyy')
              : undefined,
            date: sub?.targetDate,
            state,
            percent: pct,
          }
        })

        const links: LifeMapLink[] = layout.links.map((l) => ({
          ...l,
          done: townDone(l.source),
        }))

        set({
          lifeMap: { nodes, links, width: layout.width, height: layout.height },
          error: null,
        })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingLifeMap: false })
      }
    },

    // --- AI assistance ---
    // Thin orchestration: build the prompt (pure), ask the provider (the only
    // thing that "calls out"), parse the reply (pure, never throws). No store
    // state is cached — the caller holds the returned suggestions while the user
    // accepts/edits/rejects them. A provider rejection bubbles up to the caller.
    suggestMilestones: async (context) => {
      // Phase 9: enrich the prompt with who the user is and where they stand on
      // the parent goal, so suggestions are tailored. Fetched store-side; the
      // engine prompt builder stays pure.
      const [userContext, goalContext, strategyBrief] = await Promise.all([
        loadAIUserContext(),
        loadAIGoalContext(context.goalId),
        getStrategyBrief(context.goalId),
      ])
      const response = await aiProvider.complete(
        buildMilestonePrompt({ ...context, userContext, goalContext, strategyBrief }),
      )
      return parseMilestoneSuggestions(response)
    },

    // Sibling of suggestMilestones, one level up: goal -> its subgoals. Same
    // thin orchestration (pure prompt -> provider -> pure parser), same
    // propagate-on-failure contract.
    suggestSubgoals: async (context) => {
      const [userContext, goalContext, strategyBrief] = await Promise.all([
        loadAIUserContext(),
        loadAIGoalContext(context.goalId),
        getStrategyBrief(context.goalId),
      ])
      const response = await aiProvider.complete(
        buildSubgoalPrompt({ ...context, userContext, goalContext, strategyBrief }),
      )
      return parseSubgoalSuggestions(response)
    },

    // Daily plan: resolve the window from the subgoal's EXISTING scheduled tasks
    // (so a re-run extends, not overlaps) -> prompt -> provider -> shared parser
    // (capped at the window length) -> pure scheduler that dates the sessions
    // from the window start. `new Date()` is read here (store side), never in the
    // engine. Returns [] when the plan already reaches the deadline. Read-only;
    // the modal writes accepted tasks via addTask.
    generateDailyPlan: async (request) => {
      const existing = await getTasksBySubgoalId(request.subgoalId)
      const scheduledDates = existing
        .map((t) => t.scheduledDate)
        .filter((d): d is string => d !== undefined)
      // 'yyyy-MM-dd' keys sort lexically, so the max string is the latest day.
      const lastScheduledDate =
        scheduledDates.length > 0
          ? scheduledDates.reduce((a, b) => (a > b ? a : b))
          : null

      const { startDate, days } = computePlanWindow(
        new Date(),
        lastScheduledDate,
        request.targetDate ?? null,
        DAILY_PLAN_HORIZON,
      )
      if (days <= 0) return [] // already planned through the deadline

      // Phase 9: tailor the plan to the person + goal. Fetched only after the
      // early-out above, so a no-op regenerate does no extra reads. The RAW
      // context also gives the days-off indices the scheduler uses to avoid
      // placing tasks on rest days (capacity: don't work on days off).
      const [userContext, goalContext, rawContext, strategyBrief, digest] =
        await Promise.all([
          loadAIUserContext(),
          loadAIGoalContext(request.goalId),
          getUserContext(),
          getStrategyBrief(request.goalId),
          roadmapDigestFor(request.goalId),
        ])
      const response = await aiProvider.complete(
        buildDailyPlanPrompt({
          subgoalTitle: request.subgoalTitle,
          subgoalDescription: request.subgoalDescription,
          goalTitle: request.goalTitle,
          dailyMinutes: request.dailyMinutes,
          days,
          userContext,
          goalContext,
          strategyBrief,
          digest,
        }),
      )
      // Sessions carry the model's own per-session minutes. Split them: one-time
      // PROGRESSION sessions form the day-by-day backbone (scheduleDailyTasks), while
      // RECURRING habits are overlaid across the same window at their cadence
      // (expandRecurringSessions). Both fall back to request.dailyMinutes for minutes.
      const sessions = parsePlannedSessions(response, days)
      const lightDays = rawContext?.lightDays ?? []
      const backbone = scheduleDailyTasks(
        sessions.filter((s) => !s.recurrence),
        startDate,
        request.dailyMinutes,
        lightDays,
      )
      // Cap recurring habits: even if the model over-marks sessions recurring, keep
      // only the first few so one plan can't dump dozens of daily occurrences
      // (MAX_RECURRING_SESSIONS). Order preserved, so the earliest habits survive.
      const habits = expandRecurringSessions(
        sessions.filter((s) => s.recurrence).slice(0, MAX_RECURRING_SESSIONS),
        {
          startDate,
          windowDays: days,
          defaultMinutes: request.dailyMinutes,
          skipWeekdays: lightDays,
        },
      )
      return [...backbone, ...habits]
    },

    // --- strategy brief (read slot) ---
    currentStrategyBrief: null,
    isLoadingStrategyBrief: false,

    // Blank the slot first (avoids a previous goal's brief flashing when navigating
    // between detail pages), then read the persisted brief. Mirrors loadGoalTree.
    loadStrategyBrief: async (goalId) => {
      set({ isLoadingStrategyBrief: true, currentStrategyBrief: null })
      try {
        const brief = (await getStrategyBrief(goalId)) ?? null
        set({ currentStrategyBrief: brief, error: null })
      } catch {
        set({ error: LOAD_ERROR_MESSAGE })
      } finally {
        set({ isLoadingStrategyBrief: false })
      }
    },

    // Phase 10 — Direction layer. Fetch the goal + the person/goal context, ask
    // the provider for a brief, parse it (never throws), and persist it on success.
    // Standalone for now: the downstream structure/schedule stages will render the
    // stored brief into their prompts in a later slice. `new Date()` isn't read
    // here — the brief carries no dates. Uses getGoalTree only to reach the goal's
    // fields (same pattern as generateFullRoadmap).
    generateStrategyBrief: async (goalId, intake) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return null
      const goal = tree.goal

      const [userContext, goalContext] = await Promise.all([
        loadAIUserContext(),
        loadAIGoalContext(goalId),
      ])
      const response = await aiProvider.complete(
        buildStrategyBriefPrompt({
          goalId,
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalCategory: goal.category,
          targetDate: goal.targetDate,
          intake,
          userContext,
          goalContext,
        }),
      )
      const brief = parseStrategyBrief(response)
      // Only persist a usable brief; a null (malformed reply) leaves any existing
      // brief in place rather than clobbering it with nothing. On success, refresh
      // the read slot so the Detail View reflects the new brief immediately.
      if (brief) {
        await saveStrategyBrief(goalId, brief)
        set({ currentStrategyBrief: brief })
      }
      return brief
    },

    // Phase check-in beat 2 — apply the "anything changed?" note. Reuses the brief
    // pipeline: the note becomes a light re-intake exchange, so the regenerated brief
    // reflects it and every downstream generation (notably beat 3's next-phase
    // planning) inherits the change. An empty note never reaches the provider.
    applyCheckInChange: async (goalId, note) => {
      const trimmed = note.trim()
      if (trimmed.length === 0) return null
      return get().generateStrategyBrief(goalId, [
        {
          question:
            'What has changed since the last phase, that the plan should account for?',
          answer: trimmed,
        },
      ])
    },

    // Phase 10, Stage 2 — STRUCTURE proposal (READ-ONLY). The thin orchestration
    // (fetch goal + context + the stored brief, build prompt, provider, pure parser)
    // WITHOUT the writes — it RETURNS the tracks for the user to review/edit before
    // anything is created. Guarded like the direct path (structure defines the INITIAL
    // arc; a goal that already has subgoals returns []). Propagates provider errors.
    generateStructureProposal: async (goalId) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return []
      if (tree.subgoals.length > 0) return []
      const goal = tree.goal

      const [userContext, goalContext, strategyBrief] = await Promise.all([
        loadAIUserContext(),
        loadAIGoalContext(goalId),
        getStrategyBrief(goalId),
      ])
      const response = await aiProvider.complete(
        buildStructurePrompt({
          goalId,
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalCategory: goal.category,
          targetDate: goal.targetDate,
          userContext,
          goalContext,
          strategyBrief,
        }),
      )
      return parseStructure(response)
    },

    // Write an APPROVED (possibly user-edited) structure: each track → a subgoal, each
    // of its phases → a milestone under it, via the existing add* paths (order handled
    // there; each refresh lands progressively). Undated — no tasks (Stage 3 expands
    // each phase). Guarded so it can never append onto an existing skeleton, and it
    // skips blank titles (the review UI may have emptied one). Counterpart to
    // generateStructureProposal; also the writer inside the direct generateStructure.
    applyStructure: async (goalId, tracks) => {
      if (tracks.length === 0) return
      const tree = await getGoalTree(goalId)
      if (!tree || tree.subgoals.length > 0) return
      for (const track of tracks) {
        if (track.title.trim().length === 0) continue
        const subgoal = await get().addSubgoal({
          goalId,
          title: track.title.trim(),
          description: track.description?.trim() ?? '',
          status: DEFAULT_SUBGOAL_STATUS,
          requiresConsistency: true,
          estimatedDailyMinutes: DEFAULT_DAILY_MINUTES,
        })
        for (const phase of track.phases) {
          if (phase.title.trim().length === 0) continue
          await get().addMilestone({
            subgoalId: subgoal.id,
            title: phase.title.trim(),
            ...(phase.description?.trim()
              ? { description: phase.description.trim() }
              : {}),
            status: DEFAULT_MILESTONE_STATUS,
            aiSuggested: true,
          })
        }
      }
    },

    // STRUCTURE — direct (one-click) path: propose then immediately write. Unchanged
    // contract (used by generateFullRoadmap); the review flow uses the two actions
    // above so the user approves before anything is written.
    generateStructure: async (goalId) => {
      const tracks = await get().generateStructureProposal(goalId)
      await get().applyStructure(goalId, tracks)
      return tracks
    },

    // Phase 10, Stage 3 — SCHEDULE one phase, PROPOSAL (READ-ONLY). Self-derives the
    // milestone's subgoal + goal, resolves the window from the PHASE's own scheduled
    // tasks (so a re-run extends this phase, not the whole subgoal), then runs the exact
    // daily-plan pipeline (prompt → provider → parser → scheduleDailyTasks backbone +
    // expandRecurringSessions overlay) with the MILESTONE as the focus — and RETURNS the
    // dated tasks instead of writing them, so the user can review before they land. []
    // when the milestone is gone or the phase already reaches the deadline. Propagates.
    generatePhaseTasksProposal: async (milestoneId) => {
      const milestone = await getMilestoneById(milestoneId)
      if (!milestone) return []
      const subgoal = await getSubgoalById(milestone.subgoalId)
      if (!subgoal) return []
      const goal = await getGoalById(subgoal.goalId)
      if (!goal) return []

      // Window from the PHASE's existing scheduled tasks (extend, don't overlap).
      const existing = await getTasksByMilestoneId(milestoneId)
      const scheduledDates = existing
        .map((t) => t.scheduledDate)
        .filter((d): d is string => d !== undefined)
      const lastScheduledDate =
        scheduledDates.length > 0
          ? scheduledDates.reduce((a, b) => (a > b ? a : b))
          : null

      const dailyMinutes = subgoal.estimatedDailyMinutes ?? DEFAULT_DAILY_MINUTES
      const targetDate = subgoal.targetDate ?? goal.targetDate
      const { startDate, days } = computePlanWindow(
        new Date(),
        lastScheduledDate,
        targetDate ?? null,
        DAILY_PLAN_HORIZON,
      )
      if (days <= 0) return [] // phase already planned through the deadline

      const [userContext, goalContext, rawContext, strategyBrief, digest] =
        await Promise.all([
          loadAIUserContext(),
          loadAIGoalContext(goal.id),
          getUserContext(),
          getStrategyBrief(goal.id),
          roadmapDigestFor(goal.id),
        ])
      const response = await aiProvider.complete(
        buildDailyPlanPrompt({
          // The PHASE (milestone) is the focus of this window's sessions.
          subgoalTitle: milestone.title,
          subgoalDescription: milestone.description ?? '',
          goalTitle: goal.title,
          dailyMinutes,
          days,
          userContext,
          goalContext,
          strategyBrief,
          digest,
        }),
      )
      const sessions = parsePlannedSessions(response, days)
      const lightDays = rawContext?.lightDays ?? []
      const backbone = scheduleDailyTasks(
        sessions.filter((s) => !s.recurrence),
        startDate,
        dailyMinutes,
        lightDays,
      )
      const habits = expandRecurringSessions(
        sessions.filter((s) => s.recurrence).slice(0, MAX_RECURRING_SESSIONS),
        { startDate, windowDays: days, defaultMinutes: dailyMinutes, skipWeekdays: lightDays },
      )
      return [...backbone, ...habits]
    },

    // Write APPROVED (possibly user-trimmed/edited) phase tasks UNDER the milestone
    // (milestoneId set so they roll up to the phase). Re-derives the subgoal from the
    // milestone. Skips blank titles (the review UI may have emptied one). Returns how
    // many were written. Counterpart to generatePhaseTasksProposal; also the writer
    // inside the direct generatePhaseTasks.
    applyPhaseTasks: async (milestoneId, tasks) => {
      if (tasks.length === 0) return 0
      const milestone = await getMilestoneById(milestoneId)
      if (!milestone) return 0
      let written = 0
      for (const t of tasks) {
        if (t.title.trim().length === 0) continue
        await get().addTask({
          subgoalId: milestone.subgoalId,
          milestoneId, // roll the task up to the PHASE
          title: t.title.trim(),
          status: DEFAULT_TASK_STATUS,
          priority: DEFAULT_TASK_PRIORITY,
          isRecurring: t.isRecurring,
          scheduledDate: t.scheduledDate,
          estimatedMinutes: t.estimatedMinutes,
          ...(t.description ? { description: t.description } : {}),
        })
        written += 1
      }
      return written
    },

    // Stage 3 — direct (one-click) path: propose then write. Unchanged contract (used
    // by the phase-end check-in's beat 3). The review flow uses the two actions above.
    generatePhaseTasks: async (milestoneId) => {
      const planned = await get().generatePhaseTasksProposal(milestoneId)
      return get().applyPhaseTasks(milestoneId, planned)
    },

    // Stage 0 — the intake questions. Same thin orchestration as the suggest*
    // actions (fetch goal + context, build prompt, provider, pure parser). Reads
    // the goal's fields via getGoalTree (like generateStrategyBrief), so the caller
    // needs only the goalId.
    generateIntakeQuestions: async (goalId) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return []
      const goal = tree.goal

      const [userContext, goalContext] = await Promise.all([
        loadAIUserContext(),
        loadAIGoalContext(goalId),
      ])
      const response = await aiProvider.complete(
        buildIntakePrompt({
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalCategory: goal.category,
          targetDate: goal.targetDate,
          userContext,
          goalContext,
        }),
      )
      return parseIntakeQuestions(response, MAX_INTAKE_QUESTIONS)
    },

    // Build the whole roadmap from a goal in one go: the STRUCTURE (tracks +
    // phases) if the goal has none yet, then a dated daily plan attached to each
    // track's opening phase. Reuses the AI actions + the existing add* write paths
    // (each refreshes the open tree), so the user watches it fill in. Sequential by
    // necessity: each subgoal's id is needed before its tasks can be created.
    // Phase 10: the decomposition is now the staged, model-scoped generateStructure
    // (tracks → subgoals, phases → milestones), so milestones ARE created here — the
    // packed tasks land under the FIRST phase, and later phases stay undated for
    // on-demand expansion ("Plan tasks with AI").
    generateFullRoadmap: async (goalId) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return
      const goal = tree.goal

      // Capacity budget: the user's available minutes in a day. The pure day-packer
      // (below) fills each working day up to this across ALL subgoals, so the whole
      // day's generated work never exceeds what they said they can actually do.
      const profile = await getProfile()
      const dayMinutes = (profile?.availableHoursPerDay ?? 4) * 60

      // Existing structure (so a re-run fills gaps instead of duplicating).
      // firstMilestoneId is the track's opening PHASE (Phase 10): the packed tasks
      // attach there, so the one-click plan dates the current phase and leaves later
      // phases undated for on-demand expansion.
      type Sg = {
        id: ID
        title: string
        description: string
        hasTasks: boolean
        firstMilestoneId?: ID
      }
      let subgoals: Sg[] = tree.subgoals.map((st) => ({
        id: st.subgoal.id,
        title: st.subgoal.title,
        description: st.subgoal.description,
        hasTasks:
          st.looseTasks.length > 0 ||
          st.milestones.some((m) => m.tasks.length > 0),
        firstMilestoneId: st.milestones[0]?.milestone.id,
      }))

      // Subgoals this run creates itself (as opposed to ones the user made by
      // hand). Only these are eligible for the empty-subgoal prune at the end —
      // we never delete a subgoal a person authored, even if it ends up task-less.
      const createdIds = new Set<ID>()

      // 1) Structure — only when the goal has none yet. generateStructure writes
      // the tracks (subgoals) + their phases (milestones) internally, UNDATED, so we
      // re-read the tree to pick up the created ids + each track's opening phase.
      if (subgoals.length === 0) {
        await get().generateStructure(goalId)
        const seeded = await getGoalTree(goalId)
        subgoals = (seeded?.subgoals ?? []).map((st) => ({
          id: st.subgoal.id,
          title: st.subgoal.title,
          description: st.subgoal.description,
          hasTasks: false,
          firstMilestoneId: st.milestones[0]?.milestone.id,
        }))
        for (const sg of subgoals) createdIds.add(sg.id)
      }

      // 2) Tasks — ONE packed schedule across every subgoal that still needs them.
      // Ask each subgoal for an undated session list, interleave them round-robin
      // (so a day mixes subjects), then the pure packer fills each working day up
      // to the daily budget and skips days off. THIS is the capacity guarantee:
      // the whole day's work across subgoals never exceeds availableHoursPerDay.
      const pending = subgoals.filter((sg) => !sg.hasTasks)
      if (pending.length > 0) {
        // Context is per-user / per-goal — fetch once and reuse for every subgoal.
        // The Strategy Brief (Phase 10) is included so every subgoal's daily plan
        // pulls toward the same target/priorities, not just its own title.
        const [userContext, goalContext, rawContext, strategyBrief, digest] =
          await Promise.all([
            loadAIUserContext(),
            loadAIGoalContext(goalId),
            getUserContext(),
            getStrategyBrief(goalId),
            roadmapDigestFor(goalId),
          ])

        // The model decides WHAT each session is AND how long it takes; the packer
        // decides WHEN. `dailyMinutes` is only a sizing hint — each session carries
        // its own model-decided minutes (falling back to DEFAULT_DAILY_MINUTES). The
        // digest (computed once) gives every subgoal's plan the whole-roadmap context.
        // De-dup across subgoals: seed with any tasks the goal ALREADY has, then feed
        // each subgoal's freshly-planned titles forward so a later subgoal never
        // regenerates work an earlier one already owns (the digest carries only
        // counts, so without this siblings are blind to each other's actual tasks).
        // Bounded by the plan's shape — generation-time only, so the flat-cost
        // principle for rolling calls is untouched.
        const plannedTitles: string[] = tree.subgoals.flatMap((st) => [
          ...st.looseTasks.map((t) => t.title),
          ...st.milestones.flatMap((m) => m.tasks.map((t) => t.title)),
        ])
        const perSubgoal: { subgoalId: ID; sessions: PlannedSession[] }[] = []
        for (const sg of pending) {
          const response = await aiProvider.complete(
            buildDailyPlanPrompt({
              subgoalTitle: sg.title,
              subgoalDescription: sg.description,
              goalTitle: goal.title,
              dailyMinutes: DEFAULT_DAILY_MINUTES,
              days: DAILY_PLAN_HORIZON,
              userContext,
              goalContext,
              strategyBrief,
              digest,
              plannedElsewhere: plannedTitles,
            }),
          )
          const sessions = parsePlannedSessions(response, DAILY_PLAN_HORIZON)
          perSubgoal.push({ subgoalId: sg.id, sessions })
          // Feed this subgoal's titles forward so the next subgoal avoids them.
          for (const s of sessions) plannedTitles.push(s.title)
        }

        // Window: the horizon, never past the goal's deadline. Shared by the
        // recurring overlay and the progression packer so both span the same days.
        const startDate = new Date()
        const lightDays = rawContext?.lightDays ?? []
        const daysToDeadline = differenceInCalendarDays(
          parseISO(goal.targetDate),
          startDate,
        )
        const maxDays = Math.max(1, Math.min(DAILY_PLAN_HORIZON, daysToDeadline))

        // RESERVE-then-pack (Phase 10). A session with a `recurrence` is a HABIT that
        // repeats on a fixed cadence; the rest is one-time PROGRESSION. First expand
        // each subgoal's habits onto their cadence dates (capped like the per-phase
        // path) and total the minutes they claim per day — the packer then fits the
        // progression backbone into what each day has LEFT, so habits + progression
        // together stay within the daily budget (the old code flattened habits into
        // one-time tasks, losing the cadence AND double-counting the capacity).
        const recurringOut: { subgoalId: ID; task: ScheduledDailyTask }[] = []
        const reservedByDay: Record<string, number> = {}
        const progressionBySubgoal: {
          subgoalId: ID
          sessions: PlannedSession[]
        }[] = []
        for (const p of perSubgoal) {
          progressionBySubgoal.push({
            subgoalId: p.subgoalId,
            sessions: p.sessions.filter((s) => !s.recurrence),
          })
          const occurrences = expandRecurringSessions(
            p.sessions.filter((s) => s.recurrence).slice(0, MAX_RECURRING_SESSIONS),
            {
              startDate,
              windowDays: maxDays,
              defaultMinutes: DEFAULT_DAILY_MINUTES,
              skipWeekdays: lightDays,
            },
          )
          for (const task of occurrences) {
            recurringOut.push({ subgoalId: p.subgoalId, task })
            reservedByDay[task.scheduledDate] =
              (reservedByDay[task.scheduledDate] ?? 0) + task.estimatedMinutes
          }
        }

        // Round-robin interleave the PROGRESSION across subgoals so packed days mix
        // subjects. Each item keeps its own duration, so the per-day capacity budget
        // is spent on the REAL sizes the model chose, not a flat constant.
        const items: PackSession[] = []
        const rounds = Math.max(
          0,
          ...progressionBySubgoal.map((p) => p.sessions.length),
        )
        for (let i = 0; i < rounds; i++) {
          for (const p of progressionBySubgoal) {
            const s = p.sessions[i]
            if (s) {
              items.push({
                subgoalId: p.subgoalId,
                title: s.title,
                description: s.description,
                minutes: s.minutes ?? DEFAULT_DAILY_MINUTES,
              })
            }
          }
        }

        const packed = packSessionsIntoDays(items, {
          startDate,
          dailyBudgetMinutes: dayMinutes,
          skipWeekdays: lightDays,
          maxDays,
          reservedMinutesByDay: reservedByDay,
        })

        // Attach every dated task — recurring habits AND packed progression — to its
        // track's opening PHASE (milestone) so the work lives under the structure,
        // not loose; later phases stay undated for on-demand expansion. Falls back to
        // loose (subgoal only) if a track somehow has no phase.
        const firstPhaseBySubgoal = new Map(
          subgoals.map((sg) => [sg.id, sg.firstMilestoneId]),
        )
        for (const { subgoalId, task } of recurringOut) {
          const milestoneId = firstPhaseBySubgoal.get(subgoalId)
          await get().addTask({
            subgoalId,
            ...(milestoneId ? { milestoneId } : {}),
            title: task.title,
            status: DEFAULT_TASK_STATUS,
            priority: DEFAULT_TASK_PRIORITY,
            isRecurring: true,
            scheduledDate: task.scheduledDate,
            estimatedMinutes: task.estimatedMinutes,
            ...(task.description ? { description: task.description } : {}),
          })
        }
        for (const t of packed) {
          const milestoneId = firstPhaseBySubgoal.get(t.subgoalId)
          await get().addTask({
            subgoalId: t.subgoalId,
            ...(milestoneId ? { milestoneId } : {}),
            title: t.title,
            status: DEFAULT_TASK_STATUS,
            priority: DEFAULT_TASK_PRIORITY,
            isRecurring: false,
            scheduledDate: t.scheduledDate,
            estimatedMinutes: t.minutes,
            ...(t.description ? { description: t.description } : {}),
          })
        }

        // Invariant: a subgoal with no tasks is just clutter — there is nothing to
        // act on under it (same reasoning that stopped us auto-creating empty
        // milestones). The packer can drop a subgoal's sessions entirely when the
        // deadline/window is too tight, and a malformed AI reply can yield no
        // sessions at all. Prune any subgoal THIS run created that ended up with
        // zero scheduled tasks (progression OR habit) — never one the user authored
        // (left as-is above), and never one that carries PHASES (its structure is
        // worth keeping even with no tasks yet; the user can expand a phase on demand).
        const scheduledSubgoalIds = new Set([
          ...packed.map((t) => t.subgoalId),
          ...recurringOut.map((r) => r.subgoalId),
        ])
        for (const sg of pending) {
          if (
            createdIds.has(sg.id) &&
            !scheduledSubgoalIds.has(sg.id) &&
            sg.firstMilestoneId === undefined
          ) {
            await get().removeSubgoal(sg.id)
          }
        }
      }

      // Belt-and-suspenders on the prompt-level de-dup: sweep near-identical task
      // titles across the whole goal and drop later copies. Provider-independent, so
      // it also cleans plans generated before the prompt fix. Runs on EVERY
      // generation (outside the pending guard) — including gap-fills and re-runs.
      await get().dedupeGoalTasks(goalId)
    },

    topUpRoadmap: async (goalId) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return
      const now = new Date()

      for (const st of tree.subgoals) {
        const sg = st.subgoal
        // Only consistency subgoals carry a rolling daily plan to extend.
        if (!sg.requiresConsistency) continue

        const tasks = [...st.looseTasks, ...st.milestones.flatMap((m) => m.tasks)]
        const scheduled = tasks
          .map((t) => t.scheduledDate)
          .filter((d): d is string => d !== undefined)
        // Never planned yet — seeding is an explicit action, not a top-up.
        if (scheduled.length === 0) continue

        // Furthest scheduled day ('yyyy-MM-dd' sorts lexically). If it still has
        // runway, leave it — only extend when the window is genuinely low.
        const last = scheduled.reduce((a, b) => (a > b ? a : b))
        if (differenceInCalendarDays(parseISO(last), now) >= DAILY_PLAN_LOW_WINDOW) {
          continue
        }

        // Phase-aware extension (Phase 10). The CURRENT phase is the milestone
        // holding the latest scheduled task — extend THAT phase (tasks written under
        // its milestone), so a top-up stays attached to the structure exactly like
        // the initial plan. generatePhaseTasks resumes after the phase's last task,
        // is capacity/day-off aware, and caps at the deadline.
        const currentMilestoneId = tasks.find(
          (t) => t.scheduledDate === last,
        )?.milestoneId

        if (currentMilestoneId) {
          await get().generatePhaseTasks(currentMilestoneId)
          continue
        }

        // Fallback: the active work is loose (no milestone — a subgoal planned the
        // old, pre-structure way). Extend it at the subgoal level as before.
        const plan = await get().generateDailyPlan({
          subgoalId: sg.id,
          goalId,
          subgoalTitle: sg.title,
          subgoalDescription: sg.description,
          goalTitle: tree.goal.title,
          dailyMinutes: sg.estimatedDailyMinutes ?? DEFAULT_DAILY_MINUTES,
          targetDate: sg.targetDate ?? tree.goal.targetDate,
        })
        for (const t of plan) {
          await get().addTask({
            subgoalId: sg.id,
            title: t.title,
            status: DEFAULT_TASK_STATUS,
            priority: DEFAULT_TASK_PRIORITY,
            isRecurring: t.isRecurring,
            scheduledDate: t.scheduledDate,
            estimatedMinutes: t.estimatedMinutes,
            ...(t.description ? { description: t.description } : {}),
          })
        }
      }
    },

    // Reschedule this goal's overdue tasks forward (see the interface doc). Reads
    // the goal tree (tasks + targetDate), the goal's intake (deadlineHardness), the
    // profile (daily capacity) and the user context (days off); the pure
    // rescheduleOverdue decides the new dates. `new Date()` is read here (store
    // side), never in the engine.
    rescheduleOverdueForGoal: async (goalId, reason) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return 0

      const now = new Date()
      const today = format(now, 'yyyy-MM-dd')
      const allTasks = tree.subgoals.flatMap((st) => [
        ...st.looseTasks,
        ...st.milestones.flatMap((m) => m.tasks),
      ])
      // Overdue = scheduled before today AND not yet completed. Oldest first, so the
      // longest-missed work is placed back onto the calendar first.
      const overdue = allTasks
        .filter(
          (t) =>
            t.scheduledDate !== undefined &&
            t.scheduledDate < today &&
            t.status !== 'completed',
        )
        .sort((a, b) => ((a.scheduledDate ?? '') < (b.scheduledDate ?? '') ? -1 : 1))
      if (overdue.length === 0) return 0

      const [goalContext, profile, userContext] = await Promise.all([
        getGoalContext(goalId),
        getProfile(),
        getUserContext(),
      ])
      const dailyBudget = (profile?.availableHoursPerDay ?? 4) * 60
      // A hard deadline caps the window at the goal's target (overflow compresses,
      // never slips past); a soft deadline is unbounded.
      const maxDate =
        goalContext?.deadlineHardness === 'hard' ? tree.goal.targetDate : null

      const rescheduled = rescheduleOverdue(
        overdue.map((t) => ({
          id: t.id,
          minutes: t.estimatedMinutes ?? DEFAULT_DAILY_MINUTES,
        })),
        {
          from: now,
          dailyBudgetMinutes: dailyBudget,
          skipWeekdays: userContext?.lightDays ?? [],
          maxDate,
        },
      )

      // Persist the new dates AND bump the durable slip counter (so Reliability
      // remembers this miss even after the task is later completed), then refresh
      // every surface a task date touches.
      const priorCount = new Map(overdue.map((t) => [t.id, t.rescheduleCount ?? 0]))
      for (const r of rescheduled) {
        await updateTask(r.id, {
          scheduledDate: r.scheduledDate,
          rescheduleCount: (priorCount.get(r.id) ?? 0) + 1,
        })
      }
      // Log one slip event per moved task with the batch reason (Stage 3), then
      // refresh the goal's slip pattern so the Detail View updates in place.
      await createSlipEvents(
        rescheduled.map((r) => ({ taskId: r.id, goalId, reason })),
      )
      const slipInsight = await slipInsightFor(goalId)
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
      set({ currentGoalSlipInsight: slipInsight })
      return rescheduled.length
    },

    // Cross-goal reschedule-on-miss (the dashboard "catch up"). Same engine as the
    // per-goal version, but the overdue set spans EVERY goal and shares one daily
    // budget — a getTasksScheduledBefore(today) read already returns them all, so no
    // per-goal tree walk is needed. Unbounded (maxDate: null): capacity-first spread.
    rescheduleAllOverdue: async (reason) => {
      const now = new Date()
      const today = format(now, 'yyyy-MM-dd')
      const overdueRaw = await getTasksScheduledBefore(today)
      // Still owed = past-dated and not yet done. Oldest first, so the longest-missed
      // work returns to the calendar first (matches the per-goal ordering).
      const overdue = overdueRaw
        .filter((t) => t.status !== 'completed')
        .sort((a, b) => ((a.scheduledDate ?? '') < (b.scheduledDate ?? '') ? -1 : 1))
      if (overdue.length === 0) return 0

      const [profile, userContext] = await Promise.all([
        getProfile(),
        getUserContext(),
      ])
      const dailyBudget = (profile?.availableHoursPerDay ?? 4) * 60

      const rescheduled = rescheduleOverdue(
        overdue.map((t) => ({
          id: t.id,
          minutes: t.estimatedMinutes ?? DEFAULT_DAILY_MINUTES,
        })),
        {
          from: now,
          dailyBudgetMinutes: dailyBudget,
          skipWeekdays: userContext?.lightDays ?? [],
          maxDate: null,
        },
      )

      const priorCount = new Map(overdue.map((t) => [t.id, t.rescheduleCount ?? 0]))
      for (const r of rescheduled) {
        await updateTask(r.id, {
          scheduledDate: r.scheduledDate,
          rescheduleCount: (priorCount.get(r.id) ?? 0) + 1,
        })
      }

      // Resolve each moved task's goal (via its subgoal) so its slip event lands on
      // the right goal — this cross-goal action has no goalId in hand, unlike the
      // per-goal reschedule. Unique-subgoal fan-out; tiny at this scale.
      const subgoalIds = [...new Set(overdue.map((t) => t.subgoalId))]
      const subgoalGoal = new Map<ID, ID>()
      await Promise.all(
        subgoalIds.map(async (sid) => {
          const sg = await getSubgoalById(sid)
          if (sg) subgoalGoal.set(sid, sg.goalId)
        }),
      )
      const taskSubgoal = new Map(overdue.map((t) => [t.id, t.subgoalId]))
      const events = rescheduled
        .map((r) => {
          const goalId = subgoalGoal.get(taskSubgoal.get(r.id) ?? '')
          return goalId ? { taskId: r.id, goalId, reason } : null
        })
        .filter((e): e is { taskId: ID; goalId: ID; reason: SlipReason } => e !== null)
      await createSlipEvents(events)

      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
      // If a goal is open, its pattern may have changed — refresh it in place.
      const openGoalId = get().currentGoalTree?.goal.id
      if (openGoalId) {
        set({ currentGoalSlipInsight: await slipInsightFor(openGoalId) })
      }
      return rescheduled.length
    },

    // Hard-deadline scope-cut escalation. Thin orchestration like the other AI
    // actions (assemble context → provider → pure parser), plus a store-side
    // `behindSummary` built from the goal's projection. READ-ONLY: it returns the
    // proposal for the user to review; applyScopeCut does the writing.
    generateScopeCutProposal: async (goalId) => {
      const tree = await getGoalTree(goalId)
      if (!tree) return null
      const goal = tree.goal

      const progress = goalProgressFromTree(tree)
      const projection = computeGoalProjection(
        goal.createdAt,
        goal.targetDate,
        progress,
        new Date(),
      )
      const behindSummary = describeBehind(projection, goal.targetDate)

      const [userContext, goalContext, strategyBrief, digest] = await Promise.all([
        loadAIUserContext(),
        loadAIGoalContext(goalId),
        getStrategyBrief(goalId),
        roadmapDigestFor(goalId),
      ])
      const response = await aiProvider.complete(
        buildScopeCutPrompt({
          goalId,
          goalTitle: goal.title,
          goalDescription: goal.description,
          goalCategory: goal.category,
          targetDate: goal.targetDate,
          behindSummary,
          userContext,
          goalContext,
          strategyBrief,
          digest,
        }),
      )
      return parseScopeCut(response)
    },

    // Enact the approved suggestions. Each is resolved against a FRESH tree read per
    // iteration, so a suggestion whose target a prior 'cut' already removed simply
    // fails to match (reported as unmatched) instead of acting on a stale id.
    applyScopeCut: async (goalId, suggestions) => {
      const result: ScopeCutApplyResult = {
        deferred: 0,
        cut: 0,
        compressAdvised: 0,
        unmatched: [],
      }

      for (const suggestion of suggestions) {
        // 'compress' ("do less") has no safe mechanical definition — never auto-trim
        // the user's tasks; count it as advice for them to act on by hand.
        if (suggestion.action === 'compress') {
          result.compressAdvised += 1
          continue
        }

        const tree = await getGoalTree(goalId)
        if (!tree) break
        const match = resolveScopeCutTarget(tree, suggestion.target)
        if (!match) {
          result.unmatched.push(suggestion.target)
          continue
        }

        if (suggestion.action === 'cut') {
          if (match.kind === 'subgoal') {
            // removeSubgoal cascades its milestones + tasks + dependency edges.
            await get().removeSubgoal(match.id)
          } else {
            // A cut phase leaves no orphan loose work: delete its tasks first, then
            // remove the milestone (removeMilestone would otherwise re-home them).
            for (const taskId of match.taskIds) await deleteTask(taskId)
            await get().removeMilestone(match.id)
          }
          result.cut += 1
        } else {
          // 'defer' — unschedule the incomplete tasks so they fall into the undated
          // "Later" backlog (kept, off the dated plan). Clearing scheduledDate drops
          // them from the date index; the structure stays intact and reversible.
          for (const taskId of match.incompleteTaskIds) {
            await updateTask(taskId, { scheduledDate: undefined })
          }
          result.deferred += 1
        }
      }

      // removeSubgoal/removeMilestone refresh as they go, but a 'defer' only calls
      // updateTask (no refresh), so settle every touched surface once at the end.
      await settleRefreshes([
        refreshCurrentTree(),
        refreshDashboard(),
        refreshCrossGoal(),
      ])
      return result
    },
  }
})