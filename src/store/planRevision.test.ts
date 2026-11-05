// End-to-end for plan revision ("something changed").
//
// The risky part of this feature is not proposing changes — it is APPLYING them.
// Every action mutates a plan the user has already put work into, so these tests
// pin the destructive boundaries: what each action touches, what it must leave
// alone, and that completed work is never collateral damage.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import {
  createGoal,
  createMilestone,
  createSubgoal,
  createTask,
  getGoalTree,
  getTasksByMilestoneId,
} from '@/database/repositories'
import { useGoalStore } from './useGoalStore'

beforeEach(async () => {
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.milestones.clear(),
    db.tasks.clear(),
    db.goalContext.clear(),
    db.dependencies.clear(),
  ])
  useGoalStore.setState({ currentGoalTree: null })
})

// A goal with one track, one phase, and a mix of finished and unfinished work —
// enough to tell "cleared the stale work" from "erased my progress".
async function seedGoal() {
  const goal = await createGoal({
    title: 'Learn data analysis',
    description: '',
    category: 'skills',
    targetDate: '2030-01-01',
    status: 'active',
    priority: 'medium',
  })
  const subgoal = await createSubgoal({
    goalId: goal.id,
    title: 'Pandas fundamentals',
    description: '',
    status: 'active',
    requiresConsistency: false,
    order: 0,
  })
  const milestone = await createMilestone({
    subgoalId: subgoal.id,
    title: 'Core practice',
    status: 'active',
    order: 0,
    aiSuggested: true,
  })
  const done = await createTask({
    subgoalId: subgoal.id,
    milestoneId: milestone.id,
    title: 'Finished lesson',
    status: 'completed',
    completedAt: new Date().toISOString(),
    priority: 'medium',
    isRecurring: false,
    scheduledDate: '2026-08-01',
    order: 0,
  })
  const open = await createTask({
    subgoalId: subgoal.id,
    milestoneId: milestone.id,
    title: 'Unfinished lesson',
    status: 'pending',
    priority: 'medium',
    isRecurring: false,
    scheduledDate: '2026-08-20',
    order: 1,
  })
  return { goal, subgoal, milestone, done, open }
}

describe('generatePlanRevisionProposal', () => {
  it('returns null for an empty change note without calling the provider', async () => {
    const { goal } = await seedGoal()
    expect(
      await useGoalStore.getState().generatePlanRevisionProposal(goal.id, '   '),
    ).toBeNull()
  })

  it('produces a proposal from a real change note', async () => {
    const { goal } = await seedGoal()
    const proposal = await useGoalStore
      .getState()
      .generatePlanRevisionProposal(goal.id, 'The course switched to Rust')
    expect(proposal).not.toBeNull()
    expect(proposal!.summary.length).toBeGreaterThan(0)
  })

  it('writes nothing — proposing is read-only', async () => {
    const { goal } = await seedGoal()
    const before = await db.tasks.count()
    await useGoalStore
      .getState()
      .generatePlanRevisionProposal(goal.id, 'The course switched to Rust')
    expect(await db.tasks.count()).toBe(before)
  })
})

describe('applyPlanRevision', () => {
  it('replan clears UNFINISHED work but keeps completed work and the phase itself', async () => {
    const { goal, milestone, done } = await seedGoal()

    const result = await useGoalStore
      .getState()
      .applyPlanRevision(goal.id, 'Switched to Rust', [
        { target: 'Core practice', action: 'replan', rationale: '' },
      ])

    expect(result.replanned).toBe(1)
    const remaining = await getTasksByMilestoneId(milestone.id)
    // The finished lesson survives — it is history, and erasing it would both lose
    // real progress and silently change the goal's completion.
    expect(remaining.map((t) => t.id)).toEqual([done.id])
    // The phase itself is still there, so it keeps its place in the structure and
    // can be expanded again from the revised direction.
    const tree = await getGoalTree(goal.id)
    expect(tree!.subgoals[0].milestones).toHaveLength(1)
  })

  it('defer unschedules unfinished work instead of deleting it', async () => {
    const { goal, milestone, open } = await seedGoal()

    const result = await useGoalStore
      .getState()
      .applyPlanRevision(goal.id, 'Busy at work for a month', [
        { target: 'Core practice', action: 'defer', rationale: '' },
      ])

    expect(result.deferred).toBe(1)
    const tasks = await getTasksByMilestoneId(milestone.id)
    expect(tasks).toHaveLength(2) // nothing deleted
    const deferred = tasks.find((t) => t.id === open.id)!
    expect(deferred.scheduledDate).toBeUndefined() // dropped to the undated backlog
  })

  it('drop removes a track and everything under it', async () => {
    const { goal } = await seedGoal()

    const result = await useGoalStore
      .getState()
      .applyPlanRevision(goal.id, 'No longer doing any Python', [
        { target: 'Pandas fundamentals', action: 'drop', rationale: '' },
      ])

    expect(result.dropped).toBe(1)
    const tree = await getGoalTree(goal.id)
    expect(tree!.subgoals).toHaveLength(0)
    expect(await db.tasks.count()).toBe(0)
    expect(await db.milestones.count()).toBe(0)
  })

  it('reports an unmatched target instead of guessing at one', async () => {
    const { goal } = await seedGoal()

    const result = await useGoalStore
      .getState()
      .applyPlanRevision(goal.id, 'Something changed', [
        { target: 'A track that does not exist', action: 'drop', rationale: '' },
      ])

    expect(result.dropped).toBe(0)
    expect(result.unmatched).toEqual(['A track that does not exist'])
    // Nothing was touched on a miss.
    const tree = await getGoalTree(goal.id)
    expect(tree!.subgoals).toHaveLength(1)
    expect(await db.tasks.count()).toBe(2)
  })

  it('folds the change into the goal Direction so future plans account for it', async () => {
    const { goal } = await seedGoal()

    const result = await useGoalStore
      .getState()
      .applyPlanRevision(goal.id, 'The course switched from Python to Rust', [])

    // Applying no suggestions is legitimate ("nothing to change, but remember this").
    expect(result.directionUpdated).toBe(true)
    const context = await db.goalContext.get(goal.id)
    expect(context?.strategyBrief).toBeDefined()
  })

  it('applies an empty approval set without touching the plan', async () => {
    const { goal } = await seedGoal()
    const result = await useGoalStore
      .getState()
      .applyPlanRevision(goal.id, 'Minor update', [])

    expect(result.dropped + result.deferred + result.replanned).toBe(0)
    expect(await db.tasks.count()).toBe(2)
  })
})
