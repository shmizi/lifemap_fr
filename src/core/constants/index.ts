// Application-wide constants.
// Never use magic strings or numbers directly in components — import from here.

import type {
  GoalCategory,
  GoalStatus,
  Priority,
  EffortSize,
  SubgoalStatus,
  MilestoneStatus,
  TaskStatus,
} from '@/core/types';

export const APP_NAME = 'LifeMap' as const;

// Route paths — used in router config and navigation links
export const ROUTES = {
  DASHBOARD:   '/',
  GOALS:       '/goals',
  GOAL_DETAIL: '/goals/:id',
  ROADMAP:     '/roadmap',
  REVIEWS:     '/reviews',
  SETTINGS:    '/settings',
} as const;

// Helper to build goal detail path with a real ID
export const goalDetailPath = (id: string) => `/goals/${id}`;

// Default values for a new user profile
export const DEFAULT_USER_PROFILE = {
  availableHoursPerDay: 4,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
} as const;

// ─── Goal creation (Phase 1) ─────────────────────────────────────────────────
// Human-readable labels for each goal category, kept here so the creation form
// (and any future filter UI) never hardcodes category strings. `value` is the
// canonical GoalCategory stored in the database; `label` is display-only.
export const GOAL_CATEGORY_OPTIONS: ReadonlyArray<{
  value: GoalCategory;
  label: string;
}> = [
  { value: 'education', label: 'Education' },
  { value: 'career',    label: 'Career' },
  { value: 'health',    label: 'Health' },
  { value: 'skills',    label: 'Skills' },
  { value: 'personal',  label: 'Personal' },
  { value: 'financial', label: 'Financial' },
  { value: 'other',     label: 'Other' },
];

// A new goal starts active with medium priority. The Phase 1 creation form only
// asks for title, category, target date, and description, so status and priority
// use these defaults until a later phase exposes them in the UI.
export const DEFAULT_GOAL_STATUS: GoalStatus = 'active';
export const DEFAULT_GOAL_PRIORITY: Priority = 'medium';

// A new subgoal starts 'active' (parity with new goals). The Phase 1 creation
// form asks only for title, description, and an optional target date; status,
// requiresConsistency, and order are filled by the store/defaults until later
// phases expose them.
export const DEFAULT_SUBGOAL_STATUS: SubgoalStatus = 'active';

// A new milestone defaults to 'active' (available to work on). 'locked' is
// PARKED, not used: Phase 3 dependencies are SOFT (they strengthen, they do not
// block), so nothing hard-locks a milestone today and no code sets this status.
// It is deliberately kept in the model as a future escape hatch for an explicit
// hard-prerequisite mode — and is never something the user picks at creation.
export const DEFAULT_MILESTONE_STATUS: MilestoneStatus = 'active';

// A new task starts 'pending' at 'medium' priority, not recurring. The creation
// form lets the user override priority and set a due date; the rest default.
export const DEFAULT_TASK_STATUS: TaskStatus = 'pending';
export const DEFAULT_TASK_PRIORITY: Priority = 'medium';
// New tasks default to medium effort — the same size that an unset task is
// weighted as, so the creation default and the momentum fallback agree.
export const DEFAULT_TASK_EFFORT: EffortSize = 'M';

// Ordered options for the priority <select> (low -> critical). Kept as an array
// (not derived from PRIORITY_LABELS) so the display order is explicit.
export const PRIORITY_OPTIONS: ReadonlyArray<{
  value: Priority;
  label: string;
}> = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
];

// ─── Effort sizing (Phase 2 — effort-based momentum) ─────────────────────────
// Coarse task-size categories and their relative weights. Momentum on the
// dashboard sums these weights ("how much work", not "how many tasks"). The
// weights are intentionally super-linear (XL is worth 8 XS, not 5) so a single
// big task registers as the meaningful effort it is. A task with no effort set
// counts as DEFAULT_EFFORT_WEIGHT so legacy/quick-add tasks still contribute and
// don't distort the percentage.
export const EFFORT_WEIGHTS: Record<EffortSize, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
};

export const DEFAULT_EFFORT_WEIGHT: number = EFFORT_WEIGHTS.M;

// Ordered options for the effort <select> (smallest -> largest), mirroring
// PRIORITY_OPTIONS. Labels pair the short code with a plain-language size.
export const EFFORT_OPTIONS: ReadonlyArray<{
  value: EffortSize;
  label: string;
}> = [
  { value: 'XS', label: 'XS - tiny' },
  { value: 'S',  label: 'S - small' },
  { value: 'M',  label: 'M - medium' },
  { value: 'L',  label: 'L - large' },
  { value: 'XL', label: 'XL - huge' },
];

// ─── Status & priority display labels (Phase 1) ──────────────────────────────
// Map the canonical stored enum values to human-readable text, so display code
// (the Goal Detail View, and later the dashboard) never hardcodes label strings.
// These are display-only; the values stored in the database are the keys.
export const SUBGOAL_STATUS_LABELS: Record<SubgoalStatus, string> = {
  not_started: 'Not started',
  active:      'Active',
  completed:   'Completed',
  at_risk:     'At risk',
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  locked:    'Locked',
  active:    'Active',
  completed: 'Completed',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending:     'Pending',
  in_progress: 'In progress',
  completed:   'Completed',
  skipped:     'Skipped',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low:      'Low',
  medium:   'Medium',
  high:     'High',
  critical: 'Critical',
};