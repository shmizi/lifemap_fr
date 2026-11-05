// Regression test for cross-goal overcommitment.
//
// availableHoursPerDay used to be applied per GENERATION rather than per DAY: each
// goal was planned against an empty calendar, so N goals produced N plans that each
// filled the whole day. The engines were individually correct — every one of them
// was simply told the calendar was empty.
//
// So these tests exercise the STORE seam where the capacity map is assembled and
// handed to the schedulers, not the engines (which have their own unit tests).

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { db } from '@/database/db'
import { createGoal, createSubgoal, createTask, getAllTasks } from '@/database/repositories'
import { computeCommittedMinutesByDay } from '@/engine/planning/committedMinutes'
import { useGoalStore } from './useGoalStore'

const DAY = 'yyyy-MM-dd'
const today = () => format(new Date(), DAY)
const dayFromNow = (n: number) => format(addDays(new Date(), n), DAY)

beforeEach(async () => {
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.tasks.clear(),
    db.profile.clear(),
  ])
  useGoalStore.setState({ overcommittedDays: [], dailyBudgetMinutes: 240 })
})

async function seedSubgoal(title: string) {
  const goal = await createGoal({
    title,
    description: '',
    category: 'skills',
    targetDate: dayFromNow(120),
    status: 'active',
    priority: 'medium',
  })
  const subgoal = await createSubgoal({
    goalId: goal.id,
    title: `${title} track`,
    description: '',
    status: 'active',
    requiresConsistency: false,
    order: 0,
  })
  return { goal, subgoal }
}

// Put `count` tasks of `minutes` each on one day — a day already spoken for.
async function fillDay(subgoalId: string, day: string, count: number, minutes: number) {
  for (let i = 0; i < count; i++) {
    await createTask({
      subgoalId,
      title: `filler ${i}`,
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      scheduledDate: day,
      estimatedMinutes: minutes,
      order: i,
    })
  }
}

describe('cross-goal daily capacity', () => {
  it('sees load from EVERY goal, not just one', async () => {
    const a = await seedSubgoal('Goal A')
    const b = await seedSubgoal('Goal B')
    await fillDay(a.subgoal.id, dayFromNow(1), 2, 60)
    await fillDay(b.subgoal.id, dayFromNow(1), 1, 60)

    const map = computeCommittedMinutesByDay(await getAllTasks(), {
      defaultMinutes: 25,
    })
    // 180 minutes on that day, contributed by two different goals — the number the
    // per-goal view could never see.
    expect(map[dayFromNow(1)]).toBe(180)
  })

  it('flags an over-budget day on the dashboard, and only from today onward', async () => {
    const a = await seedSubgoal('Goal A')
    await db.profile.clear()
    // Default budget is 4h = 240min. 6 x 60 = 360 on a future day -> over.
    await fillDay(a.subgoal.id, dayFromNow(2), 6, 60)
    // A past day is equally overloaded but can't be relieved by moving work
    // forward, so it must not appear.
    await fillDay(a.subgoal.id, dayFromNow(-3), 6, 60)

    await useGoalStore.getState().loadDashboard()

    const flagged = useGoalStore.getState().overcommittedDays
    expect(flagged.map((d) => d.day)).toEqual([dayFromNow(2)])
    expect(flagged[0].minutes).toBe(360)
  })

  it('reports no overcommitment when the plan fits the budget', async () => {
    const a = await seedSubgoal('Goal A')
    await fillDay(a.subgoal.id, dayFromNow(1), 3, 60) // 180 < 240
    await useGoalStore.getState().loadDashboard()
    expect(useGoalStore.getState().overcommittedDays).toEqual([])
  })
})

describe('rebalanceSchedule', () => {
  it('is a no-op when nothing is over budget', async () => {
    const a = await seedSubgoal('Goal A')
    await fillDay(a.subgoal.id, dayFromNow(1), 2, 60)
    expect(await useGoalStore.getState().rebalanceSchedule()).toBe(0)
  })

  it('spreads an overloaded day until every day fits the budget', async () => {
    const a = await seedSubgoal('Goal A')
    const b = await seedSubgoal('Goal B')
    // Two goals dump 6h each onto the same day: 720 minutes against a 240 budget.
    await fillDay(a.subgoal.id, dayFromNow(1), 6, 60)
    await fillDay(b.subgoal.id, dayFromNow(1), 6, 60)

    const moved = await useGoalStore.getState().rebalanceSchedule()
    expect(moved).toBeGreaterThan(0)

    const after = computeCommittedMinutesByDay(await getAllTasks(), {
      defaultMinutes: 25,
    })
    for (const [, minutes] of Object.entries(after)) {
      expect(minutes).toBeLessThanOrEqual(240)
    }
    // Nothing was dropped on the floor.
    expect((await getAllTasks()).every((t) => t.scheduledDate !== undefined)).toBe(true)
    expect(await db.tasks.count()).toBe(12)
  })

  it('never moves work earlier than today', async () => {
    const a = await seedSubgoal('Goal A')
    await fillDay(a.subgoal.id, dayFromNow(1), 8, 60)
    await useGoalStore.getState().rebalanceSchedule()
    for (const t of await getAllTasks()) {
      expect(t.scheduledDate! >= today()).toBe(true)
    }
  })

  it('does NOT dent reliability — a system rebalance is not a user slip', async () => {
    const a = await seedSubgoal('Goal A')
    await fillDay(a.subgoal.id, dayFromNow(1), 8, 60)

    await useGoalStore.getState().rebalanceSchedule()

    // rescheduleCount is the durable slip tally Reliability reads. Moving work the
    // system itself overcommitted must leave it untouched.
    for (const t of await getAllTasks()) {
      expect(t.rescheduleCount ?? 0).toBe(0)
    }
  })

  it('leaves days before the first overloaded one untouched', async () => {
    const a = await seedSubgoal('Goal A')
    // Day+1 fits; day+3 is over. Only day+3 onward should be re-placed.
    await fillDay(a.subgoal.id, dayFromNow(1), 2, 60)
    await fillDay(a.subgoal.id, dayFromNow(3), 8, 60)

    await useGoalStore.getState().rebalanceSchedule()

    const stillOnDay1 = (await getAllTasks()).filter(
      (t) => t.scheduledDate === dayFromNow(1),
    )
    expect(stillOnDay1).toHaveLength(2)
  })
})

describe('rebalanceSchedule only pushes work later', () => {
  it('does not pull a far-future task into a gap', async () => {
    const a = await seedSubgoal('Goal A')
    await fillDay(a.subgoal.id, dayFromNow(1), 8, 60)
    await fillDay(a.subgoal.id, dayFromNow(30), 1, 60)

    await useGoalStore.getState().rebalanceSchedule()

    const onDay30 = (await getAllTasks()).filter(
      (t) => t.scheduledDate === dayFromNow(30),
    )
    expect(onDay30).toHaveLength(1)
  })
})
