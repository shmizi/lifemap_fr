// Application-wide constants.
// Never use magic strings or numbers directly in components — import from here.

import type { GoalCategory, GoalStatus, Priority } from '@/core/types';

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