// Application-wide constants.
// Never use magic strings or numbers directly in components — import from here.

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
