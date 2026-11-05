// Regression test for the "inert dependency graph" defect.
//
// Every dependency-derived signal in the app (the per-goal lagging-foundation note,
// the active-support counts that feed the priority ranking's dependencyBoost, the
// weekly review's strengthened foundations) reads the SUBGOAL EDGE SET. Those edges
// have exactly one write path — useDependencyStore.addDependency — and for a while
// nothing in the UI reached it, so the set was permanently empty and every signal
// silently rendered its "nothing to say" branch. The engines were correct the whole
// time; they were being handed [].
//
// So this test deliberately does NOT test an engine. It walks the seam the defect
// lived in: add an edge through the store the UI actually calls, and assert the
// cached signal in useGoalStore changes as a result. It fails if the cross-store
// refresh is dropped, or if the graph stops being writable at all.

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { createGoal, createSubgoal, createTask } from '@/database/repositories'
import { useDependencyStore } from './useDependencyStore'
import { useGoalStore } from './useGoalStore'

beforeEach(async () => {
  await Promise.all([
    db.goals.clear(),
    db.subgoals.clear(),
    db.tasks.clear(),
    db.dependencies.clear(),
  ])
  useDependencyStore.setState({
    dependencies: [],
    loadedType: null,
    order: [],
    cyclic: false,
    isLoadingDependencies: false,
  })
  useGoalStore.setState({ goalHealth: {}, subgoalSupportCounts: {} })
})

// A goal with two subgoals: `foundation` (which will support the other) and
// `dependent`. Each carries one incomplete task so the goal has real work to rank
// and the health engine has something to judge.
async function seedGoalWithTwoSubgoals() {
  const goal = await createGoal({
    title: 'Ship the thing',
    description: '',
    category: 'career',
    targetDate: '2030-01-01',
    status: 'active',
    priority: 'high',
  })
  const mk = async (title: string) => {
    const subgoal = await createSubgoal({
      goalId: goal.id,
      title,
      description: '',
      status: 'active',
      requiresConsistency: false,
      order: 0,
    })
    await createTask({
      subgoalId: subgoal.id,
      title: `${title} task`,
      status: 'pending',
      priority: 'medium',
      isRecurring: false,
      order: 0,
    })
    return subgoal
  }
  return { goal, foundation: await mk('Foundation'), dependent: await mk('Dependent') }
}

describe('subgoal dependency signals', () => {
  it('start empty — nothing is derived when no edge exists', async () => {
    await seedGoalWithTwoSubgoals()
    await useGoalStore.getState().refreshDependencySignals()

    expect(useGoalStore.getState().subgoalSupportCounts).toEqual({})
    for (const health of Object.values(useGoalStore.getState().goalHealth)) {
      expect(health.laggingFoundation).toBeNull()
    }
  })

  it('adding an edge through the store populates the derived support counts', async () => {
    const { foundation, dependent } = await seedGoalWithTwoSubgoals()

    // The exact call the "Depends on" panel makes: "foundation supports dependent".
    const result = await useDependencyStore.getState().addDependency({
      fromId: foundation.id,
      toId: dependent.id,
      type: 'subgoal',
    })
    expect(result.ok).toBe(true)

    // The edge is durable...
    expect(await db.dependencies.count()).toBe(1)
    // ...AND the derived cache moved without any further load. This is the
    // assertion that was impossible to satisfy while the graph was unreachable.
    expect(useGoalStore.getState().subgoalSupportCounts[foundation.id]).toBe(1)
  })

  it('removing the edge clears the derived signal again', async () => {
    const { foundation, dependent } = await seedGoalWithTwoSubgoals()

    const result = await useDependencyStore.getState().addDependency({
      fromId: foundation.id,
      toId: dependent.id,
      type: 'subgoal',
    })
    if (!result.ok) throw new Error('setup: edge should have been created')
    expect(useGoalStore.getState().subgoalSupportCounts[foundation.id]).toBe(1)

    await useDependencyStore.getState().removeDependency(result.dependency.id)

    expect(await db.dependencies.count()).toBe(0)
    expect(useGoalStore.getState().subgoalSupportCounts).toEqual({})
  })

  it('rejects a cycle without writing an edge or disturbing the signals', async () => {
    const { foundation, dependent } = await seedGoalWithTwoSubgoals()
    const store = useDependencyStore.getState()

    await store.addDependency({
      fromId: foundation.id,
      toId: dependent.id,
      type: 'subgoal',
    })
    // The reverse edge would close a loop — an expected user-level rejection,
    // reported as data rather than thrown.
    const reverse = await store.addDependency({
      fromId: dependent.id,
      toId: foundation.id,
      type: 'subgoal',
    })

    expect(reverse).toEqual({ ok: false, reason: 'cycle' })
    expect(await db.dependencies.count()).toBe(1)
    expect(useGoalStore.getState().subgoalSupportCounts[foundation.id]).toBe(1)
  })
})
