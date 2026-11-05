// database/migration/toRows.ts — PURE mappers from the app's camelCase domain
// objects (as stored in Dexie) to the snake_case Postgres row shapes defined in
// supabase/migrations/0002_app_data.sql.
//
// Kept pure and separate from the importer (importToSupabase.ts) precisely because
// this field-by-field translation is the part most prone to silent mistakes — a
// mistyped column name or a dropped optional would corrupt the migrated copy. As
// pure functions they are unit-tested (toRows.test.ts) without any DB.
//
// Two deliberate omissions in every row:
//  • user_id — never sent; the column defaults to auth.uid() server-side, so the
//    signed-in caller's id is filled by Postgres and can't be spoofed.
//  • undefined optionals are passed through as-is; supabase-js serialises an absent
//    optional to SQL NULL, matching the nullable columns.

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
} from '@/core/types'

export function goalToRow(g: Goal) {
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    target_date: g.targetDate,
    status: g.status,
    priority: g.priority,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
  }
}

export function subgoalToRow(s: Subgoal) {
  return {
    id: s.id,
    goal_id: s.goalId,
    title: s.title,
    description: s.description,
    target_date: s.targetDate ?? null,
    status: s.status,
    requires_consistency: s.requiresConsistency,
    estimated_daily_minutes: s.estimatedDailyMinutes ?? null,
    order: s.order,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  }
}

export function milestoneToRow(m: Milestone) {
  return {
    id: m.id,
    subgoal_id: m.subgoalId,
    title: m.title,
    description: m.description ?? null,
    status: m.status,
    order: m.order,
    ai_suggested: m.aiSuggested,
    completed_at: m.completedAt ?? null,
    created_at: m.createdAt,
  }
}

export function taskToRow(t: Task) {
  return {
    id: t.id,
    subgoal_id: t.subgoalId,
    milestone_id: t.milestoneId ?? null,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    due_date: t.dueDate ?? null,
    scheduled_date: t.scheduledDate ?? null,
    estimated_minutes: t.estimatedMinutes ?? null,
    effort: t.effort ?? null,
    is_recurring: t.isRecurring,
    completed_at: t.completedAt ?? null,
    reschedule_count: t.rescheduleCount ?? 0,
    order: t.order,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }
}

export function dependencyToRow(d: Dependency) {
  return {
    id: d.id,
    from_id: d.fromId,
    to_id: d.toId,
    type: d.type,
    created_at: d.createdAt,
  }
}

// Single-row-per-user: the local 'me' id is dropped; user_id (the PK) defaults to
// auth.uid() server-side, so it too is omitted here.
export function userProfileToRow(p: UserProfile) {
  return {
    name: p.name,
    available_hours_per_day: p.availableHoursPerDay,
    timezone: p.timezone,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }
}

export function userContextToRow(c: UserContext) {
  return {
    situation: c.situation,
    situation_detail: c.situationDetail ?? null,
    light_days: c.lightDays,
    best_time_of_day: c.bestTimeOfDay,
    work_rhythm: c.workRhythm,
    about: c.about ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

export function goalContextToRow(c: GoalContext) {
  return {
    goal_id: c.goalId,
    success_definition: c.successDefinition ?? null,
    starting_level: c.startingLevel ?? null,
    prior_experience: c.priorExperience ?? null,
    deadline_hardness: c.deadlineHardness,
    motivation: c.motivation ?? null,
    learnings: c.learnings ?? null,
    // Stored as jsonb; supabase-js serialises the object directly.
    strategy_brief: c.strategyBrief ?? null,
    source_document: c.sourceDocument ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }
}

export function snapshotToRow(s: ProgressSnapshot) {
  return {
    id: s.id,
    goal_id: s.goalId,
    captured_at: s.capturedAt,
    goal_progress_percent: s.goalProgressPercent,
    completed_task_count: s.completedTaskCount,
    total_task_count: s.totalTaskCount,
    completed_milestone_count: s.completedMilestoneCount,
    total_milestone_count: s.totalMilestoneCount,
  }
}

export function slipEventToRow(e: SlipEvent) {
  return {
    id: e.id,
    task_id: e.taskId,
    goal_id: e.goalId,
    reason: e.reason,
    at: e.at,
  }
}

export function opportunityToRow(o: Opportunity) {
  return {
    id: o.id,
    type: o.type,
    title: o.title,
    organization: o.organization,
    description: o.description,
    deadline: o.deadline ?? null,
    start_date: o.startDate ?? null,
    end_date: o.endDate ?? null,
    url: o.url,
    location: o.location ?? null,
    relevance_score: o.relevanceScore ?? null,
    matched_goal_ids: o.matchedGoalIds,
    tags: o.tags,
    source: o.source,
    added_to_roadmap: o.addedToRoadmap,
    dismissed: o.dismissed,
    saved_at: o.savedAt,
  }
}
