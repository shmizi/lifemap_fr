// Canonical data models for LifeMap.
// These are the single source of truth for the entire app's data shapes.
// Every layer (database, engine, store, UI) imports from here.
// Do not alter these without updating the database schema and migrations.

export type ID = string;
export type ISODate = string;

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type SubgoalStatus = 'not_started' | 'active' | 'completed' | 'at_risk';
export type MilestoneStatus = 'locked' | 'active' | 'completed';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
// Coarse, closed effort category for a task — a quick "how big is this" pick,
// NOT a precise time estimate (that is `estimatedMinutes`, which stays separate).
// Used to weight the dashboard's effort-based momentum. See EFFORT_WEIGHTS.
export type EffortSize = 'XS' | 'S' | 'M' | 'L' | 'XL';
export type GoalCategory =
  | 'education' | 'career' | 'health'
  | 'skills' | 'personal' | 'financial' | 'other';

export interface Goal {
  id: ID;
  title: string;
  description: string;
  category: GoalCategory;
  targetDate: ISODate;
  status: GoalStatus;
  priority: Priority;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Subgoal {
  id: ID;
  goalId: ID;
  title: string;
  description: string;
  targetDate?: ISODate;
  status: SubgoalStatus;
  requiresConsistency: boolean;
  estimatedDailyMinutes?: number;
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Milestone {
  id: ID;
  subgoalId: ID;
  title: string;
  description?: string;
  status: MilestoneStatus;
  order: number;
  aiSuggested: boolean;
  completedAt?: ISODate;
  createdAt: ISODate;
}

export interface Task {
  id: ID;
  subgoalId: ID;
  milestoneId?: ID;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueDate?: ISODate;
  scheduledDate?: ISODate;
  estimatedMinutes?: number;           // precise time estimate (reserved; AI scheduling)
  effort?: EffortSize;                 // coarse size for effort-based momentum weighting
  isRecurring: boolean;
  completedAt?: ISODate;
  // Durable slip history: how many times this task was pulled forward from overdue
  // by a reschedule. Monotonic — set by the reschedule actions and never cleared by
  // completing the task, so it survives catch-up. This is what lets Reliability
  // (engine/health/computeReliability) remember a slip a reschedule would otherwise
  // hide (it rewrites scheduledDate). Absent/0 for a task that has never slipped.
  rescheduleCount?: number;
  order: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Dependency {
  id: ID;
  fromId: ID;
  toId: ID;
  type: 'subgoal' | 'task';
  createdAt: ISODate;
}

// Why a task slipped, captured when it is rescheduled (Stage 3 of the health model).
// 'unspecified' is the value stored when the user skips the reason prompt, so the
// event log stays complete (a skip is still a slip) while the pattern engine simply
// ignores unspecified reasons. The five real reasons drive the pattern insights.
export type SlipReason =
  | 'higher_priority' // more urgent work bumped it
  | 'no_time'         // ran out of time / over-committed
  | 'not_motivated'   // didn't feel like it
  | 'dependency'      // waiting on a prerequisite
  | 'external'        // a blocker outside the user's control
  | 'unspecified';    // the user skipped the prompt

// One durable slip record: a task was pulled forward from overdue at time `at`, for
// `reason`. Distinct from Task.rescheduleCount (a scalar tally) — this is the EVENT
// LOG, so the pattern engine can window by time ("this month") and group by reason.
// One row per task moved per reschedule; `goalId` is denormalised for direct grouping.
export interface SlipEvent {
  id: ID;
  taskId: ID;
  goalId: ID;
  reason: SlipReason;
  at: ISODate;
}

export interface UserProfile {
  id: ID;
  name: string;
  availableHoursPerDay: number;
  timezone: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ProgressSnapshot {
  id: ID;
  goalId: ID;
  capturedAt: ISODate;
  goalProgressPercent: number;
  completedTaskCount: number;
  totalTaskCount: number;
  completedMilestoneCount: number;
  totalMilestoneCount: number;
}

// Phase 6+ — Opportunity Discovery
export type OpportunityType =
  | 'internship' | 'hackathon' | 'scholarship'
  | 'conference' | 'competition' | 'program' | 'other';

export type OpportunitySource = 'ai_search' | 'manual';

export interface Opportunity {
  id: ID;
  type: OpportunityType;
  title: string;
  organization: string;
  description: string;
  deadline?: ISODate;
  startDate?: ISODate;
  endDate?: ISODate;
  url: string;
  location?: string;
  relevanceScore?: number;
  matchedGoalIds: ID[];
  tags: string[];
  source: OpportunitySource;
  addedToRoadmap: boolean;
  dismissed: boolean;
  savedAt: ISODate;
}

// ─── Phase 9 — AI personalization context (NEW; NOT part of the canonical
// models above) ──────────────────────────────────────────────────────────────
// These power AI-tailored roadmaps. They are kept deliberately SEPARATE from
// UserProfile / Goal (which stay untouched) and live in their own tables
// (userContext / goalContext), persisted via contextRepository. Same per-entity
// timestamp contract as UserProfile (createdAt set once, updatedAt every save).
// Only the primary key is indexed; closed-vocabulary / array / optional fields
// are filtered in memory, where record counts are tiny.

// How the user is mostly spending their days — coarse, for AI pacing context.
export type LifeSituation = 'student' | 'working' | 'both' | 'other';
// When in the day they focus best — informs how the AI suggests scheduling.
export type TimeOfDay = 'morning' | 'evening' | 'flexible';
// How the user likes to work — steady cadence vs. bursts.
export type WorkRhythm = 'structured' | 'flexible';
// Whether a goal's target date can move. A HARD deadline cannot be managed by
// slipping the date — missing it means missing the goal — so the AI must
// front-load/intensify and the health card must never suggest moving it.
export type DeadlineHardness = 'hard' | 'soft';

// The user's standing "about me" context — collected once at first run, editable
// in Settings, fed into every AI prompt. SINGLE-ROW (fixed id, like UserProfile);
// name / availableHoursPerDay / timezone deliberately stay in UserProfile and are
// NOT duplicated here.
export interface UserContext {
  id: ID;
  situation: LifeSituation;
  situationDetail?: string;
  // Weekday indices (0 = Sunday .. 6 = Saturday) with little/no capacity. Feeds
  // both AI pacing and the capacity day-packer (step 4).
  lightDays: number[];
  bestTimeOfDay: TimeOfDay;
  workRhythm: WorkRhythm;
  // Free text: strengths, constraints, past wins — anything the AI should know.
  about?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// One ranked priority inside a StrategyBrief: what to focus on, and the one-line
// reason it earns its rank.
export interface StrategyPriority {
  title: string;
  rationale: string;
}

// The durable "Direction-layer" output for a goal (Phase 10): the coach's read on
// what the real target is and what matters most, produced BEFORE any task
// breakdown and then stored so every later generation plans against the SAME
// strategy. Lives here (core/types) rather than in engine/ai because it is
// PERSISTED — it hangs off GoalContext below. Kept small and text-forward on
// purpose: it is fed back into later prompts as a compact context block, so its
// size must stay ~constant no matter how large the roadmap grows. The pure prompt
// builder / parser that produce it live in engine/ai (which re-exports this type).
export interface StrategyBrief {
  // A crisp one-sentence restatement of the real target (may sharpen a vague goal).
  sharpenedTarget: string;
  // The guiding narrative/identity that ties the work together; '' when none fits.
  theme: string;
  // What matters most, most-important first. A handful, never a long list.
  priorities: StrategyPriority[];
  // Tradeoffs weighed, constraints, and decisions captured — short lines, no prose.
  notes: string[];
}

// Per-goal intake — captured when a goal is created, editable when it is edited.
// One row per goal (goalId is the primary key). This is what makes two people
// with the SAME goal get DIFFERENT roadmaps: same target, different starting point.
export interface GoalContext {
  goalId: ID;
  // What ACHIEVING the goal actually means — the concrete finish line / definition
  // of done, distinct from `Goal.description` (what it is) and `motivation` (why it
  // matters emotionally). This is the destination the AI plans TOWARD, so a vague
  // goal still gets a sharp target. Optional; empty until the user fills it in.
  successDefinition?: string;
  // Where the user is starting from on this specific goal (current level).
  startingLevel?: string;
  // What they have already done toward it.
  priorExperience?: string;
  // Whether the target date is fixed (see DeadlineHardness).
  deadlineHardness: DeadlineHardness;
  // Why it matters — also fuels the "why it matters" framing elsewhere.
  motivation?: string;
  // A LIVING note the user grows while working the goal ("what I've learned"):
  // constraints discovered, direction that sharpened, dead ends. Fed into every AI
  // call so future generations adapt as understanding evolves — this is how a vague
  // goal refines "on the way" without an explicit re-sharpen ritual.
  learnings?: string;
  // Phase 10: the goal's generated Strategy Brief (Direction layer). Optional —
  // absent until it has been generated. Stored on this same per-goal row (no new
  // table, no index) so a goal's intake and its strategy live together.
  strategyBrief?: StrategyBrief;
  // A reference document the user attached (syllabus, job spec, training plan).
  // Stored DISTILLED, never raw — see SourceDocument. Same row as the rest of the
  // intake, following the strategyBrief precedent.
  sourceDocument?: SourceDocument;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// A user-supplied document, reduced to something a prompt can afford to carry.
//
// WHY ONLY THE SUMMARY IS KEPT: the goal's context is rendered into EVERY AI call —
// brief, structure, subgoals, milestones, every rolling daily plan and top-up. A
// raw 40-page syllabus on that path would multiply the cost of every generation
// forever, and the roadmap digest was deliberately built bounded so rolling calls
// stay flat-cost. So the document is distilled ONCE on upload and only the distillate
// is persisted; the original text is never stored and never re-sent.
export interface SourceDocument {
  // Original filename, shown so the user knows what is attached.
  name: string;
  // The distillate: the constraints, requirements, dates and topics worth planning
  // around. This is what reaches the prompts.
  summary: string;
  // Size of the ORIGINAL text, so the UI can show what was condensed.
  originalChars: number;
  addedAt: ISODate;
}

// ─── View-model tree types (Phase 1, Session 5) ──────────────────────────────
// READ-ONLY display shapes. These are NEVER persisted to the database — they are
// assembled in memory (see hierarchyRepository.getGoalTree) so a screen like the
// Goal Detail View receives ONE fully-typed nested object instead of making
// multiple store calls and re-reconstructing parent-child relationships in the
// component. Keeping the assembled shape typed here lets the UI stay dumb.

export interface TaskTree {
  task: Task;
}

export interface MilestoneTree {
  milestone: Milestone;
  tasks: Task[];
}

export interface SubgoalTree {
  subgoal: Subgoal;
  milestones: MilestoneTree[]; // milestones of this subgoal, each with its tasks
  looseTasks: Task[];          // tasks with no milestoneId, directly under subgoal
}

export interface GoalTree {
  goal: Goal;
  subgoals: SubgoalTree[];
}

// A task's "why it matters" lineage: the subgoal and goal it rolls up to.
// READ-ONLY display shape, never persisted. Resolved in memory (see
// hierarchyRepository.getTaskLineages) so a dashboard task can show "Subgoal ·
// Goal" context without the UI fetching and joining parents itself. The lineage
// is identical for every task under the same subgoal, so callers key it by
// subgoalId and dedupe to one lookup per subgoal.
export interface TaskLineage {
  subgoalTitle: string;
  goalTitle: string;
}