import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { db } from '@/database/db'
import {
  createDependency,
  createGoal,
  createSubgoal,
  createTask,
  getSubgoalById,
  getTaskById,
} from '@/database/repositories'
import { useGoalStore } from './useGoalStore'

const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
const store = () => useGoalStore.getState()

beforeEach(async () => {
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.tasks.clear(),
    db.dependencies.clear(),
  ])
  useGoalStore.setState({ subgoalSupportCounts: {}, todaysTasks: [], thisWeekTasks: [] })
})

async function seed() {
  const goal = await createGoal({
    title: 'Goal',
    description: '',
    category: 'skills',
    targetDate: '2030-01-01',
    status: 'active',
    priority: 'medium',
  })
  const mk = (title: string, order: number) =>
    createSubgoal({
      goalId: goal.id,
      title,
      description: '',
      status: 'active',
      requiresConsistency: false,
      order,
    })
  const subgoal = await mk('Foundation', 0)
  const other = await mk('Dependent', 1)
  const task = (over: Partial<Parameters<typeof createTask>[0]>) =>
    createTask({
      subgoalId: subgoal.id,
      title: 't',
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
      ...over,
    })
  return { goal, subgoal, other, task }
}

describe('setSubgoalComplete', () => {
  it('marks the subgoal complete and reopening restores active', async () => {
    const { subgoal } = await seed()
    await store().setSubgoalComplete(subgoal.id, true)
    expect((await getSubgoalById(subgoal.id))?.status).toBe('completed')
    await store().setSubgoalComplete(subgoal.id, false)
    expect((await getSubgoalById(subgoal.id))?.status).toBe('active')
  })

  it('moves open dated tasks to the backlog, keeps finished work untouched', async () => {
    const { subgoal, task } = await seed()
    const open = await task({ scheduledDate: tomorrow })
    const done = await task({ scheduledDate: '2026-01-01', status: 'completed' })

    expect(await store().setSubgoalComplete(subgoal.id, true)).toBe(1)

    expect((await getTaskById(open.id))?.scheduledDate).toBeUndefined()
    expect((await getTaskById(open.id))?.status).toBe('pending')
    expect((await getTaskById(done.id))?.scheduledDate).toBe('2026-01-01')
    expect(await db.tasks.count()).toBe(2)
  })

  it('takes those tasks off the dashboard windows', async () => {
    const { subgoal, task } = await seed()
    await task({ scheduledDate: tomorrow })
    await store().loadDashboard()
    expect(store().thisWeekTasks).toHaveLength(1)

    await store().setSubgoalComplete(subgoal.id, true)
    expect(store().thisWeekTasks).toHaveLength(0)
  })

  it('stops counting support for a subgoal that is finished', async () => {
    const { subgoal, other } = await seed()
    await createDependency({ fromId: subgoal.id, toId: other.id, type: 'subgoal' })
    await store().refreshDependencySignals()
    expect(store().subgoalSupportCounts[subgoal.id]).toBe(1)

    // Completing the DEPENDENT: the foundation no longer supports anything active.
    await store().setSubgoalComplete(other.id, true)
    expect(store().subgoalSupportCounts[subgoal.id] ?? 0).toBe(0)
  })
})
