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

// Per-goal intake — captured when a goal is created, editable when it is edited.
// One row per goal (goalId is the primary key). This is what makes two people
// with the SAME goal get DIFFERENT roadmaps: same target, different starting point.
export interface GoalContext {
  goalId: ID;
  // Where the user is starting from on this specific goal (current level).
  startingLevel?: string;
  // What they have already done toward it.
  priorExperience?: string;
  // Whether the target date is fixed (see DeadlineHardness).
  deadlineHardness: DeadlineHardness;
  // Why it matters — also fuels the "why it matters" framing elsewhere.
  motivation?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
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