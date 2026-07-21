// database/migration/fromRows.ts — PURE mappers from the snake_case Postgres row
// shapes (supabase/migrations/0002_app_data.sql) BACK to the app's camelCase domain
// objects. The exact inverse of toRows.ts, and the read half of the repository port
// (ADR-0003 step 3): every cloud READ passes its rows through here so the engine /
// store / UI receive objects indistinguishable from what Dexie returns.
//
// Two rules mirror toRows.ts in reverse:
//  • Postgres returns NULL for an absent optional; Dexie holds it as `undefined`. So
//    every nullable column is mapped `?? undefined`, keeping the domain shape (and
//    checks like `task.milestoneId === undefined`) identical across both backends.
//  • user_id is dropped — it is a storage/RLS concern the domain objects never carry.
//
// Kept pure and separate (like toRows) so the field-by-field translation is unit-
// tested without a database (fromRows.test.ts), including a round-trip against toRows.

import type {
  Goal,
  Subgoal,
  Milestone,
  Task,
  Dependency,
  UserProfile,
  UserContext,
  GoalContext,
  ProgressSnapshot,
  Opportunity,
  SlipEvent,
  StrategyBrief,
} from '@/core/types'

// The single-row-per-user tables drop their local fixed id in toRows; we restore the
// same sentinel ids here so the returned objects match the Dexie rows exactly. These
// mirror PROFILE_ID / USER_CONTEXT_ID in the repositories (kept as literals to avoid a
// repository→mapper import cycle).
const PROFILE_ROW_ID = 'me'
const USER_CONTEXT_ROW_ID = 'me'

// Loosely-typed row inputs: PostgREST returns plain JSON objects. We read named
// columns off them and trust the schema/toRows contract, exactly as importToSupabase
// trusts it in the other direction.
type Row = Record<string, unknown>

export function goalFromRow(r: Row): Goal {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    category: r.category as Goal['category'],
    targetDate: r.target_date as string,
    status: r.status as Goal['status'],
    priority: r.priority as Goal['priority'],
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function subgoalFromRow(r: Row): Subgoal {
  return {
    id: r.id as string,
    goalId: r.goal_id as string,
    title: r.title as string,
    description: r.description as string,
    targetDate: (r.target_date as string | null) ?? undefined,
    status: r.status as Subgoal['status'],
    requiresConsistency: r.requires_consistency as boolean,
    estimatedDailyMinutes: (r.estimated_daily_minutes as number | null) ?? undefined,
    order: r.order as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function milestoneFromRow(r: Row): Milestone {
  return {
    id: r.id as string,
    subgoalId: r.subgoal_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? undefined,
    status: r.status as Milestone['status'],
    order: r.order as number,
    aiSuggested: r.ai_suggested as boolean,
    completedAt: (r.completed_at as string | null) ?? undefined,
    createdAt: r.created_at as string,
  }
}

export function taskFromRow(r: Row): Task {
  return {
    id: r.id as string,
    subgoalId: r.subgoal_id as string,
    milestoneId: (r.milestone_id as string | null) ?? undefined,
    title: r.title as string,
    description: (r.description as string | null) ?? undefined,
    status: r.status as Task['status'],
    priority: r.priority as Task['priority'],
    dueDate: (r.due_date as string | null) ?? undefined,
    scheduledDate: (r.scheduled_date as string | null) ?? undefined,
    estimatedMinutes: (r.estimated_minutes as number | null) ?? undefined,
    effort: (r.effort as Task['effort'] | null) ?? undefined,
    isRecurring: r.is_recurring as boolean,
    completedAt: (r.completed_at as string | null) ?? undefined,
    rescheduleCount: (r.reschedule_count as number | null) ?? 0,
    order: r.order as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function dependencyFromRow(r: Row): Dependency {
  return {
    id: r.id as string,
    fromId: r.from_id as string,
    toId: r.to_id as string,
    type: r.type as Dependency['type'],
    createdAt: r.created_at as string,
  }
}

// Single-row-per-user: user_id is dropped, the local 'me' id restored.
export function userProfileFromRow(r: Row): UserProfile {
  return {
    id: PROFILE_ROW_ID,
    name: r.name as string,
    availableHoursPerDay: r.available_hours_per_day as number,
    timezone: r.timezone as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function userContextFromRow(r: Row): UserContext {
  return {
    id: USER_CONTEXT_ROW_ID,
    situation: r.situation as UserContext['situation'],
    situationDetail: (r.situation_detail as string | null) ?? undefined,
    lightDays: (r.light_days as number[] | null) ?? [],
    bestTimeOfDay: r.best_time_of_day as UserContext['bestTimeOfDay'],
    workRhythm: r.work_rhythm as UserContext['workRhythm'],
    about: (r.about as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function goalContextFromRow(r: Row): GoalContext {
  return {
    goalId: r.goal_id as string,
    successDefinition: (r.success_definition as string | null) ?? undefined,
    startingLevel: (r.starting_level as string | null) ?? undefined,
    priorExperience: (r.prior_experience as string | null) ?? undefined,
    deadlineHardness: r.deadline_hardness as GoalContext['deadlineHardness'],
    motivation: (r.motivation as string | null) ?? undefined,
    learnings: (r.learnings as string | null) ?? undefined,
    // jsonb → object (or undefined when the column is NULL).
    strategyBrief: (r.strategy_brief as StrategyBrief | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export function snapshotFromRow(r: Row): ProgressSnapshot {
  return {
    id: r.id as string,
    goalId: r.goal_id as string,
    capturedAt: r.captured_at as string,
    goalProgressPercent: r.goal_progress_percent as number,
    completedTaskCount: r.completed_task_count as number,
    totalTaskCount: r.total_task_count as number,
    completedMilestoneCount: r.completed_milestone_count as number,
    totalMilestoneCount: r.total_milestone_count as number,
  }
}

export function slipEventFromRow(r: Row): SlipEvent {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    goalId: r.goal_id as string,
    reason: r.reason as SlipEvent['reason'],
    at: r.at as string,
  }
}

export function opportunityFromRow(r: Row): Opportunity {
  return {
    id: r.id as string,
    type: r.type as Opportunity['type'],
    title: r.title as string,
    organization: r.organization as string,
    description: r.description as string,
    deadline: (r.deadline as string | null) ?? undefined,
    startDate: (r.start_date as string | null) ?? undefined,
    endDate: (r.end_date as string | null) ?? undefined,
    url: r.url as string,
    location: (r.location as string | null) ?? undefined,
    relevanceScore: (r.relevance_score as number | null) ?? undefined,
    matchedGoalIds: (r.matched_goal_ids as string[] | null) ?? [],
    tags: (r.tags as string[] | null) ?? [],
    source: r.source as Opportunity['source'],
    addedToRoadmap: r.added_to_roadmap as boolean,
    dismissed: r.dismissed as boolean,
    savedAt: r.saved_at as string,
  }
}
